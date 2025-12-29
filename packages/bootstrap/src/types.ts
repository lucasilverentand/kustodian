import type { NodeListType } from '@kustodian/nodes';

/**
 * Bootstrap options for cluster provisioning.
 */
export interface BootstrapOptionsType {
  skip_validation?: boolean;
  skip_cluster?: boolean;
  skip_kubeconfig?: boolean;
  skip_labels?: boolean;
  dry_run?: boolean;
  debug?: boolean;
  timeout?: number;
  node_ready_timeout?: number;
  verify_labels?: boolean;
  resume_from_state?: boolean;
  state_path?: string;
}

/**
 * Bootstrap step status.
 */
export type StepStatusType = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * A single step in the bootstrap workflow.
 */
export interface BootstrapStepType {
  name: string;
  status: StepStatusType;
  started_at?: Date;
  completed_at?: Date;
  error?: string;
}

/**
 * Bootstrap state for resumable operations.
 */
export interface BootstrapStateType {
  cluster: string;
  started_at: Date;
  updated_at: Date;
  steps: BootstrapStepType[];
  current_step?: string | undefined;
  completed: boolean;
  failed: boolean;
}

/**
 * Configuration for the bootstrap workflow.
 */
export interface BootstrapConfigType {
  cluster: string;
  node_list: NodeListType;
  provider: string;
  options: BootstrapOptionsType;
}

/**
 * Result of a bootstrap operation.
 */
export interface BootstrapResultType {
  success: boolean;
  state: BootstrapStateType;
  kubeconfig_path?: string | undefined;
}

/**
 * Creates an initial bootstrap state.
 */
export function create_initial_state(cluster: string): BootstrapStateType {
  const now = new Date();
  return {
    cluster,
    started_at: now,
    updated_at: now,
    steps: [
      { name: 'validate', status: 'pending' },
      { name: 'install', status: 'pending' },
      { name: 'kubeconfig', status: 'pending' },
      { name: 'wait_nodes', status: 'pending' },
      { name: 'label_nodes', status: 'pending' },
    ],
    completed: false,
    failed: false,
  };
}

/**
 * Updates a step in the bootstrap state.
 */
export function update_step_status(
  state: BootstrapStateType,
  step_name: string,
  status: StepStatusType,
  error?: string,
): BootstrapStateType {
  const now = new Date();
  const steps = state.steps.map((step) => {
    if (step.name !== step_name) {
      return step;
    }

    const updated: BootstrapStepType = {
      ...step,
      status,
    };

    if (status === 'running' && !step.started_at) {
      updated.started_at = now;
    }

    if (status === 'completed' || status === 'failed') {
      updated.completed_at = now;
    }

    if (error) {
      updated.error = error;
    }

    return updated;
  });

  return {
    ...state,
    steps,
    updated_at: now,
    current_step: status === 'running' ? step_name : state.current_step,
    completed: status === 'completed' && step_name === 'label_nodes',
    failed: status === 'failed',
  };
}

/**
 * Gets the next pending step.
 */
export function get_next_step(state: BootstrapStateType): BootstrapStepType | undefined {
  return state.steps.find((step) => step.status === 'pending');
}

/**
 * Checks if all steps are completed.
 */
export function all_steps_completed(state: BootstrapStateType): boolean {
  return state.steps.every((step) => step.status === 'completed' || step.status === 'skipped');
}

/**
 * Gets completed step names.
 */
export function get_completed_steps(state: BootstrapStateType): string[] {
  return state.steps.filter((step) => step.status === 'completed').map((step) => step.name);
}
