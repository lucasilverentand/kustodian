# @kustodian/plugins

Plugin system infrastructure for Kustodian. Provides a complete framework for extending Kustodian with custom commands, hooks, generators, and object types.

## Installation

```bash
bun add @kustodian/plugins
```

## API Overview

### Plugin Registry

The central system for managing plugins and their contributions.

```typescript
import { create_plugin_registry, type PluginRegistryType } from '@kustodian/plugins';

const registry = create_plugin_registry();
registry.register(loaded_plugin);
await registry.activate_all(context);
```

### Plugin Loader

Discovers and loads plugins from npm packages and local directories.

```typescript
import { create_plugin_loader } from '@kustodian/plugins';

const loader = create_plugin_loader({
  local_plugin_dirs: ['./plugins'],
  search_node_modules: true,
  npm_prefixes: ['@kustodian/plugin-', 'kustodian-plugin-'],
});

const plugins = await loader.discover();
const loaded = await loader.load('my-plugin');
```

### Hook System

Event-driven hooks for generator, CLI, bootstrap, validation, and output lifecycle events.

```typescript
import { create_hook_dispatcher, type PluginHookContributionType } from '@kustodian/plugins';

const hook: PluginHookContributionType = {
  event: 'generator:before',
  priority: 50,
  handler: async (event, context) => success(context),
};
```

### Generators

Create Kubernetes resources from custom object types.

```typescript
import { define_generator, type PluginGeneratorType } from '@kustodian/plugins';

const generator = define_generator({
  name: 'my-generator',
  handles: [{ api_version: 'example.io/v1', kind: 'MyResource' }],
  generate: async (object, context) => success([]),
});
```

### Object Types

Define custom Kubernetes-style object types with Zod validation.

```typescript
import { define_object_type, create_object_type_registry } from '@kustodian/plugins';
import { z } from 'zod';

const myType = define_object_type({
  api_version: 'example.io/v1',
  kind: 'MyResource',
  schema: z.object({ apiVersion: z.string(), kind: z.string() }),
  locations: ['cluster.spec', 'template.spec'],
});
```

### Creating a Plugin

```typescript
import type { KustodianPluginType } from '@kustodian/plugins';

const plugin: KustodianPluginType = {
  manifest: {
    name: '@my-org/kustodian-plugin-example',
    version: '1.0.0',
    capabilities: ['commands', 'hooks', 'generators', 'object-types'],
  },
  activate: async (ctx) => success(undefined),
  deactivate: async () => success(undefined),
  get_commands: () => [],
  get_hooks: () => [],
  get_generators: () => [],
  get_object_types: () => [],
};

export default plugin;
```

## License

MIT

## Repository

[https://github.com/lucasilverentand/kustodian](https://github.com/lucasilverentand/kustodian)
