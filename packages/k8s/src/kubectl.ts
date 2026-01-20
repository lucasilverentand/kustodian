import type { KustodianErrorType } from '@kustodian/core';
import { type ResultType, failure, success } from '@kustodian/core';

import { type ExecOptionsType, check_command, exec_command } from './exec.js';
import type { ApplyOptionsType, K8sResourceType, LogOptionsType } from './types.js';

/**
 * Options for creating a KubectlClient.
 */
export interface KubectlClientOptionsType {
  kubeconfig?: string;
  context?: string;
  timeout?: number;
}

/**
 * Kubernetes resource object (generic).
 */
export interface K8sObjectType {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: unknown;
  status?: unknown;
}

/**
 * Kubectl client interface.
 */
export interface KubectlClientType {
  /**
   * Applies manifests to the cluster.
   */
  apply(
    manifest: string,
    options?: ApplyOptionsType,
  ): Promise<ResultType<string, KustodianErrorType>>;

  /**
   * Gets resources from the cluster.
   */
  get(resource: K8sResourceType): Promise<ResultType<K8sObjectType[], KustodianErrorType>>;

  /**
   * Deletes resources from the cluster.
   */
  delete(resource: K8sResourceType): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Labels a node.
   */
  label(
    node: string,
    labels: Record<string, string>,
  ): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Annotates a resource.
   */
  annotate(
    resource: K8sResourceType,
    annotations: Record<string, string>,
  ): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Waits for a resource to reach a condition.
   */
  wait(
    resource: K8sResourceType,
    condition: string,
    timeout_seconds?: number,
  ): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Gets logs from a pod.
   */
  logs(
    pod: string,
    namespace: string,
    options?: LogOptionsType,
  ): Promise<ResultType<string, KustodianErrorType>>;

  /**
   * Checks if kubectl is available.
   */
  check(): Promise<ResultType<boolean, KustodianErrorType>>;
}

/**
 * Creates a kubectl client.
 */
export function create_kubectl_client(options: KubectlClientOptionsType = {}): KubectlClientType {
  const base_args: string[] = [];

  if (options.kubeconfig) {
    base_args.push(`--kubeconfig=${options.kubeconfig}`);
  }
  if (options.context) {
    base_args.push(`--context=${options.context}`);
  }

  const exec_options: ExecOptionsType = {
    timeout: options.timeout ?? 60000,
  };

  return {
    async apply(manifest, apply_options = {}) {
      const args = [...base_args, 'apply', '-f', manifest];

      if (apply_options.dry_run) {
        args.push('--dry-run=client');
      }
      if (apply_options.server_side) {
        args.push('--server-side');
      }
      if (apply_options.force_conflicts) {
        args.push('--force-conflicts');
      }

      const result = await exec_command('kubectl', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECTL_APPLY_ERROR',
          message: result.value.stderr || 'Failed to apply manifest',
        });
      }

      return success(result.value.stdout);
    },

    async get(resource) {
      const args = [...base_args, 'get', resource.kind.toLowerCase()];

      if (resource.name) {
        args.push(resource.name);
      }
      if (resource.namespace) {
        args.push('-n', resource.namespace);
      }

      args.push('-o', 'json');

      const result = await exec_command('kubectl', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECTL_GET_ERROR',
          message: result.value.stderr || 'Failed to get resource',
        });
      }

      try {
        const parsed = JSON.parse(result.value.stdout);
        // Handle both single resource and list responses
        if (parsed.kind?.endsWith('List')) {
          return success(parsed.items as K8sObjectType[]);
        }
        return success([parsed as K8sObjectType]);
      } catch {
        return failure({
          code: 'KUBECTL_PARSE_ERROR',
          message: 'Failed to parse kubectl output',
        });
      }
    },

    async delete(resource) {
      const args = [...base_args, 'delete', resource.kind.toLowerCase(), resource.name];

      if (resource.namespace) {
        args.push('-n', resource.namespace);
      }

      const result = await exec_command('kubectl', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECTL_DELETE_ERROR',
          message: result.value.stderr || 'Failed to delete resource',
        });
      }

      return success(undefined);
    },

    async label(node, labels) {
      const label_args = Object.entries(labels).map(([k, v]) => `${k}=${v}`);
      const args = [...base_args, 'label', 'node', node, ...label_args, '--overwrite'];

      const result = await exec_command('kubectl', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECTL_LABEL_ERROR',
          message: result.value.stderr || 'Failed to label node',
        });
      }

      return success(undefined);
    },

    async annotate(resource, annotations) {
      const annotation_args = Object.entries(annotations).map(([k, v]) => `${k}=${v}`);
      const args = [
        ...base_args,
        'annotate',
        resource.kind.toLowerCase(),
        resource.name,
        ...annotation_args,
        '--overwrite',
      ];

      if (resource.namespace) {
        args.push('-n', resource.namespace);
      }

      const result = await exec_command('kubectl', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECTL_ANNOTATE_ERROR',
          message: result.value.stderr || 'Failed to annotate resource',
        });
      }

      return success(undefined);
    },

    async wait(resource, condition, timeout_seconds = 300) {
      const args = [
        ...base_args,
        'wait',
        `${resource.kind.toLowerCase()}/${resource.name}`,
        `--for=${condition}`,
        `--timeout=${timeout_seconds}s`,
      ];

      if (resource.namespace) {
        args.push('-n', resource.namespace);
      }

      const result = await exec_command('kubectl', args, {
        ...exec_options,
        timeout: (timeout_seconds + 10) * 1000,
      });
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECTL_WAIT_ERROR',
          message: result.value.stderr || 'Timeout waiting for condition',
        });
      }

      return success(undefined);
    },

    async logs(pod, namespace, log_options = {}) {
      const args = [...base_args, 'logs', pod, '-n', namespace];

      if (log_options.tail) {
        args.push(`--tail=${log_options.tail}`);
      }
      if (log_options.container) {
        args.push('-c', log_options.container);
      }
      if (log_options.previous) {
        args.push('--previous');
      }

      const result = await exec_command('kubectl', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECTL_LOGS_ERROR',
          message: result.value.stderr || 'Failed to get logs',
        });
      }

      return success(result.value.stdout);
    },

    async check() {
      const available = await check_command('kubectl');
      return success(available);
    },
  };
}
