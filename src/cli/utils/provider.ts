/**
 * Generic provider resolution utilities.
 * Replaces the k0s-specific k0s-provider.ts with a provider-agnostic approach.
 */

import type { KustodianErrorType, ResultType } from '../../core/index.js';
import { Errors, failure } from '../../core/index.js';
import type { LoadedClusterType } from '../../loader/index.js';
import type { NodeListType } from '../../nodes/index.js';
import type { ClusterProviderType, PluginRegistryType } from '../../plugins/index.js';

/**
 * Builds a NodeListType from a loaded cluster.
 * This is provider-agnostic — any provider can use it.
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

/**
 * Resolves provider-specific options from a cluster's plugin config.
 * Looks up `spec.plugins[].config` for a plugin matching the provider name.
 */
export function resolve_provider_options(
  loaded_cluster: LoadedClusterType,
  provider_name: string,
): Record<string, unknown> {
  const cluster_name = loaded_cluster.cluster.metadata.name;

  const plugin_entry = loaded_cluster.cluster.spec.plugins?.find(
    (p) => p.name === provider_name || p.name === `@kustodian/plugin-${provider_name}`,
  );
  const plugin_config = plugin_entry?.config ?? {};

  return {
    ...plugin_config,
    cluster_name: loaded_cluster.cluster.metadata.code ?? cluster_name,
  };
}

/**
 * Creates a cluster provider by name using the plugin registry.
 */
export function create_provider(
  registry: PluginRegistryType,
  provider_name: string,
  options: Record<string, unknown>,
): ResultType<ClusterProviderType, KustodianErrorType> {
  const provider = registry.create_provider(provider_name, options);

  if (!provider) {
    return failure(
      Errors.not_found(
        'Provider',
        `'${provider_name}' — no plugin provides this provider. Install a provider plugin (e.g., kustodian-${provider_name})`,
      ),
    );
  }

  return { success: true, value: provider };
}

/**
 * Resolves a provider from the registry for a loaded cluster.
 * Combines option resolution and provider creation.
 */
export function resolve_provider(
  registry: PluginRegistryType,
  loaded_cluster: LoadedClusterType,
  provider_name: string,
): ResultType<ClusterProviderType, KustodianErrorType> {
  const options = resolve_provider_options(loaded_cluster, provider_name);
  return create_provider(registry, provider_name, options);
}
