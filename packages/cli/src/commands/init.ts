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
        oci_repository: 'flux-system',
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
        oci: {
          registry: 'ghcr.io',
          repository: `your-org/${project_name}`,
          tag_strategy: 'git-sha',
          secret_ref: 'ghcr-auth',
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

    // Create GitHub Actions workflow
    const workflow_yaml = `name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Flux CLI
        uses: fluxcd/flux2/action@main

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Install kustodian
        run: |
          # TODO: Replace with actual installation method
          # npm install -g @kustodian/cli
          echo "Install kustodian CLI here"

      - name: Validate configuration
        run: |
          # TODO: Run validation once kustodian is installed
          echo "Validation step"

      - name: Push artifacts (on main branch)
        if: github.ref == 'refs/heads/main'
        run: |
          # TODO: Replace with actual push command once kustodian is installed
          # for cluster in clusters/*/cluster.yaml; do
          #   cluster_name=$(basename $(dirname $cluster))
          #   echo "Pushing $cluster_name..."
          #   kustodian push --cluster $cluster_name
          # done
          echo "Push step (configure after installing kustodian)"
`;

    result = await write_file(
      path.join(project_dir, '.github', 'workflows', 'deploy.yaml'),
      workflow_yaml,
    );
    if (!result.success) {
      console.error(`Error creating workflow: ${result.error.message}`);
      return result;
    }
    console.log('  Created .github/workflows/deploy.yaml');

    console.log(`\n✓ Project '${project_name}' created successfully`);
    console.log('\nNext steps:');
    console.log(`  1. cd ${project_name}`);
    console.log(
      '  2. Initialize git repository: git init && git add . && git commit -m "Initial commit"',
    );
    console.log('  3. Update clusters/local/cluster.yaml with your OCI registry details');
    console.log('  4. Create registry authentication secret in your cluster:');
    console.log('     kubectl create secret docker-registry ghcr-auth \\');
    console.log('       --docker-server=ghcr.io \\');
    console.log('       --docker-username=<your-username> \\');
    console.log('       --docker-password=<your-token>');
    console.log('  5. Generate and push: kustodian push --cluster local --dry-run');
    console.log('  6. Review output, then: kustodian push --cluster local');
    console.log('  7. Apply Flux resources: kubectl apply -f output/local/');

    return success(undefined);
  },
});
