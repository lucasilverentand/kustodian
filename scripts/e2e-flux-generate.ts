#!/usr/bin/env bun
/**
 * E2E Flux Generate Script
 *
 * Generates Flux manifests from e2e fixtures for integration testing.
 * This script:
 * 1. Loads the valid-project fixture
 * 2. Generates Flux Kustomization manifests
 * 3. Writes them to a temp directory for kubectl apply
 *
 * For e2e testing, we use path-based Kustomizations (no OCI/Git source)
 * to test the generated manifests directly against the checked-out code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { create_generator, serialize_resource } from '../packages/generator/src/index.js';
import { load_project } from '../packages/loader/src/index.js';

const FIXTURES_DIR = path.join(import.meta.dir, '..', 'e2e', 'fixtures');
const VALID_PROJECT = path.join(FIXTURES_DIR, 'valid-project');
const OUTPUT_DIR = '/tmp/kustodian-e2e-output';

async function main() {
  console.log('E2E Flux Generate Script');
  console.log('========================\n');

  // Create output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  // Load project
  console.log('Loading project from fixtures...');
  const project_result = await load_project(VALID_PROJECT);
  if (!project_result.success) {
    console.error('Failed to load project:', project_result.error);
    process.exit(1);
  }

  const project = project_result.value;
  console.log(`  Loaded ${project.templates.length} templates`);
  console.log(`  Loaded ${project.clusters.length} clusters\n`);

  const cluster_entry = project.clusters[0];
  if (!cluster_entry) {
    console.error('No cluster found in project');
    process.exit(1);
  }

  const cluster = cluster_entry.cluster;
  const templates = project.templates.map((t) => t.template);

  console.log(`Cluster: ${cluster.metadata.name}`);
  console.log(`Templates: ${templates.map((t) => t.metadata.name).join(', ')}\n`);

  // Create generator
  const generator = create_generator({
    flux_namespace: 'flux-system',
  });

  // Generate Flux resources
  console.log('Generating Flux manifests...');
  const result = await generator.generate(cluster, templates, {
    output_dir: OUTPUT_DIR,
  });

  if (!result.success) {
    console.error('Failed to generate:', result.error);
    process.exit(1);
  }

  const generation = result.value;
  console.log(`  Generated ${generation.kustomizations.length} Kustomizations\n`);

  // For e2e testing, we create path-based Kustomizations
  // These reference the template paths directly in the checked-out repo
  const manifests: string[] = [];

  // Generate namespace for the example app
  const namespace_manifest = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: 'example',
    },
  };
  manifests.push(serialize_resource(namespace_manifest));

  // For each generated kustomization, create a simplified version
  // that references the local path (for e2e testing without OCI)
  for (const kust of generation.kustomizations) {
    // Modify the Flux Kustomization to use a local path approach
    // In real usage, this would reference OCIRepository/GitRepository
    // For e2e testing, we'll apply the kustomize directly
    const flux_kust = {
      ...kust.flux_kustomization,
      spec: {
        ...kust.flux_kustomization.spec,
        // For e2e, we use prune: false to avoid issues with missing source
        prune: false,
        // Reduce retry interval for faster testing
        interval: '30s',
        retryInterval: '10s',
        timeout: '1m',
      },
    };

    manifests.push(serialize_resource(flux_kust));
    console.log(`  - ${kust.name}: ${kust.path}`);
  }

  // Write combined manifest
  const combined_path = path.join(OUTPUT_DIR, 'flux-manifests.yaml');
  fs.writeFileSync(combined_path, manifests.join('---\n'));
  console.log(`\nWrote manifests to: ${combined_path}`);

  // Also write the kustomize resources directly (for Flux to apply)
  // Copy the template files to a location Flux can access
  const templates_output = path.join(OUTPUT_DIR, 'templates');
  fs.mkdirSync(templates_output, { recursive: true });

  // Copy template files
  const template_source = path.join(VALID_PROJECT, 'templates', 'example', 'app');
  const template_dest = path.join(templates_output, 'example', 'app');
  fs.mkdirSync(template_dest, { recursive: true });

  for (const file of fs.readdirSync(template_source)) {
    const src = path.join(template_source, file);
    const dest = path.join(template_dest, file);

    // Read and process the file (substitute variables)
    let content = fs.readFileSync(src, 'utf-8');

    // Substitute variables from cluster config
    const template_config = cluster.spec.templates?.find((t) => t.name === 'example');
    const values = template_config?.values || {};

    // Apply substitutions
    content = content.replace(/\$\{replicas\}/g, values['replicas'] || '1');
    content = content.replace(/\$\{namespace\}/g, 'example');

    fs.writeFileSync(dest, content);
  }

  console.log(`Copied and processed templates to: ${templates_output}`);

  // For direct kubectl apply (without Flux source), create a simple kustomization
  const direct_kustomization = `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - deployment.yaml
`;

  fs.writeFileSync(path.join(template_dest, 'kustomization.yaml'), direct_kustomization);

  // Create the namespace file
  const namespace_content = `apiVersion: v1
kind: Namespace
metadata:
  name: example
`;
  fs.writeFileSync(path.join(template_dest, 'namespace.yaml'), namespace_content);

  console.log('\nE2E generation complete!');
  console.log('\nTo apply directly (for testing):');
  console.log(`  kubectl apply -k ${template_dest}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
