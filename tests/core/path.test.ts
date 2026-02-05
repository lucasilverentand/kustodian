import { describe, expect, it } from 'bun:test';

import {
  change_extension,
  common_path_prefix,
  ensure_relative,
  get_basename,
  get_dirname,
  get_extension,
  is_absolute_path,
  join_paths,
  matches_pattern,
  normalize_path,
  relative_path,
  remove_extension,
  resolve_path,
  split_path,
} from '../../src/core/path.js';

describe('Path Utilities', () => {
  describe('normalize_path', () => {
    it('should remove leading ./', () => {
      // Act & Assert
      expect(normalize_path('./foo/bar')).toBe('foo/bar');
    });

    it('should remove trailing slash', () => {
      // Act & Assert
      expect(normalize_path('foo/bar/')).toBe('foo/bar');
    });

    it('should handle root path', () => {
      // Act & Assert
      expect(normalize_path('/')).toBe('/');
    });

    it('should normalize multiple slashes', () => {
      // Act & Assert
      expect(normalize_path('foo//bar')).toBe('foo/bar');
    });
  });

  describe('join_paths', () => {
    it('should join path segments', () => {
      // Act & Assert
      expect(join_paths('foo', 'bar', 'baz')).toBe('foo/bar/baz');
    });

    it('should handle segments with slashes', () => {
      // Act & Assert
      expect(join_paths('foo/', '/bar')).toBe('foo/bar');
    });
  });

  describe('resolve_path', () => {
    it('should resolve relative to base', () => {
      // Arrange
      const base = '/home/user';

      // Act
      const result = resolve_path(base, 'project');

      // Assert
      expect(result).toBe('/home/user/project');
    });
  });

  describe('relative_path', () => {
    it('should compute relative path', () => {
      // Act & Assert
      expect(relative_path('/home/user', '/home/user/project')).toBe('project');
    });
  });

  describe('get_dirname', () => {
    it('should get directory name', () => {
      // Act & Assert
      expect(get_dirname('/foo/bar/baz.txt')).toBe('/foo/bar');
    });
  });

  describe('get_basename', () => {
    it('should get file name', () => {
      // Act & Assert
      expect(get_basename('/foo/bar/baz.txt')).toBe('baz.txt');
    });

    it('should remove extension if provided', () => {
      // Act & Assert
      expect(get_basename('/foo/bar/baz.txt', '.txt')).toBe('baz');
    });
  });

  describe('get_extension', () => {
    it('should get file extension', () => {
      // Act & Assert
      expect(get_extension('file.txt')).toBe('.txt');
    });

    it('should return empty for no extension', () => {
      // Act & Assert
      expect(get_extension('file')).toBe('');
    });
  });

  describe('is_absolute_path', () => {
    it('should return true for absolute unix paths', () => {
      // Act & Assert
      expect(is_absolute_path('/foo/bar')).toBe(true);
    });

    it('should return true for absolute windows paths', () => {
      // Act & Assert
      expect(is_absolute_path('C:/foo/bar')).toBe(true);
    });

    it('should return false for relative paths', () => {
      // Act & Assert
      expect(is_absolute_path('foo/bar')).toBe(false);
      expect(is_absolute_path('./foo')).toBe(false);
    });
  });

  describe('ensure_relative', () => {
    it('should add ./ to bare paths', () => {
      // Act & Assert
      expect(ensure_relative('foo/bar')).toBe('./foo/bar');
    });

    it('should not modify paths starting with ./', () => {
      // Act & Assert
      expect(ensure_relative('./foo')).toBe('./foo');
    });

    it('should not modify paths starting with ../', () => {
      // Act & Assert
      expect(ensure_relative('../foo')).toBe('../foo');
    });

    it('should not modify absolute paths', () => {
      // Act & Assert
      expect(ensure_relative('/foo')).toBe('/foo');
    });
  });

  describe('remove_extension', () => {
    it('should remove file extension', () => {
      // Act & Assert
      expect(remove_extension('file.txt')).toBe('file');
    });

    it('should handle paths', () => {
      // Act & Assert
      expect(remove_extension('/foo/bar/file.yaml')).toBe('/foo/bar/file');
    });

    it('should handle no extension', () => {
      // Act & Assert
      expect(remove_extension('file')).toBe('file');
    });
  });

  describe('change_extension', () => {
    it('should change file extension', () => {
      // Act & Assert
      expect(change_extension('file.txt', '.md')).toBe('file.md');
    });

    it('should add dot if not provided', () => {
      // Act & Assert
      expect(change_extension('file.txt', 'md')).toBe('file.md');
    });
  });

  describe('matches_pattern', () => {
    it('should match wildcard pattern', () => {
      // Act & Assert
      expect(matches_pattern('any/path', ['*'])).toBe(true);
    });

    it('should match extension pattern', () => {
      // Act & Assert
      expect(matches_pattern('file.yaml', ['*.yaml'])).toBe(true);
      expect(matches_pattern('file.txt', ['*.yaml'])).toBe(false);
    });

    it('should match directory pattern', () => {
      // Act & Assert
      expect(matches_pattern('src/file.ts', ['src/*'])).toBe(true);
      expect(matches_pattern('lib/file.ts', ['src/*'])).toBe(false);
    });

    it('should match exact pattern', () => {
      // Act & Assert
      expect(matches_pattern('file.txt', ['file.txt'])).toBe(true);
    });
  });

  describe('split_path', () => {
    it('should split path into segments', () => {
      // Act & Assert
      expect(split_path('foo/bar/baz')).toEqual(['foo', 'bar', 'baz']);
    });

    it('should handle leading slashes', () => {
      // Act & Assert
      expect(split_path('/foo/bar')).toEqual(['foo', 'bar']);
    });
  });

  describe('common_path_prefix', () => {
    it('should find common prefix', () => {
      // Arrange
      const paths = ['src/foo/a.ts', 'src/foo/b.ts', 'src/foo/c.ts'];

      // Act & Assert
      expect(common_path_prefix(paths)).toBe('src/foo');
    });

    it('should return empty for no common prefix', () => {
      // Arrange
      const paths = ['foo/a.ts', 'bar/b.ts'];

      // Act & Assert
      expect(common_path_prefix(paths)).toBe('');
    });

    it('should handle empty array', () => {
      // Act & Assert
      expect(common_path_prefix([])).toBe('');
    });

    it('should handle single path', () => {
      // Act & Assert
      expect(common_path_prefix(['foo/bar/baz.ts'])).toBe('foo/bar');
    });
  });
});
