# Kustodian JSON Schemas

This directory contains JSON Schema definitions for all Kustodian resource types. These schemas are automatically generated from the Zod schemas defined in the `src/` directory.

For detailed installation instructions, see [SCHEMA_INSTALLATION.md](../SCHEMA_INSTALLATION.md).

## Quick Start

Copy [vscode-settings.example.json](./vscode-settings.example.json) to your project's `.vscode/settings.json` to enable automatic schema validation in VSCode.

## Available Schemas

- **template.json** - Schema for Template resources (`kind: Template`)
- **cluster.json** - Schema for Cluster resources (`kind: Cluster`)
- **node.json** - Schema for Node resources (`kind: Node`)
- **node-profile.json** - Schema for NodeProfile resources (`kind: NodeProfile`)

## Using in YAML Files

Add a `$schema` directive at the top of your YAML files to enable IDE validation and autocompletion:

### Template Files

```yaml
# $schema: https://kustodian.io/schemas/template.json
apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: my-app
spec:
  kustomizations:
    - name: deployment
      path: ./deployment
      namespace:
        default: my-app
```

### Node Files

Individual node definitions (e.g., `clusters/production/nodes/controller-1.yaml`):

```yaml
# $schema: https://kustodian.io/schemas/node.json
apiVersion: kustodian.io/v1
kind: Node
metadata:
  name: controller-1
  cluster: production
spec:
  role: controller+worker
  address: 10.0.0.10
  labels:
    metallb: true
    storage: nvme
```

### Cluster Files

```yaml
# $schema: https://kustodian.io/schemas/cluster.json
apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: production
spec:
  domain: example.com
  templates:
    - name: my-app
      enabled: true
```

## Using with npm Package

The schemas are included in the `@kustodian/schema` npm package and can be accessed programmatically:

```typescript
import templateSchema from '@kustodian/schema/schemas/template.json';
import clusterSchema from '@kustodian/schema/schemas/cluster.json';
```

## Regenerating Schemas

To regenerate the JSON Schema files from the Zod schemas:

```bash
bun run generate-schemas
```

This command should be run whenever the Zod schemas in `src/` are updated to ensure the JSON Schemas stay in sync.
