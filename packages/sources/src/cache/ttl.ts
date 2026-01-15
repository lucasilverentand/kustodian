import {
  Errors,
  type KustodianErrorType,
  type ResultType,
  failure,
  success,
} from '@kustodian/core';

/**
 * Default TTL for mutable sources (1 hour).
 */
export const DEFAULT_TTL = '1h';

/**
 * Parses a TTL duration string into milliseconds.
 * Supported formats: 30m, 1h, 24h, 7d
 */
export function parse_ttl(ttl: string): ResultType<number, KustodianErrorType> {
  const match = ttl.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    return failure(
      Errors.invalid_argument(
        'ttl',
        `Invalid TTL format: ${ttl}. Expected format: <number>(m|h|d)`,
      ),
    );
  }

  const value = match[1] ?? '0';
  const unit = match[2] as 'm' | 'h' | 'd';
  const multipliers: Record<'m' | 'h' | 'd', number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return success(Number.parseInt(value, 10) * multipliers[unit]);
}

/**
 * Calculates the expiration date from a TTL string.
 * Returns null for immutable sources (no expiration).
 */
export function calculate_expiry(mutable: boolean, ttl?: string): Date | null {
  if (!mutable) {
    return null;
  }

  const ttl_ms_result = parse_ttl(ttl ?? DEFAULT_TTL);
  if (!ttl_ms_result.success) {
    // Fall back to default TTL on parse error
    const default_ms_result = parse_ttl(DEFAULT_TTL);
    if (!default_ms_result.success) {
      // This should never happen with the hardcoded default
      return new Date(Date.now() + 60 * 60 * 1000);
    }
    return new Date(Date.now() + default_ms_result.value);
  }

  return new Date(Date.now() + ttl_ms_result.value);
}

/**
 * Checks if a cache entry has expired.
 */
export function is_expired(expires_at: Date | null): boolean {
  if (expires_at === null) {
    return false; // Immutable entries never expire
  }
  return new Date() > expires_at;
}
