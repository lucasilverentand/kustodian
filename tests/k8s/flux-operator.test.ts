import { describe, expect, it } from 'bun:test';

import { failure, success } from '../../src/core/index.js';
import {
  type ClusterFluxStatusType,
  type FluxOperatorType,
  create_flux_operator,
} from '../../src/k8s/flux-operator.js';
import type { FluxClientType } from '../../src/k8s/flux.js';
import type { K8sObjectType, KubectlClientType } from '../../src/k8s/kubectl.js';

// ─── Mock Helpers ─────────────────────────────────────────────────

function make_kustomization(
  name: string,
  opts: {
    ready?: boolean;
    healthy?: boolean;
    suspended?: boolean;
    applied_revision?: string;
    attempted_revision?: string;
    ready_reason?: string;
    ready_message?: string;
    healthy_message?: string;
  } = {},
): K8sObjectType {
  const conditions: { type: string; status: string; reason?: string; message?: string }[] = [];

  if (opts.ready !== undefined) {
    conditions.push({
      type: 'Ready',
      status: opts.ready ? 'True' : 'False',
      reason: opts.ready_reason,
      message: opts.ready_message,
    });
  }

  if (opts.healthy !== undefined) {
    conditions.push({
      type: 'Healthy',
      status: opts.healthy ? 'True' : 'False',
      message: opts.healthy_message,
    });
  }

  return {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: { name, namespace: 'flux-system' },
    spec: { suspend: opts.suspended ?? false },
    status: {
      conditions,
      lastAppliedRevision: opts.applied_revision,
      lastAttemptedRevision: opts.attempted_revision,
    },
  } as unknown as K8sObjectType;
}

function make_oci_repository(
  name: string,
  opts: {
    ready?: boolean;
    suspended?: boolean;
    revision?: string;
    ready_reason?: string;
    ready_message?: string;
  } = {},
): K8sObjectType {
  const conditions: { type: string; status: string; reason?: string; message?: string }[] = [];

  if (opts.ready !== undefined) {
    conditions.push({
      type: 'Ready',
      status: opts.ready ? 'True' : 'False',
      reason: opts.ready_reason,
      message: opts.ready_message,
    });
  }

  return {
    apiVersion: 'source.toolkit.fluxcd.io/v1beta2',
    kind: 'OCIRepository',
    metadata: { name, namespace: 'flux-system' },
    spec: { suspend: opts.suspended ?? false },
    status: {
      conditions,
      artifact: opts.revision ? { revision: opts.revision } : undefined,
    },
  } as unknown as K8sObjectType;
}

interface MockFluxClientOptions {
  installed?: boolean;
  version?: string;
  check_error?: boolean;
  suspend_errors?: string[];
  resume_errors?: string[];
  reconcile_error?: boolean;
}

function create_mock_flux_client(opts: MockFluxClientOptions = {}): FluxClientType {
  const suspend_calls: string[] = [];
  const resume_calls: string[] = [];
  const reconcile_calls: string[] = [];

  return {
    async check() {
      if (opts.check_error) {
        return failure({ code: 'FLUX_CHECK_ERROR', message: 'check failed' });
      }
      return success({
        installed: opts.installed ?? true,
        version: opts.version,
        components: [
          { name: 'source-controller', ready: true },
          { name: 'kustomize-controller', ready: true },
        ],
      });
    },
    async suspend(resource) {
      suspend_calls.push(resource.name);
      if (opts.suspend_errors?.includes(resource.name)) {
        return failure({ code: 'FLUX_SUSPEND_ERROR', message: `suspend failed: ${resource.name}` });
      }
      return success(undefined);
    },
    async resume(resource) {
      resume_calls.push(resource.name);
      if (opts.resume_errors?.includes(resource.name)) {
        return failure({ code: 'FLUX_RESUME_ERROR', message: `resume failed: ${resource.name}` });
      }
      return success(undefined);
    },
    async reconcile(resource) {
      reconcile_calls.push(resource.name);
      if (opts.reconcile_error) {
        return failure({
          code: 'FLUX_RECONCILE_ERROR',
          message: `reconcile failed: ${resource.name}`,
        });
      }
      return success(undefined);
    },
    // Unused methods
    async bootstrap() {
      return success(undefined);
    },
    async get() {
      return success({});
    },
    async uninstall() {
      return success(undefined);
    },
    async install() {
      return success(undefined);
    },
    async check_cli() {
      return success(true);
    },
    async diff_kustomization() {
      return success({ exit_code: 0, stdout: '', stderr: '', has_changes: false });
    },
    // Expose call tracking for assertions
    _suspend_calls: suspend_calls,
    _resume_calls: resume_calls,
    _reconcile_calls: reconcile_calls,
  } as FluxClientType & {
    _suspend_calls: string[];
    _resume_calls: string[];
    _reconcile_calls: string[];
  };
}

