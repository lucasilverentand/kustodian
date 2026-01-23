import type { KustodianErrorType, ResultType } from '@kustodian/core';
import type { ClusterType, TemplateType } from '@kustodian/schema';
import type { z } from 'zod';

/**
 * Context provided to substitution providers during resolution.
 */
export interface SubstitutionContextType {
  /** Cluster configuration */
  cluster: ClusterType;
  /** All templates being processed */
  templates: TemplateType[];
  /** Plugin-specific configuration (optional) */
  config?: Record<string, unknown> | undefined;
}

/**
 * Substitution provider interface.
 * Plugins implement this to provide custom substitution types (e.g., SOPS, Vault, AWS Secrets Manager).
 */
export interface SubstitutionProviderType {
  /**
   * Unique type identifier for this provider (e.g., 'sops', 'vault', 'aws-secrets').
   * This must match the 'type' field in substitution objects.
   */
  readonly type: string;

  /**
   * Zod schema for validating substitutions of this type.
   * The schema should validate the structure of substitution objects with this provider's type.
   */
  readonly schema: z.ZodType<unknown>;

  /**
   * Resolves substitutions to key-value pairs.
   *
   * @param substitutions - Array of substitution objects to resolve (all of this provider's type)
   * @param context - Context information including cluster config and templates
   * @returns Result containing a map of substitution names to their resolved values
   *
   * @example
   * ```typescript
   * // Input substitutions:
   * // [{ type: 'sops', name: 'db_password', file: 'secrets.enc.yaml', key: 'database.password' }]
   * //
   * // Returns:
   * // { db_password: 'actual-secret-value' }
   * ```
   */
  resolve(
    substitutions: unknown[],
    context: SubstitutionContextType,
  ): Promise<ResultType<Record<string, string>, KustodianErrorType>>;
}
