/**
 * A discriminated union type representing either success or failure.
 * This is the core Result type used throughout Kustodian for error handling.
 */
export type ResultType<T, E> = SuccessType<T> | FailureType<E>;

export interface SuccessType<T> {
  readonly success: true;
  readonly value: T;
}

export interface FailureType<E> {
  readonly success: false;
  readonly error: E;
}

/**
 * Creates a successful Result.
 */
export function success<T>(value: T): SuccessType<T> {
  return { success: true, value };
}

/**
 * Creates a failed Result.
 */
export function failure<E>(error: E): FailureType<E> {
  return { success: false, error };
}

/**
 * Type guard to check if a Result is successful.
 */
export function is_success<T, E>(result: ResultType<T, E>): result is SuccessType<T> {
  return result.success;
}

/**
 * Type guard to check if a Result is a failure.
 */
export function is_failure<T, E>(result: ResultType<T, E>): result is FailureType<E> {
  return !result.success;
}

/**
 * Maps the success value of a Result using the provided function.
 * If the Result is a failure, returns the failure unchanged.
 */
export function map_result<T, U, E>(
  result: ResultType<T, E>,
  fn: (value: T) => U,
): ResultType<U, E> {
  if (is_success(result)) {
    return success(fn(result.value));
  }
  return result;
}

/**
 * Maps the error of a Result using the provided function.
 * If the Result is a success, returns the success unchanged.
 */
export function map_error<T, E, F>(
  result: ResultType<T, E>,
  fn: (error: E) => F,
): ResultType<T, F> {
  if (is_failure(result)) {
    return failure(fn(result.error));
  }
  return result;
}

/**
 * Chains Result operations. If the Result is successful, applies the function
 * which returns a new Result. If the Result is a failure, returns it unchanged.
 */
export function flat_map<T, U, E>(
  result: ResultType<T, E>,
  fn: (value: T) => ResultType<U, E>,
): ResultType<U, E> {
  if (is_success(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Unwraps a Result, returning the value if successful,
 * or throwing the error if failed.
 */
export function unwrap<T, E>(result: ResultType<T, E>): T {
  if (is_success(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwraps a Result, returning the value if successful,
 * or a default value if failed.
 */
export function unwrap_or<T, E>(result: ResultType<T, E>, default_value: T): T {
  if (is_success(result)) {
    return result.value;
  }
  return default_value;
}

/**
 * Unwraps a Result, returning the value if successful,
 * or calling the provided function with the error to get a default value.
 */
export function unwrap_or_else<T, E>(result: ResultType<T, E>, fn: (error: E) => T): T {
  if (is_success(result)) {
    return result.value;
  }
  return fn(result.error);
}

/**
 * Converts a Promise to a Result.
 * Catches any errors and wraps them in a failure Result.
 */
export async function from_promise<T, E = Error>(
  promise: Promise<T>,
  map_error_fn?: (error: unknown) => E,
): Promise<ResultType<T, E>> {
  try {
    const value = await promise;
    return success(value);
  } catch (error) {
    if (map_error_fn) {
      return failure(map_error_fn(error));
    }
    return failure(error as E);
  }
}

/**
 * Converts a function that may throw into one that returns a Result.
 */
export function from_try<T, E = Error>(
  fn: () => T,
  map_error_fn?: (error: unknown) => E,
): ResultType<T, E> {
  try {
    return success(fn());
  } catch (error) {
    if (map_error_fn) {
      return failure(map_error_fn(error));
    }
    return failure(error as E);
  }
}

/**
 * Combines multiple Results into a single Result containing an array of values.
 * If any Result is a failure, returns the first failure.
 */
export function combine<T, E>(results: ResultType<T, E>[]): ResultType<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (is_failure(result)) {
      return result;
    }
    values.push(result.value);
  }
  return success(values);
}

/**
 * Combines multiple Results into a single Result, collecting all errors.
 * If all Results are successful, returns an array of values.
 * If any Results fail, returns an array of all errors.
 */
export function combine_all<T, E>(results: ResultType<T, E>[]): ResultType<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];

  for (const result of results) {
    if (is_success(result)) {
      values.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return failure(errors);
  }

  return success(values);
}
