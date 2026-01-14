# @kustodian/nodes

Node definitions, roles, and labeling utilities for Kustodian Kubernetes cluster management.

## Installation

```bash
bun add @kustodian/nodes
```

## API Overview

### Types

- **`NodeType`** - Node definition with name, role, address, SSH config, labels, taints, and annotations
- **`NodeRoleType`** - Node role: `'controller'` | `'worker'` | `'controller+worker'`
- **`NodeListType`** - Collection of nodes with cluster name and default SSH configuration
- **`TaintType`** - Kubernetes taint configuration with key, value, and effect
- **`SshConfigType`** - SSH connection settings (user, key path, port, known hosts)

### Node Utilities

```typescript
import {
  is_controller,
  is_worker,
  get_controllers,
  get_workers,
  get_primary_controller,
  get_node_ssh_config,
} from '@kustodian/nodes';
```

### Label Management

```typescript
import {
  format_label_key,
  format_label_value,
  format_node_labels,
  calculate_label_changes,
  calculate_all_label_changes,
} from '@kustodian/nodes';
```

The labeler module provides diff-based label synchronization with support for add, update, and remove operations.

### Profile Resolution

```typescript
import {
  resolve_node_profile,
  resolve_all_node_profiles,
  validate_profile_references,
} from '@kustodian/nodes';
```

Profiles allow shared configuration (labels, taints, annotations) to be defined once and applied to multiple nodes. Node-specific values override profile defaults.

## License

MIT

## Repository

[github.com/lucasilverentand/kustodian](https://github.com/lucasilverentand/kustodian)
