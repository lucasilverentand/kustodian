import type { KustodianErrorType } from '@kustodian/core';
import { Errors, type ResultType, failure, is_success, success } from '@kustodian/core';

import type { PluginGeneratorType } from './generators.js';
import { type HookDispatcherType, create_hook_dispatcher } from './hooks.js';
import { type ObjectTypeRegistryType, create_object_type_registry } from './object-types.js';
import type { SubstitutionProviderType } from './substitution-providers.js';
import type {
  KustodianPluginType,
  LoadedPluginType,
  PluginActivationContextType,
  PluginCommandContributionType,
  PluginManifestType,
} from './types.js';

/**
 * Unified plugin registry that manages all plugin contributions.
 */
export interface PluginRegistryType {
  /**
   * Registers a loaded plugin.
   */
  register(loaded: LoadedPluginType): ResultType<void, KustodianErrorType>;

  /**
   * Activates all registered plugins.
   */
  activate_all(ctx: PluginActivationContextType): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Deactivates all registered plugins.
   */
  deactivate_all(): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Gets a plugin by name.
   */
  get(name: string): KustodianPluginType | undefined;

  /**
   * Lists all registered plugin manifests.
   */
  list(): PluginManifestType[];

  /**
   * Lists all registered plugin names.
   */
  list_names(): string[];

  /**
   * Gets all command contributions from plugins.
   */
  get_commands(): PluginCommandContributionType[];

  /**
   * Gets the hook dispatcher for dispatching events.
   */
  get_hook_dispatcher(): HookDispatcherType;

  /**
   * Gets all generators from plugins.
   */
  get_generators(): PluginGeneratorType[];

  /**
   * Gets the object type registry.
   */
  get_object_types(): ObjectTypeRegistryType;

  /**
   * Gets a generator that handles a specific object type.
   */
  get_generator_for_type(api_version: string, kind: string): PluginGeneratorType | undefined;

  /**
   * Gets all substitution providers from plugins.
   */
  get_substitution_providers(): SubstitutionProviderType[];

  /**
   * Gets a substitution provider for a specific type.
   */
  get_substitution_provider(type: string): SubstitutionProviderType | undefined;
}

/**
 * Creates a new unified plugin registry.
 */
export function create_plugin_registry(): PluginRegistryType {
  const plugins = new Map<string, KustodianPluginType>();
  const activated = new Set<string>();

  // Contribution collections
  const commands: PluginCommandContributionType[] = [];
  const generators: PluginGeneratorType[] = [];
  const substitution_providers: SubstitutionProviderType[] = [];
  const hook_dispatcher = create_hook_dispatcher();
  const object_type_registry = create_object_type_registry();

  return {
    register(loaded) {
      const { plugin } = loaded;
      const name = plugin.manifest.name;

      if (plugins.has(name)) {
        return failure(Errors.already_exists('Plugin', name));
      }

      plugins.set(name, plugin);

      // Collect command contributions
      if (plugin.get_commands) {
        const plugin_commands = plugin.get_commands();
        commands.push(...plugin_commands);
      }

      // Collect hook contributions
      if (plugin.get_hooks) {
        const plugin_hooks = plugin.get_hooks();
        for (const hook of plugin_hooks) {
          hook_dispatcher.register(hook);
        }
      }

      // Collect generator contributions
      if (plugin.get_generators) {
        const plugin_generators = plugin.get_generators();
        generators.push(...plugin_generators);
      }

      // Collect object type contributions
      if (plugin.get_object_types) {
        const plugin_object_types = plugin.get_object_types();
        for (const object_type of plugin_object_types) {
          object_type_registry.register(object_type);
        }
      }

      // Collect substitution provider contributions
      if (plugin.get_substitution_providers) {
        const plugin_substitution_providers = plugin.get_substitution_providers();
        substitution_providers.push(...plugin_substitution_providers);
      }

      return success(undefined);
    },

    async activate_all(ctx) {
      for (const [name, plugin] of plugins) {
        if (activated.has(name)) {
          continue;
        }

        if (plugin.activate) {
          const result = await plugin.activate(ctx);
          if (!is_success(result)) {
            return result;
          }
        }

        activated.add(name);
      }

      return success(undefined);
    },

    async deactivate_all() {
      // Deactivate in reverse order
      const names = Array.from(activated).reverse();

      for (const name of names) {
        const plugin = plugins.get(name);
        if (!plugin) {
          continue;
        }

        if (plugin.deactivate) {
          const result = await plugin.deactivate();
          if (!is_success(result)) {
            return result;
          }
        }

        activated.delete(name);
      }

      return success(undefined);
    },

    get(name) {
      return plugins.get(name);
    },

    list() {
      return Array.from(plugins.values()).map((p) => p.manifest);
    },

    list_names() {
      return Array.from(plugins.keys());
    },

    get_commands() {
      return [...commands];
    },

    get_hook_dispatcher() {
      return hook_dispatcher;
    },

    get_generators() {
      return [...generators];
    },

    get_object_types() {
      return object_type_registry;
    },

    get_generator_for_type(api_version, kind) {
      return generators.find((g) =>
        g.handles.some((h) => h.api_version === api_version && h.kind === kind),
      );
    },

    get_substitution_providers() {
      return [...substitution_providers];
    },

    get_substitution_provider(type) {
      return substitution_providers.find((p) => p.type === type);
    },
  };
}

// ============================================================
// Legacy exports for backward compatibility
// ============================================================

import type {
  LegacyPluginType,
  ResourceGeneratorPluginType,
  SecretProviderPluginType,
  TransformerPluginType,
  ValidatorPluginType,
} from './types.js';
import {
  is_resource_generator,
  is_secret_provider,
  is_transformer,
  is_validator,
} from './types.js';

/**
 * @deprecated Use PluginRegistryType instead
 */
export interface LegacyPluginRegistryType {
  register(plugin: LegacyPluginType): ResultType<void, KustodianErrorType>;
  get(name: string): LegacyPluginType | undefined;
  get_secret_providers(): SecretProviderPluginType[];
  get_secret_provider_by_scheme(scheme: string): SecretProviderPluginType | undefined;
  get_resource_generators(): ResourceGeneratorPluginType[];
  get_validators(): ValidatorPluginType[];
  get_transformers(): TransformerPluginType[];
  list(): string[];
}

/**
 * @deprecated Use create_plugin_registry instead
 */
export function create_legacy_plugin_registry(): LegacyPluginRegistryType {
  const plugins = new Map<string, LegacyPluginType>();

  return {
    register(plugin) {
      const name = plugin.manifest.name;
      if (plugins.has(name)) {
        return failure(Errors.already_exists('Plugin', name));
      }
      plugins.set(name, plugin);
      return success(undefined);
    },

    get(name) {
      return plugins.get(name);
    },

    get_secret_providers() {
      return Array.from(plugins.values()).filter(is_secret_provider);
    },

    get_secret_provider_by_scheme(scheme) {
      return this.get_secret_providers().find((p) => p.scheme === scheme);
    },

    get_resource_generators() {
      return Array.from(plugins.values()).filter(is_resource_generator);
    },

    get_validators() {
      return Array.from(plugins.values()).filter(is_validator);
    },

    get_transformers() {
      return Array.from(plugins.values()).filter(is_transformer);
    },

    list() {
      return Array.from(plugins.keys());
    },
  };
}
