import type { KustodianErrorType } from '../core/index.js';
import { Errors, type ResultType, failure, is_success, success } from '../core/index.js';

import type { PluginGeneratorType } from './generators.js';
import type {
  GitOpsCheckOptionsType,
  GitOpsEngineType,
  PluginGitOpsEngineContributionType,
} from './gitops-engine.js';
import { type HookDispatcherType, create_hook_dispatcher } from './hooks.js';
import { type ObjectTypeRegistryType, create_object_type_registry } from './object-types.js';
import type { SubstitutionProviderType } from './substitution-providers.js';
import type {
  ClusterProviderType,
  KustodianPluginType,
  LoadedPluginType,
  PluginActivationContextType,
  PluginCommandContributionType,
  PluginManifestType,
  PluginProviderContributionType,
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

  /**
   * Gets all provider contributions from plugins.
   */
  get_providers(): PluginProviderContributionType[];

  /**
   * Creates a cluster provider by name with the given options.
   * Returns undefined if no plugin provides a provider with that name.
   */
  create_provider(name: string, options: Record<string, unknown>): ClusterProviderType | undefined;

  /**
   * Gets all GitOps engine contributions from plugins.
   */
  get_gitops_engines(): PluginGitOpsEngineContributionType[];

  /**
   * Creates a GitOps engine by name.
   * Returns undefined if no plugin provides an engine with that name.
   */
  create_gitops_engine(
    name: string,
    options?: GitOpsCheckOptionsType,
  ): GitOpsEngineType | undefined;
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
  const providers: PluginProviderContributionType[] = [];
  const gitops_engines: PluginGitOpsEngineContributionType[] = [];
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

      // Collect provider contributions
      if (plugin.get_providers) {
        const plugin_providers = plugin.get_providers();
        providers.push(...plugin_providers);
      }

      // Collect GitOps engine contributions
      if (plugin.get_gitops_engines) {
        const plugin_engines = plugin.get_gitops_engines();
        gitops_engines.push(...plugin_engines);
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

    get_providers() {
      return [...providers];
    },

    create_provider(name, options) {
      const contribution = providers.find((p) => p.name === name);
      if (!contribution) {
        return undefined;
      }
      return contribution.factory(options);
    },

    get_gitops_engines() {
      return [...gitops_engines];
    },

    create_gitops_engine(name, options) {
      const contribution = gitops_engines.find((e) => e.name === name);
      if (!contribution) {
        return undefined;
      }
      return contribution.factory(options);
    },
  };
}
