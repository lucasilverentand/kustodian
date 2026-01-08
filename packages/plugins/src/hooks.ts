import type { KustodianErrorType, ResultType } from '@kustodian/core';
import { is_success, success } from '@kustodian/core';

import type { ClusterType, TemplateType } from '@kustodian/schema';
import type { GeneratedResourceType } from './types.js';

/**
 * Hook event types organized by category.
 */
export type GeneratorHookEventType =
  | 'generator:before'
  | 'generator:after_resolve'
  | 'generator:after_kustomization'
  | 'generator:after'
  | 'generator:before_write'
  | 'generator:after_write';

export type CLIHookEventType = 'cli:before_command' | 'cli:after_command' | 'cli:on_error';

export type BootstrapHookEventType =
  | 'bootstrap:before'
  | 'bootstrap:after'
  | 'bootstrap:before_step'
  | 'bootstrap:after_step'
  | 'bootstrap:on_error';

export type ValidationHookEventType =
  | 'validation:cluster'
  | 'validation:template'
  | 'validation:object';

export type OutputHookEventType = 'output:before_write' | 'output:after_write';

/**
 * Union of all hook event types.
 */
export type HookEventType =
  | GeneratorHookEventType
  | CLIHookEventType
  | BootstrapHookEventType
  | ValidationHookEventType
  | OutputHookEventType;

/**
 * Base hook context shared by all hooks.
 */
export interface BaseHookContextType {
  cluster?: ClusterType;
  template?: TemplateType;
}

/**
 * Generator hook context.
 */
export interface GeneratorHookContextType extends BaseHookContextType {
  cluster: ClusterType;
  templates?: unknown[];
  kustomization?: unknown;
  flux_kustomization?: unknown;
  result?: unknown;
  additional_resources?: GeneratedResourceType[];
}

/**
 * CLI hook context.
 */
export interface CLIHookContextType extends BaseHookContextType {
  command_name: string;
  command_path: string[];
  args: string[];
  options: Record<string, unknown>;
  error?: KustodianErrorType;
}

/**
 * Bootstrap hook context.
 */
export interface BootstrapHookContextType extends BaseHookContextType {
  cluster: ClusterType;
  config?: unknown;
  state?: unknown;
  step_name?: string;
  error?: KustodianErrorType;
}

/**
 * Validation hook context.
 */
export interface ValidationHookContextType extends BaseHookContextType {
  resource: unknown;
  resource_type: 'cluster' | 'template' | 'object';
  errors: string[];
  warnings: string[];
}

/**
 * Output hook context.
 */
export interface OutputHookContextType extends BaseHookContextType {
  file_path?: string;
  content?: string;
  files?: Array<{ path: string; content: string }>;
}

/**
 * Union of all hook context types.
 */
export type HookContextType =
  | GeneratorHookContextType
  | CLIHookContextType
  | BootstrapHookContextType
  | ValidationHookContextType
  | OutputHookContextType;

/**
 * Hook handler function type.
 */
export type HookHandlerType<C extends HookContextType = HookContextType> = (
  event: HookEventType,
  context: C,
) => Promise<ResultType<C, KustodianErrorType>>;

/**
 * Plugin hook contribution.
 */
export interface PluginHookContributionType {
  /** Event this hook listens to */
  event: HookEventType;
  /** Hook priority (lower runs first, default 100) */
  priority?: number;
  /** Hook handler */
  handler: HookHandlerType;
}

/**
 * Registered hook with metadata.
 */
interface RegisteredHookType {
  priority: number;
  handler: HookHandlerType;
}

/**
 * Hook dispatcher for running hooks with priority ordering.
 */
export interface HookDispatcherType {
  /**
   * Registers a hook contribution.
   */
  register(contribution: PluginHookContributionType): void;

  /**
   * Dispatches an event to all registered handlers.
   * Handlers run in priority order (lowest first).
   * Context is passed through the chain, allowing modifications.
   */
  dispatch<C extends HookContextType>(
    event: HookEventType,
    context: C,
  ): Promise<ResultType<C, KustodianErrorType>>;

  /**
   * Checks if any hooks are registered for an event.
   */
  has_hooks(event: HookEventType): boolean;

  /**
   * Lists all registered events.
   */
  list_events(): HookEventType[];
}

/**
 * Creates a new hook dispatcher.
 */
export function create_hook_dispatcher(): HookDispatcherType {
  const hooks = new Map<HookEventType, RegisteredHookType[]>();

  return {
    register(contribution) {
      const { event, priority = 100, handler } = contribution;

      if (!hooks.has(event)) {
        hooks.set(event, []);
      }

      const event_hooks = hooks.get(event);
      if (event_hooks) {
        event_hooks.push({ priority, handler });
        // Sort by priority (lower runs first)
        event_hooks.sort((a, b) => a.priority - b.priority);
      }
    },

    async dispatch<C extends HookContextType>(event: HookEventType, context: C) {
      const event_hooks = hooks.get(event) ?? [];
      let current_context = context;

      for (const { handler } of event_hooks) {
        const result = await handler(event, current_context);
        if (!is_success(result)) {
          return result;
        }
        current_context = result.value as C;
      }

      return success(current_context);
    },

    has_hooks(event) {
      const event_hooks = hooks.get(event);
      return event_hooks !== undefined && event_hooks.length > 0;
    },

    list_events() {
      return Array.from(hooks.keys());
    },
  };
}
