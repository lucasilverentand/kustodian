import type { KustodianErrorType } from '../core/index.js';
import { type ResultType, failure, is_success, success } from '../core/index.js';

import type { FluxClientType } from './flux.js';
import type { K8sObjectType, KubectlClientType } from './kubectl.js';

/**
 * Flux condition on a resource status.
 */
export interface FluxConditionType {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

/**
 * Status of a single Flux Kustomization.
 */
export interface KustomizationStatusType {
  name: string;
  namespace: string;
  suspended: boolean;
  ready: boolean;
  healthy: boolean | null;
  ready_reason?: string | undefined;
  ready_message?: string | undefined;
  healthy_message?: string | undefined;
  last_applied_revision?: string | undefined;
  last_attempted_revision?: string | undefined;
  has_failed_revision: boolean;
}

/**
 * Status of an OCIRepository source.
 */
export interface OciRepositoryStatusType {
  name: string;
  namespace: string;
  suspended: boolean;
  ready: boolean;
  ready_reason?: string | undefined;
  ready_message?: string | undefined;
  revision?: string | undefined;
}

/**
 * Full cluster Flux status.
 */
export interface ClusterFluxStatusType {
  flux_installed: boolean;
  flux_version?: string | undefined;
  components: { name: string; ready: boolean }[];
  oci_repository?: OciRepositoryStatusType | undefined;
  kustomizations: KustomizationStatusType[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    suspended: number;
  };
}

/**
 * Options for the Flux operator.
 */
export interface FluxOperatorOptionsType {
  flux_client: FluxClientType;
  kubectl_client: KubectlClientType;
  flux_namespace: string;
}

/**
 * Flux operator - provides status queries and rollback operations.
 *
 * This is a pure-logic layer over FluxClient and KubectlClient.
 * It can be tested with mock clients.
 */
export interface FluxOperatorType {
  /**
   * Gets the full Flux status for the cluster.
   */
  get_status(
    oci_repository_name?: string,
  ): Promise<ResultType<ClusterFluxStatusType, KustodianErrorType>>;

  /**
   * Lists all Kustomization names in the flux namespace.
   */
  list_kustomizations(): Promise<ResultType<string[], KustodianErrorType>>;

  /**
   * Suspends all Kustomizations in the flux namespace.
   */
  suspend_all(): Promise<
    ResultType<
      { succeeded: string[]; failed: { name: string; error: string }[] },
      KustodianErrorType
    >
  >;

  /**
   * Resumes all Kustomizations in the flux namespace.
   */
  resume_all(): Promise<
    ResultType<
      { succeeded: string[]; failed: { name: string; error: string }[] },
      KustodianErrorType
    >
  >;

