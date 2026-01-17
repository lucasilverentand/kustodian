# Smart Enable/Disable System for Kustomizations

**Issue:** #109
**Status:** ✅ Implemented

## Overview

This feature introduces a smart enable/disable system for kustomizations that:
- Allows templates to define default enabled/disabled states
- Enables cluster-specific overrides
- Preserves storage and secrets when disabling database/stateful workloads
- Validates dependencies to prevent breaking changes

## Key Features

### 1. Template-Level Defaults

Templates can now specify which kustomizations should be disabled by default:

```yaml
apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: database
spec:
  kustomizations:
    - name: cnpg-operator
      path: operator
      enabled: true  # Always enabled (default)

    - name: authelia-db
      path: clusters/authelia
      enabled: false  # Disabled by default
      preservation:
        mode: stateful  # Keep PVCs, Secrets, ConfigMaps
```

### 2. Cluster-Level Overrides

Clusters can selectively enable specific kustomizations:

```yaml
apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: production
spec:
  templates:
    - name: database
      enabled: true
      kustomizations:
        authelia-db: true  # Enable this database
        gitea-db:
          enabled: true
          preservation:
            mode: stateful  # Override preservation policy
```

### 3. Smart Preservation Modes

Three preservation modes protect against data loss:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `none` | Delete all resources | Stateless apps, clean removal |
| `stateful` | Keep PVCs, Secrets, ConfigMaps | **Default** - Databases, caches |
| `custom` | Keep specified resource types | Fine-grained control |

**How it works:**
- When a kustomization is disabled, Flux Kustomization patches add labels to preserved resources
- The `kustodian.io/preserve: "true"` label marks resources to keep
- Non-preserved resources are automatically pruned
- Preserved resources remain in the cluster for future use

### 4. Dependency Validation

The system prevents breaking changes by validating dependencies:

```yaml
kustomizations:
  - name: app
    depends_on: [database]
    enabled: true

  - name: database
    enabled: false  # ❌ ERROR: app depends on database
```

**Error message:**
```
Enabled kustomization 'myapp/app' depends on disabled kustomization 'database/postgres'.
Either enable 'database/postgres' or disable 'myapp/app'.
```

## Architecture

### Schema Changes

**packages/schema/src/template.ts:**
```typescript
export const preservation_mode_schema = z.enum(['none', 'stateful', 'custom']);

export const preservation_policy_schema = z.object({
  mode: preservation_mode_schema.default('stateful'),
  keep_resources: z.array(z.string()).optional(),
});

export const kustomization_schema = z.object({
  // ... existing fields
  enabled: z.boolean().optional().default(true),
  preservation: preservation_policy_schema.optional(),
});
```

**packages/schema/src/cluster.ts:**
```typescript
export const kustomization_override_schema = z.object({
  enabled: z.boolean(),
  preservation: z.object({
    mode: preservation_mode_schema,
  }).optional(),
});

export const template_config_schema = z.object({
  // ... existing fields
  kustomizations: z.record(
    z.string(),
    z.union([
      z.boolean(),  // Simple: authelia-db: true
      kustomization_override_schema,  // Advanced: { enabled: true, preservation: ... }
    ])
  ).optional(),
});
```

### Resolution Logic

**packages/generator/src/kustomization-resolution.ts:**

Three-level resolution hierarchy:
1. Template kustomization default (`enabled: false`)
2. Cluster kustomization override (`kustomizations: { authelia-db: true }`)
3. Final resolved state

```typescript
export function resolve_kustomization_state(
  kustomization: KustomizationType,
  template_config: TemplateConfigType | undefined,
  kustomization_name: string,
): ResolvedKustomizationStateType {
  return {
    enabled: resolve_kustomization_enabled(...),
    preservation: resolve_kustomization_preservation(...),
  };
}
```

### Validation

**packages/generator/src/validation/enablement.ts:**

Validates that enabled kustomizations don't depend on disabled ones:

```typescript
export function validate_enablement_dependencies(
  cluster: ClusterType,
  templates: TemplateType[],
): DisabledDependencyErrorType[] {
  // Build enablement map
  // Check each enabled kustomization's dependencies
  // Return errors if dependencies are disabled
}
```

### Preservation Implementation

**packages/generator/src/preservation.ts:**

Label-based preservation strategy:

```typescript
export function generate_preservation_patches(
  preserved_types: string[],
): FluxPatchType[] {
  return preserved_types.map(kind => ({
    patch: `
apiVersion: v1
kind: ${kind}
metadata:
  labels:
    kustodian.io/preserve: "true"
`,
    target: { kind },
  }));
}
```

**Generated Flux Kustomization:**
```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: database-authelia-db
  namespace: flux-system
spec:
  # ... standard fields
  patches:
    - patch: |
        apiVersion: v1
        kind: PersistentVolumeClaim
        metadata:
          labels:
            kustodian.io/preserve: "true"
      target:
        kind: PersistentVolumeClaim
    - patch: |
        apiVersion: v1
        kind: Secret
        metadata:
          labels:
            kustodian.io/preserve: "true"
      target:
        kind: Secret
```

## Use Cases

### Database Template

Perfect for managing multiple optional databases:

