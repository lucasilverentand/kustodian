import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  get_extension,
  serialize_resource,
  serialize_resources,
  write_file,
  write_flux_kustomization,
  write_generation_result,
} from '../src/output.js';
import type { FluxKustomizationType, GenerationResultType } from '../src/types.js';

describe('Output Module', () => {
  describe('serialize_resource', () => {
    it('should serialize to YAML by default', () => {
      // Arrange
      const resource = { name: 'test', value: 42 };

      // Act
      const result = serialize_resource(resource);

      // Assert
      expect(result).toContain('name: test');
      expect(result).toContain('value: 42');
    });

    it('should serialize to JSON when specified', () => {
      // Arrange
      const resource = { name: 'test', value: 42 };

      // Act
      const result = serialize_resource(resource, 'json');

      // Assert
      expect(JSON.parse(result)).toEqual(resource);
    });
  });

  describe('serialize_resources', () => {
    it('should serialize multiple resources with YAML document separators', () => {
      // Arrange
      const resources = [{ name: 'first' }, { name: 'second' }];

      // Act
      const result = serialize_resources(resources, 'yaml');

      // Assert
      expect(result).toContain('name: first');
      expect(result).toContain('---');
      expect(result).toContain('name: second');
    });

    it('should serialize as JSON array when specified', () => {
      // Arrange
      const resources = [{ name: 'first' }, { name: 'second' }];

      // Act
      const result = serialize_resources(resources, 'json');

      // Assert
      expect(JSON.parse(result)).toEqual(resources);
    });
  });

  describe('get_extension', () => {
    it('should return yaml for yaml format', () => {
      expect(get_extension('yaml')).toBe('yaml');
    });

    it('should return json for json format', () => {
      expect(get_extension('json')).toBe('json');
    });
  });

  describe('write_file', () => {
    let temp_dir: string;

    beforeEach(async () => {
      temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-test-'));
    });

    afterEach(async () => {
      await fs.rm(temp_dir, { recursive: true, force: true });
    });

    it('should write content to file', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'test.txt');
      const content = 'Hello, World!';

      // Act
      const result = await write_file(file_path, content);

      // Assert
      expect(result.success).toBe(true);
      const written = await fs.readFile(file_path, 'utf-8');
      expect(written).toBe(content);
    });

    it('should create directories when create_dirs is true', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'nested', 'dir', 'test.txt');
      const content = 'nested content';

      // Act
      const result = await write_file(file_path, content, { create_dirs: true });

      // Assert
      expect(result.success).toBe(true);
      const written = await fs.readFile(file_path, 'utf-8');
      expect(written).toBe(content);
    });

    it('should fail when directory does not exist and create_dirs is false', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'nonexistent', 'test.txt');

      // Act
      const result = await write_file(file_path, 'content', { create_dirs: false });

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('write_flux_kustomization', () => {
    let temp_dir: string;

    beforeEach(async () => {
      temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-test-'));
    });

    afterEach(async () => {
      await fs.rm(temp_dir, { recursive: true, force: true });
    });

    it('should write flux kustomization as YAML', async () => {
      // Arrange
      const kustomization: FluxKustomizationType = {
        apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
        kind: 'Kustomization',
        metadata: {
          name: 'test-deployment',
          namespace: 'flux-system',
        },
        spec: {
          interval: '10m',
          path: './templates/test',
          prune: true,
          wait: true,
          sourceRef: {
            kind: 'GitRepository',
            name: 'flux-system',
          },
        },
      };

      // Act
      const result = await write_flux_kustomization(kustomization, temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(path.join(temp_dir, 'test-deployment.yaml'));
        const content = await fs.readFile(result.value, 'utf-8');
        expect(content).toContain('name: test-deployment');
        expect(content).toContain('apiVersion: kustomize.toolkit.fluxcd.io/v1');
      }
    });

    it('should write flux kustomization as JSON when specified', async () => {
      // Arrange
      const kustomization: FluxKustomizationType = {
        apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
        kind: 'Kustomization',
        metadata: {
          name: 'test-json',
          namespace: 'flux-system',
        },
        spec: {
          interval: '10m',
          path: './test',
          prune: true,
          wait: true,
          sourceRef: {
            kind: 'GitRepository',
            name: 'flux-system',
          },
        },
      };

      // Act
      const result = await write_flux_kustomization(kustomization, temp_dir, { format: 'json' });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(path.join(temp_dir, 'test-json.json'));
        const content = await fs.readFile(result.value, 'utf-8');
        const parsed = JSON.parse(content);
        expect(parsed.metadata.name).toBe('test-json');
      }
    });
  });

  describe('write_generation_result', () => {
    let temp_dir: string;

    beforeEach(async () => {
      temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-test-'));
    });

    afterEach(async () => {
      await fs.rm(temp_dir, { recursive: true, force: true });
    });

    it('should write kustomizations to structured directory layout', async () => {
      // Arrange
      const generation_result: GenerationResultType = {
        cluster: 'production',
        output_dir: temp_dir,
        kustomizations: [
          {
            name: 'secrets-doppler',
            template: '001-secrets',
            path: './templates/001-secrets/doppler',
            flux_kustomization: {
              apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
              kind: 'Kustomization',
              metadata: {
                name: 'secrets-doppler',
                namespace: 'flux-system',
              },
              spec: {
                interval: '10m',
                path: './templates/001-secrets/doppler',
                prune: true,
                wait: true,
                sourceRef: {
                  kind: 'GitRepository',
                  name: 'flux-system',
                },
              },
            },
          },
          {
            name: 'media-jellyfin',
            template: '401-media',
            path: './templates/401-media/jellyfin',
            flux_kustomization: {
              apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
              kind: 'Kustomization',
              metadata: {
                name: 'media-jellyfin',
                namespace: 'flux-system',
              },
              spec: {
                interval: '10m',
                path: './templates/401-media/jellyfin',
                prune: true,
                wait: true,
                sourceRef: {
                  kind: 'GitRepository',
                  name: 'flux-system',
                },
              },
            },
          },
        ],
      };

      // Act
      const result = await write_generation_result(generation_result);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        // Check that files were written to correct locations
        expect(result.value).toContain(
          path.join(temp_dir, 'templates', '001-secrets', 'secrets-doppler.yaml'),
        );
        expect(result.value).toContain(
          path.join(temp_dir, 'templates', '401-media', 'media-jellyfin.yaml'),
        );
        expect(result.value).toContain(path.join(temp_dir, 'flux-system', 'kustomization.yaml'));

        // Verify directory structure
        const secrets_file = await fs.readFile(
          path.join(temp_dir, 'templates', '001-secrets', 'secrets-doppler.yaml'),
          'utf-8',
        );
        expect(secrets_file).toContain('name: secrets-doppler');

        const media_file = await fs.readFile(
          path.join(temp_dir, 'templates', '401-media', 'media-jellyfin.yaml'),
          'utf-8',
        );
        expect(media_file).toContain('name: media-jellyfin');

        // Verify root kustomization references all templates
        const root_kustomization = await fs.readFile(
          path.join(temp_dir, 'flux-system', 'kustomization.yaml'),
          'utf-8',
        );
        expect(root_kustomization).toContain('apiVersion: kustomize.config.k8s.io/v1beta1');
        expect(root_kustomization).toContain('../templates/001-secrets/secrets-doppler.yaml');
        expect(root_kustomization).toContain('../templates/401-media/media-jellyfin.yaml');
      }
    });

    it('should include OCI repository in flux-system directory', async () => {
      // Arrange
      const generation_result: GenerationResultType = {
        cluster: 'production',
        output_dir: temp_dir,
        kustomizations: [
          {
            name: 'test-app',
            template: 'apps',
            path: './templates/apps/test',
            flux_kustomization: {
              apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
              kind: 'Kustomization',
              metadata: {
                name: 'test-app',
                namespace: 'flux-system',
              },
              spec: {
                interval: '10m',
                path: './templates/apps/test',
                prune: true,
                wait: true,
                sourceRef: {
                  kind: 'OCIRepository',
                  name: 'kustodian-oci',
                },
              },
            },
          },
        ],
        oci_repository: {
          apiVersion: 'source.toolkit.fluxcd.io/v1',
          kind: 'OCIRepository',
          metadata: {
            name: 'kustodian-oci',
            namespace: 'flux-system',
          },
          spec: {
            interval: '10m',
            url: 'oci://ghcr.io/my-org/infra',
            ref: {
              tag: 'latest',
            },
          },
        },
      };

      // Act
      const result = await write_generation_result(generation_result);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        // Check OCI repository is in flux-system directory
        expect(result.value).toContain(path.join(temp_dir, 'flux-system', 'oci-repository.yaml'));

        const oci_file = await fs.readFile(
          path.join(temp_dir, 'flux-system', 'oci-repository.yaml'),
          'utf-8',
        );
        expect(oci_file).toContain('kind: OCIRepository');
        expect(oci_file).toContain('oci://ghcr.io/my-org/infra');

        // Root kustomization should reference OCI repository
        const root_kustomization = await fs.readFile(
          path.join(temp_dir, 'flux-system', 'kustomization.yaml'),
          'utf-8',
        );
        expect(root_kustomization).toContain('oci-repository.yaml');
      }
    });

    it('should sort resources in root kustomization for deterministic output', async () => {
      // Arrange
      const generation_result: GenerationResultType = {
        cluster: 'production',
        output_dir: temp_dir,
        kustomizations: [
          {
            name: 'zebra',
            template: 'z-template',
            path: './templates/z-template/zebra',
            flux_kustomization: {
              apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
              kind: 'Kustomization',
              metadata: { name: 'zebra', namespace: 'flux-system' },
              spec: {
                interval: '10m',
                path: './templates/z-template/zebra',
                prune: true,
                wait: true,
                sourceRef: { kind: 'GitRepository', name: 'flux-system' },
              },
            },
          },
          {
            name: 'alpha',
            template: 'a-template',
            path: './templates/a-template/alpha',
            flux_kustomization: {
              apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
              kind: 'Kustomization',
              metadata: { name: 'alpha', namespace: 'flux-system' },
              spec: {
                interval: '10m',
                path: './templates/a-template/alpha',
                prune: true,
                wait: true,
                sourceRef: { kind: 'GitRepository', name: 'flux-system' },
              },
            },
          },
        ],
      };

      // Act
      const result = await write_generation_result(generation_result);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const root_kustomization = await fs.readFile(
          path.join(temp_dir, 'flux-system', 'kustomization.yaml'),
          'utf-8',
        );

        // Resources should be sorted alphabetically
        const alpha_index = root_kustomization.indexOf('a-template/alpha');
        const zebra_index = root_kustomization.indexOf('z-template/zebra');
        expect(alpha_index).toBeLessThan(zebra_index);
      }
    });
  });
});
