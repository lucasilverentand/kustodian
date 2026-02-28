import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import YAML from 'yaml';

import { create_kubeconfig_manager } from '../../src/k8s/kubeconfig.js';

describe('KubeconfigManager', () => {
  describe('create_kubeconfig_manager', () => {
    it('should create a manager', () => {
      const manager = create_kubeconfig_manager();

      expect(manager).toBeDefined();
      expect(manager.get_default_path).toBeDefined();
      expect(manager.get_current_context).toBeDefined();
      expect(manager.set_context).toBeDefined();
      expect(manager.list_contexts).toBeDefined();
      expect(manager.exists).toBeDefined();
      expect(manager.merge).toBeDefined();
    });
  });

  describe('get_default_path', () => {
    it('should return default kubeconfig path', () => {
      const manager = create_kubeconfig_manager();
      const default_path = manager.get_default_path();

      // Should be in home directory
      expect(default_path).toContain(os.homedir());
      expect(default_path).toContain('.kube');
      expect(default_path).toContain('config');
    });

    it('should use KUBECONFIG env if set', () => {
      const original = process.env['KUBECONFIG'];
      process.env['KUBECONFIG'] = '/custom/path/kubeconfig';

      const manager = create_kubeconfig_manager();
      const default_path = manager.get_default_path();

      expect(default_path).toBe('/custom/path/kubeconfig');

      // Restore original
      if (original) {
        process.env['KUBECONFIG'] = original;
      } else {
        delete process.env['KUBECONFIG'];
      }
    });

    it('should handle multiple paths in KUBECONFIG', () => {
      const original = process.env['KUBECONFIG'];
      process.env['KUBECONFIG'] = `/first/path${path.delimiter}/second/path`;

      const manager = create_kubeconfig_manager();
      const default_path = manager.get_default_path();

      expect(default_path).toBe('/first/path');

      // Restore original
      if (original) {
        process.env['KUBECONFIG'] = original;
      } else {
        delete process.env['KUBECONFIG'];
      }
    });
  });

  describe('exists', () => {
    it('should return false for non-existent path', async () => {
      const manager = create_kubeconfig_manager();
      const exists = await manager.exists('/nonexistent/path/kubeconfig');

      expect(exists).toBe(false);
    });
  });

  describe('rename_entries', () => {
    it('should rename all entries to cluster-scoped names', async () => {
      const manager = create_kubeconfig_manager();
      const tmp_path = path.join(os.tmpdir(), `kubeconfig-test-${Date.now()}.yaml`);

      const kubeconfig = YAML.stringify({
        apiVersion: 'v1',
        kind: 'Config',
        clusters: [{ name: 'k0s-cluster', cluster: { server: 'https://10.0.0.1:6443' } }],
        users: [{ name: 'admin', user: { 'client-certificate-data': 'abc' } }],
        contexts: [
          {
            name: 'k0s-cluster',
            context: { cluster: 'k0s-cluster', user: 'admin' },
          },
        ],
        'current-context': 'k0s-cluster',
      });

      await fs.writeFile(tmp_path, kubeconfig, 'utf-8');

      try {
        const result = await manager.rename_entries(tmp_path, 'my-cluster');
        expect(result.success).toBe(true);

        const content = await fs.readFile(tmp_path, 'utf-8');
        const config = YAML.parse(content);

        expect(config.clusters[0].name).toBe('my-cluster');
        expect(config.users[0].name).toBe('my-cluster-admin');
        expect(config.contexts[0].name).toBe('my-cluster');
        expect(config.contexts[0].context.cluster).toBe('my-cluster');
        expect(config.contexts[0].context.user).toBe('my-cluster-admin');
        expect(config['current-context']).toBe('my-cluster');
      } finally {
        await fs.unlink(tmp_path).catch(() => undefined);
      }
    });

    it('should fail for non-existent file', async () => {
      const manager = create_kubeconfig_manager();
      const result = await manager.rename_entries('/nonexistent/kubeconfig.yaml', 'test');
      expect(result.success).toBe(false);
    });
  });
});
