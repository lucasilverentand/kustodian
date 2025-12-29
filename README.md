# Kustodian

A GitOps templating framework for Kubernetes with Flux CD. Define templates in YAML, extend with plugins.

## What is Kustodian?

Kustodian is a framework for managing Kubernetes cluster configurations using a declarative, YAML-based approach. It generates [Flux CD](https://fluxcd.io/) Kustomizations from simple template definitions, making it easy to:

- **Define reusable templates** for Kubernetes applications
- **Manage multiple clusters** with shared or unique configurations
- **Extend functionality** through a plugin system
- **Keep everything in YAML** - no TypeScript or code required

## Why Kustodian?

Managing Kubernetes configurations at scale is hard. You end up with:

- Duplicated YAML across clusters
- Complex Kustomize overlays that are hard to reason about
- Custom scripts to generate configurations
- No standard way to handle secrets, auth providers, or monitoring

Kustodian solves this by providing:

| Problem | Kustodian Solution |
|---------|-------------------|
| Duplicated configs | Reusable templates with substitutions |
| Complex overlays | Simple YAML template definitions |
| Custom scripts | Standardized generation engine |
| No extensibility | Plugin system for secrets, auth, etc. |

## Quick Example

### Define a Template

```yaml
# templates/nginx/template.yaml
apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: nginx
spec:
  kustomizations:
    - name: deployment
      path: ./deployment
      namespace:
        default: nginx
      substitutions:
        - name: replicas
          default: "2"
        - name: image_tag
          default: "latest"
      health_checks:
        - kind: Deployment
          name: nginx
```

### Configure a Cluster

```yaml
# clusters/production/cluster.yaml
apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: production
spec:
  domain: example.com

  git:
    owner: myorg
    repository: infrastructure
    branch: main
    path: clusters/production

  templates:
    - name: nginx
      enabled: true
      values:
        replicas: "5"
        image_tag: "1.25"
```

### Generate Flux Resources

```bash
kustodian generate --cluster production
```

This generates Flux Kustomization CRs that deploy your templates to the cluster.

## Core Concepts

### Templates

Templates define reusable Kubernetes configurations. Each template contains one or more **kustomizations** - units of deployment that map to Flux Kustomization resources.

```yaml
apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: my-app
spec:
  kustomizations:
    - name: operator      # Deployed first
      path: ./operator
      namespace:
        default: my-app

    - name: instance      # Deployed after operator
      path: ./instance
      depends_on:
        - operator
```

### Clusters

Clusters define where and how templates are deployed. Each cluster specifies which templates to enable and what values to use.

```yaml
apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: staging
spec:
  domain: staging.example.com
  templates:
    - name: my-app
      enabled: true
      values:
        replicas: "1"
```

### Plugins

Plugins extend Kustodian's functionality. They can:

- **Generate resources** - Create additional Kubernetes resources (e.g., Authentik SSO blueprints)
- **Provide secrets** - Integrate with secret managers (e.g., Doppler, 1Password)
- **Validate configs** - Add custom validation rules
- **Transform resources** - Modify resources before output

```yaml
# Using plugins in a cluster
spec:
  plugins:
    - name: authentik-blueprints
    - name: doppler-secrets
      config:
        project: my-project
```

## Packages

Kustodian is built as a collection of packages:

| Package | Description |
|---------|-------------|
| `@kustodian/core` | Core utilities, error handling, Result type |
| `@kustodian/schema` | JSON Schema definitions for YAML validation |
| `@kustodian/loader` | YAML file loading and validation |
| `@kustodian/cli` | CLI framework with DI and middleware |
| `@kustodian/plugins` | Plugin system infrastructure |
| `@kustodian/generator` | Template processing and Flux generation |

### Official Plugins

| Plugin | Description |
|--------|-------------|
| `@kustodian/plugin-authentik` | Generate Authentik SSO blueprints |
| `@kustodian/plugin-doppler` | Doppler secret management |
| `@kustodian/plugin-1password` | 1Password secret management |

## Installation

```bash
# Install the CLI
npm install -g @kustodian/cli

# Or use with npx
npx @kustodian/cli generate --cluster production
```

## Usage

### Initialize a New Project

```bash
kustodian init my-infrastructure
cd my-infrastructure
```

This creates:

```
my-infrastructure/
├── templates/
│   └── example/
│       ├── template.yaml
│       └── deployment/
│           └── kustomization.yaml
├── clusters/
│   └── local/
│       └── cluster.yaml
└── kustodian.yaml
```

### Generate Configurations

```bash
# Generate for a specific cluster
kustodian generate --cluster production

# Generate for all clusters
kustodian generate --all

# Dry run (show what would be generated)
kustodian generate --cluster production --dry-run
```

### Validate Configurations

```bash
# Validate all templates and clusters
kustodian validate

# Validate a specific cluster
kustodian validate --cluster production
```

## Documentation

- [Getting Started Guide](https://kustodian.io/guide/getting-started)
- [Template Reference](https://kustodian.io/templates/overview)
- [Plugin Development](https://kustodian.io/plugins/creating-plugins)
- [API Reference](https://kustodian.io/api/)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details on:

- Development setup
- Code style (follows [OneZero Handbook](https://handbook.onezero.company))
- Pull request process
- Testing requirements (80% coverage minimum)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

Kustodian builds on the excellent work of:

- [Flux CD](https://fluxcd.io/) - GitOps toolkit for Kubernetes
- [Kustomize](https://kustomize.io/) - Kubernetes configuration management
