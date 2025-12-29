import { describe, expect, it } from 'vitest';

import { parse_yaml, stringify_yaml } from '../src/yaml.js';

describe('YAML', () => {
  describe('parse_yaml', () => {
    it('should parse valid YAML', () => {
      // Arrange
      const yaml = `
name: test
value: 42
nested:
  key: value
`;

      // Act
      const result = parse_yaml<{ name: string; value: number }>(yaml);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.name).toBe('test');
        expect(result.value.value).toBe(42);
      }
    });

    it('should return failure for invalid YAML', () => {
      // Arrange
      const yaml = `
name: test
  bad: indentation
`;

      // Act
      const result = parse_yaml(yaml);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should parse YAML arrays', () => {
      // Arrange
      const yaml = `
items:
  - one
  - two
  - three
`;

      // Act
      const result = parse_yaml<{ items: string[] }>(yaml);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.items).toEqual(['one', 'two', 'three']);
      }
    });
  });

  describe('stringify_yaml', () => {
    it('should stringify an object to YAML', () => {
      // Arrange
      const data = { name: 'test', value: 42 };

      // Act
      const result = stringify_yaml(data);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toContain('name: test');
        expect(result.value).toContain('value: 42');
      }
    });

    it('should stringify nested objects', () => {
      // Arrange
      const data = { outer: { inner: 'value' } };

      // Act
      const result = stringify_yaml(data);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toContain('outer:');
        expect(result.value).toContain('inner: value');
      }
    });

    it('should stringify arrays', () => {
      // Arrange
      const data = { items: ['a', 'b', 'c'] };

      // Act
      const result = stringify_yaml(data);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toContain('- a');
        expect(result.value).toContain('- b');
        expect(result.value).toContain('- c');
      }
    });
  });
});
