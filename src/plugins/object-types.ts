import type { z } from 'zod';

/**
 * Locations where plugin objects can appear.
 */
export type ObjectLocationType =
  | 'cluster.spec' // Top-level in cluster spec
  | 'template.spec' // In template spec
  | 'standalone' // Separate YAML file
  | 'inline'; // Inline anywhere

/**
 * Plugin object type definition.
 * Defines a custom Kubernetes-style object that plugins can introduce.
 */
export interface PluginObjectTypeType<T = unknown> {
  /** API version (e.g., "helm.kustodian.io/v1") */
  api_version: string;
  /** Kind identifier (e.g., "HelmChart") */
  kind: string;
  /** Zod schema for validation */
  schema: z.ZodType<T>;
  /** Valid locations for this object type */
  locations: ObjectLocationType[];
  /** Optional description */
  description?: string;
}

/**
 * Parsed object with type information.
 */
export interface ParsedObjectType<T = unknown> {
  api_version: string;
  kind: string;
  data: T;
  source_path?: string;
}

/**
 * Object type registry for managing plugin-defined object types.
 */
export interface ObjectTypeRegistryType {
  /**
   * Registers an object type.
   */
  register<T>(object_type: PluginObjectTypeType<T>): void;

  /**
   * Gets an object type by api_version and kind.
   */
  get(api_version: string, kind: string): PluginObjectTypeType | undefined;

  /**
   * Validates an object against its registered schema.
   * Returns the parsed object if valid, or validation errors.
   */
  validate(object: unknown): ParsedObjectType | { errors: string[] };

  /**
   * Checks if an object type is registered.
   */
  has(api_version: string, kind: string): boolean;

  /**
   * Lists all registered object types.
   */
  list(): PluginObjectTypeType[];

  /**
   * Gets all object types that can appear in a specific location.
   */
  get_by_location(location: ObjectLocationType): PluginObjectTypeType[];
}

/**
 * Creates a unique key for an object type.
 */
function make_key(api_version: string, kind: string): string {
  return `${api_version}/${kind}`;
}

/**
 * Creates a new object type registry.
 */
export function create_object_type_registry(): ObjectTypeRegistryType {
  const types = new Map<string, PluginObjectTypeType>();

  return {
    register<T>(object_type: PluginObjectTypeType<T>) {
      const key = make_key(object_type.api_version, object_type.kind);
      types.set(key, object_type as PluginObjectTypeType);
    },

    get(api_version, kind) {
      const key = make_key(api_version, kind);
      return types.get(key);
    },

    validate(object) {
      if (typeof object !== 'object' || object === null) {
        return { errors: ['Object must be a non-null object'] };
      }

      const obj = object as Record<string, unknown>;
      const api_version = obj['apiVersion'] as string | undefined;
      const kind = obj['kind'] as string | undefined;

      if (!api_version || !kind) {
        return { errors: ['Object must have apiVersion and kind fields'] };
      }

      const object_type = this.get(api_version, kind);
      if (!object_type) {
        return { errors: [`Unknown object type: ${api_version}/${kind}`] };
      }

      const result = object_type.schema.safeParse(object);
      if (!result.success) {
        return {
          errors: result.error.errors.map(
            (e: { path: (string | number)[]; message: string }) =>
              `${e.path.join('.')}: ${e.message}`,
          ),
        };
      }

      return {
        api_version,
        kind,
        data: result.data,
      };
    },

    has(api_version, kind) {
      const key = make_key(api_version, kind);
      return types.has(key);
    },

    list() {
      return Array.from(types.values());
    },

    get_by_location(location) {
      return Array.from(types.values()).filter((t) => t.locations.includes(location));
    },
  };
}

/**
 * Helper to define a plugin object type with proper typing.
 */
export function define_object_type<T>(config: PluginObjectTypeType<T>): PluginObjectTypeType<T> {
  return config;
}
