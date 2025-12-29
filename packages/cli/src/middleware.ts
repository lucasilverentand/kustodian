import type { ResultType } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';

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