```yaml
# Template (e2e/fixtures/valid-project/templates/database/template.yaml)
spec:
  kustomizations:
    - name: cnpg-operator
      enabled: true  # Always needed

    - name: authelia-db
      enabled: false  # Only when Authelia is deployed
      preservation: { mode: stateful }

    - name: gitea-db
      enabled: false
      preservation: { mode: stateful }
```

### Feature Flags

Use for gradual rollouts:

```yaml
# Template
spec:
  kustomizations:
    - name: stable-api
      enabled: true

    - name: experimental-api
      enabled: false  # Opt-in per cluster
```

### Environment-Specific Components

Different clusters enable different components:

```yaml
# Production cluster
templates:
  - name: monitoring
    kustomizations:
      metrics: true
      tracing: true
      profiling: false  # Only in dev

# Development cluster
templates:
  - name: monitoring
    kustomizations:
      metrics: true
      tracing: false  # Reduce overhead
      profiling: true  # Debug performance
```

## Migration Guide

### For Existing Templates

No changes required - all kustomizations default to `enabled: true`.

### To Add Opt-In Kustomizations

1. Add `enabled: false` to kustomizations that should be opt-in
2. Add appropriate `preservation` policy
3. Update cluster configs to explicitly enable as needed

**Example:**
```yaml
# Before
spec:
  kustomizations:
    - name: backup
      path: backup

# After
spec:
  kustomizations:
    - name: backup
      path: backup
      enabled: false  # Opt-in
      preservation:
        mode: custom
        keep_resources: [PersistentVolumeClaim]
```

## Future Enhancements

Potential improvements (not in scope for #109):

1. **Conditional Enablement with CEL:**
   ```yaml
   enabled_when: |
     cluster.nodes.exists(n, n.labels['gpu'] == 'nvidia')
   ```

2. **Resource-Level Disabling:**
   ```yaml
   resource_policy:
     mode: include
     rules:
       - kind: Deployment
         name: worker-*
         enabled: false
   ```

3. **Gradual Rollout:**
   ```yaml
   rollout:
     replicas_percentage: 20
     scale_up_after: 24h
   ```

4. **Maintenance Mode:**
   ```yaml
   maintenance_mode:
     enabled: false
     preserve: all
     redirect_traffic_to: maintenance-page
   ```

## Testing

Run the test suite:
```bash
pnpm run test --filter @kustodian/generator
# Or from repo root:
bun test
```

**Test Results: ✅ 311 tests passing (37 new tests added)**

### New Test Coverage

**Kustomization Resolution Tests** ([tests/kustomization-resolution.test.ts](packages/generator/tests/kustomization-resolution.test.ts)) - 13 tests:
- ✅ Template default enabled states
- ✅ Cluster boolean overrides
- ✅ Cluster object overrides with preservation
- ✅ Default to stateful preservation mode
- ✅ Preservation policy merging
- ✅ Template config lookup from cluster

**Preservation Tests** ([tests/preservation.test.ts](packages/generator/tests/preservation.test.ts)) - 11 tests:
- ✅ Preservation mode resource selection (none/stateful/custom)
- ✅ Default stateful resources (PVC, Secret, ConfigMap)
- ✅ Custom resource type specification
- ✅ Flux patch generation with preserve labels
- ✅ Resource preservation checking

**Enablement Validation Tests** ([tests/enablement-validation.test.ts](packages/generator/tests/enablement-validation.test.ts)) - 13 tests:
- ✅ Dependency blocking (enabled depends on disabled)
- ✅ Cross-template dependency validation
- ✅ Cluster override respect
- ✅ Template-level disable handling
- ✅ Multiple dependency validation
- ✅ Clear error messages

## Documentation Updates

- [x] Schema documentation (inline JSDoc)
- [x] Example templates ([examples/database-template.yaml](examples/database-template.yaml))
- [x] Example cluster config ([examples/cluster-with-selective-databases.yaml](examples/cluster-with-selective-databases.yaml))
- [ ] User guide (if needed)
- [ ] API reference (if needed)

## Summary

This implementation provides a **safe-by-default** enable/disable system that:

✅ **Solves the original problem:** Templates can have disabled-by-default kustomizations
✅ **Prevents data loss:** Stateful resources preserved automatically
✅ **Validates dependencies:** Blocks configurations that would break deployments
✅ **Flexible:** Simple boolean or advanced configuration
✅ **Non-breaking:** Existing templates work without changes

**Files Modified:**
- `packages/schema/src/template.ts` - Added `enabled` and `preservation` to kustomization schema
- `packages/schema/src/cluster.ts` - Added `kustomizations` override map
- `packages/generator/src/kustomization-resolution.ts` - **NEW** - Resolution logic
- `packages/generator/src/preservation.ts` - **NEW** - Preservation patch generation
- `packages/generator/src/validation/enablement.ts` - **NEW** - Dependency validation
- `packages/generator/src/validation/index.ts` - Integrated enablement validation
- `packages/generator/src/generator.ts` - Use resolved state, skip disabled kustomizations
- `packages/generator/src/flux.ts` - Add preservation patches to Flux Kustomizations
- `packages/generator/src/types.ts` - Added `FluxPatchType` and `patches` field
