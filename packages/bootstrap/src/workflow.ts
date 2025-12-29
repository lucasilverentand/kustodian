import { Errors, type ResultType, failure, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';

import type { ClusterProviderType } from './provider.js';
import {
  type BootstrapConfigType,
  type BootstrapOptionsType,
  type BootstrapResultType,
  type BootstrapStateType,
  all_steps_completed,
  create_initial_state,
  get_next_step,
  update_step_status,
} from './types.js';

/**
 * Bootstrap workflow executor.
 */
export interface BootstrapWorkflowType {
  /**
   * Runs the full bootstrap workflow.
   */
  run(config: BootstrapConfigType): Promise<ResultType<BootstrapResultType, KustodianErrorType>>;

  /**
   * Resumes a previously interrupted workflow.
   */
  resume(
    config: BootstrapConfigType,
    state: BootstrapStateType,
  ): Promise<ResultType<BootstrapResultType, KustodianErrorType>>;
}

/**
 * Dependencies for the bootstrap workflow.
 */
export interface WorkflowDependenciesType {
  provider: ClusterProviderType;
  on_step_start?: (step_name: string) => void;
  on_step_complete?: (step_name: string) => void;
  on_step_skip?: (step_name: string, reason: string) => void;
  on_step_fail?: (step_name: string, error: string) => void;
}

/**
 * Creates a bootstrap workflow executor.
 */
export function create_workflow(deps: WorkflowDependenciesType): BootstrapWorkflowType {
  const { provider, on_step_start, on_step_complete, on_step_skip, on_step_fail } = deps;

  async function run_step(
    step_name: string,
    state: BootstrapStateType,
    _options: BootstrapOptionsType,
    fn: () => Promise<ResultType<void, KustodianErrorType>>,
  ): Promise<{ state: BootstrapStateType; success: boolean }> {
    on_step_start?.(step_name);
    let updated_state = update_step_status(state, step_name, 'running');

    const result = await fn();

    if (result.success) {
      on_step_complete?.(step_name);
      updated_state = update_step_status(updated_state, step_name, 'completed');
      return { state: updated_state, success: true };
    }

    on_step_fail?.(step_name, result.error.message);
    updated_state = update_step_status(updated_state, step_name, 'failed', result.error.message);
    return { state: updated_state, success: false };
  }

  async function skip_step(
    step_name: string,
    state: BootstrapStateType,
    reason: string,
  ): Promise<BootstrapStateType> {
    on_step_skip?.(step_name, reason);
    return update_step_status(state, step_name, 'skipped');
  }

  async function execute(
    config: BootstrapConfigType,
    initial_state: BootstrapStateType,
  ): Promise<ResultType<BootstrapResultType, KustodianErrorType>> {
    const { node_list, options } = config;
    let state = initial_state;
    let kubeconfig_path: string | undefined;

    // Step 1: Validate
    const next_step = get_next_step(state);
    if (next_step?.name === 'validate') {
      if (options.skip_validation) {
        state = await skip_step('validate', state, 'Validation skipped by user');
      } else {
        const validation_result = provider.validate(node_list);
        if (!validation_result.success) {
          state = update_step_status(state, 'validate', 'failed', validation_result.error.message);
          return success({ success: false, state });
        }
        const result = await run_step('validate', state, options, async () => success(undefined));
        state = result.state;
        if (!result.success) {
          return success({ success: false, state });
        }
      }
    }

    // Step 2: Install cluster
    const install_step = get_next_step(state);
    if (install_step?.name === 'install') {
      if (options.skip_cluster) {
        state = await skip_step('install', state, 'Cluster installation skipped by user');
      } else if (options.dry_run) {
        state = await skip_step('install', state, 'Dry run mode - skipping installation');
      } else {
        const result = await run_step('install', state, options, () =>
          provider.install(node_list, options),
        );
        state = result.state;
        if (!result.success) {
          return success({ success: false, state });
        }
      }
    }

    // Step 3: Get kubeconfig
    const kubeconfig_step = get_next_step(state);
    if (kubeconfig_step?.name === 'kubeconfig') {
      if (options.skip_kubeconfig) {
        state = await skip_step('kubeconfig', state, 'Kubeconfig setup skipped by user');
      } else if (options.dry_run) {
        state = await skip_step('kubeconfig', state, 'Dry run mode - skipping kubeconfig');
      } else {
        const result = await run_step('kubeconfig', state, options, async () => {
          const kc_result = await provider.get_kubeconfig(node_list);
          if (kc_result.success) {
            kubeconfig_path = '~/.kube/config';
          }
          return kc_result.success ? success(undefined) : kc_result;
        });
        state = result.state;
        if (!result.success) {
          return success({ success: false, state });
        }
      }
    }

    // Step 4: Wait for nodes
    const wait_step = get_next_step(state);
    if (wait_step?.name === 'wait_nodes') {
      if (options.skip_cluster || options.dry_run) {
        state = await skip_step('wait_nodes', state, 'Skipping node wait');
      } else {
        // TODO: Implement actual node waiting
        const result = await run_step('wait_nodes', state, options, async () => success(undefined));
        state = result.state;
        if (!result.success) {
          return success({ success: false, state });
        }
      }
    }

    // Step 5: Label nodes
    const label_step = get_next_step(state);
    if (label_step?.name === 'label_nodes') {
      if (options.skip_labels) {
        state = await skip_step('label_nodes', state, 'Node labeling skipped by user');
      } else if (options.dry_run) {
        state = await skip_step('label_nodes', state, 'Dry run mode - skipping labels');
      } else {
        // TODO: Implement actual node labeling
        const result = await run_step('label_nodes', state, options, async () =>
          success(undefined),
        );
        state = result.state;
        if (!result.success) {
          return success({ success: false, state });
        }
      }
    }

    // Check if all steps are completed
    const completed = all_steps_completed(state);
    state = { ...state, completed };

    return success({
      success: completed,
      state,
      kubeconfig_path,
    });
  }

  return {
    async run(config) {
      const state = create_initial_state(config.cluster);
      return execute(config, state);
    },

    async resume(config, initial_state) {
      if (initial_state.completed) {
        return failure(Errors.bootstrap_error('Bootstrap already completed'));
      }
      let state = initial_state;
      if (state.failed) {
        // Reset failed step to pending for retry
        const failed_step = state.steps.find((s) => s.status === 'failed');
        if (failed_step) {
          state = update_step_status(state, failed_step.name, 'pending');
        }
      }
      return execute(config, state);
    },
  };
}
