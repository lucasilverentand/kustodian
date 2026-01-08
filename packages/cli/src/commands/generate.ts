import * as path from 'node:path';
import { success } from '@kustodian/core';
import { create_generator } from '@kustodian/generator';
import { find_project_root, load_project } from '@kustodian/loader';

import { define_command } from '../command.js';

/**
 * Generate command - generates Flux resources from templates.
 */
export const generate_command = define_command({
  name: 'generate',
  description: 'Generate Flux resources from templates',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Generate for a specific cluster',
      type: 'string',
    },
    {
      name: 'all',
      short: 'a',
      description: 'Generate for all clusters',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'output-dir',
      short: 'o',
      description: 'Output directory (default: ./output)',
      type: 'string',
    },
    {
      name: 'dry-run',
      short: 'd',
      description: 'Preview what would be generated without writing files',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'project',
      short: 'p',
      description: 'Path to project root (defaults to current directory)',
      type: 'string',
    },
  ],
  handler: async (ctx) => {
    const project_path = (ctx.options['project'] as string) || process.cwd();
    const cluster_name = ctx.options['cluster'] as string | undefined;
    const generate_all = ctx.options['all'] as boolean;
    const output_dir = (ctx.options['output-dir'] as string) || './output';
    const dry_run = ctx.options['dry-run'] as boolean;

    // Validate options
    if (!cluster_name && !generate_all) {
      console.error('Error: Either --cluster or --all must be specified');
      return {
        success: false as const,
        error: { code: 'INVALID_ARGS', message: 'Either --cluster or --all must be specified' },
      };
    }

    // Find project root
    console.log('Finding project root...');
    const root_result = await find_project_root(project_path);
    if (!root_result.success) {
      console.error(`Error: ${root_result.error.message}`);
      return root_result;
    }

    const project_root = root_result.value;
    console.log(`Project root: ${project_root}`);

    // Load project
    console.log('Loading project...');
    const project_result = await load_project(project_root);
    if (!project_result.success) {
      console.error(`Error loading project: ${project_result.error.message}`);
      return project_result;
    }

    const project = project_result.value;
    console.log(
      `Loaded ${project.templates.length} templates, ${project.clusters.length} clusters`,
    );

    // Get clusters to process
    const clusters = cluster_name
      ? project.clusters.filter((c) => c.cluster.metadata.name === cluster_name)
      : project.clusters;

    if (clusters.length === 0) {
      console.error(`Error: No clusters found${cluster_name ? ` matching '${cluster_name}'` : ''}`);
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: 'No clusters found' },
      };
    }

    // Create generator
    const generator = create_generator({
      flux_namespace: 'flux-system',
      git_repository_name: 'flux-system',
    });

    // Generate for each cluster
    for (const loaded_cluster of clusters) {
      const cluster = loaded_cluster.cluster;
      const cluster_output_dir = path.join(output_dir, cluster.metadata.name);

      console.log(`\nGenerating for cluster: ${cluster.metadata.name}`);
      console.log(`  Output directory: ${cluster_output_dir}`);

      // Extract templates array
      const templates = project.templates.map((t) => t.template);

      // Generate
      const gen_result = await generator.generate(cluster, templates, {
        output_dir: cluster_output_dir,
        dry_run,
      });

      if (!gen_result.success) {
        console.error(`  Error: ${gen_result.error.message}`);
        return gen_result;
      }

      const result = gen_result.value;
      console.log(`  Generated ${result.kustomizations.length} kustomizations:`);

      for (const k of result.kustomizations) {
        console.log(`    - ${k.name} (from ${k.template})`);
      }

      // Write output
      if (!dry_run) {
        console.log('  Writing output...');
        const write_result = await generator.write(result);
        if (!write_result.success) {
          console.error(`  Error writing: ${write_result.error.message}`);
          return write_result;
        }
        console.log(`  ✓ Wrote ${write_result.value.length} files`);
      } else {
        console.log('  (dry run - no files written)');
      }
    }

    console.log('\n✓ Generation complete');
    return success(undefined);
  },
});
