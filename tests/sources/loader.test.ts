import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { load_project } from '../../src/loader/project.js';
import { load_templates_from_sources } from '../../src/sources/loader.js';

/**
 * Initializes a bare-style local git repo with the given file tree and
 * returns its `file://` URL. The repo has a single commit on `main` and
 * a tag `v1.0.0` pointing at that commit, which is enough for the
 * fetcher to clone with `--branch`.
 */
async function init_git_template_repo(
  parent: string,
  name: string,
  files: Record<string, string>,
): Promise<string> {
  const repo_dir = path.join(parent, name);
  await fs.mkdir(repo_dir, { recursive: true });

  // Scrub any GIT_* variables that the parent process may have inherited
  // (e.g. when these tests run inside a `git push` pre-push hook). Leaving
  // GIT_DIR/GIT_WORK_TREE/etc. set would point our `git init` at the
  // outer repository instead of the temp directory.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('GIT_')) {
      env[key] = value;
    }
  }
  env.GIT_AUTHOR_NAME = 'Test';
  env.GIT_AUTHOR_EMAIL = 'test@example.com';
  env.GIT_COMMITTER_NAME = 'Test';
  env.GIT_COMMITTER_EMAIL = 'test@example.com';

  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo_dir, env });

  for (const [rel, contents] of Object.entries(files)) {
    const target = path.join(repo_dir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }

  execFileSync('git', ['add', '.'], { cwd: repo_dir, env });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo_dir, env });
  execFileSync('git', ['tag', 'v1.0.0'], { cwd: repo_dir, env });

  // Allow file:// clones with --depth=1 (modern git refuses by default
  // for local protocol unless we set this config or use the protocol
  // explicitly via `file://` URL — we do both).
  execFileSync('git', ['config', 'uploadpack.allowFilter', 'true'], { cwd: repo_dir, env });

  return `file://${repo_dir}`;
}

const SINGLE_TEMPLATE = `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: nginx
spec:
  kustomizations:
    - name: app
      path: ./app
`;

const MULTI_TEMPLATE_A = `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: redis
spec:
  kustomizations:
    - name: app
      path: ./app
`;

const MULTI_TEMPLATE_B = `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: postgres
spec:
  kustomizations:
    - name: app
      path: ./app
`;

