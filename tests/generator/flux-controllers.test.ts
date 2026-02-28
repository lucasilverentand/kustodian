import { describe, expect, it } from 'bun:test';

import type { FluxConfigType } from '../../src/schema/index.js';

import { generate_flux_controller_patches } from '../../src/generator/flux.js';

describe('Flux Controller Patches', () => {
  describe('generate_flux_controller_patches', () => {
    it('should return undefined when no controllers config', () => {
      const flux_config: FluxConfigType = {};

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeUndefined();
    });

    it('should return undefined when controllers config is empty', () => {
      const flux_config: FluxConfigType = {
        controllers: {},
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeUndefined();
    });

    it('should generate patches for global concurrent setting', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          concurrent: 20,
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      expect(result).toHaveLength(3);

      const controller_names = result?.map((p) => p.target.name);
      expect(controller_names).toContain('kustomize-controller');
      expect(controller_names).toContain('helm-controller');
      expect(controller_names).toContain('source-controller');

      for (const patch of result ?? []) {
        expect(patch.patch).toContain('--concurrent=20');
      }
    });

    it('should generate patches for global requeue_dependency setting', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          requeue_dependency: '5s',
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      expect(result).toHaveLength(3);

      for (const patch of result ?? []) {
        expect(patch.patch).toContain('--requeue-dependency=5s');
      }
    });

    it('should generate patches with both global settings', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          concurrent: 10,
          requeue_dependency: '3s',
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      for (const patch of result ?? []) {
        expect(patch.patch).toContain('--concurrent=10');
        expect(patch.patch).toContain('--requeue-dependency=3s');
      }
    });

    it('should allow per-controller overrides', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          concurrent: 10,
          kustomize_controller: {
            concurrent: 30,
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      const kustomize_patch = result?.find((p) => p.target.name === 'kustomize-controller');
      const helm_patch = result?.find((p) => p.target.name === 'helm-controller');

      expect(kustomize_patch?.patch).toContain('--concurrent=30');
      expect(helm_patch?.patch).toContain('--concurrent=10');
    });

    it('should only generate patches for controllers with settings', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          kustomize_controller: {
            concurrent: 25,
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result?.[0]?.target.name).toBe('kustomize-controller');
      expect(result?.[0]?.patch).toContain('--concurrent=25');
    });

    it('should generate valid JSON patch operations', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          concurrent: 15,
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      for (const patch of result ?? []) {
        const ops = JSON.parse(patch.patch);
        expect(Array.isArray(ops)).toBe(true);
        expect(ops.length).toBeGreaterThan(0);

        for (const op of ops) {
          expect(op.op).toBe('add');
          expect(op.path).toBe('/spec/template/spec/containers/0/args/-');
          expect(typeof op.value).toBe('string');
        }
      }
    });

    it('should generate patches for global max_retry_delay setting', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          max_retry_delay: '5m',
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      expect(result).toHaveLength(3);

      for (const patch of result ?? []) {
        expect(patch.patch).toContain('--max-retry-delay=5m');
      }
    });

    it('should generate patches for per-controller max_retry_delay', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          max_retry_delay: '10m',
          kustomize_controller: {
            max_retry_delay: '5m',
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      const kustomize_patch = result?.find((p) => p.target.name === 'kustomize-controller');
      const helm_patch = result?.find((p) => p.target.name === 'helm-controller');

      expect(kustomize_patch?.patch).toContain('--max-retry-delay=5m');
      expect(helm_patch?.patch).toContain('--max-retry-delay=10m');
    });

    it('should generate --no-remote-bases=true only for kustomize-controller', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          kustomize_controller: {
            no_remote_bases: true,
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result?.[0]?.target.name).toBe('kustomize-controller');
      expect(result?.[0]?.patch).toContain('--no-remote-bases=true');
    });

    it('should not generate --no-remote-bases for helm or source controllers', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          concurrent: 10,
          kustomize_controller: {
            no_remote_bases: true,
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      const helm_patch = result?.find((p) => p.target.name === 'helm-controller');
      const source_patch = result?.find((p) => p.target.name === 'source-controller');

      expect(helm_patch?.patch).not.toContain('--no-remote-bases');
      expect(source_patch?.patch).not.toContain('--no-remote-bases');
    });

    it('should generate combined flags (concurrent + requeue_dependency + max_retry_delay)', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          concurrent: 10,
          requeue_dependency: '5s',
          max_retry_delay: '15m',
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      for (const patch of result ?? []) {
        expect(patch.patch).toContain('--concurrent=10');
        expect(patch.patch).toContain('--requeue-dependency=5s');
        expect(patch.patch).toContain('--max-retry-delay=15m');
      }
    });

    it('should target Deployment kind', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          concurrent: 5,
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      for (const patch of result ?? []) {
        expect(patch.target.kind).toBe('Deployment');
      }
    });

    it('should generate --feature-gates arg from global feature_gates', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          feature_gates: {
            CancelHealthCheckOnNewRevision: true,
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      expect(result).toHaveLength(3);

      for (const patch of result ?? []) {
        expect(patch.patch).toContain('--feature-gates=CancelHealthCheckOnNewRevision=true');
      }
    });

    it('should merge per-controller feature_gates with global (per-controller wins)', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          feature_gates: {
            CancelHealthCheckOnNewRevision: true,
            OOMWatch: false,
          },
          kustomize_controller: {
            feature_gates: {
              OOMWatch: true,
            },
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      const kustomize_patch = result?.find((p) => p.target.name === 'kustomize-controller');
      const helm_patch = result?.find((p) => p.target.name === 'helm-controller');

      // kustomize-controller: OOMWatch overridden to true
      expect(kustomize_patch?.patch).toContain('CancelHealthCheckOnNewRevision=true');
      expect(kustomize_patch?.patch).toContain('OOMWatch=true');

      // helm-controller: inherits global OOMWatch=false
      expect(helm_patch?.patch).toContain('OOMWatch=false');
    });

    it('should generate resources JSON patch op', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          resources: {
            limits: { cpu: '1000m', memory: '1Gi' },
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      expect(result).toHaveLength(3);

      for (const patch of result ?? []) {
        const ops = JSON.parse(patch.patch);
        const resources_op = ops.find(
          (op: { path: string }) => op.path === '/spec/template/spec/containers/0/resources',
        );
        expect(resources_op).toBeDefined();
        expect(resources_op.op).toBe('add');
        expect(resources_op.value).toEqual({
          limits: { cpu: '1000m', memory: '1Gi' },
        });
      }
    });

    it('should allow per-controller resources to replace global entirely', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          resources: {
            limits: { cpu: '1000m', memory: '1Gi' },
          },
          kustomize_controller: {
            resources: {
              limits: { cpu: '2000m', memory: '2Gi' },
            },
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      const kustomize_patch = result?.find((p) => p.target.name === 'kustomize-controller');
      const helm_patch = result?.find((p) => p.target.name === 'helm-controller');

      const kustomize_ops = JSON.parse(kustomize_patch?.patch);
      const kustomize_resources = kustomize_ops.find(
        (op: { path: string }) => op.path === '/spec/template/spec/containers/0/resources',
      );
      expect(kustomize_resources.value).toEqual({
        limits: { cpu: '2000m', memory: '2Gi' },
      });

      const helm_ops = JSON.parse(helm_patch?.patch);
      const helm_resources = helm_ops.find(
        (op: { path: string }) => op.path === '/spec/template/spec/containers/0/resources',
      );
      expect(helm_resources.value).toEqual({
        limits: { cpu: '1000m', memory: '1Gi' },
      });
    });

    it('should generate tmpfs strategic merge patch', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          tmpfs: true,
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      // 3 tmpfs patches (one per controller), no JSON patches since no args/resources
      expect(result).toHaveLength(3);

      for (const patch of result ?? []) {
        expect(patch.target.kind).toBe('Deployment');
        // tmpfs patches are YAML, not JSON arrays
        expect(patch.patch).toContain('medium: Memory');
        expect(patch.patch).toContain('mountPath: /tmp');
        expect(patch.patch).toContain('name: tmp');
        expect(patch.patch).toContain('name: manager');
      }
    });

    it('should only generate tmpfs for controllers that have it enabled', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          kustomize_controller: {
            tmpfs: true,
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result?.[0]?.target.name).toBe('kustomize-controller');
      expect(result?.[0]?.patch).toContain('medium: Memory');
    });

    it('should allow per-controller tmpfs to override global', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          tmpfs: true,
          helm_controller: {
            tmpfs: false,
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      const tmpfs_targets = result?.map((p) => p.target.name);
      expect(tmpfs_targets).toContain('kustomize-controller');
      expect(tmpfs_targets).toContain('source-controller');
      expect(tmpfs_targets).not.toContain('helm-controller');
    });

    it('should generate separate JSON patch and tmpfs patch entries for same controller', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          concurrent: 10,
          tmpfs: true,
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();
      // 3 JSON patches + 3 tmpfs patches = 6
      expect(result).toHaveLength(6);

      const kustomize_patches = result?.filter((p) => p.target.name === 'kustomize-controller');
      expect(kustomize_patches).toHaveLength(2);

      // One is JSON patch (args)
      const json_patch = kustomize_patches?.find((p) => p.patch.startsWith('['));
      expect(json_patch?.patch).toContain('--concurrent=10');

      // One is strategic merge patch (tmpfs)
      const tmpfs_patch = kustomize_patches?.find((p) => !p.patch.startsWith('['));
      expect(tmpfs_patch?.patch).toContain('medium: Memory');
    });

    it('should generate combined: all flags + resources + feature_gates + tmpfs', () => {
      const flux_config: FluxConfigType = {
        controllers: {
          concurrent: 20,
          requeue_dependency: '5s',
          max_retry_delay: '5m',
          feature_gates: {
            CancelHealthCheckOnNewRevision: true,
          },
          tmpfs: true,
          resources: {
            limits: { cpu: '1000m', memory: '1Gi' },
          },
          kustomize_controller: {
            no_remote_bases: true,
            resources: {
              limits: { cpu: '2000m', memory: '2Gi' },
            },
          },
          source_controller: {
            concurrent: 5,
          },
        },
      };

      const result = generate_flux_controller_patches(flux_config);

      expect(result).toBeDefined();

      // kustomize-controller: JSON patch + tmpfs = 2 entries
      const kustomize_patches = result?.filter((p) => p.target.name === 'kustomize-controller');
      expect(kustomize_patches).toHaveLength(2);
      const kustomize_json = kustomize_patches?.find((p) => p.patch.startsWith('['));
      expect(kustomize_json?.patch).toContain('--concurrent=20');
      expect(kustomize_json?.patch).toContain('--no-remote-bases=true');
      expect(kustomize_json?.patch).toContain(
        '--feature-gates=CancelHealthCheckOnNewRevision=true',
      );
      const kustomize_ops = JSON.parse(kustomize_json?.patch);
      const kustomize_resources = kustomize_ops.find(
        (op: { path: string }) => op.path === '/spec/template/spec/containers/0/resources',
      );
      expect(kustomize_resources.value).toEqual({
        limits: { cpu: '2000m', memory: '2Gi' },
      });

      // source-controller: concurrent=5 (override), JSON patch + tmpfs = 2 entries
      const source_patches = result?.filter((p) => p.target.name === 'source-controller');
      expect(source_patches).toHaveLength(2);
      const source_json = source_patches?.find((p) => p.patch.startsWith('['));
      expect(source_json?.patch).toContain('--concurrent=5');
      expect(source_json?.patch).toContain('--requeue-dependency=5s');

      // helm-controller: inherits global, JSON patch + tmpfs = 2 entries
      const helm_patches = result?.filter((p) => p.target.name === 'helm-controller');
      expect(helm_patches).toHaveLength(2);
      const helm_json = helm_patches?.find((p) => p.patch.startsWith('['));
      expect(helm_json?.patch).toContain('--concurrent=20');
    });
  });
});
