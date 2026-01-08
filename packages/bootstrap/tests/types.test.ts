import { describe, expect, it } from 'bun:test';

import {
  all_steps_completed,
  create_initial_state,
  get_completed_steps,
  get_next_step,
  update_step_status,
} from '../src/types.js';

describe('Bootstrap Types', () => {
  describe('create_initial_state', () => {
    it('should create state with all pending steps', () => {
      // Act
      const state = create_initial_state('production');

      // Assert
      expect(state.cluster).toBe('production');
      expect(state.steps).toHaveLength(5);
      expect(state.steps.every((s) => s.status === 'pending')).toBe(true);
      expect(state.completed).toBe(false);
      expect(state.failed).toBe(false);
    });

    it('should include expected step names', () => {
      // Act
      const state = create_initial_state('test');

      // Assert
      const names = state.steps.map((s) => s.name);
      expect(names).toEqual(['validate', 'install', 'kubeconfig', 'wait_nodes', 'label_nodes']);
    });
  });

  describe('update_step_status', () => {
    it('should update step to running', () => {
      // Arrange
      const state = create_initial_state('test');

      // Act
      const updated = update_step_status(state, 'validate', 'running');

      // Assert
      const step = updated.steps.find((s) => s.name === 'validate');
      expect(step?.status).toBe('running');
      expect(step?.started_at).toBeDefined();
      expect(updated.current_step).toBe('validate');
    });

    it('should update step to completed', () => {
      // Arrange
      const state = update_step_status(create_initial_state('test'), 'validate', 'running');

      // Act
      const updated = update_step_status(state, 'validate', 'completed');

      // Assert
      const step = updated.steps.find((s) => s.name === 'validate');
      expect(step?.status).toBe('completed');
      expect(step?.completed_at).toBeDefined();
    });

    it('should update step to failed with error', () => {
      // Arrange
      const state = create_initial_state('test');

      // Act
      const updated = update_step_status(state, 'install', 'failed', 'Connection refused');

      // Assert
      const step = updated.steps.find((s) => s.name === 'install');
      expect(step?.status).toBe('failed');
      expect(step?.error).toBe('Connection refused');
      expect(updated.failed).toBe(true);
    });

    it('should mark completed when last step completes', () => {
      // Arrange
      let state = create_initial_state('test');
      state = update_step_status(state, 'validate', 'completed');
      state = update_step_status(state, 'install', 'completed');
      state = update_step_status(state, 'kubeconfig', 'completed');
      state = update_step_status(state, 'wait_nodes', 'completed');

      // Act
      state = update_step_status(state, 'label_nodes', 'completed');

      // Assert
      expect(state.completed).toBe(true);
    });
  });

  describe('get_next_step', () => {
    it('should return first pending step', () => {
      // Arrange
      const state = create_initial_state('test');

      // Act
      const next = get_next_step(state);

      // Assert
      expect(next?.name).toBe('validate');
    });

    it('should skip completed steps', () => {
      // Arrange
      let state = create_initial_state('test');
      state = update_step_status(state, 'validate', 'completed');

      // Act
      const next = get_next_step(state);

      // Assert
      expect(next?.name).toBe('install');
    });

    it('should return undefined when all steps are done', () => {
      // Arrange
      let state = create_initial_state('test');
      for (const step of state.steps) {
        state = update_step_status(state, step.name, 'completed');
      }

      // Act
      const next = get_next_step(state);

      // Assert
      expect(next).toBeUndefined();
    });
  });

  describe('all_steps_completed', () => {
    it('should return false when steps are pending', () => {
      // Arrange
      const state = create_initial_state('test');

      // Act & Assert
      expect(all_steps_completed(state)).toBe(false);
    });

    it('should return true when all completed', () => {
      // Arrange
      let state = create_initial_state('test');
      for (const step of state.steps) {
        state = update_step_status(state, step.name, 'completed');
      }

      // Act & Assert
      expect(all_steps_completed(state)).toBe(true);
    });

    it('should count skipped as completed', () => {
      // Arrange
      let state = create_initial_state('test');
      state = update_step_status(state, 'validate', 'completed');
      state = update_step_status(state, 'install', 'skipped');
      state = update_step_status(state, 'kubeconfig', 'skipped');
      state = update_step_status(state, 'wait_nodes', 'skipped');
      state = update_step_status(state, 'label_nodes', 'completed');

      // Act & Assert
      expect(all_steps_completed(state)).toBe(true);
    });
  });

  describe('get_completed_steps', () => {
    it('should return names of completed steps', () => {
      // Arrange
      let state = create_initial_state('test');
      state = update_step_status(state, 'validate', 'completed');
      state = update_step_status(state, 'install', 'completed');

      // Act
      const completed = get_completed_steps(state);

      // Assert
      expect(completed).toEqual(['validate', 'install']);
    });

    it('should not include skipped steps', () => {
      // Arrange
      let state = create_initial_state('test');
      state = update_step_status(state, 'validate', 'completed');
      state = update_step_status(state, 'install', 'skipped');

      // Act
      const completed = get_completed_steps(state);

      // Assert
      expect(completed).toEqual(['validate']);
    });
  });
});
