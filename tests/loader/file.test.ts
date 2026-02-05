import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  file_exists,
  is_directory,
  list_directories,
  list_files,
  read_file,
  read_yaml_file,
  write_file,
  write_yaml_file,
} from '../../src/loader/file.js';

describe('File Operations', () => {
  let temp_dir: string;

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-test-'));
  });

  afterEach(async () => {
    await fs.rm(temp_dir, { recursive: true, force: true });
  });

  describe('file_exists', () => {
    it('should return true for existing file', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'test.txt');
      await fs.writeFile(file_path, 'content');

      // Act
      const result = await file_exists(file_path);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'nonexistent.txt');

      // Act
      const result = await file_exists(file_path);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('is_directory', () => {
    it('should return true for directory', async () => {
      // Act
      const result = await is_directory(temp_dir);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for file', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'test.txt');
      await fs.writeFile(file_path, 'content');

      // Act
      const result = await is_directory(file_path);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for non-existing path', async () => {
      // Act
      const result = await is_directory(path.join(temp_dir, 'nonexistent'));

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('read_file', () => {
    it('should read file contents', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'test.txt');
      const content = 'Hello, World!';
      await fs.writeFile(file_path, content);

      // Act
      const result = await read_file(file_path);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(content);
      }
    });

    it('should return error for non-existing file', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'nonexistent.txt');

      // Act
      const result = await read_file(file_path);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FILE_NOT_FOUND');
      }
    });
  });

  describe('write_file', () => {
    it('should write file contents', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'output.txt');
      const content = 'Test content';

      // Act
      const result = await write_file(file_path, content);

      // Assert
      expect(result.success).toBe(true);
      const written = await fs.readFile(file_path, 'utf-8');
      expect(written).toBe(content);
    });

    it('should create directories as needed', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'nested', 'dir', 'file.txt');
      const content = 'Nested content';

      // Act
      const result = await write_file(file_path, content);

      // Assert
      expect(result.success).toBe(true);
      const written = await fs.readFile(file_path, 'utf-8');
      expect(written).toBe(content);
    });
  });

  describe('read_yaml_file', () => {
    it('should read and parse YAML file', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'config.yaml');
      await fs.writeFile(file_path, 'name: test\nversion: 1.0.0\n');

      // Act
      const result = await read_yaml_file<{ name: string; version: string }>(file_path);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.name).toBe('test');
        expect(result.value.version).toBe('1.0.0');
      }
    });

    it('should return error for invalid YAML', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'invalid.yaml');
      await fs.writeFile(file_path, 'invalid: yaml: content');

      // Act
      const result = await read_yaml_file(file_path);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('write_yaml_file', () => {
    it('should write object as YAML', async () => {
      // Arrange
      const file_path = path.join(temp_dir, 'output.yaml');
      const data = { name: 'test', count: 42 };

      // Act
      const result = await write_yaml_file(file_path, data);

      // Assert
      expect(result.success).toBe(true);
      const content = await fs.readFile(file_path, 'utf-8');
      expect(content).toContain('name: test');
      expect(content).toContain('count: 42');
    });
  });

  describe('list_files', () => {
    it('should list files in directory', async () => {
      // Arrange
      await fs.writeFile(path.join(temp_dir, 'file1.txt'), 'a');
      await fs.writeFile(path.join(temp_dir, 'file2.txt'), 'b');
      await fs.mkdir(path.join(temp_dir, 'subdir'));

      // Act
      const result = await list_files(temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(2);
        expect(result.value.some((f) => f.endsWith('file1.txt'))).toBe(true);
        expect(result.value.some((f) => f.endsWith('file2.txt'))).toBe(true);
      }
    });

    it('should filter by extension', async () => {
      // Arrange
      await fs.writeFile(path.join(temp_dir, 'file.yaml'), 'a');
      await fs.writeFile(path.join(temp_dir, 'file.txt'), 'b');

      // Act
      const result = await list_files(temp_dir, '.yaml');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toMatch(/file\.yaml$/);
      }
    });

    it('should return error for non-existing directory', async () => {
      // Act
      const result = await list_files(path.join(temp_dir, 'nonexistent'));

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('list_directories', () => {
    it('should list subdirectories', async () => {
      // Arrange
      await fs.mkdir(path.join(temp_dir, 'dir1'));
      await fs.mkdir(path.join(temp_dir, 'dir2'));
      await fs.writeFile(path.join(temp_dir, 'file.txt'), 'a');

      // Act
      const result = await list_directories(temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(2);
        expect(result.value.some((d) => d.endsWith('dir1'))).toBe(true);
        expect(result.value.some((d) => d.endsWith('dir2'))).toBe(true);
      }
    });

    it('should return error for non-existing directory', async () => {
      // Act
      const result = await list_directories(path.join(temp_dir, 'nonexistent'));

      // Assert
      expect(result.success).toBe(false);
    });
  });
});
