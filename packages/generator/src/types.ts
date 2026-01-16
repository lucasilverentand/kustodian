import type { ClusterType, KustomizationType, TemplateType } from '@kustodian/schema';

/**
 * Options for the generation process.
 */
export interface GenerateOptionsType {
  dry_run?: boolean;
  output_dir?: string;
  skip_validation?: boolean;
}

/**
 * A resolved template with its values.
 */
export interface ResolvedTemplateType {
  template: TemplateType;
  values: Record<string, string>;
  enabled: boolean;
}

/**
 * A resolved kustomization with substitution values applied.
 */
export interface ResolvedKustomizationType {
  template: TemplateType;
  kustomization: KustomizationType;
  values: Record<string, string>;
  namespace: string;
}

/**
 * Generation context for a cluster.
 */
export interface GenerationContextType {
  cluster: ClusterType;
  templates: ResolvedTemplateType[];
  output_dir: string;
}

/**
 * Result of a single kustomization generation.
 */
export interface GeneratedKustomizationType {
  name: string;
  template: string;
  path: string;
  flux_kustomization: FluxKustomizationType;
}

/**
 * Result of the full generation process.
 */
export interface GenerationResultType {
  cluster: string;
  output_dir: string;
  kustomizations: GeneratedKustomizationType[];
  oci_repository?: FluxOCIRepositoryType;
}

/**
 * Flux OCIRepository resource type.
 */
export interface FluxOCIRepositoryType {
  apiVersion: 'source.toolkit.fluxcd.io/v1';
  kind: 'OCIRepository';
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    interval: string;
    url: string;
    ref: {
      tag?: string;
      digest?: string;
      semver?: string;
    };
    provider?: 'aws' | 'azure' | 'gcp' | 'generic';
    secretRef?: {
      name: string;
    };
    insecure?: boolean;
    timeout?: string;
  };
}

/**
 * Flux Kustomization resource type.
 */
export interface FluxKustomizationType {
  apiVersion: 'kustomize.toolkit.fluxcd.io/v1';
  kind: 'Kustomization';
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    interval: string;
    targetNamespace?: string;
    path: string;
    prune: boolean;
    wait: boolean;
    timeout?: string;
    retryInterval?: string;
    sourceRef: {
      kind: 'GitRepository' | 'OCIRepository';
      name: string;
    };
    dependsOn?: Array<{ name: string }>;
    postBuild?: {
      substitute?: Record<string, string>;
    };
    healthChecks?: Array<{
      apiVersion: string;
      kind: string;
      name: string;
      namespace: string;
    }>;
    customHealthChecks?: Array<{
      apiVersion: string;
      kind: string;
      namespace?: string;
      /** CEL expression for when resource is healthy/current */
      current?: string;
      /** CEL expression for when resource has failed */
      failed?: string;
    }>;
  };
}
