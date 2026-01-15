# @kustodian/plugin-k0s

A [k0s](https://k0sproject.io/) cluster provider plugin for [Kustodian](https://github.com/lucasilverentand/kustodian).

## Installation

```bash
bun add @kustodian/plugin-k0s
```

## Overview

This plugin provides k0s cluster lifecycle management through the [k0sctl](https://github.com/k0sproject/k0sctl) tool. It implements the `ClusterProviderType` interface from `@kustodian/plugins`.

### Features

- **Cluster Bootstrap**: Automatically generates k0sctl configuration from your node definitions and deploys k0s
- **Kubeconfig Retrieval**: Fetch kubeconfig from deployed clusters
- **Cluster Reset**: Tear down clusters with optional force mode
- **Configuration Validation**: Validates node configurations before deployment
- **Dry Run Support**: Test configurations without applying changes

### Prerequisites

- [k0sctl](https://github.com/k0sproject/k0sctl) must be installed and available in your PATH
- SSH access to target nodes

## Usage

```typescript
import { create_k0s_plugin, create_k0s_provider } from '@kustodian/plugin-k0s';

// Create provider with options
const provider = create_k0s_provider({
  k0s_version: '1.30.0+k0s.0',
  telemetry_enabled: false,
  dynamic_config: true,
});

// Or use the plugin directly
const plugin = create_k0s_plugin({
  k0s_version: '1.30.0+k0s.0',
});
```

### Provider Options

| Option | Type | Description |
|--------|------|-------------|
| `k0s_version` | `string` | k0s version to install |
| `telemetry_enabled` | `boolean` | Enable k0s telemetry (default: `false`) |
| `dynamic_config` | `boolean` | Enable dynamic configuration |
| `default_ssh` | `SshConfigType` | Default SSH configuration for nodes |

## License

MIT
