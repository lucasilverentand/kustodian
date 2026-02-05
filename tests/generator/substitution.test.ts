import { describe, expect, it } from 'bun:test';

import type { KustomizationType, TemplateType } from '../../src/schema/index.js';

import {
  SUBSTITUTION_PATTERN,
  collect_all_substitution_values,
  collect_substitution_values,
  collect_template_versions,
  extract_variables,
  generate_flux_substitutions,
  get_defined_substitutions,
  get_required_substitutions,
  substitute_object,
  substitute_string,
  validate_substitutions,
} from '../../src/generator/substitution.js';

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
        data: null,
        name: '${name}',
      };
      const values = { name: 'test' };

      // Act
      const result = substitute_object(obj, values);

      // Assert
      expect(result).toEqual({
        count: 42,
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

  describe('collect_template_versions', () => {
    const create_template = (
      versions: Array<{
        name: string;
        default?: string;
        registry?: { image: string; type?: 'dockerhub' | 'ghcr' };
        helm?: { repository?: string; oci?: string; chart: string };
      }>,
    ): TemplateType => ({
      apiVersion: 'kustodian.io/v1',
      kind: 'Template',
      metadata: { name: 'test-template' },
      spec: {
        versions: versions.map((v) => {
          if (v.registry) {
            return { name: v.name, default: v.default, registry: v.registry };
          }
          const helm = v.helm ?? { repository: 'https://example.com', chart: 'test' };
          return { name: v.name, default: v.default, helm };
        }),
        kustomizations: [{ name: 'app', path: './app', prune: true, wait: true }],
      },
    });

    it('should collect image version entries with defaults', () => {
      // Arrange
      const template = create_template([
        { name: 'nginx_version', default: '1.25.0', registry: { image: 'nginx' } },
        {
          name: 'redis_version',
          default: '7.2.0',
          registry: { image: 'redis', type: 'dockerhub' },
        },
      ]);

      // Act
      const result = collect_template_versions(template);

      // Assert
      expect(result).toEqual({
        nginx_version: '1.25.0',
        redis_version: '7.2.0',
      });
    });

    it('should collect helm version entries with defaults', () => {
      // Arrange
      const template = create_template([
        {
          name: 'traefik_version',
          default: '28.0.0',
          helm: { repository: 'https://traefik.github.io/charts', chart: 'traefik' },
        },
      ]);

      // Act
      const result = collect_template_versions(template);

      // Assert
      expect(result).toEqual({
        traefik_version: '28.0.0',
      });
    });

    it('should override defaults with cluster values', () => {
      // Arrange
      const template = create_template([
        { name: 'nginx_version', default: '1.25.0', registry: { image: 'nginx' } },
      ]);
      const cluster_values = { nginx_version: '1.26.0' };

      // Act
      const result = collect_template_versions(template, cluster_values);

      // Assert
      expect(result).toEqual({
        nginx_version: '1.26.0',
      });
    });

    it('should exclude versions without values', () => {
      // Arrange
      const template = create_template([
        { name: 'with_default', default: '1.0.0', registry: { image: 'test' } },
        { name: 'without_default', registry: { image: 'test2' } },
      ]);

      // Act
      const result = collect_template_versions(template);

      // Assert
      expect(result).toEqual({ with_default: '1.0.0' });
      expect(result['without_default']).toBeUndefined();
    });

    it('should return empty object when no versions defined', () => {
      // Arrange
      const template: TemplateType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: {
          kustomizations: [{ name: 'app', path: './app', prune: true, wait: true }],
        },
      };

      // Act
      const result = collect_template_versions(template);

      // Assert
      expect(result).toEqual({});
    });
  });

  describe('collect_all_substitution_values', () => {
    const create_template_with_versions = (
      versions: Array<{ name: string; default?: string; registry: { image: string } }>,
      kustomization: KustomizationType,
    ): TemplateType => ({
      apiVersion: 'kustodian.io/v1',
      kind: 'Template',
      metadata: { name: 'test-template' },
      spec: {
        versions,
        kustomizations: [kustomization],
      },
    });

    it('should combine template versions and kustomization substitutions', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'app',
        path: './app',
        prune: true,
        wait: true,
        substitutions: [{ name: 'replicas', default: '3' }],
      };
      const template = create_template_with_versions(
        [{ name: 'nginx_version', default: '1.25.0', registry: { image: 'nginx' } }],
        kustomization,
      );

      // Act
      const result = collect_all_substitution_values(template, kustomization);

      // Assert
      expect(result).toEqual({
        nginx_version: '1.25.0',
        replicas: '3',
      });
    });

    it('should give kustomization substitutions precedence over template versions', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'app',
        path: './app',
        prune: true,
        wait: true,
        substitutions: [{ name: 'shared_name', default: 'from_kustomization' }],
      };
      const template = create_template_with_versions(
        [{ name: 'shared_name', default: 'from_template', registry: { image: 'test' } }],
        kustomization,
      );

      // Act
      const result = collect_all_substitution_values(template, kustomization);

      // Assert
      expect(result['shared_name']).toBe('from_kustomization');
    });

    it('should give cluster values highest precedence', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'app',
        path: './app',
        prune: true,
        wait: true,
        substitutions: [{ name: 'version', default: 'from_kustomization' }],
      };
      const template = create_template_with_versions(
        [{ name: 'version', default: 'from_template', registry: { image: 'test' } }],
        kustomization,
      );
      const cluster_values = { version: 'from_cluster' };

      // Act
      const result = collect_all_substitution_values(template, kustomization, cluster_values);

      // Assert
      expect(result['version']).toBe('from_cluster');
    });
  });
});
