import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { is_success } from '../../src/core/index.js';
import { create_plugin_loader } from '../../src/plugins/loader.js';

/**
 * Creates a minimal fake plugin package in the given node_modules directory.
 */
function create_fake_plugin(node_modules: string, name: string) {
  const pkg_dir = path.join(node_modules, name);
  fs.mkdirSync(pkg_dir, { recursive: true });
  fs.mkdirSync(path.join(pkg_dir, 'dist'), { recursive: true });

  fs.writeFileSync(
    path.join(pkg_dir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      main: './dist/index.js',
      exports: { '.': { import: './dist/index.js' } },
    }),
  );

  // Write a minimal plugin module
  fs.writeFileSync(
    path.join(pkg_dir, 'dist/index.js'),
    `
export const plugin = {
  manifest: {
    name: '${name}',
    version: '1.0.0',
    description: 'Test plugin',
    capabilities: ['providers'],
  },
  get_providers() {
    return [{ name: 'test', factory: (opts) => ({ name: 'test' }) }];
  },
};
export default plugin;
`,
  );
}

describe('Plugin Loader', () => {
  let tmp_dir: string;

  beforeEach(() => {
    tmp_dir = fs.mkdtempSync(path.join(tmpdir(), 'kustodian-loader-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp_dir, { recursive: true, force: true });
  });

  describe('discover', () => {
    it('should find plugins in local directories', async () => {
      const plugins_dir = path.join(tmp_dir, 'plugins');
      const plugin_dir = path.join(plugins_dir, 'my-plugin');
      fs.mkdirSync(plugin_dir, { recursive: true });
      fs.writeFileSync(
        path.join(plugin_dir, 'package.json'),
        JSON.stringify({ name: 'my-plugin', version: '1.0.0' }),
      );

      const loader = create_plugin_loader({
        local_plugin_dirs: [plugins_dir],
        search_node_modules: false,
      });

      const result = await loader.discover();
      expect(result.success).toBe(true);
      if (!is_success(result)) return;

      expect(result.value.length).toBe(1);
      expect(result.value[0].source).toBe('local');
      expect(result.value[0].resolved_path).toBe(plugin_dir);
    });

    it('should find kustodian-* plugins in node_modules', async () => {
      const node_modules = path.join(tmp_dir, 'node_modules');
      fs.mkdirSync(node_modules, { recursive: true });
      create_fake_plugin(node_modules, 'kustodian-k0s');
      create_fake_plugin(node_modules, 'unrelated-package');

      const loader = create_plugin_loader({
        local_plugin_dirs: [],
        search_node_modules: true,
        npm_prefixes: ['kustodian-', '@kustodian/plugin-', 'kustodian-plugin-'],
      });

      // Override CWD to point to our tmp dir
      const original_cwd = process.cwd();
      process.chdir(tmp_dir);
      try {
        const result = await loader.discover();
        expect(result.success).toBe(true);
        if (!is_success(result)) return;

        const names = result.value.map((l) => l.module_path);
        expect(names).toContain('kustodian-k0s');
        expect(names).not.toContain('unrelated-package');
      } finally {
        process.chdir(original_cwd);
      }
    });

    it('should find scoped @kustodian/plugin-* packages', async () => {
      const node_modules = path.join(tmp_dir, 'node_modules');
      const scoped_dir = path.join(node_modules, '@kustodian', 'plugin-auth');
      fs.mkdirSync(scoped_dir, { recursive: true });
      fs.writeFileSync(
        path.join(scoped_dir, 'package.json'),
        JSON.stringify({
          name: '@kustodian/plugin-auth',
          version: '1.0.0',
        }),
      );

      const loader = create_plugin_loader({
        local_plugin_dirs: [],
        search_node_modules: true,
      });

      const original_cwd = process.cwd();
      process.chdir(tmp_dir);
      try {
        const result = await loader.discover();
        expect(result.success).toBe(true);
        if (!is_success(result)) return;

        const names = result.value.map((l) => l.module_path);
        expect(names).toContain('@kustodian/plugin-auth');
      } finally {
        process.chdir(original_cwd);
      }
    });

    it('should return empty when no plugins exist', async () => {
      const loader = create_plugin_loader({
        local_plugin_dirs: [path.join(tmp_dir, 'nonexistent')],
        search_node_modules: false,
      });

      const result = await loader.discover();
      expect(result.success).toBe(true);
      if (!is_success(result)) return;
      expect(result.value.length).toBe(0);
    });
  });

  describe('load_from_path', () => {
    it('should load a plugin with providers from a path', async () => {
      const node_modules = path.join(tmp_dir, 'node_modules');
      create_fake_plugin(node_modules, 'kustodian-test');

      const loader = create_plugin_loader({
        local_plugin_dirs: [],
        search_node_modules: false,
      });

      const result = await loader.load_from_path(path.join(node_modules, 'kustodian-test'));
      expect(result.success).toBe(true);
      if (!is_success(result)) return;

      expect(result.value.plugin.manifest.name).toBe('kustodian-test');
      expect(result.value.plugin.manifest.capabilities).toContain('providers');
      expect(result.value.plugin.get_providers).toBeDefined();
      expect(result.value.plugin.get_providers?.().length).toBe(1);
      expect(result.value.plugin.get_providers?.()[0].name).toBe('test');
    });

    it('should fail for nonexistent path', async () => {
      const loader = create_plugin_loader({
        local_plugin_dirs: [],
        search_node_modules: false,
      });

      const result = await loader.load_from_path(path.join(tmp_dir, 'nonexistent'));
      expect(result.success).toBe(false);
    });
  });

  describe('load_all', () => {
    it('should load multiple plugins by name', async () => {
      const node_modules = path.join(tmp_dir, 'node_modules');
      create_fake_plugin(node_modules, 'kustodian-a');
      create_fake_plugin(node_modules, 'kustodian-b');

      const loader = create_plugin_loader({
        local_plugin_dirs: [],
        search_node_modules: true,
      });

      const original_cwd = process.cwd();
      process.chdir(tmp_dir);
      try {
        const result = await loader.load_all(['kustodian-a', 'kustodian-b']);
        expect(result.success).toBe(true);
        if (!is_success(result)) return;
        expect(result.value.length).toBe(2);
      } finally {
        process.chdir(original_cwd);
      }
    });
  });
});
