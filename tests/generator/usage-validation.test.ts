import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { validate_usage } from '../../src/generator/validation/usage.js';
import type { LoadedClusterType, LoadedTemplateType } from '../../src/loader/project.js';
import type { ClusterType, TemplateType } from '../../src/schema/index.js';

function create_cluster(
  name: string,
  overrides: Partial<ClusterType['spec']> = {},
): LoadedClusterType {
  return {
    path: `/clusters/${name}`,
    cluster: {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: { name },
      spec: {
        oci: {
          registry: 'ghcr.io',
          repository: 'test/repo',
          tag_strategy: 'git-sha',
          provider: 'generic',
          insecure: false,
        },
        ...overrides,
      },
    },
    nodes: [],
  };
}

function create_template(
  project_root: string,
  name: string,
  kustomizations: TemplateType['spec']['kustomizations'],
  versions: TemplateType['spec']['versions'] = [],
): LoadedTemplateType {
  return {
    path: path.join(project_root, 'templates', name),
    template: {
      apiVersion: 'kustodian.io/v1',
      kind: 'Template',
      metadata: { name },
      spec: {
        versions,
        kustomizations,
      },
    },
  };
}

async function write_file(file_path: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file_path), { recursive: true });
  await fs.writeFile(file_path, content, 'utf-8');
}

function issue_types(result: Awaited<ReturnType<typeof validate_usage>>): string[] {
  return result.issues.map((issue) => issue.type);
}

describe('Usage Validation', () => {
  let temp_dir: string;

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-usage-test-'));
  });

  afterEach(async () => {
    await fs.rm(temp_dir, { recursive: true, force: true });
  });

  it('detects unused templates and dead cluster/template values', async () => {
    const app = create_template(temp_dir, 'app', [
      {
        name: 'main',
        path: './main',
        substitutions: [{ name: 'replicas' }],
      },
    ]);
    const old = create_template(temp_dir, 'old', [{ name: 'main', path: './main' }]);

    await write_file(
      path.join(app.path, 'main', 'kustomization.yaml'),
      'resources:\n  - deployment.yaml\n',
    );
    await write_file(path.join(app.path, 'main', 'deployment.yaml'), 'replicas: ${replicas}\n');
    await write_file(path.join(old.path, 'main', 'kustomization.yaml'), 'resources: []\n');

    const cluster = create_cluster('prod', {
      values: {
        global_unused: 'true',
        replicas: '2',
      },
      templates: [
        {
          name: 'app',
          values: {
            replicas: '3',
            typo: 'yes',
          },
        },
      ],
    });

    const result = await validate_usage(temp_dir, [cluster], [app, old]);

    expect(result.valid).toBe(false);
    expect(issue_types(result)).toContain('unused_template');
    expect(issue_types(result)).toContain('unused_template_value');
    expect(result.issues.filter((issue) => issue.type === 'unused_cluster_value')).toHaveLength(2);
  });

  it('detects unreachable resource files, orphan kustomization directories, and stale variables', async () => {
    const app = create_template(
      temp_dir,
      'app',
      [
        {
          name: 'main',
          path: './main',
          substitutions: [{ name: 'replicas' }, { name: 'unused_substitution' }],
        },
      ],
      [
        {
          name: 'image_tag',
          default: 'latest',
          registry: { image: 'nginx', type: 'dockerhub' },
        },
      ],
    );

    await write_file(
      path.join(app.path, 'main', 'kustomization.yaml'),
      `resources:
  - deployment.yaml
configMapGenerator:
  - name: app-config
    files:
      - app.conf
`,
    );
    await write_file(
      path.join(app.path, 'main', 'deployment.yaml'),
      'replicas: ${replicas}\nimage: nginx:${undeclared_tag}\n',
    );
    await write_file(path.join(app.path, 'main', 'app.conf'), 'image=${image_tag}\n');
    await write_file(path.join(app.path, 'main', 'stale.yaml'), 'kind: ConfigMap\n');
    await write_file(
      path.join(app.path, 'old', 'kustomization.yaml'),
      'resources:\n  - old.yaml\n',
    );
    await write_file(path.join(app.path, 'old', 'old.yaml'), 'kind: Namespace\n');

    const cluster = create_cluster('prod', {
      templates: [{ name: 'app' }],
    });

    const result = await validate_usage(temp_dir, [cluster], [app]);
    const types = issue_types(result);

    expect(result.valid).toBe(false);
    expect(types).toContain('unused_resource');
    expect(types).toContain('unused_kustomization_directory');
    expect(types).toContain('undeclared_variable');
    expect(types).toContain('unused_substitution');
    expect(types).not.toContain('unused_template_version');
  });

  it('detects missing declared kustomization paths and missing local references', async () => {
    const app = create_template(temp_dir, 'app', [
      { name: 'missing-path', path: './does-not-exist' },
      { name: 'main', path: './main' },
    ]);

    await write_file(
      path.join(app.path, 'main', 'kustomization.yaml'),
      'resources:\n  - missing-resource.yaml\n',
    );

    const cluster = create_cluster('prod', {
      templates: [{ name: 'app' }],
    });

    const result = await validate_usage(temp_dir, [cluster], [app]);
    const types = issue_types(result);

    expect(result.valid).toBe(false);
    expect(types).toContain('missing_kustomization_path');
    expect(types).toContain('missing_resource_reference');
  });

  it('passes when every template, value, resource, and variable is reachable', async () => {
    const app = create_template(temp_dir, 'app', [
      {
        name: 'main',
        path: './main',
        namespace: { default: 'app' },
        substitutions: [{ name: 'replicas' }],
      },
    ]);

    await write_file(
      path.join(app.path, 'main', 'kustomization.yaml'),
      'resources:\n  - deployment.yaml\n',
    );
    await write_file(
      path.join(app.path, 'main', 'deployment.yaml'),
      'namespace: ${namespace}\nreplicas: ${replicas}\n',
    );

    const cluster = create_cluster('prod', {
      templates: [{ name: 'app', values: { replicas: '3' } }],
    });

    const result = await validate_usage(temp_dir, [cluster], [app]);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