interface MockKubectlOptions {
  kustomizations?: K8sObjectType[];
  oci_repositories?: K8sObjectType[];
  get_error?: boolean;
}

function create_mock_kubectl_client(opts: MockKubectlOptions = {}): KubectlClientType {
  return {
    async get(resource) {
      if (opts.get_error) {
        return failure({ code: 'KUBECTL_GET_ERROR', message: 'get failed' });
      }

      if (resource.kind.startsWith('Kustomization')) {
        return success(opts.kustomizations ?? []);
      }

      if (resource.kind === 'OCIRepository') {
        const repos = opts.oci_repositories ?? [];
        if (resource.name) {
          const found = repos.filter((r) => r.metadata.name === resource.name);
          return success(found);
        }
        return success(repos);
      }

      return success([]);
    },
    // Unused methods
    async apply() {
      return success('');
    },
    async delete() {
      return success(undefined);
    },
    async label() {
      return success(undefined);
    },
    async annotate() {
      return success(undefined);
    },
    async wait() {
      return success(undefined);
    },
    async logs() {
      return success('');
    },
    async apply_stdin() {
      return success('');
    },
    async diff_stdin() {
      return success({ exit_code: 0, stdout: '', stderr: '', has_changes: false });
    },
    async check() {
      return success(true);
    },
  } as KubectlClientType;
}

function create_operator(
  flux_opts: MockFluxClientOptions = {},
  kubectl_opts: MockKubectlOptions = {},
): FluxOperatorType {
  return create_flux_operator({
    flux_client: create_mock_flux_client(flux_opts),
    kubectl_client: create_mock_kubectl_client(kubectl_opts),
    flux_namespace: 'flux-system',
  });
}

// ─── Tests ────────────────────────────────────────────────────────

