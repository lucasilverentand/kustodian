import { success } from '@kustodian/core';
import type {
  CommandType,
  HookContextType,
  HookEventType,
  KustodianPluginType,
  PluginCommandContributionType,
  PluginHookContributionType,
  PluginManifestType,
} from '@kustodian/plugins';

import {
  check_authentik_available,
  generate_random_secret,
  validate_blueprint,
} from './executor.js';
import { blueprint_to_yaml, generate_authentik_blueprint } from './generator.js';
import type { AuthConfigType } from './types.js';
import { authentik_plugin_options_schema } from './types.js';

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
            // TODO: Implement auth config extraction from templates
            // This will:
            // 1. Extract auth configs from kustomizations
            // 2. Generate Authentik blueprints
            // 3. Write blueprints to output directory
            // 4. Generate Kubernetes ConfigMaps with blueprints

            // For now, just pass through
            return success(ctx);
          },
        },
        {
          event: 'generator:before',
          priority: 50,
          handler: async (_event: HookEventType, ctx: HookContextType) => {
            // TODO: This hook could be used to:
            // 1. Inject generated Authentik blueprints as ConfigMaps
            // 2. Generate documentation for configured applications
            // 3. Validate auth configuration consistency

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
