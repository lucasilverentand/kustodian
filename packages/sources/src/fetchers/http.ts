import { exec } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  Errors,
  type KustodianErrorType,
  type ResultType,
  failure,
  success,
} from '@kustodian/core';
import { type TemplateSourceType, is_http_source } from '@kustodian/schema';
import type { FetchOptionsType, FetchResultType, RemoteVersionType } from '../types.js';
import type { SourceFetcherType } from './types.js';

const exec_async = promisify(exec);

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

/**
 * Creates an HTTP source fetcher.
 */
export function create_http_fetcher(): SourceFetcherType {
  return new HttpFetcher();
}

class HttpFetcher implements SourceFetcherType {
  readonly type = 'http' as const;

  is_mutable(source: TemplateSourceType): boolean {
    if (!is_http_source(source)) return true;
    // HTTP sources with checksums are immutable (content is verified)
    // Without checksum, we assume mutable
    return source.http.checksum === undefined;
  }

  async fetch(
    source: TemplateSourceType,
    options?: FetchOptionsType,
  ): Promise<ResultType<FetchResultType, KustodianErrorType>> {
    if (!is_http_source(source)) {
      return failure(Errors.invalid_argument('source', 'Expected an http source'));
    }

    const { url, checksum, headers } = source.http;
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

    // Create temp directory for download
    const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-http-'));
    const archive_path = path.join(temp_dir, 'archive');

    try {
      // Download the archive
      const controller = new AbortController();
      const timeout_id = setTimeout(() => controller.abort(), timeout);

      const fetch_options: RequestInit = {
        signal: controller.signal,
      };

      if (headers) {
        fetch_options.headers = headers;
      }

      const response = await fetch(url, fetch_options);
      clearTimeout(timeout_id);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return failure(Errors.source_auth_error(source.name));
        }
        return failure(
          Errors.source_fetch_error(
            source.name,
            new Error(`HTTP ${response.status}: ${response.statusText}`),
          ),
        );
      }

      // Write to file
      const buffer = await response.arrayBuffer();
      await fs.writeFile(archive_path, new Uint8Array(buffer));

      // Verify checksum if provided
      if (checksum) {
        const verify_result = await this.verify_checksum(archive_path, checksum, source.name);
        if (!verify_result.success) {
          return verify_result;
        }
      }

      // Compute checksum for version identifier
      const actual_checksum = await this.compute_checksum(archive_path);

      // Extract archive
      const extract_dir = path.join(temp_dir, 'extracted');
      await fs.mkdir(extract_dir, { recursive: true });

      const extract_result = await this.extract_archive(
        archive_path,
        extract_dir,
        url,
        source.name,
      );
      if (!extract_result.success) {
        return extract_result;
      }

      // Find the actual content directory (archives often have a root folder)
      const content_dir = await this.find_content_dir(extract_dir);

      // Create clean output directory
      const output_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-templates-'));
      await fs.cp(content_dir, output_dir, { recursive: true });

      // Cleanup
      await fs.rm(temp_dir, { recursive: true, force: true });

      return success({
        path: output_dir,
        version: checksum ?? `sha256:${actual_checksum.slice(0, 16)}`,
        from_cache: false,
        fetched_at: new Date(),
      });
    } catch (error) {
      // Cleanup on error
      await fs.rm(temp_dir, { recursive: true, force: true }).catch(() => {});

      if (error instanceof Error && error.name === 'AbortError') {
        return failure(Errors.source_timeout(source.name, timeout));
      }
      return failure(Errors.source_fetch_error(source.name, error));
    }
  }

  async list_versions(
    _source: TemplateSourceType,
  ): Promise<ResultType<RemoteVersionType[], KustodianErrorType>> {
    // HTTP sources don't have version listing capability
    return success([]);
  }

  private async verify_checksum(
    file_path: string,
    expected: string,
    source_name: string,
  ): Promise<ResultType<void, KustodianErrorType>> {
    // Parse expected checksum (format: algorithm:hash or just hash for sha256)
    const [algorithm, hash] = expected.includes(':')
      ? (expected.split(':') as [string, string])
      : ['sha256', expected];

    const actual = await this.compute_checksum(file_path, algorithm);

    if (actual.toLowerCase() !== hash.toLowerCase()) {
      return failure(
        Errors.source_checksum_mismatch(source_name, expected, `${algorithm}:${actual}`),
      );
    }

    return success(undefined);
  }

  private async compute_checksum(file_path: string, algorithm = 'sha256'): Promise<string> {
    const content = await fs.readFile(file_path);
    return crypto.createHash(algorithm).update(new Uint8Array(content)).digest('hex');
  }

  private async extract_archive(
    archive_path: string,
    dest_dir: string,
    url: string,
    source_name: string,
  ): Promise<ResultType<void, KustodianErrorType>> {
    const lower_url = url.toLowerCase();

    try {
      if (lower_url.endsWith('.tar.gz') || lower_url.endsWith('.tgz')) {
        await exec_async(`tar -xzf "${archive_path}" -C "${dest_dir}"`);
      } else if (lower_url.endsWith('.tar')) {
        await exec_async(`tar -xf "${archive_path}" -C "${dest_dir}"`);
      } else if (lower_url.endsWith('.zip')) {
        await exec_async(`unzip -q "${archive_path}" -d "${dest_dir}"`);
      } else {
        // Try to detect format from content
        const { stdout } = await exec_async(`file "${archive_path}"`);
        if (stdout.includes('gzip')) {
          await exec_async(`tar -xzf "${archive_path}" -C "${dest_dir}"`);
        } else if (stdout.includes('Zip')) {
          await exec_async(`unzip -q "${archive_path}" -d "${dest_dir}"`);
        } else if (stdout.includes('tar')) {
          await exec_async(`tar -xf "${archive_path}" -C "${dest_dir}"`);
        } else {
          return failure(Errors.invalid_argument('source', `Unknown archive format for ${url}`));
        }
      }
      return success(undefined);
    } catch (error) {
      return failure(Errors.source_fetch_error(source_name, error));
    }
  }

  private async find_content_dir(extract_dir: string): Promise<string> {
    const entries = await fs.readdir(extract_dir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());

    // If there's exactly one directory, assume it's the content root
    if (dirs.length === 1 && entries.length === 1 && dirs[0]) {
      return path.join(extract_dir, dirs[0].name);
    }

    // Otherwise, use the extract directory itself
    return extract_dir;
  }
}
