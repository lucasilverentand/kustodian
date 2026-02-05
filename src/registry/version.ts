import * as semver from 'semver';
import type { TagInfoType, VersionCheckResultType } from './types.js';

/**
 * Default pattern for semver-like tags.
 * Matches: 1.0.0, v1.0.0, 1.0.0-alpha, v1.0.0-rc.1
 */
export const DEFAULT_SEMVER_PATTERN = /^v?(\d+\.\d+\.\d+)(-[\w.]+)?$/;

/**
 * Filters tags to only semver-valid versions.
 */
export function filter_semver_tags(
  tags: TagInfoType[],
  options: {
    pattern?: RegExp;
    exclude_prerelease?: boolean;
  } = {},
): string[] {
  const pattern = options.pattern ?? DEFAULT_SEMVER_PATTERN;
  const exclude_prerelease = options.exclude_prerelease ?? true;

  const versions: string[] = [];

  for (const tag of tags) {
    if (!pattern.test(tag.name)) {
      continue;
    }

    const cleaned = semver.clean(tag.name);
    if (!cleaned) {
      continue;
    }

    const parsed = semver.parse(cleaned);
    if (!parsed) {
      continue;
    }

    if (exclude_prerelease && parsed.prerelease.length > 0) {
      continue;
    }

    versions.push(cleaned);
  }

  // Sort descending (newest first)
  return versions.sort(semver.rcompare);
}

/**
 * Finds the latest version satisfying a constraint.
 */
export function find_latest_matching(versions: string[], constraint?: string): string | undefined {
  if (!constraint) {
    // Return the latest (first in sorted array)
    return versions[0];
  }

  const result = semver.maxSatisfying(versions, constraint);
  return result ?? undefined;
}

/**
 * Checks if a newer version is available.
 */
export function check_version_update(
  current: string,
  available: string[],
  constraint?: string,
): VersionCheckResultType {
  const cleaned_current = semver.clean(current) ?? current;
  const latest = find_latest_matching(available, constraint);

  const has_update =
    latest !== undefined &&
    semver.valid(latest) !== null &&
    semver.valid(cleaned_current) !== null &&
    semver.gt(latest, cleaned_current);

  return {
    current_version: cleaned_current,
    latest_version: latest ?? cleaned_current,
    available_versions: available,
    has_update,
  };
}
