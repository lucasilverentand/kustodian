import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { KustodianErrorType } from '../core/index.js';
import { type ResultType, failure, success } from '../core/index.js';

import YAML from 'yaml';
import { exec_command } from './exec.js';

/**
 * Kubeconfig context information.
 */
export interface KubeconfigContextType {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
}

/**
 * Kubeconfig manager interface.
 */
export interface KubeconfigManagerType {
  /**
   * Gets the default kubeconfig path.
   */
  get_default_path(): string;

  /**
   * Gets the current context.
   */
  get_current_context(): Promise<ResultType<string, KustodianErrorType>>;

  /**
   * Sets the current context.
   */
  set_context(name: string): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Lists all available contexts.
   */
  list_contexts(): Promise<ResultType<KubeconfigContextType[], KustodianErrorType>>;

  /**
   * Checks if a kubeconfig file exists.
   */
  exists(kubeconfig_path?: string): Promise<boolean>;

  /**
   * Merges a kubeconfig into the default kubeconfig.
   */
  merge(new_kubeconfig: string): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Renames kubeconfig entries to use cluster-scoped names.
   *
   * Naming convention:
   *   Context:  <cluster_name>
   *   Cluster:  <cluster_name>
   *   User:     <cluster_name>-admin
   */
  rename_entries(
    kubeconfig_path: string,
    cluster_name: string,
  ): Promise<ResultType<void, KustodianErrorType>>;
}

/**
 * Creates a kubeconfig manager.
 */
export function create_kubeconfig_manager(): KubeconfigManagerType {
  function get_default_path(): string {
    const kubeconfig_env = process.env['KUBECONFIG'];
    if (kubeconfig_env) {
      // Return first path if multiple are specified
      return kubeconfig_env.split(path.delimiter)[0] ?? path.join(os.homedir(), '.kube', 'config');
    }
    return path.join(os.homedir(), '.kube', 'config');
  }

  return {
    get_default_path,

    async get_current_context() {
      const result = await exec_command('kubectl', ['config', 'current-context']);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECONFIG_ERROR',
          message: result.value.stderr || 'Failed to get current context',
        });
      }

      return success(result.value.stdout);
    },

    async set_context(name) {
      const result = await exec_command('kubectl', ['config', 'use-context', name]);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECONFIG_ERROR',
          message: result.value.stderr || `Failed to set context to ${name}`,
        });
      }

      return success(undefined);
    },

    async list_contexts() {
      const result = await exec_command('kubectl', ['config', 'view', '-o', 'json']);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECONFIG_ERROR',
          message: result.value.stderr || 'Failed to read kubeconfig contexts',
        });
      }

      try {
        const parsed = JSON.parse(result.value.stdout) as {
          contexts?: Array<{
            name?: string;
            context?: {
              cluster?: string;
              user?: string;
              namespace?: string;
            };
          }>;
        };

        const contexts = (parsed.contexts ?? [])
          .filter(
            (
              ctx,
            ): ctx is {
              name: string;
              context?: { cluster?: string; user?: string; namespace?: string };
            } => Boolean(ctx.name),
          )
          .map((ctx) => {
            const context_info: KubeconfigContextType = {
              name: ctx.name,
              cluster: ctx.context?.cluster ?? '',
              user: ctx.context?.user ?? '',
            };
            if (ctx.context?.namespace) {
              context_info.namespace = ctx.context.namespace;
            }
            return context_info;
          });

        return success(contexts);
      } catch {
        return failure({
          code: 'KUBECONFIG_ERROR',
          message: 'Failed to parse kubeconfig contexts',
        });
      }
    },

    async exists(kubeconfig_path) {
      const path_to_check = kubeconfig_path ?? get_default_path();
      try {
        await fs.access(path_to_check);
        return true;
      } catch {
        return false;
      }
    },

    async merge(new_kubeconfig) {
      const default_path = get_default_path();

      // Ensure .kube directory exists
      const kube_dir = path.dirname(default_path);
      try {
        await fs.mkdir(kube_dir, { recursive: true });
      } catch {
        // Directory may already exist
      }

      // Check if default kubeconfig exists
      const default_exists = await this.exists();

      if (!default_exists) {
        // If no existing kubeconfig, just copy the new one
        try {
          await fs.copyFile(new_kubeconfig, default_path);
          return success(undefined);
        } catch (error) {
          return failure({
            code: 'KUBECONFIG_WRITE_ERROR',
            message: `Failed to write kubeconfig: ${(error as Error).message}`,
          });
        }
      }

      // Merge using KUBECONFIG environment variable
      const merged_config = `${default_path}${path.delimiter}${new_kubeconfig}`;
      const result = await exec_command('kubectl', ['config', 'view', '--flatten'], {
        env: { KUBECONFIG: merged_config },
      });

      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECONFIG_MERGE_ERROR',
          message: result.value.stderr || 'Failed to merge kubeconfig',
        });
      }

      // Write merged config
      try {
        await fs.writeFile(default_path, result.value.stdout);
        return success(undefined);
      } catch (error) {
        return failure({
          code: 'KUBECONFIG_WRITE_ERROR',
          message: `Failed to write merged kubeconfig: ${(error as Error).message}`,
        });
      }
    },

    async rename_entries(kubeconfig_path, cluster_name) {
      try {
        const content = await fs.readFile(kubeconfig_path, 'utf-8');
        // biome-ignore lint: kubeconfig is an untyped YAML document
        const config = YAML.parse(content) as any;

        if (!config || typeof config !== 'object') {
          return failure({
            code: 'KUBECONFIG_PARSE_ERROR',
            message: 'Failed to parse kubeconfig YAML',
          });
        }

        const user_name = `${cluster_name}-admin`;

        if (Array.isArray(config.clusters)) {
          for (const entry of config.clusters) {
            entry.name = cluster_name;
          }
        }

        if (Array.isArray(config.users)) {
          for (const entry of config.users) {
            entry.name = user_name;
          }
        }

        if (Array.isArray(config.contexts)) {
          for (const entry of config.contexts) {
            entry.name = cluster_name;
            if (entry.context) {
              entry.context.cluster = cluster_name;
              entry.context.user = user_name;
            }
          }
        }

        config['current-context'] = cluster_name;

        await fs.writeFile(kubeconfig_path, YAML.stringify(config), 'utf-8');
        return success(undefined);
      } catch (error) {
        return failure({
          code: 'KUBECONFIG_WRITE_ERROR',
          message: `Failed to rename kubeconfig entries: ${(error as Error).message}`,
        });
      }
    },
  };
}
