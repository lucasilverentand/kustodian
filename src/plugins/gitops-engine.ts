/**
 * GitOps engine abstraction.
 * Defines the contract for GitOps tools (Flux CD, Argo CD, etc.)
 * that handle continuous deployment on Kubernetes clusters.
 */

import type { KustodianErrorType, ResultType } from '../core/index.js';

/**
 * Options for checking if the GitOps engine is installed on a cluster.
 */
export interface GitOpsCheckOptionsType {
  kubeconfig?: string;
  context?: string;
}

/**
 * Options for installing the GitOps engine on a cluster.
 */
export interface GitOpsInstallOptionsType {
  namespace?: string;
  kubeconfig?: string;
  context?: string;
}

/**
 * Status of a GitOps engine installation.
 */
export interface GitOpsStatusType {
  installed: boolean;
  version?: string;
  components: Array<{ name: string; ready: boolean }>;
}

/**
 * Options for pushing an artifact to a registry.
 */
export interface PushArtifactOptionsType {
  /** OCI URL (e.g., oci://registry/repo:tag) */
  url: string;
  /** Local path to push */
  path: string;
  /** Source metadata (e.g., git remote URL) */
  source: string;
  /** Revision metadata (e.g., git SHA) */
  revision: string;
  /** Paths to ignore */
  ignore_paths?: string[];
  /** Extra CLI args for kubeconfig/context */
  extra_args?: string[];
}

/**
 * A resource that the GitOps engine can reconcile.
 */
export interface GitOpsResourceType {
  kind: string;
  name: string;
  namespace?: string;
}

/**
 * Result of a diff operation.
 */
export interface GitOpsDiffResultType {
  exit_code: number;
  stdout: string;
  stderr: string;
  has_changes: boolean;
}

/**
 * Options for diffing a kustomization.
 */
export interface GitOpsDiffOptionsType {
  name: string;
  path: string;
  kustomization_file?: string;
  namespace?: string;
  progress_bar?: boolean;
}

/**
 * GitOps engine interface.
 * Implementations handle specific GitOps tools (Flux CD, Argo CD, etc.).
 */
export interface GitOpsEngineType {
  /** Engine name (e.g., "flux", "argocd") */
  readonly name: string;

  /** Checks if the engine's CLI tool is available */
  check_cli(): Promise<ResultType<boolean, KustodianErrorType>>;

  /** Checks the engine's installation status on the cluster */
  check(
    options?: GitOpsCheckOptionsType,
  ): Promise<ResultType<GitOpsStatusType, KustodianErrorType>>;

  /** Installs the engine on the cluster */
  install(options?: GitOpsInstallOptionsType): Promise<ResultType<void, KustodianErrorType>>;

  /** Pushes an artifact to a registry */
  push_artifact(options: PushArtifactOptionsType): Promise<ResultType<void, KustodianErrorType>>;

  /** Triggers reconciliation of resources */
  reconcile(
    resource: GitOpsResourceType,
    options?: GitOpsCheckOptionsType,
  ): Promise<ResultType<void, KustodianErrorType>>;

  /** Diffs a kustomization against the cluster */
  diff_kustomization(
    options: GitOpsDiffOptionsType & GitOpsCheckOptionsType,
  ): Promise<ResultType<GitOpsDiffResultType, KustodianErrorType>>;
}

/**
 * GitOps engine contribution from a plugin.
 */
export interface PluginGitOpsEngineContributionType {
  /** Engine name (e.g., "flux", "argocd") */
  name: string;
  /** Factory function to create engine instances */
  factory: (options?: GitOpsCheckOptionsType) => GitOpsEngineType;
}
