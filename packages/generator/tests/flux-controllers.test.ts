import { describe, expect, it } from 'bun:test';

import type { FluxConfigType } from '@kustodian/schema';

import { generate_flux_controller_patches } from '../src/flux.js';

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

      const kustomize_patch = result?.find(
        (p) => p.target.name === 'kustomize-controller',
      );
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
  });
});
