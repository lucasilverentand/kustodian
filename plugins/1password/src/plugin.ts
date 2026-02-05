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

import { check_op_available, op_read } from './executor.js';
import type { OnePasswordPluginOptionsType } from './types.js';

/**
 * 1Password plugin manifest.
 */
const manifest: PluginManifestType = {
  name: '@kustodian/plugin-1password',
  version: '0.1.0',
  description: '1Password secret provider for Kustodian',
  capabilities: ['commands', 'hooks'],
};

/**
 * Creates the 1Password plugin.
 */
export function create_onepassword_plugin(
  options: OnePasswordPluginOptionsType = {},
): KustodianPluginType {
  return {
    manifest,

    async activate() {
      // Verify CLI availability on activation (warning only)
      const check_result = await check_op_available();
      if (!check_result.success) {
        console.warn('1Password CLI (op) not found - secret resolution may fail');
      }
      return success(undefined);
    },

    async deactivate() {
      return success(undefined);
    },

    get_commands(): PluginCommandContributionType[] {
      const onepassword_command: CommandType = {
        name: '1password',
        description: '1Password secret management commands',
        subcommands: [
          {
            name: 'check',
            description: 'Check 1Password CLI availability and authentication',
            handler: async () => {
              const result = await check_op_available();
              if (result.success) {
                console.log(`1Password CLI version: ${result.value}`);
                return success(undefined);
              }
              console.error('1Password CLI not available');
              return result;
            },
          },
          {
            name: 'test',
            description: 'Test reading a secret reference',
            arguments: [
              {
                name: 'ref',
                description: 'Secret reference (op://vault/item/field)',
                required: true,
              },
            ],
            handler: async (ctx) => {
              const ref = ctx.args[0];
              if (!ref) {
                console.error('Missing secret reference');
                return success(undefined);
              }

              const result = await op_read(ref, options);
              if (result.success) {
                console.log('Secret retrieved successfully (value hidden)');
                console.log(`Length: ${result.value.length} characters`);
                return success(undefined);
              }

              console.error(`Failed to read secret: ${result.error.message}`);
              return result;
            },
          },
        ],
      };
      return [{ command: onepassword_command }];
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
export const plugin = create_onepassword_plugin();

export default plugin;
