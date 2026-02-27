import { describe, expect, it } from 'bun:test';
import {
  build_node_list,
  resolve_k0s_provider_options,
} from '../../../src/cli/utils/k0s-provider.js';
import type { LoadedClusterType } from '../../../src/loader/index.js';

function make_loaded_cluster(
  overrides: {
    name?: string;
    code?: string;
    label_prefix?: string;
    plugins?: Array<{ name: string; config?: Record<string, unknown> }>;
  } = {},
): LoadedClusterType {
  return {
    path: '/fake/path',
    cluster: {
      apiVersion: 'kustodian.io/v1alpha1',
      kind: 'Cluster',
      metadata: {
        name: overrides.name ?? 'test-cluster',
        ...(overrides.code && { code: overrides.code }),
      },
      spec: {
        oci: { registry: 'ghcr.io', repository: 'org/repo' },
        ...(overrides.label_prefix && {
          node_defaults: { label_prefix: overrides.label_prefix },
        }),
        ...(overrides.plugins && { plugins: overrides.plugins }),
      },
    },
    nodes: [{ name: 'node1', role: 'controller', address: '10.0.0.1' }],
  } as LoadedClusterType;
}

describe('build_node_list', () => {
  it('should build correct structure', () => {
    const loaded = make_loaded_cluster({ name: 'my-cluster' });
    const node_list = build_node_list(loaded);

    expect(node_list.cluster).toBe('my-cluster');
    expect(node_list.nodes).toHaveLength(1);
    expect(node_list.nodes[0].name).toBe('node1');
  });

  it('should include label_prefix when configured', () => {
    const loaded = make_loaded_cluster({ label_prefix: 'custom.io' });
    const node_list = build_node_list(loaded);

    expect(node_list.label_prefix).toBe('custom.io');
  });

  it('should omit label_prefix when not configured', () => {
    const loaded = make_loaded_cluster();
    const node_list = build_node_list(loaded);

    expect(node_list.label_prefix).toBeUndefined();
  });
});

describe('resolve_k0s_provider_options', () => {
  it('should include all options by default', () => {
    const loaded = make_loaded_cluster({
      plugins: [
        {
          name: 'k0s',
          config: {
            k0s_version: '1.30.0',
            telemetry_enabled: false,
            dynamic_config: true,
            sans: ['10.0.0.1'],
            default_ssh: { user: 'root' },
          },
        },
      ],
    });

    const options = resolve_k0s_provider_options(loaded);

    expect(options['k0s_version']).toBe('1.30.0');
    expect(options['telemetry_enabled']).toBe(false);
    expect(options['dynamic_config']).toBe(true);
    expect(options['sans']).toEqual(['10.0.0.1']);
    expect(options['default_ssh']).toEqual({ user: 'root' });
    expect(options['cluster_name']).toBe('test-cluster');
  });

  it('should exclude extra options when include_all is false', () => {
    const loaded = make_loaded_cluster({
      plugins: [
        {
          name: 'k0s',
          config: {
            k0s_version: '1.30.0',
            telemetry_enabled: false,
            dynamic_config: true,
            sans: ['10.0.0.1'],
            default_ssh: { user: 'root' },
          },
        },
      ],
    });

    const options = resolve_k0s_provider_options(loaded, { include_all: false });

    expect(options['k0s_version']).toBe('1.30.0');
    expect(options['default_ssh']).toEqual({ user: 'root' });
    expect(options['cluster_name']).toBe('test-cluster');
    // These should NOT be present
    expect(options['telemetry_enabled']).toBeUndefined();
    expect(options['dynamic_config']).toBeUndefined();
    expect(options['sans']).toBeUndefined();
  });

  it('should use metadata.code as cluster_name when available', () => {
    const loaded = make_loaded_cluster({ name: 'full-name', code: 'short' });
    const options = resolve_k0s_provider_options(loaded);

    expect(options['cluster_name']).toBe('short');
  });

  it('should handle missing plugin config gracefully', () => {
    const loaded = make_loaded_cluster();
    const options = resolve_k0s_provider_options(loaded);

    expect(options['cluster_name']).toBe('test-cluster');
    expect(options['k0s_version']).toBeUndefined();
  });
});