describe('Sources loader (live local git)', () => {
  let work_dir: string;

  beforeEach(async () => {
    work_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-sources-test-'));
  });

  afterEach(async () => {
    await fs.rm(work_dir, { recursive: true, force: true });
  });

  it('loads a single template from a repo with a root template.yaml', async () => {
    const url = await init_git_template_repo(work_dir, 'single-repo', {
      'template.yaml': SINGLE_TEMPLATE,
      'app/kustomization.yaml': 'resources: []\n',
    });

    const cache_dir = path.join(work_dir, '.cache');
    const result = await load_templates_from_sources(
      [
        {
          name: 'single',
          git: { url, ref: { tag: 'v1.0.0' } },
        },
      ],
      { cache_dir },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.templates).toHaveLength(1);
    expect(result.value.templates[0]?.template.metadata.name).toBe('nginx');
    expect(result.value.templates[0]?.source_name).toBe('single');
  });

  it('loads multiple templates from a repo with one template per subdirectory', async () => {
    const url = await init_git_template_repo(work_dir, 'multi-repo', {
      'redis/template.yaml': MULTI_TEMPLATE_A,
      'redis/app/kustomization.yaml': 'resources: []\n',
      'postgres/template.yaml': MULTI_TEMPLATE_B,
      'postgres/app/kustomization.yaml': 'resources: []\n',
    });

    const cache_dir = path.join(work_dir, '.cache');
    const result = await load_templates_from_sources(
      [
        {
          name: 'multi',
          git: { url, ref: { tag: 'v1.0.0' } },
        },
      ],
      { cache_dir },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const names = result.value.templates.map((t) => t.template.metadata.name).sort();
    expect(names).toEqual(['postgres', 'redis']);
  });

  it('honours the path option to scope into a sub-directory', async () => {
    const url = await init_git_template_repo(work_dir, 'scoped-repo', {
      'docs/README.md': '# unrelated\n',
      'pkg/redis/template.yaml': MULTI_TEMPLATE_A,
      'pkg/redis/app/kustomization.yaml': 'resources: []\n',
      'pkg/postgres/template.yaml': MULTI_TEMPLATE_B,
      'pkg/postgres/app/kustomization.yaml': 'resources: []\n',
    });

    const cache_dir = path.join(work_dir, '.cache');
    const result = await load_templates_from_sources(
      [
        {
          name: 'scoped',
          git: { url, ref: { tag: 'v1.0.0' }, path: 'pkg' },
        },
      ],
      { cache_dir },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const names = result.value.templates.map((t) => t.template.metadata.name).sort();
    expect(names).toEqual(['postgres', 'redis']);
  });

  it('integrates external templates into load_project alongside local ones', async () => {
    const url = await init_git_template_repo(work_dir, 'integ-repo', {
      'template.yaml': SINGLE_TEMPLATE,
      'app/kustomization.yaml': 'resources: []\n',
    });

    const project_root = path.join(work_dir, 'project');
    await fs.mkdir(project_root, { recursive: true });

    // Local template
    const local_template_dir = path.join(project_root, 'templates', 'local-app');
    await fs.mkdir(local_template_dir, { recursive: true });
    await fs.writeFile(
      path.join(local_template_dir, 'template.yaml'),
      `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: local-app
spec:
  kustomizations:
    - name: app
      path: ./app
`,
    );

    // kustodian.yaml referencing the local repo as a source
    await fs.writeFile(
      path.join(project_root, 'kustodian.yaml'),
      `apiVersion: kustodian.io/v1
kind: Project
metadata:
  name: integ
spec:
  template_sources:
    - name: integ-source
      git:
        url: ${url}
        ref:
          tag: v1.0.0
`,
    );

    const result = await load_project(project_root, {
      fetch_sources: true,
      cache_dir: path.join(work_dir, '.cache'),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const names = result.value.templates.map((t) => t.template.metadata.name).sort();
    expect(names).toEqual(['local-app', 'nginx']);

    const sourced = result.value.templates.find((t) => t.source_name === 'integ-source');
    expect(sourced?.template.metadata.name).toBe('nginx');
    expect(result.value.resolved_sources).toHaveLength(1);
    expect(result.value.resolved_sources?.[0]?.name).toBe('integ-source');
  });

  it('flags conflicts when a sourced template name shadows a local template', async () => {
    const url = await init_git_template_repo(work_dir, 'clash-repo', {
      'template.yaml': SINGLE_TEMPLATE,
      'app/kustomization.yaml': 'resources: []\n',
    });

    const project_root = path.join(work_dir, 'project');
    await fs.mkdir(path.join(project_root, 'templates', 'nginx'), { recursive: true });
    await fs.writeFile(
      path.join(project_root, 'templates', 'nginx', 'template.yaml'),
      SINGLE_TEMPLATE,
    );
    await fs.writeFile(
      path.join(project_root, 'kustodian.yaml'),
      `apiVersion: kustodian.io/v1
kind: Project
metadata:
  name: clash
spec:
  template_sources:
    - name: clash-source
      git:
        url: ${url}
        ref:
          tag: v1.0.0
`,
    );

    const result = await load_project(project_root, {
      fetch_sources: true,
      cache_dir: path.join(work_dir, '.cache'),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('nginx');
    }
  });

  it('skips source fetching when fetch_sources is false', async () => {
    const project_root = path.join(work_dir, 'project');
    await fs.mkdir(project_root, { recursive: true });
    await fs.writeFile(
      path.join(project_root, 'kustodian.yaml'),
      `apiVersion: kustodian.io/v1
kind: Project
metadata:
  name: noop
spec:
  template_sources:
    - name: should-not-fetch
      git:
        url: file:///nonexistent-path-that-would-fail
        ref:
          tag: v1.0.0
`,
    );

    const result = await load_project(project_root);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.templates).toEqual([]);
    expect(result.value.resolved_sources).toBeUndefined();
  });
});
