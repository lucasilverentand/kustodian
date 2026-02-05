import { describe, expect, it } from 'bun:test';

import { failure, is_success, success } from '../../src/core/index.js';

import {
  type MiddlewareType,
  create_context,
  create_default_middleware,
  create_logger,
  create_pipeline,
  create_progress,
  dry_run_middleware,
  error_handling_middleware,
  logging_middleware,
  progress_middleware,
  timing_middleware,
} from '../../src/cli/middleware.js';

describe('Middleware', () => {
  describe('create_context', () => {
    it('should create context with defaults', () => {
      // Act
      const ctx = create_context();

      // Assert
      expect(ctx.args).toEqual([]);
      expect(ctx.options).toEqual({});
      expect(ctx.data).toEqual({});
    });

    it('should create context with args and options', () => {
      // Act
      const ctx = create_context(['arg1', 'arg2'], { verbose: true });

      // Assert
      expect(ctx.args).toEqual(['arg1', 'arg2']);
      expect(ctx.options['verbose']).toBe(true);
    });
  });

  describe('create_pipeline', () => {
    it('should execute middleware in order', async () => {
      // Arrange
      const order: number[] = [];
      const middleware: MiddlewareType[] = [
        async (_ctx, next) => {
          order.push(1);
          const result = await next();
          order.push(4);
          return result;
        },
        async (_ctx, next) => {
          order.push(2);
          const result = await next();
          order.push(3);
          return result;
        },
      ];

      const pipeline = create_pipeline(middleware);
      const ctx = create_context();

      // Act
      await pipeline(ctx, async () => success(undefined));

      // Assert
      expect(order).toEqual([1, 2, 3, 4]);
    });

    it('should pass context through middleware', async () => {
      // Arrange
      const middleware: MiddlewareType[] = [
        async (ctx, next) => {
          ctx.data['first'] = 'value1';
          return next();
        },
        async (ctx, next) => {
          ctx.data['second'] = 'value2';
          return next();
        },
      ];

      const pipeline = create_pipeline(middleware);
      const ctx = create_context();

      // Act
      await pipeline(ctx, async () => success(undefined));

      // Assert
      expect(ctx.data['first']).toBe('value1');
      expect(ctx.data['second']).toBe('value2');
    });

    it('should short-circuit if middleware does not call next', async () => {
      // Arrange
      const second_called = { value: false };
      const middleware: MiddlewareType[] = [
        async () => success(undefined),
        async (_ctx, next) => {
          second_called.value = true;
          return next();
        },
      ];

      const pipeline = create_pipeline(middleware);
      const ctx = create_context();

      // Act
      await pipeline(ctx, async () => success(undefined));

      // Assert
      expect(second_called.value).toBe(false);
    });

    it('should handle empty middleware array', async () => {
      // Arrange
      const pipeline = create_pipeline([]);
      const ctx = create_context();
      const final_called = { value: false };

      // Act
      await pipeline(ctx, async () => {
        final_called.value = true;
        return success(undefined);
      });

      // Assert
      expect(final_called.value).toBe(true);
    });

    it('should throw if next is called multiple times', async () => {
      // Arrange
      const middleware: MiddlewareType[] = [
        async (_ctx, next) => {
          await next();
          await next();
          return success(undefined);
        },
      ];

      const pipeline = create_pipeline(middleware);
      const ctx = create_context();

      // Act & Assert
      await expect(pipeline(ctx, async () => success(undefined))).rejects.toThrow(
        'next() called multiple times',
      );
    });

    it('should propagate errors from middleware', async () => {
      // Arrange
      const middleware: MiddlewareType[] = [
        async () => {
          return {
            success: false as const,
            error: { code: 'TEST_ERROR', message: 'Test error' },
          };
        },
      ];

      const pipeline = create_pipeline(middleware);
      const ctx = create_context();

      // Act
      const result = await pipeline(ctx, async () => success(undefined));

      // Assert
      expect(result.success).toBe(false);
      if (!is_success(result)) {
        expect(result.error.code).toBe('TEST_ERROR');
      }
    });

    it('should handle async operations in middleware', async () => {
      // Arrange
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const order: string[] = [];

      const middleware: MiddlewareType[] = [
        async (_ctx, next) => {
          order.push('start-1');
          await delay(10);
          order.push('end-1');
          return next();
        },
        async (_ctx, next) => {
          order.push('start-2');
          await delay(5);
          order.push('end-2');
          return next();
        },
      ];

      const pipeline = create_pipeline(middleware);
      const ctx = create_context();

      // Act
      await pipeline(ctx, async () => success(undefined));

      // Assert
      expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
    });
  });

  describe('create_logger', () => {
    it('should create logger with default normal level', () => {
      const logger = create_logger();
      expect(logger.level).toBe('normal');
    });

    it('should create logger with specified level', () => {
      const logger = create_logger('debug');
      expect(logger.level).toBe('debug');
    });

    it('should create silent logger', () => {
      const logger = create_logger('silent');
      expect(logger.level).toBe('silent');
    });
  });

  describe('create_progress', () => {
    it('should create progress tracker', () => {
      const progress = create_progress(true);
      expect(progress.start).toBeDefined();
      expect(progress.update).toBeDefined();
      expect(progress.succeed).toBeDefined();
      expect(progress.fail).toBeDefined();
      expect(progress.stop).toBeDefined();
    });

    it('should create no-op progress when disabled', () => {
      const progress = create_progress(false);
      // Should not throw
      progress.start('test');
      progress.update('test');
      progress.succeed('test');
      progress.fail('test');
      progress.stop();
    });
  });

  describe('dry_run_middleware', () => {
    it('should set dry_run flag when option is true', async () => {
      const middleware = dry_run_middleware();
      const ctx = create_context([], { 'dry-run': true });

      await middleware(ctx, async () => success(undefined));

      expect(ctx.dry_run).toBe(true);
    });

    it('should not set dry_run flag when option is false', async () => {
      const middleware = dry_run_middleware();
      const ctx = create_context([], { 'dry-run': false });

      await middleware(ctx, async () => success(undefined));

      expect(ctx.dry_run).toBe(false);
    });

    it('should not set dry_run flag when option is not present', async () => {
      const middleware = dry_run_middleware();
      const ctx = create_context([], {});

      await middleware(ctx, async () => success(undefined));

      expect(ctx.dry_run).toBe(false);
    });
  });

  describe('logging_middleware', () => {
    it('should set logger on context', async () => {
      const middleware = logging_middleware();
      const ctx = create_context();

      await middleware(ctx, async () => success(undefined));

      expect(ctx.logger).toBeDefined();
      expect(ctx.logger?.level).toBe('normal');
    });

    it('should set debug level when debug option is true', async () => {
      const middleware = logging_middleware();
      const ctx = create_context([], { debug: true });

      await middleware(ctx, async () => success(undefined));

      expect(ctx.logger?.level).toBe('debug');
    });

    it('should set verbose level when verbose option is true', async () => {
      const middleware = logging_middleware();
      const ctx = create_context([], { verbose: true });

      await middleware(ctx, async () => success(undefined));

      expect(ctx.logger?.level).toBe('verbose');
    });

    it('should set silent level when silent option is true', async () => {
      const middleware = logging_middleware();
      const ctx = create_context([], { silent: true });

      await middleware(ctx, async () => success(undefined));

      expect(ctx.logger?.level).toBe('silent');
    });
  });

  describe('progress_middleware', () => {
    it('should set progress tracker on context', async () => {
      const middleware = progress_middleware();
      const ctx = create_context();

      await middleware(ctx, async () => success(undefined));

      expect(ctx.progress).toBeDefined();
    });

    it('should disable progress when no-progress option is true', async () => {
      const middleware = progress_middleware();
      const ctx = create_context([], { 'no-progress': true });

      await middleware(ctx, async () => success(undefined));

      // Progress should still be defined but as no-op
      expect(ctx.progress).toBeDefined();
    });
  });

  describe('timing_middleware', () => {
    it('should set timing data on context', async () => {
      const middleware = timing_middleware();
      const ctx = create_context();

      await middleware(ctx, async () => success(undefined));

      expect(ctx.timing).toBeDefined();
      expect(ctx.timing?.start_time).toBeGreaterThan(0);
      expect(ctx.timing?.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error_handling_middleware', () => {
    it('should pass through successful results', async () => {
      const middleware = error_handling_middleware();
      const ctx = create_context();

      const result = await middleware(ctx, async () => success(undefined));

      expect(result.success).toBe(true);
    });

    it('should pass through failure results', async () => {
      const middleware = error_handling_middleware();
      const ctx = create_context();

      const result = await middleware(ctx, async () =>
        failure({ code: 'TEST_ERROR', message: 'Test error' }),
      );

      expect(result.success).toBe(false);
    });

    it('should catch thrown errors and return failure', async () => {
      const middleware = error_handling_middleware();
      const ctx = create_context();

      const result = await middleware(ctx, async () => {
        throw new Error('Unexpected error');
      });

      expect(result.success).toBe(false);
      if (!is_success(result)) {
        expect(result.error.code).toBe('UNEXPECTED_ERROR');
        expect(result.error.message).toBe('Unexpected error');
      }
    });
  });

  describe('create_default_middleware', () => {
    it('should return array of middleware', () => {
      const middleware = create_default_middleware();

      expect(Array.isArray(middleware)).toBe(true);
      expect(middleware.length).toBe(5);
    });

    it('should create functional pipeline', async () => {
      const middleware = create_default_middleware();
      const pipeline = create_pipeline(middleware);
      const ctx = create_context();

      const result = await pipeline(ctx, async () => success(undefined));

      expect(result.success).toBe(true);
      expect(ctx.logger).toBeDefined();
      expect(ctx.progress).toBeDefined();
      expect(ctx.timing).toBeDefined();
    });
  });
});
