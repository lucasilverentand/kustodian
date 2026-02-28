import * as path from 'node:path';
import { is_success, success } from '../../core/index.js';
import { create_kubeconfig_manager } from '../../k8s/kubeconfig.js';

import { define_command } from '../command.js';
import {
  build_node_list,
  create_k0s_provider_instance,
  resolve_k0s_provider_options,
} from '../utils/k0s-provider.js';
import { load_and_resolve_project, sanitize_filename_part } from '../utils/project.js';

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

    const project_result = await load_and_resolve_project(project_path, cluster_filter);
    if (!is_success(project_result)) {
      return project_result;
    }

    const loaded_cluster = project_result.value.target_clusters[0];
    if (!loaded_cluster) {
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: 'No clusters found in project' },
      };
    }

    const cluster_name = loaded_cluster.cluster.metadata.name;
    console.log(`  → Cluster: ${cluster_name}`);
    console.log(`  → Nodes: ${loaded_cluster.nodes.length}`);

    // Build NodeListType and provider
    const node_list = build_node_list(loaded_cluster);
    const provider_options = resolve_k0s_provider_options(loaded_cluster, { include_all: false });
    const provider = await create_k0s_provider_instance(provider_options);

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
    await writeFile(temp_kubeconfig, kubeconfig_result.value, 'utf-8');

    // Rename kubeconfig entries to cluster-scoped names
    console.log('  → Renaming kubeconfig entries...');
    const kubeconfig_manager = create_kubeconfig_manager();
    const rename_result = await kubeconfig_manager.rename_entries(temp_kubeconfig, cluster_name);
    if (!is_success(rename_result)) {
      console.error(`  ✗ Failed to rename kubeconfig entries: ${rename_result.error.message}`);
      return rename_result;
    }
    console.log(`    ✓ Context: ${cluster_name}, User: ${cluster_name}-admin`);

    // Merge into ~/.kube/config
    console.log('  → Merging into ~/.kube/config...');
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
    console.log(`\n  Tip: kubectl config use-context ${cluster_name}`);

    return success(undefined);
  },
});
