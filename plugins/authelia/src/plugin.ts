import { success } from '@kustodian/core';
import type {
  CommandType,
  GeneratorHookContextType,
  HookContextType,
  HookEventType,
  KustodianPluginType,
  PluginCommandContributionType,
  PluginHookContributionType,
  PluginManifestType,
} from '@kustodian/plugins';
import type {
  AuthConfigType as CoreAuthConfigType,
  KustomizationType,
  TemplateType,
} from '@kustodian/schema';

import {
  check_authelia_available,
  generate_random_secret,
  hash_password,
  validate_access_control,
} from './executor.js';
import { config_to_yaml, generate_authelia_config, generate_oidc_client } from './generator.js';
import type { AuthConfigType, AuthProviderType } from './types.js';
import { authelia_plugin_options_schema } from './types.js';

/**
 * Maps core auth config to Authelia-specific auth config.
 * Validates that the provider is 'authelia' and maps fields appropriately.
 */
function map_to_authelia_config(core_config: CoreAuthConfigType): AuthConfigType | undefined {
  // Only process configs targeting this plugin
  if (core_config.provider !== 'authelia') {
    return undefined;
  }

  // Map the core auth type to Authelia provider type
  const provider_type = core_config.type as AuthProviderType;
  if (!['oidc', 'proxy', 'header'].includes(provider_type)) {
    return undefined;
  }

  // Build the Authelia-specific config
  const authelia_config: AuthConfigType = {
    provider: provider_type,
    app_name: core_config.app_name,
    app_display_name: core_config.app_display_name,
    app_description: core_config.app_description,
    app_icon: core_config.app_icon,
    app_group: core_config.app_group,
    app_launch_url: core_config.app_launch_url,
    external_host: core_config.external_host,
    internal_host: core_config.internal_host,
  };

  // Map provider-specific config from the passthrough config object
  const config = core_config.config ?? {};
  if (provider_type === 'oidc' && config) {
    authelia_config.oidc = {
      client_id: (config['client_id'] as string) ?? core_config.app_name,
      redirect_uris: (config['redirect_uris'] as string[]) ?? [],
      ...(config as Record<string, unknown>),
    };
  }

  if (provider_type === 'proxy' && config) {
    authelia_config.proxy = {
      external_host: core_config.external_host ?? '',
      internal_host: core_config.internal_host ?? '',
      ...(config as Record<string, unknown>),
    };
  }

  if (config['access_control']) {
    authelia_config.access_control = config['access_control'] as AuthConfigType['access_control'];
  }

  return authelia_config;
}

/**
 * Extracts auth configs from templates that target Authelia.
 */
function extract_authelia_configs(templates: unknown[]): AuthConfigType[] {
  const auth_configs: AuthConfigType[] = [];

  for (const template_entry of templates) {
    const resolved = template_entry as { template?: TemplateType; enabled?: boolean };
    if (!resolved.enabled || !resolved.template) {
      continue;
    }

    const template = resolved.template;
    for (const kustomization of template.spec.kustomizations) {
      const kust = kustomization as KustomizationType;
      if (kust.auth) {
        const authelia_config = map_to_authelia_config(kust.auth);
        if (authelia_config) {
          auth_configs.push(authelia_config);
        }
      }
    }
  }

  return auth_configs;
}

/**
 * Authelia plugin manifest.
 */
const manifest: PluginManifestType = {
  name: '@kustodian/plugin-authelia',
  version: '1.0.0',
  description: 'Authelia authentication provider plugin for Kustodian',
  capabilities: ['commands', 'hooks'],
};

/**
 * Creates the Authelia plugin.
 */
