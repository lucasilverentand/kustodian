import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  create_namespace_manifest,
  create_registry_secret_manifest,
  get_oci_tag,
  get_provider_token_from_env,
} from '../../../src/cli/utils/oci.js';
import type { ClusterType } from '../../../src/schema/index.js';

function make_cluster(
  overrides: {
    name?: string;
    oci?: Partial<ClusterType['spec']['oci']>;
  } = {},
): ClusterType {
  return {
    apiVersion: 'kustodian.io/v1alpha1',
    kind: 'Cluster',
    metadata: { name: overrides.name ?? 'test-cluster' },
    spec: {
      oci: {
        registry: 'ghcr.io',
        repository: 'org/repo',
        tag_strategy: 'git-sha',
        tag: undefined,
        ...overrides.oci,
      },
    },
  } as ClusterType;
}

describe('get_oci_tag', () => {
  it('should return cluster name for cluster strategy', async () => {
    const cluster = make_cluster({ oci: { tag_strategy: 'cluster' } });
    const tag = await get_oci_tag(cluster, process.cwd());
    expect(tag).toBe('test-cluster');
  });

  it('should return manual tag for manual strategy', async () => {
    const cluster = make_cluster({ oci: { tag_strategy: 'manual', tag: 'v1.2.3' } });
    const tag = await get_oci_tag(cluster, process.cwd());
    expect(tag).toBe('v1.2.3');
  });

  it('should return latest for manual strategy without tag', async () => {
    const cluster = make_cluster({ oci: { tag_strategy: 'manual', tag: undefined } });
    const tag = await get_oci_tag(cluster, process.cwd());
    expect(tag).toBe('latest');
  });

  it('should return git sha for default strategy', async () => {
    const cluster = make_cluster({ oci: { tag_strategy: 'git-sha' } });
    const tag = await get_oci_tag(cluster, process.cwd());
    // We're in a git repo so it should produce sha1-<hash>
    expect(tag).toMatch(/^sha1-[a-f0-9]+$/);
  });

  it('should return latest when no oci config', async () => {
    const cluster = {
      apiVersion: 'kustodian.io/v1alpha1',
      kind: 'Cluster',
      metadata: { name: 'test' },
      spec: {},
    } as ClusterType;
    const tag = await get_oci_tag(cluster, process.cwd());
    expect(tag).toBe('latest');
  });
});

describe('create_registry_secret_manifest', () => {
  it('should create correct structure', () => {
    const secret = create_registry_secret_manifest(
      'ghcr.io',
      'my-token',
      'oci-secret',
      'flux-system',
    );

    expect(secret.apiVersion).toBe('v1');
    expect(secret.kind).toBe('Secret');
    expect(secret.metadata.name).toBe('oci-secret');
    expect(secret.metadata.namespace).toBe('flux-system');
  });

  it('should handle token without colon (prepends _:)', () => {
    const secret = create_registry_secret_manifest('ghcr.io', 'plain-token', 'name', 'ns');
    const docker_config = JSON.parse(
      Buffer.from(
        (secret as Record<string, unknown> & { data: Record<string, string> }).data[
          '.dockerconfigjson'
        ],
        'base64',
      ).toString(),
    );
    const auth = Buffer.from(docker_config.auths['ghcr.io'].auth, 'base64').toString();
    expect(auth).toBe('_:plain-token');
  });

  it('should handle token with colon (uses as-is)', () => {
    const secret = create_registry_secret_manifest('ghcr.io', 'user:pass', 'name', 'ns');
    const docker_config = JSON.parse(
      Buffer.from(
        (secret as Record<string, unknown> & { data: Record<string, string> }).data[
          '.dockerconfigjson'
        ],
        'base64',
      ).toString(),
    );
    const auth = Buffer.from(docker_config.auths['ghcr.io'].auth, 'base64').toString();
    expect(auth).toBe('user:pass');
  });
});

describe('create_namespace_manifest', () => {
  it('should create correct structure', () => {
    const ns = create_namespace_manifest('flux-system');

    expect(ns.apiVersion).toBe('v1');
    expect(ns.kind).toBe('Namespace');
    expect(ns.metadata.name).toBe('flux-system');
  });
});

describe('get_provider_token_from_env', () => {
  const original_env = { ...process.env };

  beforeEach(() => {
    delete process.env['TEST_TOKEN_A'];
    delete process.env['TEST_TOKEN_B'];
  });

  afterEach(() => {
    Object.assign(process.env, original_env);
  });

  it('should find env var when set', () => {
    process.env['TEST_TOKEN_A'] = 'my-secret';
    const token = get_provider_token_from_env(['TEST_TOKEN_A', 'TEST_TOKEN_B']);
    expect(token).toBe('my-secret');
  });

  it('should return undefined when no env vars set', () => {
    const token = get_provider_token_from_env(['TEST_TOKEN_A', 'TEST_TOKEN_B']);
    expect(token).toBeUndefined();
  });

  it('should return first matching env var', () => {
    process.env['TEST_TOKEN_A'] = 'first';
    process.env['TEST_TOKEN_B'] = 'second';
    const token = get_provider_token_from_env(['TEST_TOKEN_A', 'TEST_TOKEN_B']);
    expect(token).toBe('first');
  });
});
