import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dir, '../../action/kustodian-pr-diff/generate-diff.ts');

let tmp_dir: string;
let base_dir: string;
let pr_dir: string;
let output_html: string;
let output_summary: string;
let output_comment: string;

function write_manifest(dir: string, path: string, content: string) {
  const full = join(dir, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

async function run_diff() {
  const proc = Bun.spawn(
    ['bun', 'run', SCRIPT, base_dir, pr_dir, output_html, output_summary, output_comment],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await proc.exited;
  return {
    exit_code: proc.exitCode,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  };
}

function read_summary(): {
  total: number;
  added: number;
  modified: number;
  removed: number;
  files: { path: string; status: string }[];
} {
  return JSON.parse(readFileSync(output_summary, 'utf-8'));
}

beforeEach(() => {
  tmp_dir = join(import.meta.dir, `../../.tmp-test-diff-${Date.now()}`);
  base_dir = join(tmp_dir, 'base');
  pr_dir = join(tmp_dir, 'pr');
  output_html = join(tmp_dir, 'out/report.html');
  output_summary = join(tmp_dir, 'out/summary.json');
  output_comment = join(tmp_dir, 'out/comment.md');
  mkdirSync(base_dir, { recursive: true });
  mkdirSync(pr_dir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmp_dir)) {
    rmSync(tmp_dir, { recursive: true });
  }
});

describe('generate-diff', () => {
  it('should detect no changes when directories are identical', async () => {
    write_manifest(base_dir, 'deploy.yaml', 'apiVersion: v1\nkind: ConfigMap\n');
    write_manifest(pr_dir, 'deploy.yaml', 'apiVersion: v1\nkind: ConfigMap\n');

    const result = await run_diff();
    expect(result.exit_code).toBe(0);

    const summary = read_summary();
    expect(summary.total).toBe(0);
    expect(summary.added).toBe(0);
    expect(summary.modified).toBe(0);
    expect(summary.removed).toBe(0);
    expect(summary.files).toEqual([]);

    const comment = readFileSync(output_comment, 'utf-8');
    expect(comment).toContain('No manifest changes detected');
  });

  it('should detect added files', async () => {
    write_manifest(pr_dir, 'new-service.yaml', 'apiVersion: v1\nkind: Service\n');

    const result = await run_diff();
    expect(result.exit_code).toBe(0);

    const summary = read_summary();
    expect(summary.total).toBe(1);
    expect(summary.added).toBe(1);
    expect(summary.files[0]).toEqual({ path: 'new-service.yaml', status: 'added' });

    const html = readFileSync(output_html, 'utf-8');
    expect(html).toContain('new-service.yaml');
    expect(html).toContain('added');
  });

  it('should detect removed files', async () => {
    write_manifest(base_dir, 'old-deploy.yaml', 'apiVersion: v1\nkind: Deployment\n');

    const result = await run_diff();
    expect(result.exit_code).toBe(0);

    const summary = read_summary();
    expect(summary.total).toBe(1);
    expect(summary.removed).toBe(1);
    expect(summary.files[0]).toEqual({ path: 'old-deploy.yaml', status: 'removed' });
  });

  it('should detect modified files', async () => {
    write_manifest(base_dir, 'config.yaml', 'replicas: 1\n');
    write_manifest(pr_dir, 'config.yaml', 'replicas: 3\n');

    const result = await run_diff();
    expect(result.exit_code).toBe(0);

    const summary = read_summary();
    expect(summary.total).toBe(1);
    expect(summary.modified).toBe(1);
    expect(summary.files[0]).toEqual({ path: 'config.yaml', status: 'modified' });
  });

  it('should handle mixed changes', async () => {
    write_manifest(base_dir, 'unchanged.yaml', 'data: same\n');
    write_manifest(pr_dir, 'unchanged.yaml', 'data: same\n');

    write_manifest(base_dir, 'modified.yaml', 'image: app:v1\n');
    write_manifest(pr_dir, 'modified.yaml', 'image: app:v2\n');

    write_manifest(base_dir, 'removed.yaml', 'kind: Secret\n');

    write_manifest(pr_dir, 'added.yaml', 'kind: Service\n');

    const result = await run_diff();
    expect(result.exit_code).toBe(0);

    const summary = read_summary();
    expect(summary.total).toBe(3);
    expect(summary.added).toBe(1);
    expect(summary.modified).toBe(1);
    expect(summary.removed).toBe(1);
  });

  it('should handle nested directories', async () => {
    write_manifest(pr_dir, 'cluster/prod/deploy.yaml', 'apiVersion: v1\n');
    write_manifest(pr_dir, 'cluster/staging/deploy.yaml', 'apiVersion: v1\n');

    const result = await run_diff();
    expect(result.exit_code).toBe(0);

    const summary = read_summary();
    expect(summary.total).toBe(2);
    expect(summary.added).toBe(2);

    const paths = summary.files.map((f) => f.path).sort();
    expect(paths).toEqual(['cluster/prod/deploy.yaml', 'cluster/staging/deploy.yaml']);
  });

  it('should only process yaml, yml, and json files', async () => {
    write_manifest(pr_dir, 'valid.yaml', 'kind: ConfigMap\n');
    write_manifest(pr_dir, 'valid.yml', 'kind: Secret\n');
    write_manifest(pr_dir, 'valid.json', '{"kind": "Service"}');
    write_manifest(pr_dir, 'ignored.txt', 'not a manifest');
    write_manifest(pr_dir, 'ignored.md', '# readme');

    const result = await run_diff();
    expect(result.exit_code).toBe(0);

    const summary = read_summary();
    expect(summary.total).toBe(3);
    expect(summary.files.map((f) => f.path).sort()).toEqual([
      'valid.json',
      'valid.yaml',
      'valid.yml',
    ]);
  });

  it('should produce valid HTML with diff styling', async () => {
    write_manifest(base_dir, 'app.yaml', 'replicas: 1\nimage: nginx:1.0\n');
    write_manifest(pr_dir, 'app.yaml', 'replicas: 3\nimage: nginx:2.0\n');

    await run_diff();

    const html = readFileSync(output_html, 'utf-8');
    expect(html).toStartWith('<!DOCTYPE html>');
    expect(html).toContain('<title>Kustodian PR Diff</title>');
    expect(html).toContain('app.yaml');
    expect(html).toContain('modified');
  });

  it('should produce markdown comment with file table', async () => {
    write_manifest(pr_dir, 'new.yaml', 'kind: Deployment\n');
    write_manifest(base_dir, 'old.yaml', 'kind: Service\n');

    await run_diff();

    const comment = readFileSync(output_comment, 'utf-8');
    expect(comment).toContain('### Kustodian PR Diff');
    expect(comment).toContain('**2** files changed');
    expect(comment).toContain('`new.yaml`');
    expect(comment).toContain('`old.yaml`');
    expect(comment).toContain('+ added');
    expect(comment).toContain('- removed');
  });

  it('should escape HTML entities in file content', async () => {
    write_manifest(pr_dir, 'inject.yaml', 'data: <script>alert("xss")</script>\n');

    await run_diff();

    const html = readFileSync(output_html, 'utf-8');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should handle empty directories', async () => {
    const result = await run_diff();
    expect(result.exit_code).toBe(0);

    const summary = read_summary();
    expect(summary.total).toBe(0);
  });

  it('should create output directory if it does not exist', async () => {
    write_manifest(pr_dir, 'test.yaml', 'kind: Pod\n');

    const deep_dir = join(tmp_dir, 'deep/nested/dir');
    const deep_html = join(deep_dir, 'report.html');
    const deep_summary = join(deep_dir, 'summary.json');
    const deep_comment = join(deep_dir, 'comment.md');

    const proc = Bun.spawn(
      ['bun', 'run', SCRIPT, base_dir, pr_dir, deep_html, deep_summary, deep_comment],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    await proc.exited;

    expect(proc.exitCode).toBe(0);
    expect(existsSync(deep_html)).toBe(true);
  });

  it('should exit with error when arguments are missing', async () => {
    const proc = Bun.spawn(['bun', 'run', SCRIPT], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    expect(proc.exitCode).toBe(1);
  });
});
