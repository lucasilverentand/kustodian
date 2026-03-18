import { describe, expect, it } from 'bun:test';

import { rollback_command } from '../../../src/cli/commands/rollback.js';

describe('rollback command', () => {
  describe('command definition', () => {
    it('should have correct name and description', () => {
      expect(rollback_command.name).toBe('rollback');
      expect(rollback_command.description).toContain('Roll back');
    });

    it('should have required cluster option', () => {
      const cluster_opt = rollback_command.options?.find((o) => o.name === 'cluster');
      expect(cluster_opt).toBeDefined();
      expect(cluster_opt?.required).toBe(true);
      expect(cluster_opt?.short).toBe('c');
      expect(cluster_opt?.type).toBe('string');
    });

    it('should have revision option', () => {
      const revision_opt = rollback_command.options?.find((o) => o.name === 'revision');
      expect(revision_opt).toBeDefined();
      expect(revision_opt?.short).toBe('r');
      expect(revision_opt?.type).toBe('string');
    });

    it('should have suspend option', () => {
      const suspend_opt = rollback_command.options?.find((o) => o.name === 'suspend');
      expect(suspend_opt).toBeDefined();
      expect(suspend_opt?.type).toBe('boolean');
      expect(suspend_opt?.default_value).toBe(false);
    });

    it('should have resume option', () => {
      const resume_opt = rollback_command.options?.find((o) => o.name === 'resume');
      expect(resume_opt).toBeDefined();
      expect(resume_opt?.type).toBe('boolean');
      expect(resume_opt?.default_value).toBe(false);
    });

    it('should have dry-run option', () => {
      const dry_run_opt = rollback_command.options?.find((o) => o.name === 'dry-run');
      expect(dry_run_opt).toBeDefined();
      expect(dry_run_opt?.short).toBe('d');
      expect(dry_run_opt?.type).toBe('boolean');
      expect(dry_run_opt?.default_value).toBe(false);
    });

    it('should have project option', () => {
      const project_opt = rollback_command.options?.find((o) => o.name === 'project');
      expect(project_opt).toBeDefined();
      expect(project_opt?.short).toBe('p');
      expect(project_opt?.type).toBe('string');
    });

    it('should have a handler', () => {
      expect(rollback_command.handler).toBeDefined();
      expect(typeof rollback_command.handler).toBe('function');
    });
  });

  describe('handler validation', () => {
    it('should fail when no cluster is specified', async () => {
      const ctx = {
        args: [],
        options: { suspend: true } as Record<string, unknown>,
        data: {},
      };

      const result = await rollback_command.handler?.(ctx, {} as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ARGS');
        expect(result.error.message).toContain('--cluster');
      }
    });

    it('should fail when no mode is specified', async () => {
      const ctx = {
        args: [],
        options: {
          cluster: 'prod',
          suspend: false,
          resume: false,
        } as Record<string, unknown>,
        data: {},
      };

      const result = await rollback_command.handler?.(ctx, {} as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ARGS');
        expect(result.error.message).toContain('--revision');
      }
    });

    it('should fail when multiple modes are specified', async () => {
      const ctx = {
        args: [],
        options: {
          cluster: 'prod',
          suspend: true,
          resume: true,
          revision: undefined,
        } as Record<string, unknown>,
        data: {},
      };

      const result = await rollback_command.handler?.(ctx, {} as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ARGS');
        expect(result.error.message).toContain('mutually exclusive');
      }
    });

    it('should fail when suspend and revision are both specified', async () => {
      const ctx = {
        args: [],
        options: {
          cluster: 'prod',
          suspend: true,
          resume: false,
          revision: 'abc123',
        } as Record<string, unknown>,
        data: {},
      };

      const result = await rollback_command.handler?.(ctx, {} as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ARGS');
      }
    });
  });
});
