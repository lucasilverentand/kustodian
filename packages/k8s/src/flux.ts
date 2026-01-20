import type { KustodianErrorType } from '@kustodian/core';
import { type ResultType, failure, success } from '@kustodian/core';

import { type ExecOptionsType, check_command, exec_command } from './exec.js';
import type { FluxBootstrapOptionsType, FluxResourceType, FluxStatusType } from './types.js';

/**
 * Options for creating a FluxClient.
 */
export interface FluxClientOptionsType {
  kubeconfig?: string;
  context?: string;
  timeout?: number;
}

/**
 * Flux client interface.
 */
export interface FluxClientType {
  /**
   * Bootstraps Flux on the cluster.
   */
  bootstrap(options: FluxBootstrapOptionsType): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Checks Flux installation status.
   */
  check(): Promise<ResultType<FluxStatusType, KustodianErrorType>>;

  /**
   * Triggers reconciliation of a Flux resource.
   */
  reconcile(resource: FluxResourceType): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Gets a Flux resource.
   */
  get(resource: FluxResourceType): Promise<ResultType<unknown, KustodianErrorType>>;

  /**
   * Suspends a Flux resource.
   */
  suspend(resource: FluxResourceType): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Resumes a Flux resource.
   */
  resume(resource: FluxResourceType): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Uninstalls Flux from the cluster.
   */
  uninstall(): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Installs Flux on the cluster.
   */
  install(): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Checks if flux CLI is available.
   */
  check_cli(): Promise<ResultType<boolean, KustodianErrorType>>;
}

/**
 * Creates a Flux client.
 */
export function create_flux_client(options: FluxClientOptionsType = {}): FluxClientType {
  const base_args: string[] = [];

  if (options.kubeconfig) {
    base_args.push(`--kubeconfig=${options.kubeconfig}`);
  }
  if (options.context) {
    base_args.push(`--context=${options.context}`);
  }

  const exec_options: ExecOptionsType = {
    timeout: options.timeout ?? 300000, // 5 min default for Flux operations
  };

  function get_resource_type(kind: FluxResourceType['kind']): string {
    const mapping: Record<FluxResourceType['kind'], string> = {
      Kustomization: 'kustomization',
      GitRepository: 'source git',
      OCIRepository: 'source oci',
      HelmRelease: 'helmrelease',
      HelmRepository: 'source helm',
    };
    return mapping[kind];
  }

  return {
    async bootstrap(bootstrap_options) {
      const args = [
        ...base_args,
        'bootstrap',
        bootstrap_options.provider,
        `--owner=${bootstrap_options.owner}`,
        `--repository=${bootstrap_options.repository}`,
        `--path=${bootstrap_options.path}`,
      ];

      if (bootstrap_options.branch) {
        args.push(`--branch=${bootstrap_options.branch}`);
      }
      if (bootstrap_options.personal) {
        args.push('--personal');
      }

      const result = await exec_command('flux', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'FLUX_BOOTSTRAP_ERROR',
          message: result.value.stderr || 'Failed to bootstrap Flux',
        });
      }

      return success(undefined);
    },

    async check() {
      const args = [...base_args, 'check'];

      const result = await exec_command('flux', args, { ...exec_options, timeout: 30000 });
      if (!result.success) {
        return result;
      }

      // Parse flux check output
      const output = result.value.stdout + result.value.stderr;
      const installed = !output.includes('flux not installed');

      // Extract version if available
      const version_match = output.match(/flux-cli v?(\d+\.\d+\.\d+)/i);
      const version = version_match ? version_match[1] : undefined;

      // Parse component status
      const components: FluxStatusType['components'] = [];
      const component_names = [
        'source-controller',
        'kustomize-controller',
        'helm-controller',
        'notification-controller',
      ];

      for (const name of component_names) {
        const ready = output.includes(`${name}`) && !output.includes(`${name}: not found`);
        components.push({ name, ready });
      }

      const status: FluxStatusType = {
        installed,
        components,
      };

      if (version !== undefined) {
        status.version = version;
      }

      return success(status);
    },

    async reconcile(resource) {
      const resource_type = get_resource_type(resource.kind);
      const args = [...base_args, 'reconcile', resource_type, resource.name];

      if (resource.namespace) {
        args.push('-n', resource.namespace);
      }

      const result = await exec_command('flux', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'FLUX_RECONCILE_ERROR',
          message: result.value.stderr || 'Failed to reconcile resource',
        });
      }

      return success(undefined);
    },

    async get(resource) {
      const resource_type = get_resource_type(resource.kind);
      const args = [...base_args, 'get', resource_type, resource.name, '-o', 'json'];

      if (resource.namespace) {
        args.push('-n', resource.namespace);
      }

      const result = await exec_command('flux', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'FLUX_GET_ERROR',
          message: result.value.stderr || 'Failed to get resource',
        });
      }

      try {
        return success(JSON.parse(result.value.stdout));
      } catch {
        return failure({
          code: 'FLUX_PARSE_ERROR',
          message: 'Failed to parse flux output',
        });
      }
    },

    async suspend(resource) {
      const resource_type = get_resource_type(resource.kind);
      const args = [...base_args, 'suspend', resource_type, resource.name];

      if (resource.namespace) {
        args.push('-n', resource.namespace);
      }

      const result = await exec_command('flux', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'FLUX_SUSPEND_ERROR',
          message: result.value.stderr || 'Failed to suspend resource',
        });
      }

      return success(undefined);
    },

    async resume(resource) {
      const resource_type = get_resource_type(resource.kind);
      const args = [...base_args, 'resume', resource_type, resource.name];

      if (resource.namespace) {
        args.push('-n', resource.namespace);
      }

      const result = await exec_command('flux', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'FLUX_RESUME_ERROR',
          message: result.value.stderr || 'Failed to resume resource',
        });
      }

      return success(undefined);
    },

    async uninstall() {
      const args = [...base_args, 'uninstall', '--silent'];

      const result = await exec_command('flux', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'FLUX_UNINSTALL_ERROR',
          message: result.value.stderr || 'Failed to uninstall Flux',
        });
      }

      return success(undefined);
    },

    async install() {
      const args = [...base_args, 'install'];

      const result = await exec_command('flux', args, exec_options);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'FLUX_INSTALL_ERROR',
          message: result.value.stderr || 'Failed to install Flux',
        });
      }

      return success(undefined);
    },

    async check_cli() {
      const available = await check_command('flux');
      return success(available);
    },
  };
}
