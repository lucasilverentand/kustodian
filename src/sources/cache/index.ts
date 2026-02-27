import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  Errors,
  type KustodianErrorType,
  type ResultType,
  failure,
  success,
} from '../../core/index.js';
import type { CacheEntryType, CacheManagerType } from '../types.js';
import {
  type CacheMetaType,
  META_FILENAME,
  TEMPLATES_DIRNAME,
  cache_meta_schema,
} from './metadata.js';
import { calculate_expiry, is_expired } from './ttl.js';

export type { CacheManagerType } from '../types.js';
export {
  type CacheMetaType,
  cache_meta_schema,
  META_FILENAME,
  TEMPLATES_DIRNAME,
} from './metadata.js';
export { calculate_expiry, DEFAULT_TTL, is_expired, parse_ttl } from './ttl.js';

/**
 * Creates a safe directory name from a source name.
 */
function sanitize_name(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_');
}

/**
 * Creates a safe directory name from a version.
 */
function sanitize_version(version: string): string {
  return version.replace(/[^a-zA-Z0-9-_.]/g, '_');
}

/**
 * Creates a cache manager instance.
 */
export function create_cache_manager(cache_dir: string): CacheManagerType {
  return new CacheManager(cache_dir);
}

class CacheManager implements CacheManagerType {
  readonly cache_dir: string;

  constructor(cache_dir: string) {
    this.cache_dir = cache_dir;
  }

  private get_entry_path(source_name: string, version: string): string {
    return path.join(this.cache_dir, sanitize_name(source_name), sanitize_version(version));
  }

  private get_meta_path(source_name: string, version: string): string {
    return path.join(this.get_entry_path(source_name, version), META_FILENAME);
  }

  private get_templates_path(source_name: string, version: string): string {
    return path.join(this.get_entry_path(source_name, version), TEMPLATES_DIRNAME);
  }

