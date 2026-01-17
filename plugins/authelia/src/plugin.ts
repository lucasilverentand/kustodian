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
  check_authelia_available,
  generate_random_secret,
  hash_password,
  validate_access_control,
} from './executor.js';
import { generate_oidc_client } from './generator.js';
import type { AuthConfigType } from './types.js';
import { authelia_plugin_options_schema } from './types.js';

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
            // TODO: Implement auth config extraction from templates
            // This will:
            // 1. Extract auth configs from kustomizations
            // 2. Generate Authelia OIDC clients and access control rules
            // 3. Write configuration to output directory
            // 4. Generate Kubernetes secrets for client credentials

            // For now, just pass through
            return success(ctx);
          },
        },
        {
          event: 'generator:before',
          priority: 50,
          handler: async (_event: HookEventType, ctx: HookContextType) => {
            // TODO: This hook could be used to:
            // 1. Inject generated Authelia configurations as additional kustomizations
            // 2. Add ConfigMaps with Authelia config fragments
            // 3. Generate documentation for configured auth apps

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
