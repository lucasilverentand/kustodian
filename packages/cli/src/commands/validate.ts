import { failure, success } from '@kustodian/core';
import { validate_dependency_graph, validate_template_requirements } from '@kustodian/generator';
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
          console.log(`      - ${t.name}`);
        }
      }
    }

    // Validate template requirements for each cluster
    console.log('\nValidating template requirements...');
    let has_requirement_errors = false;

    for (const cluster_data of clusters) {
      const cluster_name = cluster_data.cluster.metadata.name;
      // All templates listed in cluster.yaml are deployed (opt-in model)
      const enabled_template_refs = cluster_data.cluster.spec.templates || [];

      if (enabled_template_refs.length === 0) {
        continue;
      }

      // Get enabled templates
      const enabled_templates = project.templates
        .filter((t) => enabled_template_refs.some((ref) => ref.name === t.template.metadata.name))
        .map((t) => t.template);

      // Validate requirements
      const requirements_result = validate_template_requirements(
        enabled_templates,
        cluster_data.nodes,
      );

      if (!requirements_result.valid) {
        has_requirement_errors = true;
        console.error(`\nRequirement validation errors for cluster '${cluster_name}':`);
        for (const error of requirements_result.errors) {
          console.error(`  ✗ ${error.template}: ${error.message}`);
        }
      }
    }

    if (has_requirement_errors) {
      return failure({
        code: 'REQUIREMENT_VALIDATION_ERROR',
        message: 'Template requirement validation failed',
      });
    }

    // Validate dependency graph
    console.log('\nValidating dependency graph...');
    const templates = project.templates.map((t) => t.template);
    const graph_result = validate_dependency_graph(templates);

    if (!graph_result.valid) {
      console.error('\nDependency validation errors:');
      for (const error of graph_result.errors) {
        console.error(`  ✗ ${error.message}`);
      }
      return failure({
        code: 'DEPENDENCY_VALIDATION_ERROR',
        message: 'Dependency validation failed',
      });
    }

    // Show deployment order if there are dependencies
    if (graph_result.topological_order && graph_result.topological_order.length > 0) {
      console.log(`\nDeployment order (${graph_result.topological_order.length} kustomizations):`);
      graph_result.topological_order.forEach((id, index) => {
        console.log(`  ${index + 1}. ${id}`);
      });
    }

    console.log('\n✓ All configurations are valid');
    return success(undefined);
  },
});
