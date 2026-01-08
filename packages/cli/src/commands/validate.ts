import { success } from '@kustodian/core';
import { find_project_root, load_project } from '@kustodian/loader';

import { define_command } from '../command.js';

/**
 * Validate command - validates cluster and template configurations.
 */
export const validate_command = define_command({
  name: 'validate',
  description: 'Validate cluster and template configurations',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Validate a specific cluster only',
      type: 'string',
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
    const cluster_filter = ctx.options['cluster'] as string | undefined;

    // Find project root
    console.log('Finding project root...');
    const root_result = await find_project_root(project_path);
    if (!root_result.success) {
      console.error(`Error: ${root_result.error.message}`);
      console.error(
        'Make sure you are in a Kustodian project directory with a kustodian.yaml file.',
      );
      return root_result;
    }

    const project_root = root_result.value;
    console.log(`Project root: ${project_root}`);

    // Load project
    console.log('Loading project...');
    const project_result = await load_project(project_root);
    if (!project_result.success) {
      console.error(`Validation failed: ${project_result.error.message}`);
      return project_result;
    }

    const project = project_result.value;

    // Report templates
    console.log(`\nTemplates: ${project.templates.length} found`);
    for (const t of project.templates) {
      console.log(`  ✓ ${t.template.metadata.name}`);
    }

    // Report clusters
    const clusters = cluster_filter
      ? project.clusters.filter((c) => c.cluster.metadata.name === cluster_filter)
      : project.clusters;

    if (cluster_filter && clusters.length === 0) {
      console.error(`\nError: Cluster '${cluster_filter}' not found`);
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Cluster '${cluster_filter}' not found` },
      };
    }

    console.log(`\nClusters: ${clusters.length} found`);
    for (const c of clusters) {
      console.log(`  ✓ ${c.cluster.metadata.name}`);
      if (c.cluster.spec.templates) {
        for (const t of c.cluster.spec.templates) {
          const status = t.enabled === false ? '(disabled)' : '';
          console.log(`      - ${t.name} ${status}`);
        }
      }
    }

    console.log('\n✓ All configurations are valid');
    return success(undefined);
  },
});
