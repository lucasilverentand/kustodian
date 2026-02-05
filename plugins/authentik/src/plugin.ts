import { success } from 'kustodian/core';
import type {
  CommandType,
  GeneratorHookContextType,
  HookContextType,
  HookEventType,
  KustodianPluginType,
  PluginCommandContributionType,
  PluginHookContributionType,
  PluginManifestType,
} from 'kustodian/plugins';
import type {
  AuthConfigType as CoreAuthConfigType,
  KustomizationType,
  TemplateType,
} from 'kustodian/schema';

import {
  check_authentik_available,
  generate_random_secret,
  validate_blueprint,
} from './executor.js';
import { blueprint_to_yaml, generate_authentik_blueprint } from './generator.js';
import type { AuthConfigType, AuthProviderType } from './types.js';
import { authentik_plugin_options_schema } from './types.js';

/**
 * Maps core auth config to Authentik-specific auth config.
 * Validates that the provider is 'authentik' and maps fields appropriately.
 */
function map_to_authentik_config(core_config: CoreAuthConfigType): AuthConfigType | undefined {
  // Only process configs targeting this plugin
  if (core_config.provider !== 'authentik') {
    return undefined;
  }

  // Map the core auth type to Authentik provider type
  const provider_type = core_config.type as AuthProviderType;
  if (!['oauth2', 'saml', 'proxy'].includes(provider_type)) {
    return undefined;
  }

  // Build the Authentik-specific config
  const authentik_config: AuthConfigType = {
    provider: provider_type,
    app_name: core_config.app_name,
    app_display_name: core_config.app_display_name,
    app_description: core_config.app_description,
    app_icon: core_config.app_icon,
    app_group: core_config.app_group,
    app_launch_url: core_config.app_launch_url,
  };

  // Map provider-specific config from the passthrough config object
  const config = core_config.config ?? {};
  if (provider_type === 'oauth2' && config) {
    authentik_config.oauth2 = {
      client_id: (config['client_id'] as string) ?? core_config.app_name,
      redirect_uris: (config['redirect_uris'] as string[]) ?? [],
      ...(config as Record<string, unknown>),
    };
  }

  if (provider_type === 'saml' && config) {
    authentik_config.saml = {
      acs_url: (config['acs_url'] as string) ?? '',
      issuer: (config['issuer'] as string) ?? core_config.app_name,
      ...(config as Record<string, unknown>),
    };
  }

  if (provider_type === 'proxy' && config) {
    authentik_config.proxy = {
      external_host: core_config.external_host ?? (config['external_host'] as string) ?? '',
      ...(config as Record<string, unknown>),
    };
  }

  return authentik_config;
}

/**
 * Extracts auth configs from templates that target Authentik.
 */
function extract_authentik_configs(templates: unknown[]): AuthConfigType[] {
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
        const authentik_config = map_to_authentik_config(kust.auth);
        if (authentik_config) {
          auth_configs.push(authentik_config);
        }
      }
    }
  }

  return auth_configs;
}

/**
 * Authentik plugin manifest.
 */
const manifest: PluginManifestType = {
  name: '@kustodian/plugin-authentik',
  version: '1.0.0',
  description: 'Authentik authentication provider plugin for Kustodian',
  capabilities: ['commands', 'hooks'],
};

/**
 * Creates the Authentik plugin.
 */
