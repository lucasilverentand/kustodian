import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { success } from '../../src/core/index.js';

import type { PluginGeneratorType } from '../../src/plugins/generators.js';
import { create_plugin_registry } from '../../src/plugins/registry.js';
import type {
  KustodianPluginType,
  LoadedPluginType,
  PluginManifestType,
} from '../../src/plugins/types.js';

describe('Plugin Registry', () => {
  // Helper to create a mock plugin
  const create_mock_plugin = (
    name: string,
    options: {
      commands?: boolean;
      hooks?: boolean;
      generators?: boolean;
      object_types?: boolean;
    } = {},
  ): KustodianPluginType => {
    const manifest: PluginManifestType = {
      name,
      version: '1.0.0',
      capabilities: [],
    };

    if (options.commands) manifest.capabilities.push('commands');
    if (options.hooks) manifest.capabilities.push('hooks');
    if (options.generators) manifest.capabilities.push('generators');
    if (options.object_types) manifest.capabilities.push('object-types');

    const plugin: KustodianPluginType = { manifest };

    if (options.commands) {
      plugin.get_commands = () => [
        {
          command: {
            name: `${name}-cmd`,
            description: `Command from ${name}`,
          },
        },
      ];
    }

    if (options.hooks) {
      plugin.get_hooks = () => [
        {
          event: 'generator:before',
          handler: async (_event, ctx) => success(ctx),
        },
      ];
    }

    if (options.generators) {
      plugin.get_generators = () => [
        {
          name: `${name}-generator`,
          handles: [{ api_version: `${name}/v1`, kind: 'Resource' }],
          generate: async () => success([]),
        } as PluginGeneratorType,
      ];
    }

    if (options.object_types) {
      plugin.get_object_types = () => [
        {
          api_version: `${name}/v1`,
          kind: 'CustomResource',
          schema: z.object({
            apiVersion: z.string(),
            kind: z.string(),
          }),
          locations: ['standalone'] as 'standalone'[],
        },
      ];
    }

    return plugin;
  };

  const wrap_as_loaded = (plugin: KustodianPluginType): LoadedPluginType => ({
    plugin,
    location: {
      source: 'local',
      module_path: plugin.manifest.name,
      resolved_path: `/test/${plugin.manifest.name}`,
    },
  });

  describe('register', () => {
    it('should register a plugin', () => {
      const registry = create_plugin_registry();
      const plugin = create_mock_plugin('test-plugin');

      const result = registry.register(wrap_as_loaded(plugin));

      expect(result.success).toBe(true);
      expect(registry.get('test-plugin')).toBe(plugin);
    });

    it('should reject duplicate plugin names', () => {
      const registry = create_plugin_registry();
      const plugin1 = create_mock_plugin('test');
      const plugin2 = create_mock_plugin('test');

      registry.register(wrap_as_loaded(plugin1));
      const result = registry.register(wrap_as_loaded(plugin2));

      expect(result.success).toBe(false);
    });

    it('should collect command contributions', () => {
      const registry = create_plugin_registry();
      const plugin = create_mock_plugin('cmd-plugin', { commands: true });

      registry.register(wrap_as_loaded(plugin));

      const commands = registry.get_commands();
      expect(commands).toHaveLength(1);
      expect(commands[0]?.command.name).toBe('cmd-plugin-cmd');
    });

    it('should collect hook contributions', () => {
      const registry = create_plugin_registry();
      const plugin = create_mock_plugin('hook-plugin', { hooks: true });

      registry.register(wrap_as_loaded(plugin));

      const dispatcher = registry.get_hook_dispatcher();
      expect(dispatcher.has_hooks('generator:before')).toBe(true);
    });

    it('should collect generator contributions', () => {
      const registry = create_plugin_registry();
      const plugin = create_mock_plugin('gen-plugin', { generators: true });

      registry.register(wrap_as_loaded(plugin));

      const generators = registry.get_generators();
      expect(generators).toHaveLength(1);
      expect(generators[0]?.name).toBe('gen-plugin-generator');
    });

    it('should collect object type contributions', () => {
      const registry = create_plugin_registry();
      const plugin = create_mock_plugin('type-plugin', { object_types: true });

      registry.register(wrap_as_loaded(plugin));

      const object_types = registry.get_object_types();
      expect(object_types.has('type-plugin/v1', 'CustomResource')).toBe(true);
    });
  });

  describe('get', () => {
    it('should return undefined for unregistered plugin', () => {
      const registry = create_plugin_registry();

      const result = registry.get('unknown');

      expect(result).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list all registered plugin manifests', () => {
      const registry = create_plugin_registry();
      registry.register(wrap_as_loaded(create_mock_plugin('plugin-a')));
      registry.register(wrap_as_loaded(create_mock_plugin('plugin-b')));

      const manifests = registry.list();

      expect(manifests).toHaveLength(2);
      expect(manifests.map((m) => m.name)).toContain('plugin-a');
      expect(manifests.map((m) => m.name)).toContain('plugin-b');
    });
  });

  describe('list_names', () => {
    it('should list all registered plugin names', () => {
      const registry = create_plugin_registry();
      registry.register(wrap_as_loaded(create_mock_plugin('plugin-a')));
      registry.register(wrap_as_loaded(create_mock_plugin('plugin-b')));

      const names = registry.list_names();

      expect(names).toHaveLength(2);
      expect(names).toContain('plugin-a');
      expect(names).toContain('plugin-b');
    });
  });

  describe('get_generator_for_type', () => {
    it('should find generator for object type', () => {
      const registry = create_plugin_registry();
      const plugin = create_mock_plugin('gen-plugin', { generators: true });

      registry.register(wrap_as_loaded(plugin));

      const generator = registry.get_generator_for_type('gen-plugin/v1', 'Resource');
      expect(generator).toBeDefined();
      expect(generator?.name).toBe('gen-plugin-generator');
    });

    it('should return undefined for unknown type', () => {
      const registry = create_plugin_registry();

      const generator = registry.get_generator_for_type('unknown/v1', 'Unknown');
      expect(generator).toBeUndefined();
    });
  });

  describe('activate_all / deactivate_all', () => {
    it('should activate plugins with activate method', async () => {
      const registry = create_plugin_registry();
      const activated: string[] = [];

      const plugin: KustodianPluginType = {
        manifest: { name: 'activatable', version: '1.0.0', capabilities: [] },
        activate: async () => {
          activated.push('activatable');
          return success(undefined);
        },
      };

      registry.register(wrap_as_loaded(plugin));

      const result = await registry.activate_all({
        container: {} as never,
        config: {},
        cwd: '/test',
      });

      expect(result.success).toBe(true);
      expect(activated).toContain('activatable');
    });

    it('should deactivate plugins in reverse order', async () => {
      const registry = create_plugin_registry();
      const order: string[] = [];

      const plugin1: KustodianPluginType = {
        manifest: { name: 'first', version: '1.0.0', capabilities: [] },
        activate: async () => {
          order.push('activate-first');
          return success(undefined);
        },
        deactivate: async () => {
          order.push('deactivate-first');
          return success(undefined);
        },
      };

      const plugin2: KustodianPluginType = {
        manifest: { name: 'second', version: '1.0.0', capabilities: [] },
        activate: async () => {
          order.push('activate-second');
          return success(undefined);
        },
        deactivate: async () => {
          order.push('deactivate-second');
          return success(undefined);
        },
      };

      registry.register(wrap_as_loaded(plugin1));
      registry.register(wrap_as_loaded(plugin2));

      await registry.activate_all({ container: {} as never, config: {}, cwd: '/test' });
      await registry.deactivate_all();

      expect(order).toEqual([
        'activate-first',
        'activate-second',
        'deactivate-second',
        'deactivate-first',
      ]);
    });
  });
});
