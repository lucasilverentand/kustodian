import type { ClusterSecretConfigType } from '../../schema/cluster.js';

/**
 * Describes a secret provider's defaults and prompts for cluster secret bootstrapping.
 */
export interface ClusterSecretProvider {
  display_name: string;
  default_namespace: string;
  default_secret_name: string;
  default_key: string;
  env_vars: string[];
  token_help_url: string;
  prompt_text: string;
  skip_warning: string;
}

/**
 * Resolved cluster secret config with all values guaranteed to be defined.
 */
export interface ResolvedSecretConfig {
  namespace: string;
  name: string;
  key: string;
  annotations?: Record<string, string>;
}

export const OCI_REGISTRY_PROVIDER: ClusterSecretProvider = {
  display_name: 'OCI Registry',
  default_namespace: 'flux-system',
  default_secret_name: 'kustodian-oci-registry',
  default_key: '.dockerconfigjson',
  env_vars: ['GITHUB_TOKEN', 'GH_TOKEN', 'REGISTRY_TOKEN'],
  token_help_url: 'https://github.com/settings/tokens',
  prompt_text: 'Enter registry token (or Enter to skip): ',
  skip_warning: 'OCI registry will be unauthenticated - Flux may fail to pull artifacts',
};

/**
 * Merges user-provided cluster_secret config with provider defaults.
 */
export function resolve_config(
  provider: ClusterSecretProvider,
  user_config?: ClusterSecretConfigType,
): ResolvedSecretConfig {
  return {
    namespace: user_config?.namespace || provider.default_namespace,
    name: user_config?.name || provider.default_secret_name,
    key: user_config?.key || provider.default_key,
    ...(user_config?.annotations && { annotations: user_config.annotations }),
  };
}
