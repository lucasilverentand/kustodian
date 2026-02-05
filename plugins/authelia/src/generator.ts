import * as yaml from 'js-yaml';
import {
  type KustodianErrorType,
  type ResultType,
  create_error,
  failure,
  success,
} from 'kustodian/core';
import type {
  AccessControlRuleType,
  AuthConfigType,
  AutheliaConfigType,
  AutheliaPluginOptionsType,
  OIDCClientConfigType,
} from './types.js';

/**
 * Generates an OIDC client configuration from auth config
 */
export function generate_oidc_client(
  auth_config: AuthConfigType,
  options: AutheliaPluginOptionsType,
): ResultType<OIDCClientConfigType, KustodianErrorType> {
  try {
    const client_id = auth_config.app_name;

    // Build base client config
    const client: OIDCClientConfigType = {
      client_id,
      client_name: auth_config.app_display_name ?? auth_config.app_name,
      public: auth_config.oidc?.public ?? false,
      authorization_policy: auth_config.oidc?.authorization_policy ?? options.default_policy,
      require_pkce: auth_config.oidc?.require_pkce ?? true,
      pkce_challenge_method: auth_config.oidc?.pkce_challenge_method ?? 'S256',
      redirect_uris: auth_config.oidc?.redirect_uris ?? [],
      scopes: auth_config.oidc?.scopes ?? ['openid', 'profile', 'email', 'groups'],
      response_types: auth_config.oidc?.response_types ?? ['code'],
      grant_types: auth_config.oidc?.grant_types ?? ['authorization_code'],
      token_endpoint_auth_method:
        auth_config.oidc?.token_endpoint_auth_method ?? 'client_secret_basic',
    };

    // Add client secret if not public and auto-generation is enabled
    if (!client.public && options.auto_generate_secrets) {
      // In production, this should generate a proper hashed secret
      // For now, we'll add a placeholder that users must replace
      client.client_secret = `\${${client_id.toUpperCase().replace(/-/g, '_')}_CLIENT_SECRET}`;
    } else if (auth_config.oidc?.client_secret) {
      client.client_secret = auth_config.oidc.client_secret;
    }

    // Add optional fields
    if (auth_config.oidc?.consent_mode) {
      client.consent_mode = auth_config.oidc.consent_mode;
    }

    if (auth_config.oidc?.pre_configured_consent_duration) {
      client.pre_configured_consent_duration = auth_config.oidc.pre_configured_consent_duration;
    }

    if (auth_config.oidc?.audience) {
      client.audience = auth_config.oidc.audience;
    }

    // Merge additional options
    if (auth_config.oidc?.additional_options) {
      Object.assign(client, auth_config.oidc.additional_options);
    }

    return success(client);
  } catch (error) {
    return failure(
      create_error(
        'AUTHELIA_CLIENT_GENERATION_FAILED',
        `Failed to generate OIDC client: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

/**
 * Generates access control rules from auth config
 */
export function generate_access_control_rules(
  auth_config: AuthConfigType,
  _options: AutheliaPluginOptionsType,
): ResultType<AccessControlRuleType[], KustodianErrorType> {
  try {
    const rules: AccessControlRuleType[] = [];

    // Add custom access control rules if provided
    if (auth_config.access_control) {
      rules.push(...auth_config.access_control);
    }

    // Generate proxy/forward auth rules
    if (auth_config.provider === 'proxy' && auth_config.external_host) {
      const domain = new URL(auth_config.external_host).hostname;
      const rule: AccessControlRuleType = {
        domain,
        policy: auth_config.proxy?.policy ?? 'two_factor',
      };

      // Add networks if specified
      if (auth_config.proxy?.networks) {
        rule.networks = auth_config.proxy.networks;
      }

      // Add subject if specified
      if (auth_config.proxy?.subject) {
        rule.subject = auth_config.proxy.subject;
      }

      // Add resource patterns if skip_path_regex is specified
      if (auth_config.proxy?.skip_path_regex) {
        // Create a bypass rule for skipped paths
        rules.push({
          domain,
          policy: 'bypass',
          resources: [auth_config.proxy.skip_path_regex],
        });
      }

      rules.push(rule);
    }

    // Generate OIDC access control rules
    if (auth_config.provider === 'oidc' && auth_config.external_host) {
      const domain = new URL(auth_config.external_host).hostname;
      rules.push({
        domain,
        policy: auth_config.oidc?.authorization_policy ?? 'two_factor',
      });
    }

    return success(rules);
  } catch (error) {
    return failure(
      create_error(
        'AUTHELIA_ACCESS_CONTROL_GENERATION_FAILED',
        `Failed to generate access control rules: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

/**
 * Generates complete Authelia configuration from multiple auth configs
 */
export function generate_authelia_config(
  auth_configs: AuthConfigType[],
  options: AutheliaPluginOptionsType,
): ResultType<AutheliaConfigType, KustodianErrorType> {
  try {
    const config: AutheliaConfigType = {
      identity_providers: {
        oidc: {
          clients: [],
        },
      },
      access_control: {
        default_policy: options.default_policy,
        rules: [],
      },
    };

    // Generate OIDC clients and access control rules
    for (const auth_config of auth_configs) {
      // Generate OIDC client if provider is OIDC
      if (auth_config.provider === 'oidc') {
        const client_result = generate_oidc_client(auth_config, options);
        if (!client_result.success) {
          return client_result;
        }
        config.identity_providers?.oidc?.clients?.push(client_result.value);
      }

      // Generate access control rules
      const rules_result = generate_access_control_rules(auth_config, options);
      if (!rules_result.success) {
        return rules_result;
      }
      config.access_control?.rules?.push(...rules_result.value);
    }

    return success(config);
  } catch (error) {
    return failure(
      create_error(
        'AUTHELIA_CONFIG_GENERATION_FAILED',
        `Failed to generate Authelia configuration: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

/**
 * Converts Authelia configuration to YAML string
 */
export function config_to_yaml(config: AutheliaConfigType): ResultType<string, KustodianErrorType> {
  try {
    const yaml_output = yaml.dump(config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
    return success(yaml_output);
  } catch (error) {
    return failure(
      create_error(
        'AUTHELIA_YAML_SERIALIZATION_FAILED',
        `Failed to convert config to YAML: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

/**
 * Parses YAML string to Authelia configuration
 */
export function yaml_to_config(
  yaml_string: string,
): ResultType<AutheliaConfigType, KustodianErrorType> {
  try {
    const config = yaml.load(yaml_string) as AutheliaConfigType;
    return success(config);
  } catch (error) {
    return failure(
      create_error(
        'AUTHELIA_YAML_PARSING_FAILED',
        `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}
