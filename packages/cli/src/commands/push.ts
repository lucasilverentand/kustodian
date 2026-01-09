import { exec } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { success } from '@kustodian/core';
import { create_generator } from '@kustodian/generator';
import { find_project_root, load_project } from '@kustodian/loader';
import type { ClusterType } from '@kustodian/schema';

import { define_command } from '../command.js';

const execAsync = promisify(exec);

/**
 * Push command - packages and pushes cluster manifests to OCI registry.
 */
export const push_command = define_command({
  name: 'push',
  description: 'Package and push cluster manifests to OCI registry',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Cluster name to push',
      type: 'string',
      required: true,
    },
    {
      name: 'tag',
      short: 't',
      description: 'Override tag (defaults to cluster tag_strategy)',
      type: 'string',
    },
    {
      name: 'project',
      short: 'p',
      description: 'Path to project root',
      type: 'string',
    },
    {
      name: 'dry-run',
      short: 'd',
      description: 'Generate but do not push',
      type: 'boolean',
      default_value: false,
    },
  ],
  handler: async (ctx) => {
    const cluster_name = ctx.options['cluster'] as string;
    const manual_tag = ctx.options['tag'] as string | undefined;
    const project_path = (ctx.options['project'] as string) || process.cwd();
    const dry_run = ctx.options['dry-run'] as boolean;

    console.log(`\n━━━ Kustodian Push ━━━`);
    console.log(`Cluster: ${cluster_name}`);

    // Load project
    console.log('\n[1/5] Loading project...');
    const root_result = await find_project_root(project_path);
    if (!root_result.success) {
      console.error(`  ✗ Error: ${root_result.error.message}`);
      return root_result;
    }

    const project_root = root_result.value;
    const project_result = await load_project(project_root);
    if (!project_result.success) {
      console.error(`  ✗ Error: ${project_result.error.message}`);
      return project_result;
    }

    const project = project_result.value;
    const loaded_cluster = project.clusters.find((c) => c.cluster.metadata.name === cluster_name);

    if (!loaded_cluster) {
      console.error(`  ✗ Error: Cluster '${cluster_name}' not found`);
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Cluster '${cluster_name}' not found` },
      };
    }

    const cluster = loaded_cluster.cluster;
    console.log(`  ✓ Project loaded`);

    // Check if cluster uses OCI
    if (!cluster.spec.oci) {
      console.error('\n  ✗ Error: Cluster does not use OCI configuration');
      console.error('  → Add spec.oci to cluster.yaml to use push command');
      console.error('  → See: https://kustodian.io/docs/oci-deployment');
      return {
        success: false as const,
        error: { code: 'INVALID_CONFIG', message: 'Cluster does not use OCI' },
      };
    }

    // Generate manifests
    console.log('\n[2/5] Generating manifests...');
    const generator = create_generator({
      flux_namespace: 'flux-system',
      git_repository_name: 'flux-system',
    });

    const output_dir = path.join(project_root, 'output', cluster_name);
    const gen_result = await generator.generate(
      cluster,
      project.templates.map((t) => t.template),
      { output_dir },
    );

    if (!gen_result.success) {
      console.error(`  ✗ Generation failed: ${gen_result.error.message}`);
      return gen_result;
    }

    const write_result = await generator.write(gen_result.value);
    if (!write_result.success) {
      console.error(`  ✗ Write failed: ${write_result.error.message}`);
      return write_result;
    }

    console.log(`  ✓ Generated ${write_result.value.length} files`);

    // Determine tag
    console.log('\n[3/5] Determining tag...');
    const tag = await resolve_tag(cluster, manual_tag, project_root);
    console.log(`  → Tag: ${tag}`);

    // Build OCI URL
    const oci_url = `oci://${cluster.spec.oci.registry}/${cluster.spec.oci.repository}:${tag}`;
    console.log(`  → URL: ${oci_url}`);

    // Get Git metadata
    console.log('\n[4/5] Gathering Git metadata...');
    const git_source = await get_git_source(project_root);
    const git_revision = await get_git_revision(project_root);
    console.log(`  → Source: ${git_source}`);
    console.log(`  → Revision: ${git_revision}`);

    // Push artifact
    console.log('\n[5/5] Pushing artifact...');
    if (dry_run) {
      console.log('  [DRY RUN] Would execute:');
      console.log(`  flux push artifact ${oci_url} \\`);
      console.log(`    --path="${output_dir}" \\`);
      console.log(`    --source="${git_source}" \\`);
      console.log(`    --revision="${git_revision}"`);
    } else {
      try {
        const cmd = `flux push artifact ${oci_url} --path="${output_dir}" --source="${git_source}" --revision="${git_revision}"`;
        const { stdout, stderr } = await execAsync(cmd);

        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);

        console.log(`  ✓ Artifact pushed successfully`);
      } catch (error) {
        const err = error as Error & { code?: string };
        console.error(`  ✗ Push failed: ${err.message}`);

        if (err.message.includes('command not found')) {
          console.error('\n  Flux CLI not found. Install it:');
          console.error('  → https://fluxcd.io/flux/installation/');
        }

        return {
          success: false as const,
          error: { code: 'PUSH_FAILED', message: err.message },
        };
      }
    }

    console.log('\n━━━ Push Complete ━━━\n');
    return success(undefined);
  },
});

/**
 * Resolves the tag to use based on cluster strategy or manual override.
 */
async function resolve_tag(
  cluster: ClusterType,
  manual_tag: string | undefined,
  project_root: string,
): Promise<string> {
  if (manual_tag) {
    return manual_tag;
  }

  if (!cluster.spec.oci) {
    return 'latest';
  }

  const strategy = cluster.spec.oci.tag_strategy || 'git-sha';

  switch (strategy) {
    case 'cluster':
      return cluster.metadata.name;

    case 'manual':
      if (cluster.spec.oci.tag) {
        return cluster.spec.oci.tag;
      }
      throw new Error('tag_strategy is "manual" but no tag specified in cluster.yaml');

    case 'version': {
      try {
        const { stdout } = await execAsync('git describe --tags --abbrev=0', {
          cwd: project_root,
        });
        return stdout.trim();
      } catch {
        console.warn('  ⚠ Could not determine version from git, using "latest"');
        return 'latest';
      }
    }

    case 'git-sha':
    default: {
      try {
        const { stdout } = await execAsync('git rev-parse --short HEAD', {
          cwd: project_root,
        });
        return `sha1-${stdout.trim()}`;
      } catch {
        console.warn('  ⚠ Could not determine git SHA, using "latest"');
        return 'latest';
      }
    }
  }
}

/**
 * Gets the git remote URL for source metadata.
 */
async function get_git_source(project_root: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git config --get remote.origin.url', {
      cwd: project_root,
    });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Gets the current git revision for source metadata.
 */
async function get_git_revision(project_root: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', {
      cwd: project_root,
    });
    return `sha1:${stdout.trim()}`;
  } catch {
    return 'unknown';
  }
}
