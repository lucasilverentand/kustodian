import type { KustodianErrorType } from '@kustodian/core';
import { type ResultType, failure } from '@kustodian/core';
import ora, { type Ora } from 'ora';

/**
 * Log levels for configurable verbosity.
 */
export type LogLevelType = 'silent' | 'normal' | 'verbose' | 'debug';

/**
 * Logger interface for middleware.
 */
export interface LoggerType {
  level: LogLevelType;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Progress tracker interface.
 */
export interface ProgressType {
  start(text: string): void;
  update(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  stop(): void;
}

/**
 * Context passed through the middleware pipeline.
 */
export interface ContextType {
  /**
   * Command arguments.
   */
  args: string[];

  /**
   * Parsed options.
   */
  options: Record<string, unknown>;

  /**
   * Custom data added by middleware.
   */
  data: Record<string, unknown>;

  /**
   * Whether running in dry-run mode.
   */
  dry_run?: boolean;

  /**
   * Logger instance (added by logging middleware).
   */
  logger?: LoggerType;

  /**
   * Progress tracker (added by progress middleware).
   */
  progress?: ProgressType;

  /**
   * Timing data (added by timing middleware).
   */
  timing?: {
    start_time: number;
    duration_ms?: number;
  };
}

/**
 * Next function in the middleware chain.
 */
export type NextType = () => Promise<ResultType<void, KustodianErrorType>>;

/**
 * Middleware function type.
 */
export type MiddlewareType = (
  ctx: ContextType,
  next: NextType,
) => Promise<ResultType<void, KustodianErrorType>>;

/**
 * Creates a middleware pipeline.
 */
export function create_pipeline(middleware: MiddlewareType[]): MiddlewareType {
  return async (ctx, next) => {
    let index = -1;

    const dispatch = async (i: number): Promise<ResultType<void, KustodianErrorType>> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      const fn = i < middleware.length ? middleware[i] : next;
      if (!fn) {
        return { success: true, value: undefined };
      }

      return fn(ctx, () => dispatch(i + 1));
    };

    return dispatch(0);
  };
}

/**
 * Creates a new empty context.
 */
export function create_context(
  args: string[] = [],
  options: Record<string, unknown> = {},
): ContextType {
  return {
    args,
    options,
    data: {},
  };
}

// ============================================================================
// Logger Implementation
// ============================================================================

/**
 * Creates a logger with the specified verbosity level.
 */
export function create_logger(level: LogLevelType = 'normal'): LoggerType {
  const should_log = (target_level: LogLevelType): boolean => {
    const levels: LogLevelType[] = ['silent', 'normal', 'verbose', 'debug'];
    return levels.indexOf(level) >= levels.indexOf(target_level);
  };

  return {
    level,
    debug(message: string, ...args: unknown[]) {
      if (should_log('debug')) {
        console.log(`[DEBUG] ${message}`, ...args);
      }
    },
    info(message: string, ...args: unknown[]) {
      if (should_log('normal')) {
        console.log(message, ...args);
      }
    },
    warn(message: string, ...args: unknown[]) {
      if (should_log('normal')) {
        console.warn(`⚠ ${message}`, ...args);
      }
    },
    error(message: string, ...args: unknown[]) {
      // Always log errors except in silent mode
      if (level !== 'silent') {
        console.error(`✗ ${message}`, ...args);
      }
    },
  };
}

// ============================================================================
// Progress Tracker Implementation
// ============================================================================

/**
 * Creates a progress tracker using ora spinner.
 */
export function create_progress(enabled = true): ProgressType {
  let spinner: Ora | null = null;

  if (!enabled) {
    // No-op implementation when progress is disabled
    return {
      start: () => {},
      update: () => {},
      succeed: () => {},
      fail: () => {},
      stop: () => {},
    };
  }

  return {
    start(text: string) {
      spinner = ora({ text, color: 'cyan' }).start();
    },
    update(text: string) {
      if (spinner) {
        spinner.text = text;
      } else {
        spinner = ora({ text, color: 'cyan' }).start();
      }
    },
    succeed(text?: string) {
      if (spinner) {
        spinner.succeed(text);
        spinner = null;
      }
    },
    fail(text?: string) {
      if (spinner) {
        spinner.fail(text);
        spinner = null;
      }
    },
    stop() {
      if (spinner) {
        spinner.stop();
        spinner = null;
      }
    },
  };
}

// ============================================================================
// Built-in Middleware
// ============================================================================

/**
 * Dry-run middleware - sets dry_run flag on context based on --dry-run option.
 */
export function dry_run_middleware(): MiddlewareType {
  return async (ctx, next) => {
    ctx.dry_run = ctx.options['dry-run'] === true;

    if (ctx.dry_run && ctx.logger) {
      ctx.logger.info('[DRY RUN] Preview mode - no changes will be made');
    }

    const result = await next();

    if (ctx.dry_run && ctx.logger) {
      ctx.logger.info('[DRY RUN] No changes were made');
    }

    return result;
  };
}

/**
 * Logging middleware - adds logger to context based on verbosity options.
 */
export function logging_middleware(): MiddlewareType {
  return async (ctx, next) => {
    let level: LogLevelType = 'normal';

    if (ctx.options['silent'] === true) {
      level = 'silent';
    } else if (ctx.options['debug'] === true) {
      level = 'debug';
    } else if (ctx.options['verbose'] === true) {
      level = 'verbose';
    }

    ctx.logger = create_logger(level);
    ctx.logger.debug('Starting command execution');
    ctx.logger.debug('Options:', ctx.options);

    const result = await next();

    ctx.logger.debug('Command execution completed');
    return result;
  };
}

/**
 * Progress middleware - adds progress tracker to context.
 */
export function progress_middleware(): MiddlewareType {
  return async (ctx, next) => {
    const enabled = ctx.options['no-progress'] !== true;
    ctx.progress = create_progress(enabled);

    try {
      return await next();
    } finally {
      // Ensure spinner is stopped even if there's an error
      ctx.progress.stop();
    }
  };
}

/**
 * Timing middleware - measures command execution duration.
 */
export function timing_middleware(): MiddlewareType {
  return async (ctx, next) => {
    const start_time = Date.now();
    ctx.timing = { start_time };

    const result = await next();

    const duration_ms = Date.now() - start_time;
    ctx.timing.duration_ms = duration_ms;

    if (ctx.logger && ctx.logger.level !== 'silent') {
      const seconds = (duration_ms / 1000).toFixed(1);
      ctx.logger.info(`Completed in ${seconds}s`);
    }

    return result;
  };
}

/**
 * Error handling middleware - provides consistent error handling and recovery suggestions.
 */
export function error_handling_middleware(): MiddlewareType {
  return async (ctx, next) => {
    try {
      const result = await next();

      if (!result.success) {
        const error = result.error;

        if (ctx.logger) {
          ctx.logger.error(`Error: ${error.message}`);

          if (ctx.logger.level === 'debug' || ctx.logger.level === 'verbose') {
            ctx.logger.debug(`Error code: ${error.code}`);
          }
        } else {
          console.error(`Error: ${error.message}`);
        }

        // Provide recovery suggestions based on error code
        const suggestions = get_error_suggestions(error.code);
        if (suggestions.length > 0 && ctx.logger) {
          ctx.logger.info('Suggestions:');
          for (const suggestion of suggestions) {
            ctx.logger.info(`  - ${suggestion}`);
          }
        }
      }

      return result;
    } catch (error) {
      const err = error as Error;

      if (ctx.logger) {
        ctx.logger.error(`Unexpected error: ${err.message}`);
        if (ctx.logger.level === 'debug') {
          ctx.logger.debug('Stack trace:', err.stack);
        }
      } else {
        console.error(`Unexpected error: ${err.message}`);
      }

      return failure({
        code: 'UNEXPECTED_ERROR',
        message: err.message,
      });
    }
  };
}

/**
 * Returns recovery suggestions for known error codes.
 */
function get_error_suggestions(code: string): string[] {
  const suggestions: Record<string, string[]> = {
    COMMAND_NOT_FOUND: ['Run "kustodian --help" to see available commands'],
    NOT_FOUND: ['Check that the resource exists', 'Verify the name is spelled correctly'],
    MISSING_DEPENDENCY: [
      'Install required dependencies',
      'Check that kubectl and flux CLIs are installed',
    ],
    DEPENDENCY_VALIDATION_ERROR: [
      'Check for circular dependencies between templates',
      'Verify all depends_on references are valid',
    ],
    FILE_NOT_FOUND: ['Verify the file path is correct', 'Check file permissions'],
    FILE_WRITE_ERROR: ['Check directory permissions', 'Ensure disk has available space'],
  };

  return suggestions[code] ?? [];
}

/**
 * Creates the default middleware stack for CLI operations.
 *
 * Middleware order (outermost to innermost):
 * 1. timing - measures total execution time
 * 2. logging - configures logger
 * 3. error_handling - catches and formats errors
 * 4. dry_run - sets dry-run mode
 * 5. progress - provides spinner for operations
 */
export function create_default_middleware(): MiddlewareType[] {
  return [
    timing_middleware(),
    logging_middleware(),
    error_handling_middleware(),
    dry_run_middleware(),
    progress_middleware(),
  ];
}