export function create_authentik_plugin(
  options: Record<string, unknown> = {},
): KustodianPluginType {
  // Parse options through schema to apply defaults
  const plugin_options = authentik_plugin_options_schema.parse(options);

  return {
    manifest,

    async activate() {
      // Verify CLI availability on activation (warning only)
      const check_result = await check_authentik_available();
      if (!check_result.success) {
        console.warn('Authentik CLI not found - some features may be unavailable');
        console.warn('Install from: https://goauthentik.io/docs/installation/');
      }
      return success(undefined);
    },

    async deactivate() {
      return success(undefined);
    },

    get_commands(): PluginCommandContributionType[] {
      const authentik_command: CommandType = {
        name: 'authentik',
        description: 'Authentik authentication provider commands',
        subcommands: [
          {
            name: 'check',
            description: 'Check Authentik CLI availability',
            handler: async () => {
              const result = await check_authentik_available();
              if (result.success) {
                console.log(`Authentik CLI: ${result.value}`);
                return success(undefined);
              }
              console.error('Authentik CLI not available');
              return result;
            },
          },
          {
            name: 'generate-secret',
            description: 'Generate random secret for OAuth2 client',
            arguments: [
              {
                name: 'length',
                description: 'Secret length (default: 64)',
                required: false,
              },
            ],
            handler: async (ctx: {
              args: string[];
              options: Record<string, unknown>;
              data: Record<string, unknown>;
            }) => {
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
            name: 'generate-blueprint',
            description: 'Generate Authentik blueprint from auth configuration',
            arguments: [
              {
                name: 'app-name',
                description: 'Application name',
                required: true,
              },
              {
                name: 'provider',
                description: 'Provider type (oauth2, saml, proxy)',
                required: true,
              },
              {
                name: 'config-json',
                description: 'JSON configuration for the provider',
                required: true,
              },
            ],
            handler: async (ctx: {
              args: string[];
              options: Record<string, unknown>;
              data: Record<string, unknown>;
            }) => {
              const app_name = ctx.args[0];
              const provider = ctx.args[1] as 'oauth2' | 'saml' | 'proxy';
              const config_json = ctx.args[2];

              if (!app_name || !provider || !config_json) {
                console.error('App name, provider, and config JSON are required');
                return success(undefined);
              }

              try {
                const provider_config = JSON.parse(config_json);
                const auth_config: AuthConfigType = {
                  provider,
                  app_name,
                  [provider]: provider_config,
                };

                const result = generate_authentik_blueprint(auth_config, plugin_options);
                if (result.success) {
                  console.log('Generated blueprint:');
                  console.log(blueprint_to_yaml(result.value));
                  return success(undefined);
                }

                console.error(`Failed to generate blueprint: ${result.error.message}`);
                return result;
              } catch (error) {
                console.error(
                  `Failed to parse config JSON: ${error instanceof Error ? error.message : String(error)}`,
                );
                return success(undefined);
              }
            },
          },
          {
            name: 'validate-blueprint',
            description: 'Validate Authentik blueprint file',
            arguments: [
              {
                name: 'blueprint-path',
                description: 'Path to blueprint file',
                required: true,
              },
            ],
            handler: async (ctx: {
              args: string[];
              options: Record<string, unknown>;
              data: Record<string, unknown>;
            }) => {
              const blueprint_path = ctx.args[0];

              if (!blueprint_path) {
                console.error('Blueprint path is required');
                return success(undefined);
              }

              const result = await validate_blueprint(blueprint_path);
              if (result.success) {
                console.log('✓ Blueprint is valid');
                return success(undefined);
              }

              console.error(`✗ Blueprint validation failed: ${result.error.message}`);
              return result;
            },
          },
        ],
      };
      return [{ command: authentik_command }];
    },

    get_hooks(): PluginHookContributionType[] {
      return [
        {
          event: 'generator:after_resolve',
          priority: 40, // Run before secret providers to allow auth configs to be processed
          handler: async (_event: HookEventType, ctx: HookContextType) => {
            const generator_ctx = ctx as GeneratorHookContextType;
            const templates = generator_ctx.templates ?? [];

            // Extract auth configs targeting Authentik
            const auth_configs = extract_authentik_configs(templates);

            if (auth_configs.length === 0) {
              return success(ctx);
            }

            // Generate Authentik blueprints for each auth config
            const blueprints: string[] = [];
            for (const auth_config of auth_configs) {
              const blueprint_result = generate_authentik_blueprint(auth_config, plugin_options);
              if (!blueprint_result.success) {
                console.warn(
                  `Authentik blueprint generation failed for ${auth_config.app_name}: ${blueprint_result.error.message}`,
                );
                continue;
              }
              blueprints.push(blueprint_to_yaml(blueprint_result.value));
            }

            // Store generated blueprints in context for later output
            const extended_ctx = ctx as GeneratorHookContextType & {
              authentik_blueprints?: string[];
              authentik_apps?: number;
            };
            extended_ctx.authentik_blueprints = blueprints;
            extended_ctx.authentik_apps = auth_configs.length;

            console.log(
              `Authentik: Generated ${blueprints.length} blueprint(s) for ${auth_configs.length} application(s)`,
            );

            return success(extended_ctx as HookContextType);
          },
        },
        {
          event: 'generator:before_write',
          priority: 50,
          handler: async (_event: HookEventType, ctx: HookContextType) => {
            // This hook can be used to add the Authentik blueprints to the output files
            const extended_ctx = ctx as GeneratorHookContextType & {
              authentik_blueprints?: string[];
              authentik_apps?: number;
            };

            if (extended_ctx.authentik_blueprints && extended_ctx.authentik_blueprints.length > 0) {
              console.log(
                `Authentik: ${extended_ctx.authentik_blueprints.length} blueprint(s) ready to write`,
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
export const plugin = create_authentik_plugin();

export default plugin;
