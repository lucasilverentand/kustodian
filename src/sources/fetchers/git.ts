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
   * Validates a Git remote URL to prevent it from being interpreted as a Git option.
   * In particular, disallow values starting with '-' such as '--upload-pack=...'.
   */
  private validate_git_url(url: string): void {
    if (!url || url.trim() === '') {
      throw Errors.invalid_argument('source.git.url', 'Git URL must not be empty');
    }

    // Prevent URLs that could be interpreted by git as options
    if (url.startsWith('-')) {
      throw Errors.invalid_argument(
        'source.git.url',
        'Git URL must not start with "-"; option-like values are not allowed',
      );
    }
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

    const { url, ref, path: subpath } = source.git;
    this.validate_git_url(url);
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
      // Validate URL to prevent argument injection (e.g. --upload-pack)
      if (url.startsWith('-')) {
        return failure(Errors.invalid_argument('source', `Invalid git URL: ${url}`));
      }

      const clone_args = ['clone', '--single-branch'];
      if (!is_commit) {
        clone_args.push('--depth=1');
      }
      if (ref.branch || ref.tag) {
        clone_args.push(`--branch=${git_ref}`);
      }
      // Use '--' to separate options from positional args
      clone_args.push('--', url, temp_dir);

      await this.exec_git(clone_args, timeout, source.name);

      // If fetching a specific commit, checkout that commit
      if (is_commit) {
        await this.exec_git(['checkout', '--', git_ref], timeout, source.name, temp_dir);
      }

      // Get the actual commit SHA for versioning
      const version = await this.get_commit_sha(temp_dir, timeout, source.name);
      if (!version.success) {
        return failure(version.error);
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
        version: version.value,
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

    const { url } = source.git;

    try {
      // Use ls-remote to list refs without cloning
      // Validate URL to prevent argument injection (e.g. --upload-pack)
      if (url.startsWith('-')) {
        return failure(Errors.invalid_argument('source', `Invalid git URL: ${url}`));
      }

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

  private async exec_git(
    args: string[],
    timeout: number,
    source_name: string,
    cwd?: string,
  ): Promise<ResultType<string, KustodianErrorType>> {
    try {
      const { stdout } = await exec_file_async('git', args, { timeout, cwd });
      return success(stdout);
    } catch (error) {
      if (error instanceof Error && 'killed' in error && error.killed) {
        return failure(Errors.source_timeout(source_name, timeout));
      }
      throw error;
    }
  }

  private async get_commit_sha(
    repo_path: string,
    timeout: number,
    source_name: string,
  ): Promise<ResultType<string, KustodianErrorType>> {
    const result = await this.exec_git(['rev-parse', 'HEAD'], timeout, source_name, repo_path);
    if (!result.success) return result;
    return success(result.value.trim());
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