  async get(
    source_name: string,
    version: string,
  ): Promise<ResultType<CacheEntryType | null, KustodianErrorType>> {
    const meta_path = this.get_meta_path(source_name, version);

    try {
      const meta_content = await fs.readFile(meta_path, 'utf-8');
      const meta_json = JSON.parse(meta_content);
      const parse_result = cache_meta_schema.safeParse(meta_json);

      if (!parse_result.success) {
        return failure(Errors.cache_corrupt(meta_path));
      }

      const meta = parse_result.data;
      const expires_at = meta.expires_at ? new Date(meta.expires_at) : null;

      // Check if expired (only for mutable refs)
      if (is_expired(expires_at)) {
        return success(null);
      }

      const templates_path = this.get_templates_path(source_name, version);

      // Verify templates directory exists
      try {
        await fs.access(templates_path);
      } catch {
        return success(null);
      }

      const entry: CacheEntryType = {
        source_name: meta.source_name,
        source_type: meta.source_type,
        version: meta.version,
        path: templates_path,
        fetched_at: new Date(meta.fetched_at),
        expires_at,
      };
      if (meta.checksum) {
        entry.checksum = meta.checksum;
      }
      return success(entry);
    } catch (error) {
      // File doesn't exist - not an error, just no cache entry
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return success(null);
      }
      return failure(Errors.cache_read_error(meta_path, error));
    }
  }

  async put(
    source_name: string,
    source_type: 'git' | 'http' | 'oci',
    version: string,
    content_path: string,
    mutable: boolean,
    ttl?: string,
  ): Promise<ResultType<CacheEntryType, KustodianErrorType>> {
    const entry_path = this.get_entry_path(source_name, version);
    const meta_path = this.get_meta_path(source_name, version);
    const templates_path = this.get_templates_path(source_name, version);

    try {
      // Create directory structure
      await fs.mkdir(entry_path, { recursive: true });

      // Replace existing cached templates atomically for the same cache key.
      await fs.rm(templates_path, { recursive: true, force: true });

      // Copy content to templates directory
      await fs.cp(content_path, templates_path, { recursive: true });

      const fetched_at = new Date();
      const expires_at = calculate_expiry(mutable, ttl);

      const meta: CacheMetaType = {
        source_name,
        source_type,
        version,
        fetched_at: fetched_at.toISOString(),
        expires_at: expires_at?.toISOString() ?? null,
      };

      // Write metadata
      await fs.writeFile(meta_path, JSON.stringify(meta, null, 2));

      return success({
        source_name,
        source_type,
        version,
        path: templates_path,
        fetched_at,
        expires_at,
      });
    } catch (error) {
      return failure(Errors.cache_write_error(entry_path, error));
    }
  }

  async invalidate(
    source_name: string,
    version?: string,
  ): Promise<ResultType<void, KustodianErrorType>> {
    try {
      if (version) {
        // Invalidate specific version
        const entry_path = this.get_entry_path(source_name, version);
        await fs.rm(entry_path, { recursive: true, force: true });
      } else {
        // Invalidate all versions for this source
        const source_path = path.join(this.cache_dir, sanitize_name(source_name));
        await fs.rm(source_path, { recursive: true, force: true });
      }
      return success(undefined);
    } catch (error) {
      return failure(Errors.cache_write_error(this.cache_dir, error));
    }
  }

  async prune(): Promise<ResultType<number, KustodianErrorType>> {
    let pruned = 0;

    try {
      // Check if cache directory exists
      try {
        await fs.access(this.cache_dir);
      } catch {
        return success(0);
      }

      const sources = await fs.readdir(this.cache_dir);

      for (const source of sources) {
        const source_path = path.join(this.cache_dir, source);
        const stat = await fs.stat(source_path);
        if (!stat.isDirectory()) continue;

        const versions = await fs.readdir(source_path);

        for (const version of versions) {
          const entry_path = path.join(source_path, version);
          const meta_path = path.join(entry_path, META_FILENAME);

          try {
            const meta_content = await fs.readFile(meta_path, 'utf-8');
            const meta_json = JSON.parse(meta_content);
            const parse_result = cache_meta_schema.safeParse(meta_json);

            if (parse_result.success) {
              const expires_at = parse_result.data.expires_at
                ? new Date(parse_result.data.expires_at)
                : null;
              if (is_expired(expires_at)) {
                await fs.rm(entry_path, { recursive: true, force: true });
                pruned++;
              }
            } else {
              // Corrupt metadata, remove entry
              await fs.rm(entry_path, { recursive: true, force: true });
              pruned++;
            }
          } catch {
            // Can't read metadata, skip
          }
        }
      }

      return success(pruned);
    } catch (error) {
      return failure(Errors.cache_read_error(this.cache_dir, error));
    }
  }

  async list(): Promise<ResultType<CacheEntryType[], KustodianErrorType>> {
    const entries: CacheEntryType[] = [];

    try {
      // Check if cache directory exists
      try {
        await fs.access(this.cache_dir);
      } catch {
        return success([]);
      }

      const sources = await fs.readdir(this.cache_dir);

      for (const source of sources) {
        const source_path = path.join(this.cache_dir, source);
        const stat = await fs.stat(source_path);
        if (!stat.isDirectory()) continue;

        const versions = await fs.readdir(source_path);

        for (const version of versions) {
          const entry_path = path.join(source_path, version);
          const meta_path = path.join(entry_path, META_FILENAME);
          const templates_path = path.join(entry_path, TEMPLATES_DIRNAME);

          try {
            const meta_content = await fs.readFile(meta_path, 'utf-8');
            const meta_json = JSON.parse(meta_content);
            const parse_result = cache_meta_schema.safeParse(meta_json);

            if (parse_result.success) {
              const meta = parse_result.data;
              const entry: CacheEntryType = {
                source_name: meta.source_name,
                source_type: meta.source_type,
                version: meta.version,
                path: templates_path,
                fetched_at: new Date(meta.fetched_at),
                expires_at: meta.expires_at ? new Date(meta.expires_at) : null,
              };
              if (meta.checksum) {
                entry.checksum = meta.checksum;
              }
              entries.push(entry);
            }
          } catch {
            // Can't read metadata, skip
          }
        }
      }

      return success(entries);
    } catch (error) {
      return failure(Errors.cache_read_error(this.cache_dir, error));
    }
  }

  async size(): Promise<ResultType<number, KustodianErrorType>> {
    const get_dir_size = async (dir_path: string): Promise<number> => {
      let total = 0;
      const entries = await fs.readdir(dir_path, { withFileTypes: true });

      for (const entry of entries) {
        const full_path = path.join(dir_path, entry.name);
        if (entry.isDirectory()) {
          total += await get_dir_size(full_path);
        } else {
          const stat = await fs.stat(full_path);
          total += stat.size;
        }
      }

      return total;
    };

    try {
      // Check if cache directory exists
      try {
        await fs.access(this.cache_dir);
      } catch {
        return success(0);
      }

      const total = await get_dir_size(this.cache_dir);
      return success(total);
    } catch (error) {
      return failure(Errors.cache_read_error(this.cache_dir, error));
    }
  }

  async clear(): Promise<ResultType<void, KustodianErrorType>> {
    try {
      await fs.rm(this.cache_dir, { recursive: true, force: true });
      return success(undefined);
    } catch (error) {
      return failure(Errors.cache_write_error(this.cache_dir, error));
    }
  }
}
