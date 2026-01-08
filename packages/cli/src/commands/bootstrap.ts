import { create_workflow } from '@kustodian/bootstrap';
import { success } from '@kustodian/core';
import { find_project_root, load_project, read_yaml_file } from '@kustodian/loader';
import type { NodeListType, NodeType } from '@kustodian/nodes';

import { define_command } from '../command.js';

/**
 * YAML structure for nodes file (with apiVersion/kind/metadata/spec wrapper).
 */
interface NodesYamlType {
  apiVersion: string;
  kind: string;
  metadata: {
    cluster: string;
  };
  spec: {
    label_prefix?: string;
    ssh?: {
      user?: string;
      key_path?: string;
      port?: number;
    };
    nodes: NodeType[];
  };
}

/**
 * Bootstrap command - bootstraps Kubernetes clusters.
 *
 * Note: This is a basic implementation. Full functionality requires:
 * - Node list loading in @kustodian/loader
 * - Provider registry integration
 * - k0s provider from @kustodian/plugin-k0s
 */
export const bootstrap_command = define_command({
  name: 'bootstrap',
  description: 'Bootstrap a Kubernetes cluster',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Cluster name to bootstrap',
      type: 'string',
      required: true,
    },
    {
      name: 'provider',
      short: 'P',
      description: 'Cluster provider (default: k0s)',
      type: 'string',
      default_value: 'k0s',
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
      description: 'Preview what would happen without making changes',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'resume',
      short: 'r',
      description: 'Resume from a previous bootstrap state',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'skip-cluster',
      description: 'Skip cluster installation (labels only)',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'skip-labels',
      description: 'Skip node labeling',
      type: 'boolean',
      default_value: false,
    },
  ],
  handler: async (ctx) => {
    const cluster_name = ctx.options['cluster'] as string;
    const provider_name = ctx.options['provider'] as string;
    const project_path = (ctx.options['project'] as string) || process.cwd();
    const dry_run = ctx.options['dry-run'] as boolean;
    const skip_cluster = ctx.options['skip-cluster'] as boolean;
    const skip_labels = ctx.options['skip-labels'] as boolean;

    if (!cluster_name) {
      console.error('Error: --cluster is required');
      return {
        success: false as const,
        error: { code: 'INVALID_ARGS', message: '--cluster is required' },
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

    // Load project to get cluster
    console.log('Loading project...');
    const project_result = await load_project(project_root);
    if (!project_result.success) {
      console.error(`Error: ${project_result.error.message}`);
      return project_result;
    }

    // Find cluster
    const loaded_cluster = project_result.value.clusters.find(
      (c) => c.cluster.metadata.name === cluster_name,
    );
    if (!loaded_cluster) {
      console.error(`Error: Cluster '${cluster_name}' not found`);
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Cluster '${cluster_name}' not found` },
      };
    }

    console.log(`\nCluster: ${cluster_name}`);
    console.log(`Provider: ${provider_name}`);
    if (dry_run) {
      console.log('Mode: DRY RUN');
    }

    // Try to load nodes.yaml from cluster directory
    const nodes_path = `${loaded_cluster.path}/nodes.yaml`;
    console.log(`\nLoading nodes from: ${nodes_path}`);

    const nodes_result = await read_yaml_file<NodesYamlType>(nodes_path);
    if (!nodes_result.success) {
      console.error(`\nWarning: Could not load nodes.yaml: ${nodes_result.error.message}`);
      console.error('Bootstrap requires a nodes.yaml file with node definitions.');
      console.error('\nExample nodes.yaml:');
      console.error(`apiVersion: kustodian.io/v1
kind: NodeList
metadata:
  cluster: ${cluster_name}
spec:
  label_prefix: myorg.io
  ssh:
    user: admin
    key_path: ~/.ssh/cluster_key
  nodes:
    - name: node-1
      role: controller+worker
      address: 10.0.0.11
`);
      return nodes_result;
    }

    // Convert from YAML structure to NodeListType
    const nodes_yaml = nodes_result.value;
    const node_list: NodeListType = {
      cluster: nodes_yaml.metadata.cluster,
      nodes: nodes_yaml.spec.nodes,
    };
    // Add optional fields only if defined
    if (nodes_yaml.spec.label_prefix) {
      node_list.label_prefix = nodes_yaml.spec.label_prefix;
    }
    if (nodes_yaml.spec.ssh) {
      node_list.ssh = nodes_yaml.spec.ssh;
    }
    console.log(`Loaded ${node_list.nodes.length} nodes`);

    // For now, create a mock provider since the plugin system needs wiring
    // In a full implementation, this would load from the plugin registry
    console.log('\nNote: Using mock provider. Full provider support requires plugin integration.');

    const mock_provider = {
      name: provider_name,
      validate: () => success(undefined),
      install: async () => {
        console.log('  [mock] Would install cluster via provider');
        return success(undefined);
      },
      get_kubeconfig: async () => {
        console.log('  [mock] Would retrieve kubeconfig');
        return success('~/.kube/config');
      },
      reset: async () => success(undefined),
    };

    // Create workflow with progress callbacks
    const workflow = create_workflow({
      provider: mock_provider,
      on_step_start: (step) => console.log(`\n→ Starting: ${step}`),
      on_step_complete: (step) => console.log(`  ✓ Completed: ${step}`),
      on_step_skip: (step, reason) => console.log(`  ⊘ Skipped: ${step} (${reason})`),
      on_step_fail: (step, error) => console.log(`  ✗ Failed: ${step} - ${error}`),
    });

    // Run bootstrap
    console.log('\nStarting bootstrap workflow...');
    const result = await workflow.run({
      cluster: cluster_name,
      node_list,
      provider: provider_name,
      options: {
        dry_run,
        skip_cluster,
        skip_labels,
      },
    });

    if (!result.success) {
      console.error(`\nBootstrap error: ${result.error.message}`);
      return result;
    }

    const bootstrap_result = result.value;
    if (bootstrap_result.success) {
      console.log('\n✓ Bootstrap completed successfully');
      if (bootstrap_result.kubeconfig_path) {
        console.log(`  Kubeconfig: ${bootstrap_result.kubeconfig_path}`);
      }
    } else {
      console.log('\n✗ Bootstrap did not complete');
      console.log('  Use --resume to continue from the last step');
    }

    return success(undefined);
  },
});
