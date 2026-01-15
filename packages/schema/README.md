# @kustodian/schema

Zod schema definitions for validating Kustodian YAML configuration files. This package provides type-safe validation for Cluster, Template, Node, and NodeProfile resources.

## Installation

```bash
bun add @kustodian/schema
```

## API Overview

### Resource Schemas

- **`cluster_schema`** - Cluster resource definition with Git/OCI source, templates, and node configuration
- **`template_schema`** - Template resource with kustomization definitions
- **`node_resource_schema`** - Node resource with role, address, SSH config, labels, and taints
- **`node_profile_resource_schema`** - Reusable node profile with labels, taints, and annotations

### Validation Functions

```typescript
import { validate_cluster, validate_template, validate_node_resource, validate_node_profile_resource } from '@kustodian/schema';

const result = validate_cluster(yamlData);
if (result.success) {
  // result.data is fully typed as ClusterType
}
```

### Substitution Types

The package supports multiple substitution types for template values:

- **Generic** - Simple key-value substitutions
- **Version** - Container image version tracking with semver constraints
- **Namespace** - Kubernetes namespace with validation
- **1Password** - Secrets from 1Password vaults (`op://` references)
- **Doppler** - Secrets from Doppler projects

### Type Guards

```typescript
import { is_version_substitution, is_onepassword_substitution } from '@kustodian/schema';

if (is_version_substitution(sub)) {
  // sub.registry is available
}
```

### Exported Types

All schemas export corresponding TypeScript types:

- `ClusterType`, `TemplateType`, `NodeResourceType`, `NodeProfileResourceType`
- `SubstitutionType`, `VersionSubstitutionType`, `GenericSubstitutionType`
- `KustomizationType`, `HealthCheckType`, `TaintSchemaType`

## License

MIT

## Repository

[github.com/lucasilverentand/kustodian](https://github.com/lucasilverentand/kustodian)
