import { describe, expect, test } from 'bun:test';
import { check_version_update, filter_semver_tags, find_latest_matching } from '../src/version.js';
import type { TagInfoType } from '../src/types.js';

describe('filter_semver_tags', () => {
  const tags: TagInfoType[] = [
    { name: 'latest' },
    { name: 'v1.0.0' },
    { name: '1.0.1' },
    { name: 'v2.0.0-alpha' },
    { name: '2.0.0' },
    { name: 'sha-abc1234' },
    { name: 'main' },
  ];

  test('filters to valid semver tags', () => {
    const result = filter_semver_tags(tags);
    expect(result).toEqual(['2.0.0', '1.0.1', '1.0.0']);
  });

  test('excludes prereleases by default', () => {
    const result = filter_semver_tags(tags);
    expect(result).not.toContain('2.0.0-alpha');
  });

  test('includes prereleases when option is false', () => {
    const result = filter_semver_tags(tags, { exclude_prerelease: false });
    expect(result).toContain('2.0.0-alpha');
  });

  test('sorts versions descending', () => {
    const result = filter_semver_tags(tags);
    expect(result[0]).toBe('2.0.0');
    expect(result[result.length - 1]).toBe('1.0.0');
  });
});

describe('find_latest_matching', () => {
  const versions = ['3.0.0', '2.1.0', '2.0.0', '1.5.0', '1.0.0'];

  test('returns latest without constraint', () => {
    const result = find_latest_matching(versions);
    expect(result).toBe('3.0.0');
  });

  test('returns latest matching ^2.0.0', () => {
    const result = find_latest_matching(versions, '^2.0.0');
    expect(result).toBe('2.1.0');
  });

  test('returns latest matching ~1.0.0', () => {
    const result = find_latest_matching(versions, '~1.0.0');
    expect(result).toBe('1.0.0');
  });

  test('returns latest matching >=1.0.0 <2.0.0', () => {
    const result = find_latest_matching(versions, '>=1.0.0 <2.0.0');
    expect(result).toBe('1.5.0');
  });

  test('returns undefined for no match', () => {
    const result = find_latest_matching(versions, '^4.0.0');
    expect(result).toBeUndefined();
  });
});

describe('check_version_update', () => {
  const versions = ['2.0.0', '1.5.0', '1.0.0'];

  test('detects update available', () => {
    const result = check_version_update('1.0.0', versions);
    expect(result.has_update).toBe(true);
    expect(result.latest_version).toBe('2.0.0');
  });

  test('detects no update when current is latest', () => {
    const result = check_version_update('2.0.0', versions);
    expect(result.has_update).toBe(false);
  });

  test('respects constraint when checking for update', () => {
    const result = check_version_update('1.0.0', versions, '^1.0.0');
    expect(result.has_update).toBe(true);
    expect(result.latest_version).toBe('1.5.0');
  });

  test('handles v prefix in current version', () => {
    const result = check_version_update('v1.0.0', versions);
    expect(result.has_update).toBe(true);
    expect(result.current_version).toBe('1.0.0');
  });
});
