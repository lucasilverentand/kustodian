import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  get_extension,
  serialize_resource,
  serialize_resources,
  write_file,
  write_flux_kustomization,
} from '../src/output.js';
import type { FluxKustomizationType } from '../src/types.js';

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
});
