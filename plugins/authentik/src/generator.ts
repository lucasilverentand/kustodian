import type { KustodianErrorType } from '@kustodian/core';
import { type ResultType, failure, success } from '@kustodian/core';
import * as yaml from 'js-yaml';

import type {
  AuthConfigType,
  AuthentikApplicationType,
  AuthentikBlueprintType,
  AuthentikOAuth2ProviderType,
  AuthentikPluginOptionsType,
  AuthentikProxyProviderType,
  AuthentikSAMLProviderType,
} from './types.js';

/**
 * Generate a random secret for OAuth2 clients.
 */
export function generate_client_secret(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  const randomArray = new Uint8Array(length);
  crypto.getRandomValues(randomArray);
  for (const value of randomArray) {
    result += chars[value % chars.length];
  }
  return result;
}

/**
 * Generate OAuth2 provider blueprint entry.
 */
export function generate_oauth2_provider(
  auth_config: AuthConfigType,
  options: AuthentikPluginOptionsType,
): ResultType<AuthentikOAuth2ProviderType, KustodianErrorType> {
  if (auth_config.provider !== 'oauth2') {
    return failure({
      code: 'INVALID_CONFIG',
      message: 'Auth config provider must be "oauth2"',
    });
  }

  const oauth2_config = auth_config.oauth2 ?? {};
  const provider_name = `${auth_config.app_name}-oauth2`;

  const provider: AuthentikOAuth2ProviderType = {
    identifiers: {
      name: provider_name,
    },
    model: 'authentik_providers_oauth2.oauth2provider',
    attrs: {
      name: provider_name,
      client_id: oauth2_config.client_id ?? auth_config.app_name,
      client_type: oauth2_config.client_type ?? 'confidential',
      redirect_uris: oauth2_config.redirect_uris?.join('\n') ?? '',
      authorization_flow: oauth2_config.authorization_flow ?? options.default_authorization_flow,
      include_claims_in_id_token: oauth2_config.include_claims_in_id_token ?? true,
      access_token_validity: oauth2_config.access_token_validity ?? 'minutes=10',
      refresh_token_validity: oauth2_config.refresh_token_validity ?? 'days=30',
      sub_mode: oauth2_config.sub_mode ?? 'hashed_user_identifier',
      issue_refresh_tokens: oauth2_config.issue_refresh_tokens ?? true,
    },
  };

  // Add client secret if confidential and auto-generate is enabled
  if (
    provider.attrs.client_type === 'confidential' &&
    options.auto_generate_secrets &&
    !oauth2_config.client_secret
  ) {
    provider.attrs.client_secret = generate_client_secret();
  } else if (oauth2_config.client_secret) {
    provider.attrs.client_secret = oauth2_config.client_secret;
  }

  // Add optional signing key
  if (oauth2_config.signing_key) {
    provider.attrs.signing_key = oauth2_config.signing_key;
  }

  return success(provider);
}

/**
 * Generate SAML provider blueprint entry.
 */
export function generate_saml_provider(
  auth_config: AuthConfigType,
  options: AuthentikPluginOptionsType,
): ResultType<AuthentikSAMLProviderType, KustodianErrorType> {
  if (auth_config.provider !== 'saml') {
    return failure({
      code: 'INVALID_CONFIG',
      message: 'Auth config provider must be "saml"',
    });
  }

  const saml_config = auth_config.saml;
  if (!saml_config?.acs_url || !saml_config?.issuer) {
    return failure({
      code: 'INVALID_CONFIG',
      message: 'SAML provider requires acs_url and issuer',
    });
  }

  const provider_name = `${auth_config.app_name}-saml`;

  const provider: AuthentikSAMLProviderType = {
    identifiers: {
      name: provider_name,
    },
    model: 'authentik_providers_saml.samlprovider',
    attrs: {
      name: provider_name,
      acs_url: saml_config.acs_url,
      issuer: saml_config.issuer,
      sp_binding: saml_config.sp_binding ?? 'post',
      authorization_flow: saml_config.authorization_flow ?? options.default_authorization_flow,
      assertion_valid_not_before: saml_config.assertion_valid_not_before ?? 'minutes=5',
      assertion_valid_not_on_or_after: saml_config.assertion_valid_not_on_or_after ?? 'minutes=5',
      session_valid_not_on_or_after: saml_config.session_valid_not_on_or_after ?? 'minutes=86400',
    },
  };

  // Add optional fields
  if (saml_config.audience) {
    provider.attrs.audience = saml_config.audience;
  }
  if (saml_config.signing_kp) {
    provider.attrs.signing_kp = saml_config.signing_kp;
  }

  return success(provider);
}

/**
 * Generate Proxy provider blueprint entry.
 */
