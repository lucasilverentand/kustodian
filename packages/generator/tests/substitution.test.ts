import { describe, expect, it } from 'bun:test';

import type { KustomizationType } from '@kustodian/schema';

import {
  SUBSTITUTION_PATTERN,
  collect_substitution_values,
  extract_variables,
  generate_flux_substitutions,
  get_defined_substitutions,
  get_required_substitutions,
  substitute_object,
  substitute_string,
  validate_substitutions,
} from '../src/substitution.js';

describe('Substitution Engine', () => {
  describe('SUBSTITUTION_PATTERN', () => {
    it('should match valid variable names', () => {
      // Arrange
      const text = '${foo} ${bar_baz} ${_underscore} ${a1b2c3}';

      // Act
      const matches = Array.from(text.matchAll(SUBSTITUTION_PATTERN));

      // Assert
      expect(matches).toHaveLength(4);
      expect(matches[0]?.[1]).toBe('foo');
      expect(matches[1]?.[1]).toBe('bar_baz');
      expect(matches[2]?.[1]).toBe('_underscore');
      expect(matches[3]?.[1]).toBe('a1b2c3');
    });

    it('should not match invalid variable names', () => {
      // Arrange
      const text = '${123} ${foo-bar} ${}';

      // Act
      const matches = Array.from(text.matchAll(SUBSTITUTION_PATTERN));

      // Assert
      expect(matches).toHaveLength(0);
    });
  });

  describe('extract_variables', () => {
    it('should extract unique variable names', () => {
      // Arrange
      const text = '${foo} and ${bar} with ${foo} again';

      // Act
      const result = extract_variables(text);

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });

    it('should return empty array for no variables', () => {
      // Act
      const result = extract_variables('no variables here');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('substitute_string', () => {
    it('should replace variables with values', () => {
      // Arrange
      const text = 'Hello ${name}, welcome to ${place}!';
      const values = { name: 'World', place: 'Kustodian' };

      // Act
      const result = substitute_string(text, values);

      // Assert
      expect(result).toBe('Hello World, welcome to Kustodian!');
    });

    it('should leave unmatched variables unchanged', () => {
      // Arrange
      const text = 'Hello ${name}, ${unknown}';
      const values = { name: 'World' };

      // Act
      const result = substitute_string(text, values);

      // Assert
      expect(result).toBe('Hello World, ${unknown}');
    });

    it('should handle empty values object', () => {
      // Arrange
      const text = '${foo} ${bar}';

      // Act
      const result = substitute_string(text, {});

      // Assert
      expect(result).toBe('${foo} ${bar}');
    });
  });

  describe('substitute_object', () => {
    it('should substitute string values in objects', () => {
      // Arrange
      const obj = {
        name: '${app_name}',
        namespace: '${ns}',
      };
      const values = { app_name: 'nginx', ns: 'production' };

      // Act
      const result = substitute_object(obj, values);

      // Assert
      expect(result).toEqual({
        name: 'nginx',
        namespace: 'production',
      });
    });

    it('should handle nested objects', () => {
      // Arrange
      const obj = {
        outer: {
          inner: '${value}',
        },
      };
      const values = { value: 'test' };

      // Act
      const result = substitute_object(obj, values);

      // Assert
      expect(result).toEqual({
        outer: {
          inner: 'test',
        },
      });
    });

    it('should handle arrays', () => {
      // Arrange
      const obj = ['${a}', '${b}', '${c}'];
      const values = { a: '1', b: '2', c: '3' };

      // Act
      const result = substitute_object(obj, values);

      // Assert
      expect(result).toEqual(['1', '2', '3']);
    });

    it('should preserve non-string values', () => {
      // Arrange
      const obj = {
        count: 42,
        enabled: true,
        data: null,
        name: '${name}',
      };
      const values = { name: 'test' };

      // Act
      const result = substitute_object(obj, values);

      // Assert
      expect(result).toEqual({
        count: 42,
        enabled: true,
        data: null,
        name: 'test',
      });
    });
  });

  describe('collect_substitution_values', () => {
    const create_kustomization = (
      substitutions: Array<{ name: string; default?: string; preserve_case?: boolean }>,
    ): KustomizationType => ({
      name: 'test',
      path: './test',
      prune: true,
      wait: true,
      substitutions,
    });

    it('should use default values when no cluster values provided', () => {
      // Arrange
      const kustomization = create_kustomization([
        { name: 'replicas', default: '2' },
        { name: 'image', default: 'nginx:latest' },
      ]);

      // Act
      const result = collect_substitution_values(kustomization);

      // Assert
      expect(result).toEqual({
        replicas: '2',
        image: 'nginx:latest',
      });
    });

    it('should override defaults with cluster values', () => {
      // Arrange
      const kustomization = create_kustomization([
        { name: 'replicas', default: '2' },
        { name: 'image', default: 'nginx:latest' },
      ]);
      const cluster_values = { replicas: '5' };

      // Act
      const result = collect_substitution_values(kustomization, cluster_values);

      // Assert
      expect(result).toEqual({
        replicas: '5',
        image: 'nginx:latest',
      });
    });

    it('should exclude substitutions without values', () => {
      // Arrange
      const kustomization = create_kustomization([
        { name: 'replicas', default: '2' },
        { name: 'required_value' },
      ]);

      // Act
      const result = collect_substitution_values(kustomization);

      // Assert
      expect(result).toEqual({ replicas: '2' });
      expect(result['required_value']).toBeUndefined();
    });

    it('should preserve case-sensitive values with preserve_case option', () => {
      // Arrange
      const kustomization = create_kustomization([
        { name: 'timezone', default: 'Europe/Amsterdam', preserve_case: true },
        { name: 'env_var', default: 'PRODUCTION', preserve_case: true },
      ]);

      // Act
      const result = collect_substitution_values(kustomization);

      // Assert
      expect(result).toEqual({
        timezone: 'Europe/Amsterdam',
        env_var: 'PRODUCTION',
      });
    });
  });

  describe('get_defined_substitutions', () => {
    it('should return all substitution names', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        substitutions: [{ name: 'foo', default: '1' }, { name: 'bar' }],
      };

      // Act
      const result = get_defined_substitutions(kustomization);

      // Assert
      expect(result).toEqual(['foo', 'bar']);
    });

    it('should return empty array when no substitutions', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
      };

      // Act
      const result = get_defined_substitutions(kustomization);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('get_required_substitutions', () => {
    it('should return only substitutions without defaults', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        substitutions: [{ name: 'optional', default: 'value' }, { name: 'required' }],
      };

      // Act
      const result = get_required_substitutions(kustomization);

      // Assert
      expect(result).toEqual(['required']);
    });
  });

  describe('validate_substitutions', () => {
    it('should be valid when all required values provided', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        substitutions: [{ name: 'required' }, { name: 'optional', default: 'default' }],
      };
      const cluster_values = { required: 'value' };

      // Act
      const result = validate_substitutions(kustomization, cluster_values);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should be invalid when required values missing', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        substitutions: [{ name: 'required1' }, { name: 'required2' }],
      };

      // Act
      const result = validate_substitutions(kustomization, {});

      // Assert
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('required1');
      expect(result.missing).toContain('required2');
    });

    it('should track unused cluster values', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        substitutions: [{ name: 'defined' }],
      };
      const cluster_values = { defined: 'value', unused: 'extra' };

      // Act
      const result = validate_substitutions(kustomization, cluster_values);

      // Assert
      expect(result.unused).toContain('unused');
    });
  });

  describe('generate_flux_substitutions', () => {
    it('should return values when present', () => {
      // Arrange
      const values = { foo: 'bar', baz: 'qux' };

      // Act
      const result = generate_flux_substitutions(values);

      // Assert
      expect(result).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('should return undefined for empty values', () => {
      // Act
      const result = generate_flux_substitutions({});

      // Assert
      expect(result).toBeUndefined();
    });
  });
});
