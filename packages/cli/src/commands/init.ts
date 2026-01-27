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
        defaults: {
          flux_namespace: 'flux-system',
          oci_repository_name: 'kustodian-oci',
          oci_registry_secret_name: 'kustodian-oci-registry',
          flux_reconciliation_interval: '10m',
          flux_reconciliation_timeout: '5m',
        },
      },
    };

    let result = await write_yaml_file(path.join(project_dir, 'kustodian.yaml'), kustodian_config);
    if (!result.success) {
      console.error(`Error creating kustodian.yaml: ${result.error.message}`);
      return result;
    }
    console.log('  Created kustodian.yaml');

    // Create nginx template
    const nginx_template = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Template',
      metadata: {
        name: 'nginx',
      },
      spec: {
        kustomizations: [
          {
            name: 'web',
            path: './web',
            namespace: {
              default: 'nginx',
              create: true,
            },
            prune: true,
            wait: true,
            timeout: '5m',
            health_checks: [
              {
                kind: 'Deployment',
                name: 'nginx',
                namespace: 'nginx',
              },
            ],
            substitutions: [
              {
                name: 'replicas',
                default: '2',
              },
              {
                name: 'image_tag',
                default: '1.25-alpine',
              },
              {
                name: 'domain',
                default: 'nginx.local',
              },
              {
                name: 'service_type',
                default: 'NodePort',
              },
              {
                name: 'namespace',
                default: 'nginx',
              },
            ],
          },
        ],
      },
    };

    result = await write_yaml_file(
      path.join(project_dir, 'templates', 'nginx', 'template.yaml'),
      nginx_template,
    );
    if (!result.success) {
      console.error(`Error creating template: ${result.error.message}`);
      return result;
    }
    console.log('  Created templates/nginx/template.yaml');

    // Create nginx kustomization.yaml
    const nginx_kustomization = `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - configmap.yaml
  - deployment.yaml
  - service.yaml
`;

    result = await write_file(
      path.join(project_dir, 'templates', 'nginx', 'web', 'kustomization.yaml'),
      nginx_kustomization,
    );
    if (!result.success) {
      console.error(`Error creating kustomization.yaml: ${result.error.message}`);
      return result;
    }
    console.log('  Created templates/nginx/web/kustomization.yaml');

    // Create namespace
    const nginx_namespace = `apiVersion: v1
kind: Namespace
metadata:
  name: \${namespace}
`;

    result = await write_file(
      path.join(project_dir, 'templates', 'nginx', 'web', 'namespace.yaml'),
      nginx_namespace,
    );
    if (!result.success) {
      console.error(`Error creating namespace.yaml: ${result.error.message}`);
      return result;
    }
    console.log('  Created templates/nginx/web/namespace.yaml');

    // Create configmap with test website
    const nginx_configmap = `apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-html
  namespace: \${namespace}
data:
  index.html: |
    <!DOCTYPE html>
    <html>
    <head>
      <title>Kustodian Nginx Demo</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 800px;
          margin: 100px auto;
          padding: 20px;
          text-align: center;
        }
        h1 { color: #009639; }
        .info {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          margin-top: 30px;
        }
      </style>
    </head>
    <body>
      <h1>🎉 Kustodian + Nginx</h1>
      <p>This is a test website deployed via Kustodian templates.</p>
      <div class="info">
        <p><strong>Domain:</strong> \${domain}</p>
        <p><strong>Replicas:</strong> \${replicas}</p>
        <p><strong>Namespace:</strong> \${namespace}</p>
      </div>
    </body>
    </html>
`;

    result = await write_file(
      path.join(project_dir, 'templates', 'nginx', 'web', 'configmap.yaml'),
      nginx_configmap,
    );
    if (!result.success) {
      console.error(`Error creating configmap.yaml: ${result.error.message}`);
      return result;
    }
    console.log('  Created templates/nginx/web/configmap.yaml');

    // Create deployment
    const nginx_deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: \${namespace}
  labels:
    app: nginx
spec:
  replicas: \${replicas}
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:\${image_tag}
          ports:
            - name: http
              containerPort: 80
              protocol: TCP
          volumeMounts:
            - name: html
              mountPath: /usr/share/nginx/html
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: html
          configMap:
            name: nginx-html
`;

    result = await write_file(
      path.join(project_dir, 'templates', 'nginx', 'web', 'deployment.yaml'),
      nginx_deployment,
    );
    if (!result.success) {
      console.error(`Error creating deployment.yaml: ${result.error.message}`);
      return result;
    }
    console.log('  Created templates/nginx/web/deployment.yaml');

    // Create service
    const nginx_service = `apiVersion: v1
kind: Service
metadata:
  name: nginx
  namespace: \${namespace}
  labels:
    app: nginx
spec:
  type: \${service_type}
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: nginx
`;

    result = await write_file(
      path.join(project_dir, 'templates', 'nginx', 'web', 'service.yaml'),
      nginx_service,
    );
    if (!result.success) {
      console.error(`Error creating service.yaml: ${result.error.message}`);
      return result;
    }
    console.log('  Created templates/nginx/web/service.yaml');

    // Create local cluster
    const local_cluster = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: {
        name: 'local',
      },
      spec: {
        domain: 'local.cluster',
        oci: {
          registry: 'ghcr.io',
          repository: `your-org/${project_name}`,
          tag_strategy: 'git-sha',
          secret_ref: 'ghcr-auth',
        },
        templates: [
          {
            name: 'nginx',
            enabled: true,
            values: {
              replicas: '3',
              domain: 'nginx.local.cluster',
              service_type: 'NodePort',
            },
          },
        ],
      },
    };

    result = await write_yaml_file(
      path.join(project_dir, 'clusters', 'local', 'cluster.yaml'),
      local_cluster,
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
          # bun install -g @kustodian/cli
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
