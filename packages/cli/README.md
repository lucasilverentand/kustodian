# @kustodian/cli

Command-line interface for Kustodian - a GitOps templating framework for Kubernetes with Flux CD.

## Installation

```bash
bun add -g @kustodian/cli
```

## Usage

```bash
kustodian <command> [options]
```

## Commands

### `init <name>`

Initialize a new Kustodian project with example templates and cluster configuration.

```bash
kustodian init my-project
```

Options:
- `--force, -f` - Overwrite existing files

### `validate`

Validate cluster and template configurations, including dependency graph validation.

```bash
kustodian validate
kustodian validate --cluster production
```

Options:
- `--cluster, -c <name>` - Validate a specific cluster only
- `--project, -p <path>` - Path to project root (defaults to current directory)

### `apply`

Apply full cluster configuration: bootstrap nodes, install Flux CD, and deploy templates.

```bash
kustodian apply --cluster production
kustodian apply --cluster local --dry-run
```

Options:
- `--cluster, -c <name>` - Cluster name to apply (required)
- `--provider, -P <name>` - Cluster provider for bootstrap (default: k0s)
- `--project, -p <path>` - Path to project root
- `--dry-run, -d` - Preview changes without applying
- `--skip-bootstrap` - Skip cluster bootstrap (use existing cluster)
- `--skip-flux` - Skip Flux CD installation
- `--skip-templates` - Skip template deployment

### `update`

Check and update image version substitutions from container registries.

```bash
kustodian update --cluster production
kustodian update --cluster production --dry-run
```

Options:
- `--cluster, -c <name>` - Cluster to update values for (required)
- `--project, -p <path>` - Path to project root
- `--dry-run, -d` - Show what would be updated without making changes
- `--json` - Output results as JSON
- `--substitution, -s <name>` - Only update specific substitution(s)

## Global Options

- `--help, -h` - Show help
- `--version, -v` - Show version

## Links

- [Repository](https://github.com/lucasilverentand/kustodian)

## License

MIT
