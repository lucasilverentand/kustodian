import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { success } from 'kustodian/core';
import type {
  CommandType,
  HookContextType,
  HookEventType,
  KustodianPluginType,
  PluginCommandContributionType,
  PluginHookContributionType,
  PluginManifestType,
  PluginProviderContributionType,
} from 'kustodian/plugins';

import { create_k0s_provider } from './provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

/**
 * k0s plugin manifest.
 */
const manifest: PluginManifestType = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  capabilities: ['commands', 'hooks', 'providers'],
};

/**
 * Creates the k0s plugin.
 */
export function create_k0s_plugin(): KustodianPluginType {
  return {
    manifest,

    async activate() {
      return success(undefined);
    },

    async deactivate() {
      return success(undefined);
    },

    get_commands(): PluginCommandContributionType[] {
      const k0s_command: CommandType = {
        name: 'k0s',
        description: 'k0s cluster management commands',
        subcommands: [
          {
            name: 'info',
            description: 'Show k0s provider information',
            handler: async () => {
              console.log('k0s cluster provider');
              return success(undefined);
            },
          },
        ],
      };
      return [{ command: k0s_command }];
    },

    get_hooks(): PluginHookContributionType[] {
      return [
        {
          event: 'bootstrap:before',
          priority: 100,
          handler: async (_event: HookEventType, ctx: HookContextType) => {
            return success(ctx);
          },
        },
      ];
    },

    get_providers(): PluginProviderContributionType[] {
      return [
        {
          name: 'k0s',
          factory: (options) => create_k0s_provider(options),
        },
      ];
    },
  };
}

/**
 * Default plugin export.
 * This is loaded when the plugin is discovered and imported.
 */
export const plugin = create_k0s_plugin();

export default plugin;
