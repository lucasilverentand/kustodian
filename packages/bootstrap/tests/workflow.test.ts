import { describe, expect, it, vi } from 'bun:test';
import type { NodeListType } from '@kustodian/schema';

import { create_mock_provider } from '../src/provider.js';
import { create_initial_state, update_step_status } from '../src/types.js';
import { create_workflow } from '../src/workflow.js';

describe('Bootstrap Workflow', () => {
  const create_node_list = (): NodeListType => ({
    cluster: 'test-cluster',
    nodes: [
      { name: 'node-1', role: 'controller', address: '10.0.0.1' },
      { name: 'node-2', role: 'worker', address: '10.0.0.2' },
    ],
  });

  describe('create_workflow', () => {
    it('should create a workflow with run and resume methods', () => {
      // Arrange
      const provider = create_mock_provider();

      // Act
      const workflow = create_workflow({ provider });

      // Assert
      expect(workflow.run).toBeDefined();
      expect(workflow.resume).toBeDefined();
    });
  });

  describe('run', () => {
    it('should execute all steps successfully', async () => {
      // Arrange
      const provider = create_mock_provider();
      const workflow = create_workflow({ provider });
      const node_list = create_node_list();

      // Act
      const result = await workflow.run({
        cluster: 'test-cluster',
        node_list,
        options: {},
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.success).toBe(true);
        expect(result.value.state.completed).toBe(true);
        expect(result.value.state.steps.every((s) => s.status !== 'pending')).toBe(true);
      }
    });

    it('should skip validation when skip_validation is true', async () => {
      // Arrange
      const provider = create_mock_provider();
      const on_step_skip = vi.fn();
      const workflow = create_workflow({ provider, on_step_skip });
      const node_list = create_node_list();

      // Act
      await workflow.run({
        cluster: 'test-cluster',
        node_list,
        options: { skip_validation: true },
      });

      // Assert
      expect(on_step_skip).toHaveBeenCalledWith('validate', 'Validation skipped by user');
    });

    it('should skip cluster installation when skip_cluster is true', async () => {
      // Arrange
      const provider = create_mock_provider();
      const on_step_skip = vi.fn();
      const workflow = create_workflow({ provider, on_step_skip });
      const node_list = create_node_list();

      // Act
      await workflow.run({
        cluster: 'test-cluster',
        node_list,
        options: { skip_cluster: true },
      });

      // Assert
      expect(on_step_skip).toHaveBeenCalledWith('install', 'Cluster installation skipped by user');
    });

    it('should skip steps in dry run mode', async () => {
      // Arrange
      const provider = create_mock_provider();
      const on_step_skip = vi.fn();
      const workflow = create_workflow({ provider, on_step_skip });
      const node_list = create_node_list();

      // Act
      const result = await workflow.run({
        cluster: 'test-cluster',
        node_list,
        options: { dry_run: true },
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.state.completed).toBe(true);
        // Validate runs, but install and others are skipped
        const skipped_calls = on_step_skip.mock.calls;
        expect(skipped_calls.some((c) => c[0] === 'install')).toBe(true);
        expect(skipped_calls.some((c) => c[0] === 'kubeconfig')).toBe(true);
      }
    });

    it('should call lifecycle hooks', async () => {
      // Arrange
      const provider = create_mock_provider();
      const on_step_start = vi.fn();
      const on_step_complete = vi.fn();
      const workflow = create_workflow({
        provider,
        on_step_start,
        on_step_complete,
      });
      const node_list = create_node_list();

      // Act
      await workflow.run({
        cluster: 'test-cluster',
        node_list,
        options: {},
      });

      // Assert
      expect(on_step_start).toHaveBeenCalled();
      expect(on_step_complete).toHaveBeenCalled();
    });

    it('should stop on validation failure', async () => {
      // Arrange
      const provider = create_mock_provider();
      provider.validate = () => ({
        success: false as const,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid config' },
      });
      const on_step_fail = vi.fn();
      const workflow = create_workflow({ provider, on_step_fail });
      const node_list = create_node_list();

      // Act
      const result = await workflow.run({
        cluster: 'test-cluster',
        node_list,
        options: {},
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.success).toBe(false);
        expect(result.value.state.failed).toBe(true);
      }
    });

    it('should handle step failure', async () => {
      // Arrange
      const provider = create_mock_provider();
      provider.install = async () => ({
        success: false as const,
        error: { code: 'INSTALL_ERROR', message: 'Installation failed' },
      });
      const on_step_fail = vi.fn();
      const workflow = create_workflow({ provider, on_step_fail });
      const node_list = create_node_list();

      // Act
      const result = await workflow.run({
        cluster: 'test-cluster',
        node_list,
        options: {},
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.success).toBe(false);
        expect(result.value.state.failed).toBe(true);
        expect(on_step_fail).toHaveBeenCalledWith('install', 'Installation failed');
      }
    });
  });

  describe('resume', () => {
    it('should resume from failed step', async () => {
      // Arrange
      const provider = create_mock_provider();
      const workflow = create_workflow({ provider });
      const node_list = create_node_list();

      // Create a state where validate completed but install failed
      let state = create_initial_state('test-cluster');
      state = update_step_status(state, 'validate', 'completed');
      state = update_step_status(state, 'install', 'failed', 'Previous failure');

      // Act
      const result = await workflow.resume(
        { cluster: 'test-cluster', node_list, options: {} },
        state,
      );

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.success).toBe(true);
        expect(result.value.state.completed).toBe(true);
      }
    });

    it('should return error for already completed workflow', async () => {
      // Arrange
      const provider = create_mock_provider();
      const workflow = create_workflow({ provider });
      const node_list = create_node_list();

      let state = create_initial_state('test-cluster');
      state = { ...state, completed: true };

      // Act
      const result = await workflow.resume(
        { cluster: 'test-cluster', node_list, options: {} },
        state,
      );

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BOOTSTRAP_ERROR');
        expect(result.error.message).toContain('already completed');
      }
    });

    it('should skip already completed steps', async () => {
      // Arrange
      const provider = create_mock_provider();
      const on_step_start = vi.fn();
      const workflow = create_workflow({ provider, on_step_start });
      const node_list = create_node_list();

      // Create state with first two steps completed
      let state = create_initial_state('test-cluster');
      state = update_step_status(state, 'validate', 'completed');
      state = update_step_status(state, 'install', 'completed');

      // Act
      await workflow.resume({ cluster: 'test-cluster', node_list, options: {} }, state);

      // Assert
      // Should not restart validate or install
      const started_steps = on_step_start.mock.calls.map((c) => c[0]);
      expect(started_steps).not.toContain('validate');
      expect(started_steps).not.toContain('install');
      expect(started_steps).toContain('kubeconfig');
    });
  });
});
