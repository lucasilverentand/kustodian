import { basename, dirname, extname, join, normalize, relative, resolve } from 'node:path';

/**
 * Normalizes a path, removing any leading "./" and trailing slashes.
 */
export function normalize_path(path: string): string {
  let normalized = normalize(path);
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Joins path segments and normalizes the result.
 */
export function join_paths(...segments: string[]): string {
  return normalize(join(...segments));
}

/**
 * Resolves a path relative to a base path.
 */
export function resolve_path(base: string, path: string): string {
  return resolve(base, path);
}

/**
 * Gets the relative path from one path to another.
 */
export function relative_path(from: string, to: string): string {
  return relative(from, to);
}

/**
 * Gets the directory name from a path.
 */
export function get_dirname(path: string): string {
  return dirname(path);
}

/**
 * Gets the file name from a path.
 */
export function get_basename(path: string, ext?: string): string {
  return basename(path, ext);
}

/**
 * Gets the file extension from a path.
 */
export function get_extension(path: string): string {
  return extname(path);
}

/**
 * Checks if a path is absolute.
 */
export function is_absolute_path(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:/.test(path);
}

/**
 * Ensures a path starts with "./" for relative paths.
 */
export function ensure_relative(path: string): string {
  if (is_absolute_path(path)) {
    return path;
  }
  if (path.startsWith('./') || path.startsWith('../')) {
    return path;
  }
  return `./${path}`;
}

/**
 * Removes the extension from a file path.
 */
export function remove_extension(path: string): string {
  const ext = extname(path);
  if (ext) {
    return path.slice(0, -ext.length);
  }
  return path;
}

/**
 * Changes the extension of a file path.
 */
export function change_extension(path: string, new_ext: string): string {
  const without_ext = remove_extension(path);
  const ext = new_ext.startsWith('.') ? new_ext : `.${new_ext}`;
  return `${without_ext}${ext}`;
}

/**
 * Checks if a path matches any of the given patterns (simple glob support).
 */
export function matches_pattern(path: string, patterns: string[]): boolean {
  const normalized = normalize_path(path);
  for (const pattern of patterns) {
    if (pattern === '*') {
      return true;
    }
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      if (normalized.endsWith(ext)) {
        return true;
      }
    }
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (normalized.startsWith(prefix)) {
        return true;
      }
    }
    if (normalized === pattern || normalized.endsWith(`/${pattern}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Splits a path into its segments.
 */
export function split_path(path: string): string[] {
  return normalize_path(path).split('/').filter(Boolean);
}

/**
 * Gets the common prefix of multiple paths.
 */
export function common_path_prefix(paths: string[]): string {
  if (paths.length === 0) {
    return '';
  }
  if (paths.length === 1) {
    const path = paths[0];
    return path ? get_dirname(path) : '';
  }

  const first = paths[0];
  if (!first) {
    return '';
  }
  const segments = split_path(first);
  const common: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;
    const all_match = paths.every((p) => {
      const s = split_path(p);
      return s[i] === segment;
    });
    if (all_match) {
      common.push(segment);
    } else {
      break;
    }
  }

  return common.length > 0 ? common.join('/') : '';
}