export function create_authelia_plugin(options: Record<string, unknown> = {}): KustodianPluginType {
  // Parse options through schema to apply defaults
  const plugin_options = authelia_plugin_options_schema.parse(options);

  return {
    manifest,

    async activate() {
      // Verify CLI availability on activation (warning only)
      const check_result = await check_authelia_available();
      if (!check_result.success) {
        console.warn('Authelia CLI not found - some features may be unavailable');
        console.warn('Install from: https://www.authelia.com/integration/deployment/installation/');
      }
      return success(undefined);
    },

    async deactivate() {
      return success(undefined);
    },

    get_commands(): PluginCommandContributionType[] {
      const authelia_command: CommandType = {
        name: 'authelia',
        description: 'Authelia authentication provider commands',
        subcommands: [
          {
            name: 'check',
            description: 'Check Authelia CLI availability',
            handler: async () => {
              const result = await check_authelia_available();
              if (result.success) {
                console.log(`Authelia CLI: ${result.value}`);
                return success(undefined);
              }
              console.error('Authelia CLI not available');
              return result;
            },
          },
          {
            name: 'hash-password',
            description: 'Generate hashed password for Authelia',
            arguments: [
              {
                name: 'password',
                description: 'Password to hash',
                required: true,
              },
              {
                name: 'algorithm',
                description: 'Hashing algorithm (pbkdf2 or argon2)',
                required: false,
              },
            ],
            handler: async (ctx) => {
              const password = ctx.args[0];
              const algorithm = (ctx.args[1] as 'pbkdf2' | 'argon2') ?? 'pbkdf2';

              if (!password) {
                console.error('Password is required');
                return success(undefined);
              }

              const result = await hash_password(password, algorithm);
              if (result.success) {
                console.log('Hashed password:');
                console.log(result.value);
                return success(undefined);
              }

              console.error(`Failed to hash password: ${result.error.message}`);
              return result;
            },
          },
          {
            name: 'generate-secret',
            description: 'Generate random secret for OIDC client',
            arguments: [
              {
                name: 'length',
                description: 'Secret length (default: 64)',
                required: false,
              },
            ],
            handler: async (ctx) => {
              const length = ctx.args[0] ? Number.parseInt(ctx.args[0], 10) : 64;

              const result = await generate_random_secret(length);
              if (result.success) {
                console.log('Generated secret:');
                console.log(result.value);
                return success(undefined);
              }

              console.error(`Failed to generate secret: ${result.error.message}`);
              return result;
            },
          },
          {
            name: 'generate-client',
            description: 'Generate OIDC client configuration',
            arguments: [
              {
                name: 'app-name',
                description: 'Application name',
                required: true,
              },
              {
                name: 'redirect-uri',
                description: 'OAuth redirect URI',
                required: true,
              },
            ],
            handler: async (ctx) => {
              const app_name = ctx.args[0];
              const redirect_uri = ctx.args[1];

              if (!app_name || !redirect_uri) {
                console.error('App name and redirect URI are required');
                return success(undefined);
              }

              const auth_config: AuthConfigType = {
                provider: 'oidc',
                app_name,
                oidc: {
                  client_id: app_name,
                  redirect_uris: [redirect_uri],
                },
              };

              const result = generate_oidc_client(auth_config, plugin_options);
              if (result.success) {
                console.log('Generated OIDC client configuration:');
                console.log(JSON.stringify(result.value, null, 2));
                return success(undefined);
              }

              console.error(`Failed to generate client: ${result.error.message}`);
              return result;
            },
          },
          {
            name: 'validate-config',
            description: 'Validate Authelia configuration file',
            arguments: [
              {
                name: 'config-path',
                description: 'Path to Authelia configuration file',
                required: true,
              },
            ],
            handler: async (ctx) => {
              const config_path = ctx.args[0];

              if (!config_path) {
                console.error('Configuration path is required');
                return success(undefined);
              }

              const result = await validate_access_control(config_path);
              if (result.success) {
                console.log('✓ Configuration is valid');
                return success(undefined);
              }

              console.error(`✗ Configuration validation failed: ${result.error.message}`);
              return result;
            },
          },
        ],
      };
      return [{ command: authelia_command }];
    },

    get_hooks(): PluginHookContributionType[] {
      return [
        {
          event: 'generator:after_resolve',
          priority: 40, // Run before secret providers to allow auth configs to be processed
          handler: async (_event: HookEventType, ctx: HookContextType) => {
            const generator_ctx = ctx as GeneratorHookContextType;
            const templates = generator_ctx.templates ?? [];

            // Extract auth configs targeting Authelia
            const auth_configs = extract_authelia_configs(templates);

            if (auth_configs.length === 0) {
              return success(ctx);
            }

            // Generate Authelia configuration
            const config_result = generate_authelia_config(auth_configs, plugin_options);
            if (!config_result.success) {
              console.warn(`Authelia config generation failed: ${config_result.error.message}`);
              return success(ctx);
            }

            // Convert to YAML for output
            const yaml_result = config_to_yaml(config_result.value);
            if (!yaml_result.success) {
              console.warn(`Authelia YAML conversion failed: ${yaml_result.error.message}`);
              return success(ctx);
            }

            // Store generated config in context for later output
            // The generator can use this to write additional files
            const extended_ctx = ctx as GeneratorHookContextType & {
              authelia_config?: string;
              authelia_clients?: number;
            };
            extended_ctx.authelia_config = yaml_result.value;
            extended_ctx.authelia_clients = auth_configs.length;

            console.log(`Authelia: Generated config for ${auth_configs.length} application(s)`);

            return success(extended_ctx as HookContextType);
          },
        },
        {
          event: 'generator:before_write',
          priority: 50,
          handler: async (_event: HookEventType, ctx: HookContextType) => {
            // This hook can be used to add the Authelia config to the output files
            // For now, we just log that the config was generated
            const extended_ctx = ctx as GeneratorHookContextType & {
              authelia_config?: string;
              authelia_clients?: number;
            };

            if (extended_ctx.authelia_config) {
              console.log(
                `Authelia: Config ready to write (${extended_ctx.authelia_clients} client(s))`,
              );
            }

            return success(ctx);
          },
        },
      ];
    },
  };
}

/**
 * Default plugin export.
 */
export const plugin = create_authelia_plugin();

export default plugin;
