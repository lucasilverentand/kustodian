import type { KustodianErrorType } from '../../core/index.js';
import type { ResultType } from '../../core/index.js';
import type { LoadedClusterType } from '../../loader/index.js';
import type { NodeListType } from '../../nodes/index.js';

/**
 * Interface for the k0s provider returned by the dynamically imported kustodian-k0s package.
 */
export interface K0sProviderType {
  validate(node_list: NodeListType): ResultType<void, KustodianErrorType>;
  install(
    node_list: NodeListType,
    options: { dry_run: boolean },
  ): Promise<ResultType<void, KustodianErrorType>>;
  get_kubeconfig(node_list: NodeListType): Promise<ResultType<string, KustodianErrorType>>;
  get_config_preview?(node_list: NodeListType): ResultType<string, KustodianErrorType>;
  cleanup?(): Promise<unknown>;
}

/**
 * Builds a NodeListType from a loaded cluster.
 */
export function build_node_list(loaded_cluster: LoadedClusterType): NodeListType {
  const cluster_name = loaded_cluster.cluster.metadata.name;
  return {
    cluster: cluster_name,
    nodes: loaded_cluster.nodes,
    ...(loaded_cluster.cluster.spec.node_defaults?.label_prefix && {
      label_prefix: loaded_cluster.cluster.spec.node_defaults.label_prefix,
    }),
  } as NodeListType;
}

export interface K0sProviderOptionsConfig {
  /** When true, includes telemetry_enabled, dynamic_config, and sans from plugin config */
  include_all?: boolean;
}

/**
 * Resolves k0s provider options from cluster plugin config.
 * `include_all: true` (default) includes all options (for apply/diff).
 * `include_all: false` includes only k0s_version and default_ssh (for kubeconfig).
 */
export function resolve_k0s_provider_options(
  loaded_cluster: LoadedClusterType,
  config: K0sProviderOptionsConfig = {},
): Record<string, unknown> {
  const include_all = config.include_all ?? true;
  const cluster_name = loaded_cluster.cluster.metadata.name;

  const k0s_plugin = loaded_cluster.cluster.spec.plugins?.find(
    (p) => p.name === 'k0s' || p.name === '@kustodian/plugin-k0s',
  );
  const plugin_config = k0s_plugin?.config ?? {};

  const provider_options: Record<string, unknown> = {};
  if (plugin_config['k0s_version']) {
    provider_options['k0s_version'] = plugin_config['k0s_version'];
  }
  if (include_all) {
    if (plugin_config['telemetry_enabled'] !== undefined) {
      provider_options['telemetry_enabled'] = plugin_config['telemetry_enabled'];
    }
    if (plugin_config['dynamic_config'] !== undefined) {
      provider_options['dynamic_config'] = plugin_config['dynamic_config'];
    }
    if (plugin_config['sans']) {
      provider_options['sans'] = plugin_config['sans'];
    }
  }
  if (plugin_config['default_ssh']) {
    provider_options['default_ssh'] = plugin_config['default_ssh'];
  }
  provider_options['cluster_name'] = loaded_cluster.cluster.metadata.code ?? cluster_name;

  return provider_options;
}

/**
 * Creates a k0s provider instance from resolved options.
 * Returns an error result if the kustodian-k0s package is not installed.
 */
export async function create_k0s_provider_instance(
  options: Record<string, unknown>,
): Promise<ResultType<K0sProviderType, KustodianErrorType>> {
  try {
    const k0s_package = 'kustodian-k0s';
    const { create_k0s_provider } = await import(k0s_package);
    return { success: true, value: create_k0s_provider(options) as K0sProviderType };
  } catch {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'kustodian-k0s package is not installed. Install it with: bun add kustodian-k0s',
      },
    };
  }
}
