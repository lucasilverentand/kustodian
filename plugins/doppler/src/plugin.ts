import { success } from 'kustodian/core';
import type {
  CommandType,
  HookContextType,
  HookEventType,
  KustodianPluginType,
  PluginCommandContributionType,
  PluginHookContributionType,
  PluginManifestType,
} from 'kustodian/plugins';

import {
  check_doppler_available,
  doppler_secret_get,
  doppler_secrets_download,
} from './executor.js';
import type { DopplerPluginOptionsType } from './types.js';

/**
 * Doppler plugin manifest.
 */
const manifest: PluginManifestType = {
  name: '@kustodian/plugin-doppler',
  version: '0.1.0',
  description: 'Doppler secret provider for Kustodian',
  capabilities: ['commands', 'hooks'],
};

/**
 * Creates the Doppler plugin.
 */
export function create_doppler_plugin(options: DopplerPluginOptionsType = {}): KustodianPluginType {
  return {
    manifest,

    async activate() {
      // Verify CLI availability on activation (warning only)
      const check_result = await check_doppler_available();
      if (!check_result.success) {
        console.warn('Doppler CLI not found - secret resolution may fail');
      }
      return success(undefined);
    },

    async deactivate() {
      return success(undefined);
    },

    get_commands(): PluginCommandContributionType[] {
      const doppler_command: CommandType = {
        name: 'doppler',
        description: 'Doppler secret management commands',
        subcommands: [
          {
            name: 'check',
            description: 'Check Doppler CLI availability and authentication',
            handler: async () => {
              const result = await check_doppler_available();
              if (result.success) {
                console.log(`Doppler CLI version: ${result.value}`);
                return success(undefined);
              }
              console.error('Doppler CLI not available');
              return result;
            },
          },
          {
            name: 'test',
            description: 'Test reading a secret from Doppler',
            arguments: [
              { name: 'project', description: 'Doppler project', required: true },
              { name: 'config', description: 'Doppler config', required: true },
              { name: 'secret', description: 'Secret name', required: true },
            ],
            handler: async (ctx) => {
              const [project, config, secret] = ctx.args;
              if (!project || !config || !secret) {
                console.error('Missing required arguments: project, config, secret');
                return success(undefined);
              }

              const result = await doppler_secret_get(project, config, secret, options);
              if (result.success) {
                console.log('Secret retrieved successfully (value hidden)');
                console.log(`Length: ${result.value.length} characters`);
                return success(undefined);
              }

              console.error(`Failed to read secret: ${result.error.message}`);
              return result;
            },
          },
          {
            name: 'list-secrets',
            description: 'List available secrets in a Doppler config',
            arguments: [
              { name: 'project', description: 'Doppler project', required: true },
              { name: 'config', description: 'Doppler config', required: true },
            ],
            handler: async (ctx) => {
              const [project, config] = ctx.args;
              if (!project || !config) {
                console.error('Missing required arguments: project, config');
                return success(undefined);
              }

              const result = await doppler_secrets_download(project, config, options);
              if (result.success) {
                console.log('Available secrets:');
                for (const key of Object.keys(result.value)) {
                  console.log(`  - ${key}`);
                }
                return success(undefined);
              }

              console.error(`Failed to list secrets: ${result.error.message}`);
              return result;
            },
          },
        ],
      };
      return [{ command: doppler_command }];
    },

    get_hooks(): PluginHookContributionType[] {
      return [
        {
          event: 'generator:after_resolve',
          priority: 50, // Run before default (100) to inject secrets early
          handler: async (_event: HookEventType, ctx: HookContextType) => {
            // Hook for secret injection will be implemented in generator integration
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
export const plugin = create_doppler_plugin();

export default plugin;
