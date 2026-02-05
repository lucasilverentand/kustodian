import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { KustodianErrorType } from '../core/index.js';
import { type ResultType, failure, success } from '../core/index.js';

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
      const result = await exec_command('kubectl', ['config', 'get-contexts', '-o', 'name']);
      if (!result.success) {
        return result;
      }

      if (result.value.exit_code !== 0) {
        return failure({
          code: 'KUBECONFIG_ERROR',
          message: result.value.stderr || 'Failed to list contexts',
        });
      }

      // Parse context names
      const context_names = result.value.stdout.split('\n').filter(Boolean);

      // Get details for each context
      const contexts: KubeconfigContextType[] = [];
      for (const name of context_names) {
        const view_result = await exec_command('kubectl', [
          'config',
          'view',
          '-o',
          `jsonpath={.contexts[?(@.name=="${name}")]}`,
        ]);

        if (view_result.success && view_result.value.exit_code === 0) {
          try {
            const ctx = JSON.parse(view_result.value.stdout);
            contexts.push({
              name,
              cluster: ctx.context?.cluster ?? '',
              user: ctx.context?.user ?? '',
              namespace: ctx.context?.namespace,
            });
          } catch {
            // If parsing fails, just add basic context info
            contexts.push({ name, cluster: '', user: '' });
          }
        } else {
          contexts.push({ name, cluster: '', user: '' });
        }
      }

      return success(contexts);
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
  };
}
