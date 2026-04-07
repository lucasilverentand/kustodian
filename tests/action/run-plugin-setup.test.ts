import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dir, '../../action/kustodian-pr-diff/run-plugin-setup.ts');

let tmp_dir: string;

function write_package(dir: string, pkg: Record<string, unknown>) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
}

function write_setup_script(dir: string, script_name: string, content: string) {
  writeFileSync(join(dir, script_name), content);
}

async function run_plugin_setup(project_path: string) {
  const proc = Bun.spawn(['bun', 'run', SCRIPT, project_path], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      // Skip global node_modules discovery to avoid running real ci-setup scripts
      KUSTODIAN_SKIP_GLOBAL: '1',
    },
  });
  await proc.exited;
  return {
    exit_code: proc.exitCode,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  };
}

beforeEach(() => {
  tmp_dir = join(import.meta.dir, `../../.tmp-test-plugin-${Date.now()}`);
  mkdirSync(tmp_dir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmp_dir)) {
    rmSync(tmp_dir, { recursive: true });
  }
});

describe('run-plugin-setup', () => {
  it('should report no plugins when node_modules is empty', async () => {
    const project = join(tmp_dir, 'project');
    mkdirSync(project, { recursive: true });

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('No plugin CI setup scripts found');
  });

  it('should report no plugins when no matching packages exist', async () => {
    const project = join(tmp_dir, 'project');
    const node_modules = join(project, 'node_modules');
    write_package(join(node_modules, 'some-other-package'), {
      name: 'some-other-package',
      version: '1.0.0',
    });

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('No plugin CI setup scripts found');
  });

  it('should skip plugins without ci.setup field', async () => {
    const project = join(tmp_dir, 'project');
    const node_modules = join(project, 'node_modules');
    write_package(join(node_modules, 'kustodian-sops'), {
      name: 'kustodian-sops',
      version: '1.0.0',
    });

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('No plugin CI setup scripts found');
  });

  it('should run ci.setup script from a plugin', async () => {
    const project = join(tmp_dir, 'project');
    const pkg_dir = join(project, 'node_modules', 'kustodian-sops');
    write_package(pkg_dir, {
      name: 'kustodian-sops',
      version: '1.0.0',
      kustodian: { ci: { setup: 'ci-setup.sh' } },
    });
    write_setup_script(pkg_dir, 'ci-setup.sh', '#!/bin/bash\necho "sops setup done"');

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('Running CI setup for kustodian-sops');
    expect(result.stdout).toContain('Completed 1 plugin setup script');
  });

  it('should discover kustodian-plugin- prefixed packages', async () => {
    const project = join(tmp_dir, 'project');
    const pkg_dir = join(project, 'node_modules', 'kustodian-plugin-helm');
    write_package(pkg_dir, {
      name: 'kustodian-plugin-helm',
      version: '1.0.0',
      kustodian: { ci: { setup: 'setup.sh' } },
    });
    write_setup_script(pkg_dir, 'setup.sh', '#!/bin/bash\necho "helm plugin ready"');

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('Running CI setup for kustodian-plugin-helm');
  });

  it('should discover @kustodian/plugin- scoped packages', async () => {
    const project = join(tmp_dir, 'project');
    const pkg_dir = join(project, 'node_modules', '@kustodian', 'plugin-vault');
    write_package(pkg_dir, {
      name: '@kustodian/plugin-vault',
      version: '1.0.0',
      kustodian: { ci: { setup: 'install.sh' } },
    });
    write_setup_script(pkg_dir, 'install.sh', '#!/bin/bash\necho "vault ready"');

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('Running CI setup for @kustodian/plugin-vault');
  });

  it('should run multiple plugin setup scripts', async () => {
    const project = join(tmp_dir, 'project');
    const nm = join(project, 'node_modules');

    const pkg1 = join(nm, 'kustodian-sops');
    write_package(pkg1, {
      name: 'kustodian-sops',
      version: '1.0.0',
      kustodian: { ci: { setup: 'ci.sh' } },
    });
    write_setup_script(pkg1, 'ci.sh', '#!/bin/bash\necho "sops ok"');

    const pkg2 = join(nm, 'kustodian-plugin-helm');
    write_package(pkg2, {
      name: 'kustodian-plugin-helm',
      version: '1.0.0',
      kustodian: { ci: { setup: 'ci.sh' } },
    });
    write_setup_script(pkg2, 'ci.sh', '#!/bin/bash\necho "helm ok"');

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('Completed 2 plugin setup scripts');
  });

  it('should warn when declared setup script does not exist', async () => {
    const project = join(tmp_dir, 'project');
    const pkg_dir = join(project, 'node_modules', 'kustodian-missing');
    write_package(pkg_dir, {
      name: 'kustodian-missing',
      version: '1.0.0',
      kustodian: { ci: { setup: 'nonexistent.sh' } },
    });

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    expect(result.stderr).toContain('Warning: CI setup script not found');
  });

  it('should exit with error when setup script fails', async () => {
    const project = join(tmp_dir, 'project');
    const pkg_dir = join(project, 'node_modules', 'kustodian-broken');
    write_package(pkg_dir, {
      name: 'kustodian-broken',
      version: '1.0.0',
      kustodian: { ci: { setup: 'fail.sh' } },
    });
    write_setup_script(pkg_dir, 'fail.sh', '#!/bin/bash\nexit 1');

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(1);
    expect(result.stderr).toContain('CI setup failed for kustodian-broken');
  });

  it('should not run duplicate packages', async () => {
    const project = join(tmp_dir, 'project');
    const pkg_dir = join(project, 'node_modules', 'kustodian-dedup');

    // Write a script that appends to a counter file to detect double execution
    const counter_file = join(tmp_dir, 'counter');
    writeFileSync(counter_file, '');

    write_package(pkg_dir, {
      name: 'kustodian-dedup',
      version: '1.0.0',
      kustodian: { ci: { setup: 'count.sh' } },
    });
    write_setup_script(pkg_dir, 'count.sh', `#!/bin/bash\necho "x" >> "${counter_file}"`);

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    // The script should only run once even though it's discovered once
    expect(result.stdout).toContain('Completed 1 plugin setup script');
  });

  it('should detect kustodian core package with ci.setup', async () => {
    const project = join(tmp_dir, 'project');
    const pkg_dir = join(project, 'node_modules', 'kustodian');
    write_package(pkg_dir, {
      name: 'kustodian',
      version: '1.0.0',
      kustodian: { ci: { setup: 'core-setup.sh' } },
    });
    write_setup_script(pkg_dir, 'core-setup.sh', '#!/bin/bash\necho "core setup"');

    const result = await run_plugin_setup(project);

    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('Running CI setup for kustodian');
  });
});
