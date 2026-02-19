import * as path from 'node:path';
import { is_success, success } from '../../core/index.js';
import { create_kubeconfig_manager } from '../../k8s/kubeconfig.js';
import { find_cluster, find_project_root, load_project } from '../../loader/index.js';
import type { NodeListType } from '../../nodes/index.js';

import { define_command } from '../command.js';

function sanitize_filename_part(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Kubeconfig command - pulls kubeconfig from a k0s cluster and merges it
 * into the local ~/.kube/config.
 */
export const kubeconfig_command = define_command({
  name: 'kubeconfig',
  description: 'Pull and merge kubeconfig from a k0s cluster',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Cluster name (required)',
      type: 'string',
      required: true,
    },
    {
      name: 'project',
      short: 'p',
      description: 'Path to project root',
      type: 'string',
    },
  ],
  handler: async (ctx) => {
    const cluster_filter = ctx.options['cluster'] as string | undefined;
    const project_path = (ctx.options['project'] as string) || process.cwd();

    if (!cluster_filter) {
      console.error('Error: --cluster is required');
      return {
        success: false as const,
        error: { code: 'INVALID_ARGS', message: '--cluster is required' },
      };
    }

    console.log('\n━━━ Kustodian Kubeconfig ━━━\n');

    // Load project
    console.log('Loading project configuration...');
    const root_result = await find_project_root(project_path);
    if (!is_success(root_result)) {
      console.error(`  ✗ ${root_result.error.message}`);
      return root_result;
    }

    const project_root = root_result.value;
    const project_result = await load_project(project_root);
    if (!is_success(project_result)) {
      console.error(`  ✗ ${project_result.error.message}`);
      return project_result;
    }

    const project = project_result.value;

    // Find target cluster
    const loaded_cluster = find_cluster(project.clusters, cluster_filter);
    if (!loaded_cluster) {
      console.error(`  ✗ Cluster '${cluster_filter}' not found`);
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Cluster '${cluster_filter}' not found` },
      };
    }

    const cluster_name = loaded_cluster.cluster.metadata.name;
    console.log(`  → Cluster: ${cluster_name}`);
    console.log(`  → Nodes: ${loaded_cluster.nodes.length}`);

    // Build NodeListType
    const node_list: NodeListType = {
      cluster: cluster_name,
      nodes: loaded_cluster.nodes,
      ...(loaded_cluster.cluster.spec.node_defaults?.label_prefix && {
        label_prefix: loaded_cluster.cluster.spec.node_defaults.label_prefix,
      }),
    } as NodeListType;

    // Load k0s provider
    const k0s_package = 'kustodian-k0s';
    const { create_k0s_provider } = await import(k0s_package);

    const k0s_plugin = loaded_cluster.cluster.spec.plugins?.find(
      (p) => p.name === 'k0s' || p.name === '@kustodian/plugin-k0s',
    );
    const plugin_config = k0s_plugin?.config ?? {};

    const provider_options: Record<string, unknown> = {};
    if (plugin_config['k0s_version']) {
      provider_options['k0s_version'] = plugin_config['k0s_version'];
    }
    if (plugin_config['default_ssh']) {
      provider_options['default_ssh'] = plugin_config['default_ssh'];
    }
    provider_options['cluster_name'] = loaded_cluster.cluster.metadata.code ?? cluster_name;

    const provider = create_k0s_provider(provider_options);

    // Validate
    console.log('\n  → Validating cluster configuration...');
    const validate_result = provider.validate(node_list);
    if (!is_success(validate_result)) {
      console.error(`  ✗ Validation failed: ${validate_result.error.message}`);
      return validate_result;
    }

    // Pull kubeconfig
    console.log('  → Pulling kubeconfig via k0sctl...');
    const kubeconfig_result = await provider.get_kubeconfig(node_list);
    if (!is_success(kubeconfig_result)) {
      console.error(`  ✗ Failed to get kubeconfig: ${kubeconfig_result.error.message}`);
      return kubeconfig_result;
    }
    console.log('    ✓ Retrieved kubeconfig');

    // Write to temp file for merging
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const temp_kubeconfig = path.join(
      tmpdir(),
      `kustodian-kubeconfig-${sanitize_filename_part(cluster_name)}.yaml`,
    );
    await writeFile(temp_kubeconfig, kubeconfig_result.value as string, 'utf-8');

    // Merge into ~/.kube/config
    console.log('  → Merging into ~/.kube/config...');
    const kubeconfig_manager = create_kubeconfig_manager();
    const merge_result = await kubeconfig_manager.merge(temp_kubeconfig);

    // Clean up temp file
    try {
      await unlink(temp_kubeconfig);
    } catch {
      // Ignore cleanup errors
    }

    // Clean up provider temp files
    await provider.cleanup?.();

    if (!is_success(merge_result)) {
      console.error(`  ✗ Failed to merge kubeconfig: ${merge_result.error.message}`);
      return merge_result;
    }
    console.log('    ✓ Kubeconfig merged');

    console.log(`\n  ✓ Kubeconfig for '${cluster_name}' is ready`);
    console.log('\n  Tip: kubectl config use-context <context-name>');

    return success(undefined);
  },
});
