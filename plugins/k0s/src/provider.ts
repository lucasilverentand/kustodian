import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { Errors, type ResultType, failure, is_success, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import type { NodeListType } from '@kustodian/nodes';
import { get_controllers } from '@kustodian/nodes';
import type {
  BootstrapOptionsType,
  ClusterProviderType,
  ResetOptionsType,
} from '@kustodian/plugins';
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
 * Validates k0s cluster configuration.
 */
export function validate_k0s_config(node_list: NodeListType): ResultType<void, KustodianErrorType> {
  const controllers = get_controllers(node_list.nodes);

  if (controllers.length === 0) {
    return failure(Errors.validation_error('k0s cluster requires at least one controller node'));
  }

  // Validate SSH configuration is present
  for (const node of node_list.nodes) {
    const ssh = node.ssh ?? node_list.ssh;
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
      return validate_k0s_config(node_list);
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

      return success(undefined);
    },

    async get_kubeconfig(node_list: NodeListType): Promise<ResultType<string, KustodianErrorType>> {
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
  };
}