  /**
   * Triggers reconciliation of the OCIRepository and all Kustomizations.
   */
  reconcile_all(oci_repository_name: string): Promise<ResultType<void, KustodianErrorType>>;
}

/**
 * Creates a Flux operator.
 */
export function create_flux_operator(options: FluxOperatorOptionsType): FluxOperatorType {
  const { flux_client, kubectl_client, flux_namespace } = options;

  async function get_kustomization_objects(): Promise<K8sObjectType[]> {
    const result = await kubectl_client.get({
      kind: 'Kustomization.kustomize.toolkit.fluxcd.io',
      name: '',
      namespace: flux_namespace,
    });
    if (!is_success(result)) return [];
    return result.value;
  }

  function parse_kustomization_status(raw: K8sObjectType): KustomizationStatusType {
    const ks = raw as unknown as {
      metadata: { name: string; namespace: string };
      spec: { suspend?: boolean };
      status?: {
        conditions?: FluxConditionType[];
        lastAppliedRevision?: string;
        lastAttemptedRevision?: string;
      };
    };

    const ready_condition = ks.status?.conditions?.find((c) => c.type === 'Ready');
    const healthy_condition = ks.status?.conditions?.find((c) => c.type === 'Healthy');
    const suspended = ks.spec?.suspend ?? false;
    const is_ready = ready_condition?.status === 'True';
    const is_healthy = healthy_condition ? healthy_condition.status === 'True' : null;

    return {
      name: ks.metadata.name,
      namespace: ks.metadata.namespace,
      suspended,
      ready: is_ready,
      healthy: is_healthy,
      ready_reason: ready_condition?.reason,
      ready_message: ready_condition?.message,
      healthy_message: healthy_condition?.message,
      last_applied_revision: ks.status?.lastAppliedRevision,
      last_attempted_revision: ks.status?.lastAttemptedRevision,
      has_failed_revision:
        !!ks.status?.lastAttemptedRevision &&
        !!ks.status?.lastAppliedRevision &&
        ks.status.lastAttemptedRevision !== ks.status.lastAppliedRevision,
    };
  }

  function parse_oci_repository_status(raw: K8sObjectType): OciRepositoryStatusType {
    const oci = raw as unknown as {
      metadata: { name: string; namespace: string };
      spec: { suspend?: boolean };
      status?: {
        conditions?: FluxConditionType[];
        artifact?: { revision?: string };
      };
    };

    const ready_condition = oci.status?.conditions?.find((c) => c.type === 'Ready');
    const suspended = oci.spec?.suspend ?? false;

    return {
      name: oci.metadata.name,
      namespace: oci.metadata.namespace,
      suspended,
      ready: ready_condition?.status === 'True',
      ready_reason: ready_condition?.reason,
      ready_message: ready_condition?.message,
      revision: oci.status?.artifact?.revision,
    };
  }

  return {
    async get_status(oci_repository_name) {
      // Check Flux installation
      const flux_check = await flux_client.check();
      if (!is_success(flux_check)) {
        return flux_check;
      }

      const flux_status = flux_check.value;
      if (!flux_status.installed) {
        return success({
          flux_installed: false,
          components: flux_status.components,
          kustomizations: [],
          summary: { total: 0, healthy: 0, unhealthy: 0, suspended: 0 },
        });
      }

      // Get OCIRepository status
      let oci_repository: OciRepositoryStatusType | undefined;
      if (oci_repository_name) {
        const oci_result = await kubectl_client.get({
          kind: 'OCIRepository',
          name: oci_repository_name,
          namespace: flux_namespace,
        });
        const first_oci = is_success(oci_result) ? oci_result.value[0] : undefined;
        if (first_oci) {
          oci_repository = parse_oci_repository_status(first_oci);
        }
      }

      // Get all Kustomizations
      const raw_kustomizations = await get_kustomization_objects();
      const kustomizations = raw_kustomizations.map(parse_kustomization_status);

      // Compute summary
      let healthy = 0;
      let unhealthy = 0;
      let suspended = 0;

      for (const ks of kustomizations) {
        if (ks.suspended) {
          suspended++;
        } else if (ks.ready) {
          healthy++;
        } else {
          unhealthy++;
        }
      }

      return success({
        flux_installed: true,
        flux_version: flux_status.version,
        components: flux_status.components,
        oci_repository,
        kustomizations,
        summary: {
          total: kustomizations.length,
          healthy,
          unhealthy,
          suspended,
        },
      });
    },

    async list_kustomizations() {
      const kustomizations = await get_kustomization_objects();
      return success(kustomizations.map((ks) => ks.metadata.name));
    },

    async suspend_all() {
      const kustomizations = await get_kustomization_objects();
      const succeeded: string[] = [];
      const failed: { name: string; error: string }[] = [];

      for (const ks of kustomizations) {
        const result = await flux_client.suspend({
          kind: 'Kustomization',
          name: ks.metadata.name,
          namespace: flux_namespace,
        });
        if (is_success(result)) {
          succeeded.push(ks.metadata.name);
        } else {
          failed.push({ name: ks.metadata.name, error: result.error.message });
        }
      }

      return success({ succeeded, failed });
    },

    async resume_all() {
      const kustomizations = await get_kustomization_objects();
      const succeeded: string[] = [];
      const failed: { name: string; error: string }[] = [];

      for (const ks of kustomizations) {
        const result = await flux_client.resume({
          kind: 'Kustomization',
          name: ks.metadata.name,
          namespace: flux_namespace,
        });
        if (is_success(result)) {
          succeeded.push(ks.metadata.name);
        } else {
          failed.push({ name: ks.metadata.name, error: result.error.message });
        }
      }

      return success({ succeeded, failed });
    },

    async reconcile_all(oci_repository_name) {
      // Reconcile OCIRepository
      const oci_result = await flux_client.reconcile({
        kind: 'OCIRepository',
        name: oci_repository_name,
        namespace: flux_namespace,
      });
      if (!is_success(oci_result)) {
        return failure({
          code: 'FLUX_RECONCILE_ERROR',
          message: `Failed to reconcile OCIRepository/${oci_repository_name}: ${oci_result.error.message}`,
        });
      }

      // Reconcile all Kustomizations
      const kustomizations = await get_kustomization_objects();
      for (const ks of kustomizations) {
        await flux_client.reconcile({
          kind: 'Kustomization',
          name: ks.metadata.name,
          namespace: flux_namespace,
        });
      }

      return success(undefined);
    },
  };
}
