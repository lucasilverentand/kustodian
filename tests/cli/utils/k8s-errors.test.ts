import { describe, expect, it } from 'bun:test';
import { is_not_found_error } from '../../../src/cli/utils/k8s-errors.js';

describe('is_not_found_error', () => {
  it('should match kubectl NotFound format', () => {
    expect(is_not_found_error('Error from server (NotFound): secrets "foo" not found')).toBe(true);
  });

  it('should match trailing not found', () => {
    expect(is_not_found_error('secrets "foo" not found')).toBe(true);
  });

  it('should match multiline with trailing not found', () => {
    expect(is_not_found_error('some context\nsecrets "foo" not found')).toBe(true);
  });

  it('should reject unrelated not found messages', () => {
    expect(is_not_found_error('config file not found on disk, retrying')).toBe(false);
  });

  it('should reject forbidden errors', () => {
    expect(is_not_found_error('Error from server (Forbidden): forbidden')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(is_not_found_error('')).toBe(false);
  });
});
