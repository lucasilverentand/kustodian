# @kustodian/generator

Template processing and Flux CD resource generation for Kustodian.

## Installation

```bash
bun add @kustodian/generator
```

## Overview

This package provides the core generation engine for transforming Kustodian templates into Flux CD resources. It handles template resolution, variable substitution, dependency validation, and output serialization.

## API

### Generator

```typescript
import { create_generator } from '@kustodian/generator';

const generator = create_generator({
  flux_namespace: 'flux-system',
  git_repository_name: 'flux-system',
});

// Generate Flux resources for a cluster
const result = await generator.generate(cluster, templates, {
  output_dir: './output',
});

// Write generated resources to disk
await generator.write(result.value);
```

### Flux Resource Generation

- `generate_flux_kustomization()` - Creates Flux Kustomization resources
- `generate_flux_oci_repository()` - Creates OCI Repository sources
- `generate_depends_on()` - Resolves dependency references
- `generate_health_checks()` - Configures health checks

### Substitution Processing

- `substitute_string()` / `substitute_object()` - Apply variable substitutions
- `validate_substitutions()` - Validate required values are provided
- `extract_external_substitutions()` - Extract 1Password/Doppler references

### Namespace Management

- `generate_namespace_resources()` - Generate Namespace resources
- `collect_namespaces()` - Collect all namespaces from templates
- `filter_system_namespaces()` - Filter out system namespaces

### Dependency Validation

- `validate_dependencies()` - Validate dependency graph
- `validate_dependency_graph()` - Full graph validation with cycle detection
- `build_dependency_graph()` - Build dependency graph from templates

### Output Serialization

- `serialize_resource()` / `serialize_resources()` - Serialize to YAML/JSON
- `write_generation_result()` - Write all generated resources to disk

## License

MIT

## Repository

[github.com/lucasilverentand/kustodian](https://github.com/lucasilverentand/kustodian)
