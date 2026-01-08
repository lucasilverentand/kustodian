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

import { create_k0s_provider } from './provider.js';
import type { K0sProviderOptionsType } from './types.js';

/**
 * k0s plugin manifest.
 */
const manifest: PluginManifestType = {
  name: '@kustodian/plugin-k0s',
  version: '0.1.0',
  description: 'k0s cluster provider for Kustodian',
  capabilities: ['commands', 'hooks'],
};

/**
 * Creates the k0s plugin.
 */
export function create_k0s_plugin(options: K0sProviderOptionsType = {}): KustodianPluginType {
  const provider = create_k0s_provider(options);

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
              console.log('Provider name:', provider.name);
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
            // Could add k0s-specific pre-bootstrap validation here
            return success(ctx);
          },
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
