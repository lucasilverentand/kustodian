import { describe, expect, it } from 'bun:test';
import { success } from '@kustodian/core';

import { type GeneratorHookContextType, create_hook_dispatcher } from '../src/hooks.js';

describe('Hook Dispatcher', () => {
  const create_mock_context = (): GeneratorHookContextType => ({
    cluster: {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: { name: 'test-cluster' },
      spec: {
        domain: 'example.com',
        git: { owner: 'test', repository: 'test', branch: 'main', path: './' },
      },
    },
  });

  describe('register', () => {
    it('should register a hook', () => {
      const dispatcher = create_hook_dispatcher();

      dispatcher.register({
        event: 'generator:before',
        handler: async (_event, ctx) => success(ctx),
      });

      expect(dispatcher.has_hooks('generator:before')).toBe(true);
    });

    it('should not have hooks for unregistered events', () => {
      const dispatcher = create_hook_dispatcher();

      expect(dispatcher.has_hooks('generator:before')).toBe(false);
    });
  });

  describe('dispatch', () => {
    it('should dispatch event to registered handlers', async () => {
      const dispatcher = create_hook_dispatcher();
      const calls: string[] = [];

      dispatcher.register({
        event: 'generator:before',
        handler: async (_event, ctx) => {
          calls.push('handler1');
          return success(ctx);
        },
      });

      const context = create_mock_context();
      const result = await dispatcher.dispatch('generator:before', context);

      expect(result.success).toBe(true);
      expect(calls).toEqual(['handler1']);
    });

    it('should dispatch to multiple handlers in priority order', async () => {
      const dispatcher = create_hook_dispatcher();
      const calls: string[] = [];

      dispatcher.register({
        event: 'generator:before',
        priority: 200,
        handler: async (_event, ctx) => {
          calls.push('low-priority');
          return success(ctx);
        },
      });

      dispatcher.register({
        event: 'generator:before',
        priority: 50,
        handler: async (_event, ctx) => {
          calls.push('high-priority');
          return success(ctx);
        },
      });

      dispatcher.register({
        event: 'generator:before',
        priority: 100,
        handler: async (_event, ctx) => {
          calls.push('default-priority');
          return success(ctx);
        },
      });

      const context = create_mock_context();
      await dispatcher.dispatch('generator:before', context);

      expect(calls).toEqual(['high-priority', 'default-priority', 'low-priority']);
    });

    it('should pass context through handlers', async () => {
      const dispatcher = create_hook_dispatcher();

      dispatcher.register({
        event: 'generator:after',
        handler: async (_event, ctx) => {
          return success({
            ...ctx,
            additional_resources: [
              {
                api_version: 'v1',
                kind: 'ConfigMap',
                metadata: { name: 'added-by-hook' },
              },
            ],
          });
        },
      });

      const context = create_mock_context();
      const result = await dispatcher.dispatch('generator:after', context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.additional_resources).toHaveLength(1);
        expect(result.value.additional_resources?.[0]?.metadata.name).toBe('added-by-hook');
      }
    });

    it('should stop on first error', async () => {
      const dispatcher = create_hook_dispatcher();
      const calls: string[] = [];

      dispatcher.register({
        event: 'generator:before',
        priority: 1,
        handler: async (_event, ctx) => {
          calls.push('first');
          return success(ctx);
        },
      });

      dispatcher.register({
        event: 'generator:before',
        priority: 2,
        handler: async () => {
          calls.push('second');
          return { success: false, error: { code: 'TEST_ERROR', message: 'Test error' } };
        },
      });

      dispatcher.register({
        event: 'generator:before',
        priority: 3,
        handler: async (_event, ctx) => {
          calls.push('third');
          return success(ctx);
        },
      });

      const context = create_mock_context();
      const result = await dispatcher.dispatch('generator:before', context);

      expect(result.success).toBe(false);
      expect(calls).toEqual(['first', 'second']);
    });

    it('should return success for events with no handlers', async () => {
      const dispatcher = create_hook_dispatcher();
      const context = create_mock_context();

      const result = await dispatcher.dispatch('generator:before', context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(context);
      }
    });
  });

  describe('list_events', () => {
    it('should list all registered events', () => {
      const dispatcher = create_hook_dispatcher();

      dispatcher.register({
        event: 'generator:before',
        handler: async (_event, ctx) => success(ctx),
      });

      dispatcher.register({
        event: 'generator:after',
        handler: async (_event, ctx) => success(ctx),
      });

      dispatcher.register({
        event: 'cli:before_command',
        handler: async (_event, ctx) => success(ctx),
      });

      const events = dispatcher.list_events();

      expect(events).toHaveLength(3);
      expect(events).toContain('generator:before');
      expect(events).toContain('generator:after');
      expect(events).toContain('cli:before_command');
    });
  });
});
