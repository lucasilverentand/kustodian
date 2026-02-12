import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { KustodianErrorType } from 'kustodian/core';
import { Errors, type ResultType, failure, is_success, success } from 'kustodian/core';
import type { NodeListType } from 'kustodian/nodes';
import { get_controllers } from 'kustodian/nodes';
import type {
  BootstrapOptionsType,
  ClusterProviderType,
  ResetOptionsType,
} from 'kustodian/plugins';
import YAML from 'yaml';

import { generate_k0sctl_config, serialize_k0sctl_config } from './config.js';
import {
  check_k0sctl_available,
  k0sctl_apply,
  k0sctl_kubeconfig,
  k0sctl_reset,
} from './executor.js';
import type { K0sProviderOptionsType } from './types.js';

/**
 * Validates that SSH key files exist for all nodes.
 */
export async function validate_ssh_keys(
  node_list: NodeListType,
  options: K0sProviderOptionsType = {},
): Promise<ResultType<void, KustodianErrorType>> {
  const key_paths = new Set<string>();
  const default_ssh = options.default_ssh ?? node_list.ssh;

  for (const node of node_list.nodes) {
    const ssh = node.ssh ?? default_ssh;
    const key_path = ssh?.key_path;
    if (key_path) {
      // Resolve ~ to home directory since fs.access doesn't expand tilde
      const resolved = key_path.startsWith('~')
        ? path.join(os.homedir(), key_path.slice(1))
        : key_path;
      key_paths.add(resolved);
    }
  }

  for (const key_path of key_paths) {
    try {
      await fs.access(key_path);
    } catch {
      return failure(Errors.validation_error(`SSH key not found: ${key_path}`));
    }
  }

  return success(undefined);
}

/**
 * Validates k0s cluster configuration.
 */
export function validate_k0s_config(
  node_list: NodeListType,
  options: K0sProviderOptionsType = {},
): ResultType<void, KustodianErrorType> {
  const controllers = get_controllers(node_list.nodes);

  if (controllers.length === 0) {
    return failure(Errors.validation_error('k0s cluster requires at least one controller node'));
  }

  // Validate SSH configuration is present
  const default_ssh = options.default_ssh ?? node_list.ssh;
  for (const node of node_list.nodes) {
    const ssh = node.ssh ?? default_ssh;
    if (!ssh?.user) {
      return failure(
        Errors.validation_error(`Node '${node.name}' requires SSH user configuration`),
      );
    }
  }

  return success(undefined);
}

/**
 * Writes k0sctl config to a temporary file.
 */
async function write_k0sctl_config(
  config: unknown,
  cluster_name: string,
): Promise<ResultType<string, KustodianErrorType>> {
  const temp_dir = os.tmpdir();
  const config_path = path.join(temp_dir, `k0sctl-${cluster_name}.yaml`);

  try {
    const yaml_content = YAML.stringify(config);
    await fs.writeFile(config_path, yaml_content, 'utf-8');
    return success(config_path);
  } catch (error) {
    return failure(Errors.file_write_error(config_path, error));
  }
}

/**
 * Creates the k0s cluster provider.
 */
