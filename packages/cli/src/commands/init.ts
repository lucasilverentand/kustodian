import * as path from 'node:path';
import { success } from '@kustodian/core';
import { file_exists, write_file, write_yaml_file } from '@kustodian/loader';

import { define_command } from '../command.js';

/**
 * Init command - initializes a new Kustodian project.
 */
export const init_command = define_command({
  name: 'init',
  description: 'Initialize a new Kustodian project',
  arguments: [
    {
      name: 'name',
      description: 'Project name (creates directory)',
      required: true,
    },
  ],
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Overwrite existing files',
      type: 'boolean',
      default_value: false,
    },
  ],
  handler: async (ctx) => {
    const project_name = ctx.args[0];
    const force = ctx.options['force'] as boolean;

    if (!project_name) {
      console.error('Error: Project name is required');
      return {
        success: false as const,
        error: { code: 'INVALID_ARGS', message: 'Project name is required' },
      };
    }

    const project_dir = path.resolve(project_name);

    // Check if directory exists
    if (!force && (await file_exists(project_dir))) {
      console.error(`Error: Directory '${project_name}' already exists. Use --force to overwrite.`);
      return {
        success: false as const,
        error: { code: 'ALREADY_EXISTS', message: `Directory '${project_name}' already exists` },
      };
    }

    console.log(`Creating project: ${project_name}`);

    // Create kustodian.yaml
    const kustodian_config = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Project',
      metadata: {
        name: project_name,
      },
      spec: {
        flux_namespace: 'flux-system',
        git_repository: 'flux-system',
      },
    };

    let result = await write_yaml_file(path.join(project_dir, 'kustodian.yaml'), kustodian_config);
    if (!result.success) {
      console.error(`Error creating kustodian.yaml: ${result.error.message}`);
      return result;
    }
    console.log('  Created kustodian.yaml');

    // Create example template
    const example_template = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Template',
      metadata: {
        name: 'example',
      },
      spec: {
        kustomizations: [
          {
            name: 'app',
            path: './app',
            namespace: {
              default: 'example',
            },
            substitutions: [
              {
                name: 'replicas',
                default: '1',
              },
            ],
          },
        ],
      },
    };

    result = await write_yaml_file(
      path.join(project_dir, 'templates', 'example', 'template.yaml'),
      example_template,
    );
    if (!result.success) {
      console.error(`Error creating template: ${result.error.message}`);
      return result;
    }
    console.log('  Created templates/example/template.yaml');

    // Create example kustomization.yaml
    const example_kustomization = `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
`;

    result = await write_file(
      path.join(project_dir, 'templates', 'example', 'app', 'kustomization.yaml'),
      example_kustomization,
    );
    if (!result.success) {
      console.error(`Error creating kustomization.yaml: ${result.error.message}`);
      return result;
    }
    console.log('  Created templates/example/app/kustomization.yaml');

    // Create example deployment
    const example_deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: example
spec:
  replicas: \${replicas}
  selector:
    matchLabels:
      app: example
  template:
    metadata:
      labels:
        app: example
    spec:
      containers:
        - name: example
          image: nginx:latest
          ports:
            - containerPort: 80
`;

    result = await write_file(
      path.join(project_dir, 'templates', 'example', 'app', 'deployment.yaml'),
      example_deployment,
    );
    if (!result.success) {
      console.error(`Error creating deployment.yaml: ${result.error.message}`);
      return result;
    }
    console.log('  Created templates/example/app/deployment.yaml');

    // Create example cluster
    const example_cluster = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: {
        name: 'local',
      },
      spec: {
        domain: 'local.example.com',
        git: {
          owner: 'your-org',
          repository: project_name,
        },
        templates: [
          {
            name: 'example',
            enabled: true,
            values: {
              replicas: '2',
            },
          },
        ],
      },
    };

    result = await write_yaml_file(
      path.join(project_dir, 'clusters', 'local', 'cluster.yaml'),
      example_cluster,
    );
    if (!result.success) {
      console.error(`Error creating cluster: ${result.error.message}`);
      return result;
    }
    console.log('  Created clusters/local/cluster.yaml');

    // Create .gitignore
    const gitignore = `# Output
output/

# Dependencies
node_modules/

# Build artifacts
dist/
*.tsbuildinfo

# OS files
.DS_Store
`;

    result = await write_file(path.join(project_dir, '.gitignore'), gitignore);
    if (!result.success) {
      console.error(`Error creating .gitignore: ${result.error.message}`);
      return result;
    }
    console.log('  Created .gitignore');

    console.log(`\n✓ Project '${project_name}' created successfully`);
    console.log('\nNext steps:');
    console.log(`  cd ${project_name}`);
    console.log('  kustodian validate');
    console.log('  kustodian generate --cluster local');

    return success(undefined);
  },
});
