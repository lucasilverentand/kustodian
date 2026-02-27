import { execFile } from 'node:child_process';
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
} from '../../core/index.js';
import { type TemplateSourceType, is_git_source } from '../../schema/index.js';
import type { FetchOptionsType, FetchResultType, RemoteVersionType } from '../types.js';
import type { SourceFetcherType } from './types.js';

const exec_file_async = promisify(execFile);

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

/**
 * Creates a Git source fetcher.
 */
export function create_git_fetcher(): SourceFetcherType {
  return new GitFetcher();
}

class GitFetcher implements SourceFetcherType {
  readonly type = 'git' as const;

  /**
   * Sanitizes a Git remote URL, returning a safe string guaranteed not to be
   * interpreted as a Git CLI option (e.g. `--upload-pack=...`).
   *
   * Returns a fresh string to break taint propagation for static analysis.
   */
  private sanitize_git_url(url: string): string {
    if (!url || url.trim() === '') {
      throw Errors.invalid_argument('source.git.url', 'Git URL must not be empty');
    }

    // Reject URLs that could be interpreted by git as options
    if (url.startsWith('-')) {
      throw Errors.invalid_argument(
        'source.git.url',
        'Git URL must not start with "-"; option-like values are not allowed',
      );
    }

    // Return a copy to break taint tracking: the returned value is validated.
    return `${url}`;
  }

  is_mutable(source: TemplateSourceType): boolean {
    if (!is_git_source(source)) return true;
    // Branches are mutable, tags and commits are immutable
    return source.git.ref.branch !== undefined;
  }

  async fetch(
    source: TemplateSourceType,
    options?: FetchOptionsType,
  ): Promise<ResultType<FetchResultType, KustodianErrorType>> {
    if (!is_git_source(source)) {
      return failure(Errors.invalid_argument('source', 'Expected a git source'));
    }

    const { ref, path: subpath } = source.git;
    const url = this.sanitize_git_url(source.git.url);
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

    // Determine the ref to fetch
    const git_ref = ref.branch ?? ref.tag ?? ref.commit;
    if (!git_ref) {
      return failure(Errors.invalid_argument('source', 'No git ref specified'));
    }

    // Create temp directory for clone
    const temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-git-'));

    try {
      // Clone with depth=1 for efficiency (shallow clone)
      // For commits, we need a full clone to checkout specific commits
      const is_commit = ref.commit !== undefined;

      const clone_args: string[] = ['clone', '--single-branch'];
      if (!is_commit) {
        clone_args.push('--depth=1');
      }
      if (ref.branch || ref.tag) {
        clone_args.push(`--branch=${git_ref}`);
      }
      // '--' separates git options from positional args (url, dest)
      clone_args.push('--', url, temp_dir);

      // Inline exec_file_async for clone so the sanitized URL doesn't flow
      // through a generic wrapper — this lets static analysis see the full call.
      try {
        await exec_file_async('git', clone_args, { timeout });
      } catch (error) {
        if (error instanceof Error && 'killed' in error && (error as { killed?: boolean }).killed) {
          return failure(Errors.source_timeout(source.name, timeout));
        }
        throw error;
      }

      // If fetching a specific commit, checkout that commit
      if (is_commit) {
        try {
          await exec_file_async('git', ['checkout', '--', git_ref], { timeout, cwd: temp_dir });
        } catch (error) {
          if (
            error instanceof Error &&
            'killed' in error &&
            (error as { killed?: boolean }).killed
          ) {
            return failure(Errors.source_timeout(source.name, timeout));
          }
          throw error;
        }
      }

      // Get the actual commit SHA for versioning
      let commit_sha: string;
      try {
        const { stdout } = await exec_file_async('git', ['rev-parse', 'HEAD'], {
          timeout,
          cwd: temp_dir,
        });
        commit_sha = stdout.trim();
      } catch (error) {
        if (error instanceof Error && 'killed' in error && (error as { killed?: boolean }).killed) {
          return failure(Errors.source_timeout(source.name, timeout));
        }
        throw error;
      }

      // Determine final content path
      let content_path = temp_dir;
      if (subpath) {
        content_path = path.join(temp_dir, subpath);
        // Verify subpath exists
        try {
          await fs.access(content_path);
        } catch {
          return failure(Errors.not_found('path', `${url}:${subpath}`));
        }
      }

      // Create a clean output directory with just the templates
      const output_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-templates-'));

      // Copy content (excluding .git directory)
      await this.copy_excluding_git(content_path, output_dir);

      // Cleanup original clone
      await fs.rm(temp_dir, { recursive: true, force: true });

      return success({
        path: output_dir,
        version: commit_sha,
        from_cache: false,
        fetched_at: new Date(),
      });
    } catch (error) {
      // Cleanup on error
      await fs.rm(temp_dir, { recursive: true, force: true }).catch(() => {});

      if (error instanceof Error && error.message.includes('Authentication')) {
        return failure(Errors.source_auth_error(source.name, error));
      }
      return failure(Errors.source_fetch_error(source.name, error));
    }
  }

  async list_versions(
    source: TemplateSourceType,
  ): Promise<ResultType<RemoteVersionType[], KustodianErrorType>> {
    if (!is_git_source(source)) {
      return failure(Errors.invalid_argument('source', 'Expected a git source'));
    }

    const url = this.sanitize_git_url(source.git.url);

    try {
      const { stdout } = await exec_file_async(
        'git',
        ['ls-remote', '--tags', '--heads', '--', url],
        {
          timeout: DEFAULT_TIMEOUT,
        },
      );

      const versions: RemoteVersionType[] = [];

      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;

        const [sha, ref] = line.split('\t');
        if (!sha || !ref) continue;

        // Parse ref name
        let version: string;
        if (ref.startsWith('refs/tags/')) {
          version = ref.replace('refs/tags/', '').replace(/\^{}$/, '');
        } else if (ref.startsWith('refs/heads/')) {
          version = ref.replace('refs/heads/', '');
        } else {
          continue;
        }

        // Deduplicate (annotated tags appear twice)
        if (!versions.some((v) => v.version === version)) {
          versions.push({
            version,
            digest: sha,
          });
        }
      }

      return success(versions);
    } catch (error) {
      return failure(Errors.source_fetch_error(source.name, error));
    }
  }

  private async copy_excluding_git(src: string, dest: string): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.git') continue;

      const src_path = path.join(src, entry.name);
      const dest_path = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(dest_path, { recursive: true });
        await this.copy_excluding_git(src_path, dest_path);
      } else {
        await fs.copyFile(src_path, dest_path);
      }
    }
  }
}
