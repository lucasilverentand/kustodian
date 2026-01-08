import type { KustodianErrorType, ResultType } from '@kustodian/core';

import type { ClusterType, TemplateType } from '@kustodian/schema';
import type { GeneratedResourceType } from './types.js';

/**
 * Object type reference that a generator handles.
 */
export interface ObjectTypeRefType {
  api_version: string;
  kind: string;
}

/**
 * Context provided to generators during resource generation.
 */
export interface GeneratorContextType {
  /** Current cluster being processed */
  cluster: ClusterType;
  /** Current template being processed (if applicable) */
  template?: TemplateType;
  /** Plugin configuration */
  config: Record<string, unknown>;
  /** All loaded objects by kind (for cross-referencing) */
  all_objects: Map<string, unknown[]>;
}

/**
 * Plugin generator interface.
 * Generators produce Kubernetes resources from objects they handle.
 */
export interface PluginGeneratorType {
  /** Generator name for identification */
  name: string;

  /**
   * Object types this generator handles.
   * When objects of these types are encountered, this generator is invoked.
   */
  handles: ObjectTypeRefType[];

  /**
   * Generates Kubernetes resources from an object.
   *
   * @param object The object to generate resources from
   * @param context Generation context with cluster and config
   * @returns Generated Kubernetes resources
   */
  generate(
    object: unknown,
    context: GeneratorContextType,
  ): Promise<ResultType<GeneratedResourceType[], KustodianErrorType>>;
}

/**
 * Creates a generator that handles specific object types.
 */
export function define_generator(config: PluginGeneratorType): PluginGeneratorType {
  return config;
}
