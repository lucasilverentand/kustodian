import { exec } from 'node:child_process';
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
import { type TemplateSourceType, is_oci_source } from '@kustodian/schema';
import type { FetchOptionsType, FetchResultType, RemoteVersionType } from '../types.js';
import type { SourceFetcherType } from './types.js';

const exec_async = promisify(exec);

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

/**
 * Creates an OCI source fetcher.
 */
export function create_oci_fetcher(): SourceFetcherType {
  return new OciFetcher();
}

class OciFetcher implements SourceFetcherType {
  readonly type = 'oci' as const;

  is_mutable(source: TemplateSourceType): boolean {
    if (!is_oci_source(source)) return true;
    // Digests are immutable, 'latest' tag is mutable, other tags are treated as immutable
    if (source.oci.digest) return false;
    return source.oci.tag === 'latest';
  }

  async fetch(
    source: TemplateSourceType,
    options?: FetchOptionsType,
  ): Promise<ResultType<FetchResultType, KustodianErrorType>> {
    if (!is_oci_source(source)) {
      return failure(Errors.invalid_argument('source', 'Expected an oci source'));
    }

    const { registry, repository, tag, digest } = source.oci;
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

    // Build OCI reference
    const ref = digest ?? tag;
    if (!ref) {
      return failure(Errors.invalid_argument('source', 'No OCI tag or digest specified'));
    }

    const oci_ref = `${registry}/${repository}:${ref}`;

    // Create temp directory for pull
    const output_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-oci-'));

    try {
      // Try flux first, then oras
      let pull_result = await this.try_flux_pull(oci_ref, output_dir, timeout, source.name);

      if (!pull_result.success && pull_result.error.code === 'SOURCE_FETCH_ERROR') {
        // Flux not available, try oras
        pull_result = await this.try_oras_pull(oci_ref, output_dir, timeout, source.name);
      }

      if (!pull_result.success) {
        return pull_result;
      }

      // Get the actual digest for version identifier
      const version =
        digest ?? (await this.get_digest(registry, repository, ref, timeout, source.name));

      return success({
        path: output_dir,
        version: version ?? ref,
        from_cache: false,
        fetched_at: new Date(),
      });
    } catch (error) {
      // Cleanup on error
      await fs.rm(output_dir, { recursive: true, force: true }).catch(() => {});
      return failure(Errors.source_fetch_error(source.name, error));
    }
  }

  async list_versions(
    source: TemplateSourceType,
  ): Promise<ResultType<RemoteVersionType[], KustodianErrorType>> {
    if (!is_oci_source(source)) {
      return failure(Errors.invalid_argument('source', 'Expected an oci source'));
    }

    const { registry, repository } = source.oci;

    try {
      // Try using oras to list tags
      const { stdout } = await exec_async(`oras repo tags ${registry}/${repository}`, {
        timeout: DEFAULT_TIMEOUT,
      });

      const versions: RemoteVersionType[] = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((version) => ({ version }));

      return success(versions);
    } catch {
      // If oras fails, try crane
      try {
        const { stdout } = await exec_async(`crane ls ${registry}/${repository}`, {
          timeout: DEFAULT_TIMEOUT,
        });

        const versions: RemoteVersionType[] = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((version) => ({ version }));

        return success(versions);
      } catch (error) {
        return failure(Errors.source_fetch_error(source.name, error));
      }
    }
  }

  private async try_flux_pull(
    oci_ref: string,
    output_dir: string,
    timeout: number,
    source_name: string,
  ): Promise<ResultType<void, KustodianErrorType>> {
    try {
      await exec_async(`flux pull artifact oci://${oci_ref} --output="${output_dir}"`, { timeout });
      return success(undefined);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return failure(Errors.source_fetch_error(source_name, new Error('flux CLI not found')));
      }
      if (error instanceof Error && error.message.includes('unauthorized')) {
        return failure(Errors.source_auth_error(source_name, error));
      }
      if (error instanceof Error && 'killed' in error && error.killed) {
        return failure(Errors.source_timeout(source_name, timeout));
      }
      return failure(Errors.source_fetch_error(source_name, error));
    }
  }

  private async try_oras_pull(
    oci_ref: string,
    output_dir: string,
    timeout: number,
    source_name: string,
  ): Promise<ResultType<void, KustodianErrorType>> {
    try {
      await exec_async(`oras pull ${oci_ref} --output="${output_dir}"`, { timeout });
      return success(undefined);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return failure(
          Errors.source_fetch_error(source_name, new Error('Neither flux nor oras CLI found')),
        );
      }
      if (error instanceof Error && error.message.includes('unauthorized')) {
        return failure(Errors.source_auth_error(source_name, error));
      }
      if (error instanceof Error && 'killed' in error && error.killed) {
        return failure(Errors.source_timeout(source_name, timeout));
      }
      return failure(Errors.source_fetch_error(source_name, error));
    }
  }

  private async get_digest(
    registry: string,
    repository: string,
    tag: string,
    timeout: number,
    _source_name: string,
  ): Promise<string | null> {
    try {
      // Try crane first
      const { stdout } = await exec_async(`crane digest ${registry}/${repository}:${tag}`, {
        timeout,
      });
      return stdout.trim();
    } catch {
      // If crane fails, try oras
      try {
        const { stdout } = await exec_async(
          `oras manifest fetch ${registry}/${repository}:${tag} --descriptor | jq -r .digest`,
          { timeout },
        );
        return stdout.trim() || null;
      } catch {
        return null;
      }
    }
  }
}
