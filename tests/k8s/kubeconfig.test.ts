import { describe, expect, it } from 'bun:test';
import * as os from 'node:os';
import * as path from 'node:path';

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
});
