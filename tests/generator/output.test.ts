import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  clean_orphaned_files,
  get_extension,
  serialize_resource,
  serialize_resources,
  write_file,
  write_flux_kustomization,
  write_generation_result,
} from '../../src/generator/output.js';
import type { FluxKustomizationType, GenerationResultType } from '../../src/generator/types.js';

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
            name: 'secrets-provider',
            template: '001-secrets',
            path: './templates/001-secrets/provider',
            flux_kustomization: {
              apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
              kind: 'Kustomization',
              metadata: {
                name: 'secrets-provider',
                namespace: 'flux-system',
              },
              spec: {
                interval: '10m',
                path: './templates/001-secrets/provider',
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
          path.join(temp_dir, 'templates', '001-secrets', 'secrets-provider.yaml'),
        );
        expect(result.value).toContain(
          path.join(temp_dir, 'templates', '401-media', 'media-jellyfin.yaml'),
        );
        expect(result.value).toContain(path.join(temp_dir, 'flux-system', 'kustomization.yaml'));

        // Verify directory structure
        const secrets_file = await fs.readFile(
          path.join(temp_dir, 'templates', '001-secrets', 'secrets-provider.yaml'),
          'utf-8',
        );
        expect(secrets_file).toContain('name: secrets-provider');

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
        expect(root_kustomization).toContain('../templates/001-secrets/secrets-provider.yaml');
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

    it('should remove orphaned files from a previous generation', async () => {
      // Arrange: simulate a previous run that wrote an extra kustomization
      const templates_dir = path.join(temp_dir, 'templates');
      const old_template_dir = path.join(templates_dir, 'old-template');
      await fs.mkdir(old_template_dir, { recursive: true });
      await fs.writeFile(path.join(old_template_dir, 'stale-app.yaml'), 'old content');

      const generation_result: GenerationResultType = {
        cluster: 'production',
        output_dir: temp_dir,
        kustomizations: [
          {
            name: 'new-app',
            template: 'current-template',
            path: './templates/current-template/new-app',
            flux_kustomization: {
              apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
              kind: 'Kustomization',
              metadata: { name: 'new-app', namespace: 'flux-system' },
              spec: {
                interval: '10m',
                path: './templates/current-template/new-app',
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

      // The stale file should be gone
      const stale_exists = await fs
        .access(path.join(old_template_dir, 'stale-app.yaml'))
        .then(() => true)
        .catch(() => false);
      expect(stale_exists).toBe(false);

      // The empty old-template directory should also be removed
      const old_dir_exists = await fs
        .access(old_template_dir)
        .then(() => true)
        .catch(() => false);
      expect(old_dir_exists).toBe(false);

      // The new file should exist
      const new_file = path.join(templates_dir, 'current-template', 'new-app.yaml');
      const new_exists = await fs
        .access(new_file)
        .then(() => true)
        .catch(() => false);
      expect(new_exists).toBe(true);
    });

    it('should not remove files that are part of the current generation', async () => {
      // Arrange: pre-create a file that will also be written by the generation
      const templates_dir = path.join(temp_dir, 'templates', 'my-template');
      await fs.mkdir(templates_dir, { recursive: true });
      await fs.writeFile(path.join(templates_dir, 'keep-me.yaml'), 'old version');

      const generation_result: GenerationResultType = {
        cluster: 'production',
        output_dir: temp_dir,
        kustomizations: [
          {
            name: 'keep-me',
            template: 'my-template',
            path: './templates/my-template/keep-me',
            flux_kustomization: {
              apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
              kind: 'Kustomization',
              metadata: { name: 'keep-me', namespace: 'flux-system' },
              spec: {
                interval: '10m',
                path: './templates/my-template/keep-me',
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
      const content = await fs.readFile(path.join(templates_dir, 'keep-me.yaml'), 'utf-8');
      expect(content).toContain('name: keep-me'); // overwritten with new content
    });
  });

  describe('clean_orphaned_files', () => {
    let temp_dir: string;

    beforeEach(async () => {
      temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-test-'));
    });

    afterEach(async () => {
      await fs.rm(temp_dir, { recursive: true, force: true });
    });

    it('should return empty array when templates directory does not exist', async () => {
      const deleted = await clean_orphaned_files(temp_dir, []);
      expect(deleted).toEqual([]);
    });

    it('should delete files not in the written set', async () => {
      // Arrange
      const template_dir = path.join(temp_dir, 'templates', 'test-template');
      await fs.mkdir(template_dir, { recursive: true });
      const orphan_path = path.join(template_dir, 'orphan.yaml');
      await fs.writeFile(orphan_path, 'orphan content');

      // Act
      const deleted = await clean_orphaned_files(temp_dir, []);

      // Assert
      expect(deleted).toContain(path.resolve(orphan_path));
      const exists = await fs
        .access(orphan_path)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it('should keep files that are in the written set', async () => {
      // Arrange
      const template_dir = path.join(temp_dir, 'templates', 'test-template');
      await fs.mkdir(template_dir, { recursive: true });
      const kept_path = path.join(template_dir, 'kept.yaml');
      await fs.writeFile(kept_path, 'kept content');

      // Act
      const deleted = await clean_orphaned_files(temp_dir, [kept_path]);

      // Assert
      expect(deleted).toEqual([]);
      const content = await fs.readFile(kept_path, 'utf-8');
      expect(content).toBe('kept content');
    });

    it('should remove empty directories after deleting orphans', async () => {
      // Arrange
      const template_dir = path.join(temp_dir, 'templates', 'empty-after');
      await fs.mkdir(template_dir, { recursive: true });
      await fs.writeFile(path.join(template_dir, 'orphan.yaml'), 'content');

      // Act
      await clean_orphaned_files(temp_dir, []);

      // Assert
      const dir_exists = await fs
        .access(template_dir)
        .then(() => true)
        .catch(() => false);
      expect(dir_exists).toBe(false);
    });

    it('should not remove directories that still have files', async () => {
      // Arrange
      const template_dir = path.join(temp_dir, 'templates', 'partial');
      await fs.mkdir(template_dir, { recursive: true });
      const kept = path.join(template_dir, 'kept.yaml');
      const orphan = path.join(template_dir, 'orphan.yaml');
      await fs.writeFile(kept, 'kept');
      await fs.writeFile(orphan, 'orphan');

      // Act
      const deleted = await clean_orphaned_files(temp_dir, [kept]);

      // Assert
      expect(deleted).toContain(path.resolve(orphan));
      // Directory should still exist because kept.yaml is still there
      const dir_exists = await fs
        .access(template_dir)
        .then(() => true)
        .catch(() => false);
      expect(dir_exists).toBe(true);
    });
  });
});
