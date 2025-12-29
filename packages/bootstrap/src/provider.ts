import { type ResultType, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import type { NodeListType } from '@kustodian/nodes';

import type { BootstrapOptionsType } from './types.js';

/**
 * Reset options for cluster teardown.
 */
export interface ResetOptionsType {
  force?: boolean;
  dry_run?: boolean;
}

/**
 * Cluster provider interface.
 * Implementations handle specific cluster technologies (k0s, Talos, etc.).
 */
export interface ClusterProviderType {
  /**
   * Provider name (e.g., "k0s", "talos").
   */
  readonly name: string;

  /**
   * Validates the cluster configuration.
   */
  validate(node_list: NodeListType): ResultType<void, KustodianErrorType>;

  /**
   * Installs the cluster.
   */
  install(
    node_list: NodeListType,
    options: BootstrapOptionsType,
  ): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Gets the kubeconfig for the cluster.
   */
  get_kubeconfig(node_list: NodeListType): Promise<ResultType<string, KustodianErrorType>>;

  /**
   * Resets/destroys the cluster.
   */
  reset(
    node_list: NodeListType,
    options: ResetOptionsType,
  ): Promise<ResultType<void, KustodianErrorType>>;
}

/**
 * Provider registry for managing cluster providers.
 */
export interface ProviderRegistryType {
  /**
   * Registers a cluster provider.
   */
  register(provider: ClusterProviderType): void;

  /**
   * Gets a provider by name.
   */
  get(name: string): ClusterProviderType | undefined;

  /**
   * Gets the default provider.
   */
  get_default(): ClusterProviderType | undefined;

  /**
   * Lists all registered provider names.
   */
  list(): string[];
}

/**
 * Creates a mock provider for testing.
 */
export function create_mock_provider(): ClusterProviderType {
  return {
    name: 'mock',
    validate: () => success(undefined),
    install: async () => success(undefined),
    get_kubeconfig: async () => success('mock-kubeconfig'),
    reset: async () => success(undefined),
  };
}

/**
 * Creates a new provider registry.
 */
export function create_provider_registry(): ProviderRegistryType {
  const providers = new Map<string, ClusterProviderType>();
  let default_provider: string | undefined;

  return {
    register(provider) {
      providers.set(provider.name, provider);
      if (!default_provider) {
        default_provider = provider.name;
      }
    },

    get(name) {
      return providers.get(name);
    },

    get_default() {
      if (default_provider) {
        return providers.get(default_provider);
      }
      return undefined;
    },

    list() {
      return Array.from(providers.keys());
    },
  };
}