export function generate_proxy_provider(
  auth_config: AuthConfigType,
  options: AuthentikPluginOptionsType,
): ResultType<AuthentikProxyProviderType, KustodianErrorType> {
  if (auth_config.provider !== 'proxy') {
    return failure({
      code: 'INVALID_CONFIG',
      message: 'Auth config provider must be "proxy"',
    });
  }

  const proxy_config = auth_config.proxy;
  if (!proxy_config?.external_host) {
    return failure({
      code: 'INVALID_CONFIG',
      message: 'Proxy provider requires external_host',
    });
  }

  const provider_name = `${auth_config.app_name}-proxy`;

  const provider: AuthentikProxyProviderType = {
    identifiers: {
      name: provider_name,
    },
    model: 'authentik_providers_proxy.proxyprovider',
    attrs: {
      name: provider_name,
      external_host: proxy_config.external_host,
      internal_host_ssl_validation: proxy_config.internal_host_ssl_validation ?? true,
      basic_auth_enabled: proxy_config.basic_auth_enabled ?? false,
      mode: proxy_config.mode ?? 'forward_single',
      authorization_flow: proxy_config.authorization_flow ?? options.default_authorization_flow,
      access_token_validity: proxy_config.access_token_validity ?? 'minutes=10',
      intercept_header_auth: proxy_config.intercept_header_auth ?? true,
    },
  };

  // Add optional fields
  if (proxy_config.internal_host) {
    provider.attrs.internal_host = proxy_config.internal_host;
  }
  if (proxy_config.certificate) {
    provider.attrs.certificate = proxy_config.certificate;
  }
  if (proxy_config.skip_path_regex) {
    provider.attrs.skip_path_regex = proxy_config.skip_path_regex;
  }
  if (proxy_config.basic_auth_password_attribute) {
    provider.attrs.basic_auth_password_attribute = proxy_config.basic_auth_password_attribute;
  }
  if (proxy_config.basic_auth_user_attribute) {
    provider.attrs.basic_auth_user_attribute = proxy_config.basic_auth_user_attribute;
  }

  return success(provider);
}

/**
 * Generate application blueprint entry.
 */
export function generate_application(
  auth_config: AuthConfigType,
  provider_name: string,
): AuthentikApplicationType {
  const attrs: AuthentikApplicationType['attrs'] = {
    name: auth_config.app_display_name ?? auth_config.app_name,
    slug: auth_config.app_name,
    provider: provider_name,
    policy_engine_mode: 'any',
  };

  // Add optional fields only if defined
  if (auth_config.app_description) {
    attrs.meta_description = auth_config.app_description;
  }
  if (auth_config.app_icon) {
    attrs.meta_icon = auth_config.app_icon;
  }
  if (auth_config.app_group) {
    attrs.group = auth_config.app_group;
  }
  if (auth_config.app_launch_url) {
    attrs.meta_launch_url = auth_config.app_launch_url;
  }

  return {
    identifiers: {
      slug: auth_config.app_name,
    },
    model: 'authentik_core.application',
    attrs,
  };
}

/**
 * Generate complete Authentik blueprint from auth configuration.
 */
export function generate_authentik_blueprint(
  auth_config: AuthConfigType,
  options: AuthentikPluginOptionsType,
): ResultType<AuthentikBlueprintType, KustodianErrorType> {
  const entries: AuthentikBlueprintType['entries'] = [];

  // Generate provider based on type
  let provider_result:
    | ResultType<AuthentikOAuth2ProviderType, KustodianErrorType>
    | ResultType<AuthentikSAMLProviderType, KustodianErrorType>
    | ResultType<AuthentikProxyProviderType, KustodianErrorType>;

  switch (auth_config.provider) {
    case 'oauth2':
      provider_result = generate_oauth2_provider(auth_config, options);
      break;
    case 'saml':
      provider_result = generate_saml_provider(auth_config, options);
      break;
    case 'proxy':
      provider_result = generate_proxy_provider(auth_config, options);
      break;
    default:
      return failure({
        code: 'INVALID_CONFIG',
        message: `Unknown provider type: ${auth_config.provider}`,
      });
  }

  if (!provider_result.success) {
    return provider_result;
  }

  const provider = provider_result.value;
  entries.push(provider);

  // Generate application
  const application = generate_application(auth_config, provider.identifiers.name);
  entries.push(application);

  const blueprint: AuthentikBlueprintType = {
    version: options.blueprint_version,
    metadata: {
      name: `${auth_config.app_name}-blueprint`,
      labels: {
        'app.kubernetes.io/name': auth_config.app_name,
        'app.kubernetes.io/managed-by': 'kustodian',
      },
    },
    entries,
  };

  return success(blueprint);
}

/**
 * Convert blueprint to YAML string.
 */
export function blueprint_to_yaml(blueprint: AuthentikBlueprintType): string {
  return yaml.dump(blueprint, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}

/**
 * Parse YAML string to blueprint.
 */
export function yaml_to_blueprint(
  yaml_string: string,
): ResultType<AuthentikBlueprintType, KustodianErrorType> {
  try {
    const blueprint = yaml.load(yaml_string) as AuthentikBlueprintType;
    return success(blueprint);
  } catch (error) {
    return failure({
      code: 'PARSE_ERROR',
      message: `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
