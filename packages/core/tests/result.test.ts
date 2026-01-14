import { describe, expect, it } from 'bun:test';

import {
  type ResultType,
  combine,
  combine_all,
  failure,
  flat_map,
  from_promise,
  from_try,
  is_failure,
  is_success,
  map_error,
  map_result,
  success,
  unwrap,
  unwrap_or,
  unwrap_or_else,
} from '../src/result.js';

describe('Result', () => {
  describe('success', () => {
    it('should create a success result with the given value', () => {
      // Arrange
      const value = 42;

      // Act
      const result = success(value);

      // Assert
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should work with complex values', () => {
      // Arrange
      const value = { name: 'test', items: [1, 2, 3] };

      // Act
      const result = success(value);

      // Assert
      expect(result.success).toBe(true);
      expect(result.value).toEqual(value);
    });
  });

  describe('failure', () => {
    it('should create a failure result with the given error', () => {
      // Arrange
      const error = new Error('Something went wrong');

      // Act
      const result = failure(error);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });

    it('should work with string errors', () => {
      // Arrange
      const error = 'Invalid input';

      // Act
      const result = failure(error);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });
  });

  describe('is_success', () => {
    it('should return true for success results', () => {
      // Arrange
      const result = success('value');

      // Act & Assert
      expect(is_success(result)).toBe(true);
    });

    it('should return false for failure results', () => {
      // Arrange
      const result = failure('error');

      // Act & Assert
      expect(is_success(result)).toBe(false);
    });
  });

  describe('is_failure', () => {
    it('should return false for success results', () => {
      // Arrange
      const result = success('value');

      // Act & Assert
      expect(is_failure(result)).toBe(false);
    });

    it('should return true for failure results', () => {
      // Arrange
      const result = failure('error');

      // Act & Assert
      expect(is_failure(result)).toBe(true);
    });
  });

  describe('map_result', () => {
    it('should transform success values', () => {
      // Arrange
      const result = success(5);

      // Act
      const mapped = map_result(result, (x) => x * 2);

      // Assert
      expect(is_success(mapped)).toBe(true);
      if (is_success(mapped)) {
        expect(mapped.value).toBe(10);
      }
    });

    it('should pass through failures unchanged', () => {
      // Arrange
      const result: ResultType<number, string> = failure('error');

      // Act
      const mapped = map_result(result, (x: number) => x * 2);

      // Assert
      expect(is_failure(mapped)).toBe(true);
      if (is_failure(mapped)) {
        expect(mapped.error).toBe('error');
      }
    });
  });

  describe('map_error', () => {
    it('should transform failure errors', () => {
      // Arrange
      const result = failure('original error');

      // Act
      const mapped = map_error(result, (e) => `Wrapped: ${e}`);

      // Assert
      expect(is_failure(mapped)).toBe(true);
      if (is_failure(mapped)) {
        expect(mapped.error).toBe('Wrapped: original error');
      }
    });

    it('should pass through successes unchanged', () => {
      // Arrange
      const result: ResultType<number, string> = success(42);

      // Act
      const mapped = map_error(result, (e) => `Wrapped: ${e}`);

      // Assert
      expect(is_success(mapped)).toBe(true);
      if (is_success(mapped)) {
        expect(mapped.value).toBe(42);
      }
    });
  });

  describe('flat_map', () => {
    it('should chain successful operations', () => {
      // Arrange
      const result = success(10);

      // Act
      const chained = flat_map(result, (x) => success(x * 2));

      // Assert
      expect(is_success(chained)).toBe(true);
      if (is_success(chained)) {
        expect(chained.value).toBe(20);
      }
    });

    it('should short-circuit on failure', () => {
      // Arrange
      const result: ResultType<number, string> = failure('first error');

      // Act
      const chained = flat_map(result, (x: number) => success(x * 2));

      // Assert
      expect(is_failure(chained)).toBe(true);
      if (is_failure(chained)) {
        expect(chained.error).toBe('first error');
      }
    });

    it('should propagate failures from the function', () => {
      // Arrange
      const result = success(10);

      // Act
      const chained = flat_map(result, () => failure('function failed'));

      // Assert
      expect(is_failure(chained)).toBe(true);
      if (is_failure(chained)) {
        expect(chained.error).toBe('function failed');
      }
    });
  });

  describe('unwrap', () => {
    it('should return the value for success', () => {
      // Arrange
      const result = success('hello');

      // Act
      const value = unwrap(result);

      // Assert
      expect(value).toBe('hello');
    });

    it('should throw the error for failure', () => {
      // Arrange
      const error = new Error('test error');
      const result = failure(error);

      // Act & Assert
      expect(() => unwrap(result)).toThrow(error);
    });
  });

  describe('unwrap_or', () => {
    it('should return the value for success', () => {
      // Arrange
      const result = success('hello');

      // Act
      const value = unwrap_or(result, 'default');

      // Assert
      expect(value).toBe('hello');
    });

    it('should return the default for failure', () => {
      // Arrange
      const result: ResultType<string, string> = failure('error');

      // Act
      const value = unwrap_or(result, 'default');

      // Assert
      expect(value).toBe('default');
    });
  });

  describe('unwrap_or_else', () => {
    it('should return the value for success', () => {
      // Arrange
      const result = success('hello');

      // Act
      const value = unwrap_or_else(result, () => 'fallback');

      // Assert
      expect(value).toBe('hello');
    });

    it('should call the function with the error for failure', () => {
      // Arrange
      const result: ResultType<string, string> = failure('error code');

      // Act
      const value = unwrap_or_else(result, (e) => `Fallback: ${e}`);

      // Assert
      expect(value).toBe('Fallback: error code');
    });
  });

  describe('from_promise', () => {
    it('should wrap resolved promise in success', async () => {
      // Arrange
      const promise = Promise.resolve('value');

      // Act
      const result = await from_promise(promise);

      // Assert
      expect(is_success(result)).toBe(true);
      if (is_success(result)) {
        expect(result.value).toBe('value');
      }
    });

    it('should wrap rejected promise in failure', async () => {
      // Arrange
      const error = new Error('failed');
      const promise = Promise.reject(error);

      // Act
      const result = await from_promise(promise);

      // Assert
      expect(is_failure(result)).toBe(true);
      if (is_failure(result)) {
        expect(result.error).toBe(error);
      }
    });

    it('should use the error mapper when provided', async () => {
      // Arrange
      const promise = Promise.reject(new Error('original'));

      // Act
      const result = await from_promise(promise, (e) => `Mapped: ${(e as Error).message}`);

      // Assert
      expect(is_failure(result)).toBe(true);
      if (is_failure(result)) {
        expect(result.error).toBe('Mapped: original');
      }
    });
  });

  describe('from_try', () => {
    it('should wrap successful function in success', () => {
      // Arrange
      const fn = () => 42;

      // Act
      const result = from_try(fn);

      // Assert
      expect(is_success(result)).toBe(true);
      if (is_success(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should wrap thrown error in failure', () => {
      // Arrange
      const error = new Error('thrown');
      const fn = () => {
        throw error;
      };

      // Act
      const result = from_try(fn);

      // Assert
      expect(is_failure(result)).toBe(true);
      if (is_failure(result)) {
        expect(result.error).toBe(error);
      }
    });

    it('should use the error mapper when provided', () => {
      // Arrange
      const fn = () => {
        throw new Error('original');
      };

      // Act
      const result = from_try(fn, (e) => `Mapped: ${(e as Error).message}`);

      // Assert
      expect(is_failure(result)).toBe(true);
      if (is_failure(result)) {
        expect(result.error).toBe('Mapped: original');
      }
    });
  });

  describe('combine', () => {
    it('should combine all successes into an array', () => {
      // Arrange
      const results = [success(1), success(2), success(3)];

      // Act
      const combined = combine(results);

      // Assert
      expect(is_success(combined)).toBe(true);
      if (is_success(combined)) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should return first failure when any fails', () => {
      // Arrange
      const results: ResultType<number, string>[] = [
        success(1),
        failure('error1'),
        failure('error2'),
      ];

      // Act
      const combined = combine(results);

      // Assert
      expect(is_failure(combined)).toBe(true);
      if (is_failure(combined)) {
        expect(combined.error).toBe('error1');
      }
    });

    it('should handle empty array', () => {
      // Arrange
      const results: ReturnType<typeof success<number>>[] = [];

      // Act
      const combined = combine(results);

      // Assert
      expect(is_success(combined)).toBe(true);
      if (is_success(combined)) {
        expect(combined.value).toEqual([]);
      }
    });
  });

  describe('combine_all', () => {
    it('should combine all successes into an array', () => {
      // Arrange
      const results = [success(1), success(2), success(3)];

      // Act
      const combined = combine_all(results);

      // Assert
      expect(is_success(combined)).toBe(true);
      if (is_success(combined)) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should collect all errors when some fail', () => {
      // Arrange
      const results: ResultType<number, string>[] = [
        success(1),
        failure('error1'),
        failure('error2'),
      ];

      // Act
      const combined = combine_all(results);

      // Assert
      expect(is_failure(combined)).toBe(true);
      if (is_failure(combined)) {
        expect(combined.error).toEqual(['error1', 'error2']);
      }
    });

    it('should handle all failures', () => {
      // Arrange
      const results: ResultType<number, string>[] = [failure('e1'), failure('e2'), failure('e3')];

      // Act
      const combined = combine_all(results);

      // Assert
      expect(is_failure(combined)).toBe(true);
      if (is_failure(combined)) {
        expect(combined.error).toEqual(['e1', 'e2', 'e3']);
      }
    });
  });
});