describe('FluxOperator', () => {
  describe('get_status', () => {
    it('should return not-installed status when flux is not installed', async () => {
      const operator = create_operator({ installed: false });

      const result = await operator.get_status();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.flux_installed).toBe(false);
        expect(result.value.kustomizations).toEqual([]);
        expect(result.value.summary.total).toBe(0);
      }
    });

    it('should return failure when flux check fails', async () => {
      const operator = create_operator({ check_error: true });

      const result = await operator.get_status();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FLUX_CHECK_ERROR');
      }
    });

    it('should return full status with healthy kustomizations', async () => {
      const operator = create_operator(
        { installed: true, version: '2.3.0' },
        {
          kustomizations: [
            make_kustomization('app', {
              ready: true,
              healthy: true,
              applied_revision: 'sha1:abc123',
            }),
            make_kustomization('infra', {
              ready: true,
              healthy: true,
              applied_revision: 'sha1:abc123',
            }),
          ],
          oci_repositories: [
            make_oci_repository('kustodian-oci', {
              ready: true,
              revision: 'sha1:abc123def456',
            }),
          ],
        },
      );

      const result = await operator.get_status('kustodian-oci');

      expect(result.success).toBe(true);
      if (result.success) {
        const status: ClusterFluxStatusType = result.value;
        expect(status.flux_installed).toBe(true);
        expect(status.flux_version).toBe('2.3.0');
        expect(status.components).toHaveLength(2);
        expect(status.oci_repository?.name).toBe('kustodian-oci');
        expect(status.oci_repository?.ready).toBe(true);
        expect(status.oci_repository?.revision).toBe('sha1:abc123def456');
        expect(status.kustomizations).toHaveLength(2);
        expect(status.summary.healthy).toBe(2);
        expect(status.summary.unhealthy).toBe(0);
        expect(status.summary.suspended).toBe(0);
      }
    });

    it('should correctly count unhealthy and suspended kustomizations', async () => {
      const operator = create_operator(
        {},
        {
          kustomizations: [
            make_kustomization('healthy-app', { ready: true, healthy: true }),
            make_kustomization('failing-app', {
              ready: false,
              ready_reason: 'ReconciliationFailed',
              ready_message: 'health check failed for deployment/nginx',
            }),
            make_kustomization('suspended-app', { ready: false, suspended: true }),
          ],
        },
      );

      const result = await operator.get_status();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.summary.healthy).toBe(1);
        expect(result.value.summary.unhealthy).toBe(1);
        expect(result.value.summary.suspended).toBe(1);
        expect(result.value.summary.total).toBe(3);

        const failing = result.value.kustomizations.find((k) => k.name === 'failing-app');
        expect(failing?.ready).toBe(false);
        expect(failing?.ready_reason).toBe('ReconciliationFailed');
        expect(failing?.ready_message).toBe('health check failed for deployment/nginx');
      }
    });

    it('should detect failed revisions (attempted != applied)', async () => {
      const operator = create_operator(
        {},
        {
          kustomizations: [
            make_kustomization('app', {
              ready: false,
              ready_reason: 'HealthCheckFailed',
              applied_revision: 'sha1:old111',
              attempted_revision: 'sha1:new222',
            }),
          ],
        },
      );

      const result = await operator.get_status();

      expect(result.success).toBe(true);
      if (result.success) {
        const ks = result.value.kustomizations[0];
        expect(ks?.has_failed_revision).toBe(true);
        expect(ks?.last_applied_revision).toBe('sha1:old111');
        expect(ks?.last_attempted_revision).toBe('sha1:new222');
      }
    });

    it('should handle healthy=null when no Healthy condition exists', async () => {
      const operator = create_operator(
        {},
        {
          kustomizations: [make_kustomization('app', { ready: true })],
        },
      );

      const result = await operator.get_status();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.kustomizations[0]?.healthy).toBeNull();
      }
    });

    it('should handle missing OCIRepository gracefully', async () => {
      const operator = create_operator(
        {},
        {
          kustomizations: [make_kustomization('app', { ready: true })],
          oci_repositories: [],
        },
      );

      const result = await operator.get_status('kustodian-oci');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.oci_repository).toBeUndefined();
      }
    });

    it('should handle suspended OCIRepository', async () => {
      const operator = create_operator(
        {},
        {
          kustomizations: [],
          oci_repositories: [make_oci_repository('kustodian-oci', { suspended: true })],
        },
      );

      const result = await operator.get_status('kustodian-oci');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.oci_repository?.suspended).toBe(true);
        expect(result.value.oci_repository?.ready).toBe(false);
      }
    });

    it('should return empty kustomizations when kubectl get fails', async () => {
      const operator = create_operator({}, { get_error: true });

      const result = await operator.get_status();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.kustomizations).toEqual([]);
        expect(result.value.summary.total).toBe(0);
      }
    });

    it('should skip OCI lookup when no oci_repository_name given', async () => {
      const operator = create_operator(
        {},
        {
          kustomizations: [make_kustomization('app', { ready: true })],
          oci_repositories: [make_oci_repository('kustodian-oci', { ready: true })],
        },
      );

      // No oci_repository_name argument
      const result = await operator.get_status();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.oci_repository).toBeUndefined();
      }
    });
  });

  describe('list_kustomizations', () => {
    it('should return kustomization names', async () => {
      const operator = create_operator(
        {},
        {
          kustomizations: [
            make_kustomization('app', { ready: true }),
            make_kustomization('infra', { ready: true }),
            make_kustomization('monitoring', { ready: false }),
          ],
        },
      );

      const result = await operator.list_kustomizations();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(['app', 'infra', 'monitoring']);
      }
    });

    it('should return empty array when none found', async () => {
      const operator = create_operator({}, { kustomizations: [] });

      const result = await operator.list_kustomizations();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return empty array when kubectl fails', async () => {
      const operator = create_operator({}, { get_error: true });

      const result = await operator.list_kustomizations();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('suspend_all', () => {
    it('should suspend all kustomizations', async () => {
      const flux = create_mock_flux_client();
      const operator = create_flux_operator({
        flux_client: flux,
        kubectl_client: create_mock_kubectl_client({
          kustomizations: [
            make_kustomization('app', { ready: true }),
            make_kustomization('infra', { ready: true }),
          ],
        }),
        flux_namespace: 'flux-system',
      });

      const result = await operator.suspend_all();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.succeeded).toEqual(['app', 'infra']);
        expect(result.value.failed).toEqual([]);
      }
    });

    it('should report partial failures', async () => {
      const flux = create_mock_flux_client({ suspend_errors: ['infra'] });
      const operator = create_flux_operator({
        flux_client: flux,
        kubectl_client: create_mock_kubectl_client({
          kustomizations: [
            make_kustomization('app', { ready: true }),
            make_kustomization('infra', { ready: true }),
          ],
        }),
        flux_namespace: 'flux-system',
      });

      const result = await operator.suspend_all();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.succeeded).toEqual(['app']);
        expect(result.value.failed).toHaveLength(1);
        expect(result.value.failed[0]?.name).toBe('infra');
      }
    });

    it('should return empty results when no kustomizations exist', async () => {
      const operator = create_operator({}, { kustomizations: [] });

      const result = await operator.suspend_all();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.succeeded).toEqual([]);
        expect(result.value.failed).toEqual([]);
      }
    });
  });

  describe('resume_all', () => {
    it('should resume all kustomizations', async () => {
      const flux = create_mock_flux_client();
      const operator = create_flux_operator({
        flux_client: flux,
        kubectl_client: create_mock_kubectl_client({
          kustomizations: [
            make_kustomization('app', { suspended: true }),
            make_kustomization('infra', { suspended: true }),
          ],
        }),
        flux_namespace: 'flux-system',
      });

      const result = await operator.resume_all();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.succeeded).toEqual(['app', 'infra']);
        expect(result.value.failed).toEqual([]);
      }
    });

    it('should report partial failures', async () => {
      const flux = create_mock_flux_client({ resume_errors: ['app'] });
      const operator = create_flux_operator({
        flux_client: flux,
        kubectl_client: create_mock_kubectl_client({
          kustomizations: [
            make_kustomization('app', { suspended: true }),
            make_kustomization('infra', { suspended: true }),
          ],
        }),
        flux_namespace: 'flux-system',
      });

      const result = await operator.resume_all();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.succeeded).toEqual(['infra']);
        expect(result.value.failed).toHaveLength(1);
        expect(result.value.failed[0]?.name).toBe('app');
      }
    });
  });

  describe('reconcile_all', () => {
    it('should reconcile OCIRepository and all kustomizations', async () => {
      const flux = create_mock_flux_client() as FluxClientType & { _reconcile_calls: string[] };
      const operator = create_flux_operator({
        flux_client: flux,
        kubectl_client: create_mock_kubectl_client({
          kustomizations: [
            make_kustomization('app', { ready: true }),
            make_kustomization('infra', { ready: true }),
          ],
        }),
        flux_namespace: 'flux-system',
      });

      const result = await operator.reconcile_all('kustodian-oci');

      expect(result.success).toBe(true);
      expect(flux._reconcile_calls).toContain('kustodian-oci');
      expect(flux._reconcile_calls).toContain('app');
      expect(flux._reconcile_calls).toContain('infra');
    });

    it('should fail when OCIRepository reconciliation fails', async () => {
      const operator = create_operator(
        { reconcile_error: true },
        {
          kustomizations: [make_kustomization('app', { ready: true })],
        },
      );

      const result = await operator.reconcile_all('kustodian-oci');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FLUX_RECONCILE_ERROR');
        expect(result.error.message).toContain('kustodian-oci');
      }
    });
  });
});
