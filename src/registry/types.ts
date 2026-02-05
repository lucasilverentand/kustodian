import type { KustodianErrorType, ResultType } from '../core/index.js';

/**
 * Authentication configuration for registries.
 */
export interface RegistryAuthType {
  username?: string;
  password?: string;
  token?: string;
}

/**
 * Registry client configuration.
 */
export interface RegistryClientConfigType {
  auth?: RegistryAuthType | undefined;
  timeout?: number | undefined;
}

/**
 * Parsed image reference components.
 */
export interface ImageReferenceType {
  /** Registry hostname (e.g., docker.io, ghcr.io) */
  registry: string;
  /** Namespace/organization (e.g., library, prom) */
  namespace: string;
  /** Repository name (e.g., nginx, prometheus) */
  repository: string;
  /** Optional tag */
  tag?: string | undefined;
}

/**
 * Tag information from registry.
 */
export interface TagInfoType {
  name: string;
  digest?: string;
}

/**
 * Version check result.
 */
export interface VersionCheckResultType {
  current_version: string;
  latest_version: string;
  available_versions: string[];
  has_update: boolean;
}

/**
 * Registry client interface.
 */
export interface RegistryClientType {
  /**
   * Lists all tags for an image.
   */
  list_tags(image: ImageReferenceType): Promise<ResultType<TagInfoType[], KustodianErrorType>>;
}
