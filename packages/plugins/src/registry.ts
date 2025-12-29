import { Errors, type ResultType, failure, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';

import {
  type PluginType,
  type ResourceGeneratorPluginType,
  type SecretProviderPluginType,
  type TransformerPluginType,
  type ValidatorPluginType,
  is_resource_generator,
  is_secret_provider,
  is_transformer,
  is_validator,
} from './types.js';

/**
 * Plugin registry for managing loaded plugins.
 */
export interface PluginRegistryType {
  /**
   * Registers a plugin.
   */
  register(plugin: PluginType): ResultType<void, KustodianErrorType>;

  /**
   * Gets a plugin by name.
   */
  get(name: string): PluginType | undefined;

  /**
   * Gets all secret providers.
   */
  get_secret_providers(): SecretProviderPluginType[];

  /**
   * Gets a secret provider by scheme.
   */
  get_secret_provider_by_scheme(scheme: string): SecretProviderPluginType | undefined;

  /**
   * Gets all resource generators.
   */
  get_resource_generators(): ResourceGeneratorPluginType[];

  /**
   * Gets all validators.
   */
  get_validators(): ValidatorPluginType[];

  /**
   * Gets all transformers.
   */
  get_transformers(): TransformerPluginType[];

  /**
   * Lists all registered plugin names.
   */
  list(): string[];
}

/**
 * Creates a new plugin registry.
 */
export function create_plugin_registry(): PluginRegistryType {
  const plugins = new Map<string, PluginType>();

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
