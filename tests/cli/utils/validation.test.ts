import { describe, expect, it } from 'bun:test';
import { validate_cluster_template_requirements } from '../../../src/cli/utils/validation.js';
import type { LoadedClusterType } from '../../../src/loader/index.js';

function make_loaded_cluster(
  overrides: {
    templates?: Array<{ name: string }>;
    nodes?: Array<{
      name: string;
      role: string;
      address: string;
      labels?: Record<string, string | boolean | number>;
    }>;
  } = {},
): LoadedClusterType {
  return {
    path: '/fake/path',
    cluster: {
      apiVersion: 'kustodian.io/v1alpha1',
      kind: 'Cluster',
      metadata: { name: 'test-cluster' },
      spec: {
        oci: { registry: 'ghcr.io', repository: 'org/repo' },
        templates: overrides.templates ?? [],
      },
    },
    nodes: overrides.nodes ?? [{ name: 'node1', role: 'controller', address: '10.0.0.1' }],
  } as LoadedClusterType;
}

describe('validate_cluster_template_requirements', () => {
  it('should return success when no templates referenced', () => {
    const loaded = make_loaded_cluster({ templates: [] });
    const result = validate_cluster_template_requirements(loaded, []);

    expect(result.success).toBe(true);
  });

  it('should return success when template has no requirements', () => {
    const loaded = make_loaded_cluster({ templates: [{ name: 'example' }] });
    const all_templates = [
      {
        path: '/fake',
        template: {
          apiVersion: 'kustodian.io/v1alpha1' as const,
          kind: 'Template' as const,
          metadata: { name: 'example' },
          spec: {
            kustomizations: [],
          },
        },
      },
    ];

    const result = validate_cluster_template_requirements(loaded, all_templates);
    expect(result.success).toBe(true);
  });

  it('should return failure when requirements not met', () => {
    const loaded = make_loaded_cluster({
      templates: [{ name: 'gpu-template' }],
      nodes: [{ name: 'node1', role: 'worker', address: '10.0.0.1' }],
    });

    const all_templates = [
      {
        path: '/fake',
        template: {
          apiVersion: 'kustodian.io/v1alpha1' as const,
          kind: 'Template' as const,
          metadata: { name: 'gpu-template' },
          spec: {
            kustomizations: [],
            requirements: [
              {
                type: 'nodeLabel' as const,
                key: 'gpu',
                value: 'true',
                atLeast: 1,
              },
            ],
          },
        },
      },
    ];

    const result = validate_cluster_template_requirements(loaded, all_templates);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('REQUIREMENT_VALIDATION_ERROR');
    }
  });

  it('should return success when requirements are met', () => {
    const loaded = make_loaded_cluster({
      templates: [{ name: 'gpu-template' }],
      nodes: [
        {
          name: 'node1',
          role: 'worker',
          address: '10.0.0.1',
          labels: { gpu: 'true' },
        },
      ],
    });

    const all_templates = [
      {
        path: '/fake',
        template: {
          apiVersion: 'kustodian.io/v1alpha1' as const,
          kind: 'Template' as const,
          metadata: { name: 'gpu-template' },
          spec: {
            kustomizations: [],
            requirements: [
              {
                type: 'nodeLabel' as const,
                key: 'gpu',
                value: 'true',
                atLeast: 1,
              },
            ],
          },
        },
      },
    ];

    const result = validate_cluster_template_requirements(loaded, all_templates);
    expect(result.success).toBe(true);
  });
});
