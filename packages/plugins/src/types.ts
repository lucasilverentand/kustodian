import type { CommandType, ContainerType } from '@kustodian/cli';
import type { KustodianErrorType, ResultType } from '@kustodian/core';
import type { ClusterType, TemplateType } from '@kustodian/schema';

import type { PluginGeneratorType } from './generators.js';
import type { PluginHookContributionType } from './hooks.js';
import type { PluginObjectTypeType } from './object-types.js';

/**
 * Plugin capabilities indicating what a plugin can provide.
 */
export type PluginCapabilityType = 'commands' | 'hooks' | 'generators' | 'object-types';

/**
 * Plugin manifest with metadata.
 */
export interface PluginManifestType {
  /** Unique plugin identifier (e.g., "@kustodian/plugin-helm") */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description?: string;
  /** Capabilities this plugin provides */
  capabilities: PluginCapabilityType[];
  /** Minimum kustodian version required */
  kustodian_version?: string;
}

/**
 * Plugin activation context with runtime information.
 */
export interface PluginActivationContextType {
  /** DI container for service registration */
  container: ContainerType;
  /** Plugin configuration from cluster.spec.plugins */
  config: Record<string, unknown>;
  /** Current working directory */
  cwd: string;
}

/**
 * Command contribution from a plugin.
 */
export interface PluginCommandContributionType {
  /** Command definition */
  command: CommandType;
}

/**
 * Main plugin interface.
 * Plugins implement this interface and provide contributions via getter methods.
 */
export interface KustodianPluginType {
  /** Plugin manifest with metadata */
  readonly manifest: PluginManifestType;

  /**
   * Called when the plugin is activated.
   * Use this to initialize resources and register services.
   */
  activate?(ctx: PluginActivationContextType): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Called when the plugin is deactivated.
   * Use this to clean up resources.
   */
  deactivate?(): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Returns commands contributed by this plugin.
   */
  get_commands?(): PluginCommandContributionType[];

  /**
   * Returns hooks contributed by this plugin.
   */
  get_hooks?(): PluginHookContributionType[];

  /**
   * Returns generators contributed by this plugin.
   */
  get_generators?(): PluginGeneratorType[];

  /**
   * Returns object types contributed by this plugin.
   */
  get_object_types?(): PluginObjectTypeType[];
}

/**
 * Generated Kubernetes resource.
 */
export interface GeneratedResourceType {
  api_version: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  data?: Record<string, unknown>;
  string_data?: Record<string, string>;
}

/**
 * Context provided to plugins during generation.
 */
export interface PluginContextType {
  cluster: ClusterType;
  template?: TemplateType;
  config?: Record<string, unknown>;
}

/**
 * Plugin source types for discovery.
 */
export type PluginSourceType = 'npm' | 'local';

/**
 * Information about a discovered plugin location.
 */
export interface PluginLocationInfoType {
  source: PluginSourceType;
  /** Module path or npm package name */
  module_path: string;
  /** Resolved absolute path */
  resolved_path: string;
}

/**
 * Loaded plugin with location metadata.
 */
export interface LoadedPluginType {
  plugin: KustodianPluginType;
  location: PluginLocationInfoType;
}

// ============================================================
// Legacy types for backward compatibility
// ============================================================

/**
 * @deprecated Use PluginCapabilityType instead
 */
export type PluginTypeType = 'secret-provider' | 'resource-generator' | 'validator' | 'transformer';

/**
 * @deprecated Use PluginManifestType instead
 */
export interface LegacyPluginManifestType {
  name: string;
  version: string;
  type: PluginTypeType;
  description?: string;
}

/**
 * @deprecated Secret provider plugin interface.
 */
export interface SecretProviderPluginType {
  readonly manifest: LegacyPluginManifestType;
  readonly scheme: string;
  parse_ref(ref: string): ResultType<Record<string, string>, KustodianErrorType>;
  generate(
    ref: Record<string, string>,
    ctx: PluginContextType,
  ): ResultType<GeneratedResourceType, KustodianErrorType>;
}

/**
 * @deprecated Resource generator plugin interface.
 */
export interface ResourceGeneratorPluginType {
  readonly manifest: LegacyPluginManifestType;
  generate(ctx: PluginContextType): ResultType<GeneratedResourceType[], KustodianErrorType>;
}

/**
 * @deprecated Validator plugin interface.
 */
export interface ValidatorPluginType {
  readonly manifest: LegacyPluginManifestType;
  validate(ctx: PluginContextType): ResultType<void, KustodianErrorType>;
}

/**
 * @deprecated Transformer plugin interface.
 */
export interface TransformerPluginType {
  readonly manifest: LegacyPluginManifestType;
  transform(
    resource: GeneratedResourceType,
    ctx: PluginContextType,
  ): ResultType<GeneratedResourceType, KustodianErrorType>;
}

/**
 * @deprecated Union type of legacy plugin types.
 */
export type LegacyPluginType =
  | SecretProviderPluginType
  | ResourceGeneratorPluginType
  | ValidatorPluginType
  | TransformerPluginType;

/**
 * @deprecated Type guard for secret provider plugins.
 */
export function is_secret_provider(plugin: LegacyPluginType): plugin is SecretProviderPluginType {
  return plugin.manifest.type === 'secret-provider';
}

/**
 * @deprecated Type guard for resource generator plugins.
 */
export function is_resource_generator(
  plugin: LegacyPluginType,
): plugin is ResourceGeneratorPluginType {
  return plugin.manifest.type === 'resource-generator';
}

/**
 * @deprecated Type guard for validator plugins.
 */
export function is_validator(plugin: LegacyPluginType): plugin is ValidatorPluginType {
  return plugin.manifest.type === 'validator';
}

/**
 * @deprecated Type guard for transformer plugins.
 */
export function is_transformer(plugin: LegacyPluginType): plugin is TransformerPluginType {
  return plugin.manifest.type === 'transformer';
}
