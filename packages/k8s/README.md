# @kustodian/k8s

TypeScript client wrappers for Kubernetes and Flux runtime operations. Provides a clean, type-safe interface for interacting with `kubectl` and `flux` CLI tools.

## Installation

```bash
bun add @kustodian/k8s
```

## API Overview

### Kubectl Client

Create a kubectl client to interact with Kubernetes clusters:

```typescript
import { create_kubectl_client } from '@kustodian/k8s';

const kubectl = create_kubectl_client({
  kubeconfig: '/path/to/kubeconfig', // optional
  context: 'my-context',             // optional
  timeout: 60000,                    // optional, ms
});

// Apply manifests
await kubectl.apply('./manifest.yaml', { dry_run: true, server_side: true });

// Get resources
await kubectl.get({ kind: 'Pod', name: 'my-pod', namespace: 'default' });

// Delete resources
await kubectl.delete({ kind: 'Deployment', name: 'my-app', namespace: 'default' });

// Wait for conditions
await kubectl.wait({ kind: 'Pod', name: 'my-pod', namespace: 'default' }, 'condition=Ready');

// Get logs
await kubectl.logs('my-pod', 'default', { tail: 100 });

// Label nodes
await kubectl.label('node-1', { 'node-role': 'worker' });

// Annotate resources
await kubectl.annotate({ kind: 'Service', name: 'my-svc', namespace: 'default' }, { 'description': 'My service' });
```

### Flux Client

Create a Flux client for GitOps operations:

```typescript
import { create_flux_client } from '@kustodian/k8s';

const flux = create_flux_client({
  kubeconfig: '/path/to/kubeconfig', // optional
  context: 'my-context',             // optional
});

// Bootstrap Flux
await flux.bootstrap({
  provider: 'github',
  owner: 'my-org',
  repository: 'my-repo',
  path: 'clusters/production',
});

// Check Flux status
await flux.check();

// Reconcile resources
await flux.reconcile({ kind: 'Kustomization', name: 'my-app', namespace: 'flux-system' });

// Suspend/Resume resources
await flux.suspend({ kind: 'HelmRelease', name: 'my-release', namespace: 'default' });
await flux.resume({ kind: 'HelmRelease', name: 'my-release', namespace: 'default' });

// Install/Uninstall Flux
await flux.install();
await flux.uninstall();
```

### Kubeconfig Manager

Manage kubeconfig files and contexts:

```typescript
import { create_kubeconfig_manager } from '@kustodian/k8s';

const kubeconfig = create_kubeconfig_manager();

// Get default path
const path = kubeconfig.get_default_path();

// List and switch contexts
const contexts = await kubeconfig.list_contexts();
await kubeconfig.set_context('production');

// Merge kubeconfigs
await kubeconfig.merge('/path/to/new-kubeconfig');
```

### Result Types

All async operations return a `ResultType<T, KustodianErrorType>` for type-safe error handling:

```typescript
const result = await kubectl.get({ kind: 'Pod', name: 'my-pod', namespace: 'default' });

if (result.success) {
  console.log(result.value); // K8sObjectType[]
} else {
  console.error(result.error); // { code: string, message: string }
}
```

## License

MIT

## Repository

[https://github.com/lucasilverentand/kustodian](https://github.com/lucasilverentand/kustodian)
