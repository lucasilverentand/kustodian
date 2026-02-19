/**
 * Kubernetes resource reference.
 */
export interface K8sResourceType {
  kind: string;
  name: string;
  namespace?: string;
}

/**
 * Flux resource reference.
 */
export interface FluxResourceType {
  kind: 'Kustomization' | 'GitRepository' | 'OCIRepository' | 'HelmRelease' | 'HelmRepository';
  name: string;
  namespace?: string;
}

/**
 * Flux bootstrap options.
 */
export interface FluxBootstrapOptionsType {
  provider: 'github' | 'gitlab' | 'bitbucket';
  owner: string;
  repository: string;
  path: string;
  branch?: string;
  personal?: boolean;
}

/**
 * Flux status information.
 */
export interface FluxStatusType {
  installed: boolean;
  version?: string;
  components: {
    name: string;
    ready: boolean;
    message?: string;
  }[];
}

/**
 * Kubectl apply options.
 */
export interface ApplyOptionsType {
  dry_run?: boolean;
  server_side?: boolean;
  force_conflicts?: boolean;
}

/**
 * Diff result for kubectl/flux diff operations.
 */
export interface DiffResultType {
  exit_code: number;
  stdout: string;
  stderr: string;
  has_changes: boolean;
}

/**
 * Options for flux diff kustomization.
 */
export interface FluxDiffKustomizationOptionsType {
  path: string;
  kustomization_file?: string;
  namespace?: string;
  progress_bar?: boolean;
  recursive?: boolean;
  strict_substitute?: boolean;
  ignore_paths?: string[];
}

/**
 * Log options for kubectl logs.
 */
export interface LogOptionsType {
  tail?: number;
  follow?: boolean;
  container?: string;
  previous?: boolean;
}

/**
 * Command execution result.
 */
export interface ExecResultType {
  exit_code: number;
  stdout: string;
  stderr: string;
}