export function create_k0s_provider(options: K0sProviderOptionsType = {}): ClusterProviderType {
  let config_path: string | undefined;

  return {
    name: 'k0s',

    validate(node_list: NodeListType): ResultType<void, KustodianErrorType> {
      return validate_k0s_config(node_list, options);
    },

    async install(
      node_list: NodeListType,
      bootstrap_options: BootstrapOptionsType,
    ): Promise<ResultType<void, KustodianErrorType>> {
      // Check k0sctl is available
      const k0sctl_check = await check_k0sctl_available();
      if (!is_success(k0sctl_check)) {
        return k0sctl_check;
      }

      // Validate SSH keys exist
      const ssh_check = await validate_ssh_keys(node_list, options);
      if (!is_success(ssh_check)) {
        return ssh_check;
      }

      // Generate k0sctl config
      const k0sctl_config = generate_k0sctl_config(node_list, options);
      const serialized = serialize_k0sctl_config(k0sctl_config);

      // Write config to temp file
      const write_result = await write_k0sctl_config(serialized, node_list.cluster);
      if (!is_success(write_result)) {
        return write_result;
      }

      config_path = write_result.value;

      // Skip actual installation in dry run mode
      if (bootstrap_options.dry_run) {
        return success(undefined);
      }

      // Run k0sctl apply
      const apply_result = await k0sctl_apply(config_path, {
        timeout: bootstrap_options.timeout,
      });

      if (!is_success(apply_result)) {
        return apply_result;
      }

      // Apply node labels if configured
      if (node_list.nodes.some((n) => n.labels && Object.keys(n.labels).length > 0)) {
        console.log('  → Applying node labels...');

        // Get kubeconfig
        const kubeconfig_result = await k0sctl_kubeconfig(config_path);
        if (!is_success(kubeconfig_result)) {
          console.warn(
            `  ⚠ Failed to get kubeconfig for labeling: ${kubeconfig_result.error.message}`,
          );
          return success(undefined);
        }

        // Write kubeconfig to temp file (kubectl needs a file path, not content)
        const kubeconfig_path = path.join(
          os.tmpdir(),
          `kustodian-label-kubeconfig-${node_list.cluster}.yaml`,
        );
        await fs.writeFile(kubeconfig_path, kubeconfig_result.value, 'utf-8');

        // Create kubectl client and labeler
        const { create_kubectl_client } = await import('kustodian/k8s');
        const { create_kubectl_labeler } = await import('kustodian/nodes');

        const kubectl = create_kubectl_client({
          kubeconfig: kubeconfig_path,
        });
        const labeler = create_kubectl_labeler(kubectl);

        // Sync labels
        const label_result = await labeler.sync_labels(
          node_list,
          bootstrap_options.dry_run
            ? {
                dry_run: true,
              }
            : {},
        );

        // Clean up temp kubeconfig file
        try {
          await fs.unlink(kubeconfig_path);
        } catch {
          // Ignore cleanup errors
        }

        if (!is_success(label_result)) {
          console.warn(`  ⚠ Label sync failed: ${label_result.error.message}`);
        } else {
          console.log(`    ✓ Applied ${label_result.value.applied} labels`);
        }
      }

      return success(undefined);
    },

    async get_kubeconfig(node_list: NodeListType): Promise<ResultType<string, KustodianErrorType>> {
      // Check k0sctl is available
      const k0sctl_check = await check_k0sctl_available();
      if (!is_success(k0sctl_check)) {
        return k0sctl_check;
      }

      // If we have a config path from install, use it
      if (config_path) {
        return k0sctl_kubeconfig(config_path);
      }

      // Otherwise, generate a new config
      const k0sctl_config = generate_k0sctl_config(node_list, options);
      const serialized = serialize_k0sctl_config(k0sctl_config);

      const write_result = await write_k0sctl_config(serialized, node_list.cluster);
      if (!is_success(write_result)) {
        return write_result;
      }

      config_path = write_result.value;
      return k0sctl_kubeconfig(config_path);
    },

    async reset(
      node_list: NodeListType,
      reset_options: ResetOptionsType,
    ): Promise<ResultType<void, KustodianErrorType>> {
      // Check k0sctl is available
      const k0sctl_check = await check_k0sctl_available();
      if (!is_success(k0sctl_check)) {
        return k0sctl_check;
      }

      // Generate k0sctl config if we don't have one
      if (!config_path) {
        const k0sctl_config = generate_k0sctl_config(node_list, options);
        const serialized = serialize_k0sctl_config(k0sctl_config);

        const write_result = await write_k0sctl_config(serialized, node_list.cluster);
        if (!is_success(write_result)) {
          return write_result;
        }

        config_path = write_result.value;
      }

      // Skip actual reset in dry run mode
      if (reset_options.dry_run) {
        return success(undefined);
      }

      // Run k0sctl reset
      const reset_result = await k0sctl_reset(config_path, reset_options.force ?? false);

      if (!is_success(reset_result)) {
        return reset_result;
      }

      return success(undefined);
    },

    async cleanup(): Promise<ResultType<void, KustodianErrorType>> {
      if (config_path) {
        try {
          await fs.unlink(config_path);
        } catch (error) {
          // Ignore ENOENT - file already deleted
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            return failure(Errors.file_write_error(config_path, error));
          }
        }
        config_path = undefined;
      }
      return success(undefined);
    },

    get_config_preview(node_list: NodeListType): ResultType<string, KustodianErrorType> {
      const k0sctl_config = generate_k0sctl_config(node_list, options);
      const serialized = serialize_k0sctl_config(k0sctl_config);
      return success(YAML.stringify(serialized));
    },
  };
}
