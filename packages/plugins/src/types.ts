import type { ResultType } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import type { ClusterType, TemplateType } from '@kustodian/schema';

/**
 * Plugin types indicating their functionality.
 */
export type PluginTypeType = 'secret-provider' | 'resource-generator' | 'validator' | 'transformer';

/**
 * Plugin metadata.
 */
export interface PluginManifestType {
  name: string;
  version: string;
  type: PluginTypeType;
  description?: string;
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
}

/**
 * Context provided to plugins during execution.
 */
export interface PluginContextType {
  cluster: ClusterType;
  template?: TemplateType;
  config?: Record<string, unknown>;
}

/**
 * Secret provider plugin interface.
 * Generates secret resources from references.
 */
export interface SecretProviderPluginType {
  readonly manifest: PluginManifestType;
  readonly scheme: string;

  /**
   * Parses a secret reference string.
   */
  parse_ref(ref: string): ResultType<Record<string, string>, KustodianErrorType>;

  /**
   * Generates a secret resource from a parsed reference.
   */
  generate(
    ref: Record<string, string>,
    ctx: PluginContextType,
  ): ResultType<GeneratedResourceType, KustodianErrorType>;
}

/**
 * Resource generator plugin interface.
 * Generates additional resources during generation.
 */
export interface ResourceGeneratorPluginType {
  readonly manifest: PluginManifestType;

  /**
   * Generates resources for a template.
   */
  generate(ctx: PluginContextType): ResultType<GeneratedResourceType[], KustodianErrorType>;
}

/**
 * Validator plugin interface.
 * Validates templates or clusters.
 */
export interface ValidatorPluginType {
  readonly manifest: PluginManifestType;

  /**
   * Validates a template or cluster.
   */
  validate(ctx: PluginContextType): ResultType<void, KustodianErrorType>;
}

/**
 * Transformer plugin interface.
 * Transforms resources before output.
 */
export interface TransformerPluginType {
  readonly manifest: PluginManifestType;

  /**
   * Transforms a resource.
   */
  transform(
    resource: GeneratedResourceType,
    ctx: PluginContextType,
  ): ResultType<GeneratedResourceType, KustodianErrorType>;
}

/**
 * Union type of all plugin types.
 */
export type PluginType =
  | SecretProviderPluginType
  | ResourceGeneratorPluginType
  | ValidatorPluginType
  | TransformerPluginType;

/**
 * Type guard for secret provider plugins.
 */
export function is_secret_provider(plugin: PluginType): plugin is SecretProviderPluginType {
  return plugin.manifest.type === 'secret-provider';
}

/**
 * Type guard for resource generator plugins.
 */
export function is_resource_generator(plugin: PluginType): plugin is ResourceGeneratorPluginType {
  return plugin.manifest.type === 'resource-generator';
}

/**
 * Type guard for validator plugins.
 */
export function is_validator(plugin: PluginType): plugin is ValidatorPluginType {
  return plugin.manifest.type === 'validator';
}

/**
 * Type guard for transformer plugins.
 */
export function is_transformer(plugin: PluginType): plugin is TransformerPluginType {
  return plugin.manifest.type === 'transformer';
}
