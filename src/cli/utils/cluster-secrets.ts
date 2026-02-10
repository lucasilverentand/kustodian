import type { ClusterSecretConfigType, SecretsConfigType } from '../../schema/cluster.js';

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

/**
 * Provider config — the parts relevant to cluster secret bootstrapping.
 */
interface ProviderConfig {
  cluster_secret?: ClusterSecretConfigType | undefined;
}

export const DOPPLER_PROVIDER: ClusterSecretProvider = {
  display_name: 'Doppler',
  default_namespace: 'doppler-operator-system',
  default_secret_name: 'doppler-token',
  default_key: 'serviceToken',
  env_vars: ['DOPPLER_TOKEN'],
  token_help_url: 'https://dashboard.doppler.com',
  prompt_text: 'Enter Doppler service token (or Enter to skip): ',
  skip_warning: 'ExternalSecrets using Doppler will fail until this is configured',
};

export const ONEPASSWORD_PROVIDER: ClusterSecretProvider = {
  display_name: '1Password',
  default_namespace: 'onepassword-system',
  default_secret_name: '1password-token',
  default_key: 'token',
  env_vars: ['OP_SERVICE_ACCOUNT_TOKEN'],
  token_help_url: 'https://my.1password.com',
  prompt_text: 'Enter 1Password service account token (or Enter to skip): ',
  skip_warning: 'ExternalSecrets using 1Password will fail until this is configured',
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

/**
 * Maps over secrets config and returns [provider_descriptor, provider_config] pairs
 * for each configured provider.
 */
export function get_configured_providers(
  secrets_config: SecretsConfigType,
): Array<[ClusterSecretProvider, ProviderConfig]> {
  const providers: Array<[ClusterSecretProvider, ProviderConfig]> = [];

  if (secrets_config.doppler) {
    providers.push([DOPPLER_PROVIDER, secrets_config.doppler]);
  }

  if (secrets_config.onepassword) {
    providers.push([ONEPASSWORD_PROVIDER, secrets_config.onepassword]);
  }

  return providers;
}
