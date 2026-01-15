import { describe, expect, it } from 'bun:test';

import type { KustomizationType, TemplateType } from '@kustodian/schema';

import {
  SYSTEM_NAMESPACES,
  collect_namespaces,
  create_namespace_resource,
  filter_system_namespaces,
  generate_namespace_resources,
  get_kustomization_namespace,
  get_template_namespaces,
  is_system_namespace,
} from '../src/namespace.js';
import type { ResolvedTemplateType } from '../src/types.js';

describe('Namespace Module', () => {
  const create_template = (name: string, kustomizations: KustomizationType[]): TemplateType => ({
    apiVersion: 'kustodian.io/v1',
    kind: 'Template',
    metadata: { name },
    spec: { kustomizations },
  });

  const create_resolved = (template: TemplateType, enabled = true): ResolvedTemplateType => ({
    template,
    values: {},
    enabled,
  });

  describe('SYSTEM_NAMESPACES', () => {
    it('should include common system namespaces', () => {
      expect(SYSTEM_NAMESPACES.has('default')).toBe(true);
      expect(SYSTEM_NAMESPACES.has('flux-system')).toBe(true);
      expect(SYSTEM_NAMESPACES.has('kube-system')).toBe(true);
      expect(SYSTEM_NAMESPACES.has('kube-public')).toBe(true);
      expect(SYSTEM_NAMESPACES.has('kube-node-lease')).toBe(true);
    });
  });

  describe('get_kustomization_namespace', () => {
    it('should return namespace from config', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        namespace: { default: 'my-namespace', create: true },
        prune: true,
        wait: true,
      };

      // Act
      const result = get_kustomization_namespace(kustomization);

      // Assert
      expect(result).toBe('my-namespace');
    });

    it('should return undefined when no namespace configured', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
      };

      // Act
      const result = get_kustomization_namespace(kustomization);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('get_template_namespaces', () => {
    it('should extract all namespaces from template', () => {
      // Arrange
      const template = create_template('app', [
        {
          name: 'k1',
          path: './k1',
          namespace: { default: 'ns1', create: true },
          prune: true,
          wait: true,
        },
        {
          name: 'k2',
          path: './k2',
          namespace: { default: 'ns2', create: true },
          prune: true,
          wait: true,
        },
        { name: 'k3', path: './k3', prune: true, wait: true },
      ]);

      // Act
      const result = get_template_namespaces(template);

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain('ns1');
      expect(result).toContain('ns2');
    });

    it('should deduplicate namespaces', () => {
      // Arrange
      const template = create_template('app', [
        {
          name: 'k1',
          path: './k1',
          namespace: { default: 'same', create: true },
          prune: true,
          wait: true,
        },
        {
          name: 'k2',
          path: './k2',
          namespace: { default: 'same', create: true },
          prune: true,
          wait: true,
        },
      ]);

      // Act
      const result = get_template_namespaces(template);

      // Assert
      expect(result).toEqual(['same']);
    });
  });

  describe('collect_namespaces', () => {
    it('should collect namespaces from all enabled templates', () => {
      // Arrange
      const t1 = create_template('t1', [
        {
          name: 'k1',
          path: './k1',
          namespace: { default: 'ns1', create: true },
          prune: true,
          wait: true,
        },
      ]);
      const t2 = create_template('t2', [
        {
          name: 'k2',
          path: './k2',
          namespace: { default: 'ns2', create: true },
          prune: true,
          wait: true,
        },
      ]);
      const templates = [create_resolved(t1), create_resolved(t2)];

      // Act
      const result = collect_namespaces(templates);

      // Assert
      expect(result).toContain('ns1');
      expect(result).toContain('ns2');
    });

    it('should skip disabled templates', () => {
      // Arrange
      const t1 = create_template('t1', [
        {
          name: 'k1',
          path: './k1',
          namespace: { default: 'enabled', create: true },
          prune: true,
          wait: true,
        },
      ]);
      const t2 = create_template('t2', [
        {
          name: 'k2',
          path: './k2',
          namespace: { default: 'disabled', create: true },
          prune: true,
          wait: true,
        },
      ]);
      const templates = [create_resolved(t1, true), create_resolved(t2, false)];

      // Act
      const result = collect_namespaces(templates);

      // Assert
      expect(result).toContain('enabled');
      expect(result).not.toContain('disabled');
    });

    it('should return sorted namespaces', () => {
      // Arrange
      const t1 = create_template('t1', [
        {
          name: 'k1',
          path: './k1',
          namespace: { default: 'zebra', create: true },
          prune: true,
          wait: true,
        },
        {
          name: 'k2',
          path: './k2',
          namespace: { default: 'alpha', create: true },
          prune: true,
          wait: true,
        },
        {
          name: 'k3',
          path: './k3',
          namespace: { default: 'middle', create: true },
          prune: true,
          wait: true,
        },
      ]);
      const templates = [create_resolved(t1)];

      // Act
      const result = collect_namespaces(templates);

      // Assert
      expect(result).toEqual(['alpha', 'middle', 'zebra']);
    });
  });

  describe('is_system_namespace', () => {
    it('should return true for system namespaces', () => {
      expect(is_system_namespace('default')).toBe(true);
      expect(is_system_namespace('flux-system')).toBe(true);
      expect(is_system_namespace('kube-system')).toBe(true);
    });

    it('should return true for kube-* namespaces', () => {
      expect(is_system_namespace('kube-foo')).toBe(true);
      expect(is_system_namespace('kube-custom')).toBe(true);
    });

    it('should return false for user namespaces', () => {
      expect(is_system_namespace('production')).toBe(false);
      expect(is_system_namespace('nginx')).toBe(false);
    });
  });

  describe('filter_system_namespaces', () => {
    it('should remove system namespaces', () => {
      // Arrange
      const namespaces = ['production', 'default', 'nginx', 'kube-system'];

      // Act
      const result = filter_system_namespaces(namespaces);

      // Assert
      expect(result).toEqual(['production', 'nginx']);
    });
  });

  describe('create_namespace_resource', () => {
    it('should create namespace without labels', () => {
      // Act
      const result = create_namespace_resource('my-namespace');

      // Assert
      expect(result).toEqual({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: 'my-namespace' },
      });
    });

    it('should create namespace with labels', () => {
      // Arrange
      const labels = { 'app.kubernetes.io/managed-by': 'kustodian' };

      // Act
      const result = create_namespace_resource('my-namespace', labels);

      // Assert
      expect(result.metadata.labels).toEqual(labels);
    });
  });

  describe('generate_namespace_resources', () => {
    it('should generate resources for all non-system namespaces', () => {
      // Arrange
      const template = create_template('app', [
        {
          name: 'k1',
          path: './k1',
          namespace: { default: 'production', create: true },
          prune: true,
          wait: true,
        },
        {
          name: 'k2',
          path: './k2',
          namespace: { default: 'default', create: true },
          prune: true,
          wait: true,
        },
        {
          name: 'k3',
          path: './k3',
          namespace: { default: 'nginx', create: true },
          prune: true,
          wait: true,
        },
      ]);
      const templates = [create_resolved(template)];

      // Act
      const result = generate_namespace_resources(templates);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.metadata.name)).toContain('production');
      expect(result.map((r) => r.metadata.name)).toContain('nginx');
      expect(result.map((r) => r.metadata.name)).not.toContain('default');
    });

    it('should apply labels to all namespace resources', () => {
      // Arrange
      const template = create_template('app', [
        {
          name: 'k1',
          path: './k1',
          namespace: { default: 'ns1', create: true },
          prune: true,
          wait: true,
        },
      ]);
      const templates = [create_resolved(template)];
      const labels = { managed: 'true' };

      // Act
      const result = generate_namespace_resources(templates, labels);

      // Assert
      expect(result[0]?.metadata.labels).toEqual(labels);
    });
  });
});
