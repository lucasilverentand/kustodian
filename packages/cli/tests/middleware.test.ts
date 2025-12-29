import { describe, expect, it } from 'vitest';

import { success } from '@kustodian/core';

import { type MiddlewareType, create_context, create_pipeline } from '../src/middleware.js';

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
      expect(ctx.options.verbose).toBe(true);
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
          ctx.data.first = 'value1';
          return next();
        },
        async (ctx, next) => {
          ctx.data.second = 'value2';
          return next();
        },
      ];

      const pipeline = create_pipeline(middleware);
      const ctx = create_context();

      // Act
      await pipeline(ctx, async () => success(undefined));

      // Assert
      expect(ctx.data.first).toBe('value1');
      expect(ctx.data.second).toBe('value2');
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
      if (!result.success) {
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
});
