import YAML from 'yaml';

import type {
  AffinityType,
  LabelSelectorType,
  MatchExpressionType,
  NodeAffinityType,
  NodeSelectorTermType,
  PodAffinityTermType,
  PodAffinityType,
  ResourceRequirementsType,
  SchedulingType,
  TolerationType,
  TopologySpreadConstraintType,
  WorkloadKindType,
  WorkloadSchedulingType,
} from '../schema/index.js';

import type { KustomizePatchType } from './types.js';

/**
 * Workload kinds that scheduling patches target by default.
 * Covers every core Kubernetes workload that has a pod template.
 */
export const DEFAULT_WORKLOAD_KINDS: readonly WorkloadKindType[] = [
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
] as const;

type K8sMatchExpression = {
  key: string;
  operator: string;
  values?: string[];
};

type K8sLabelSelector = {
  matchLabels?: Record<string, string>;
  matchExpressions?: K8sMatchExpression[];
};

type K8sNodeSelectorTerm = {
  matchExpressions?: K8sMatchExpression[];
  matchFields?: K8sMatchExpression[];
};

type K8sNodeAffinity = {
  requiredDuringSchedulingIgnoredDuringExecution?: {
    nodeSelectorTerms: K8sNodeSelectorTerm[];
  };
  preferredDuringSchedulingIgnoredDuringExecution?: Array<{
    weight: number;
    preference: K8sNodeSelectorTerm;
  }>;
};

type K8sPodAffinityTerm = {
  topologyKey: string;
  labelSelector?: K8sLabelSelector;
  namespaces?: string[];
  namespaceSelector?: K8sLabelSelector;
};

type K8sPodAffinity = {
  requiredDuringSchedulingIgnoredDuringExecution?: K8sPodAffinityTerm[];
  preferredDuringSchedulingIgnoredDuringExecution?: Array<{
    weight: number;
    podAffinityTerm: K8sPodAffinityTerm;
  }>;
};

type K8sAffinity = {
  nodeAffinity?: K8sNodeAffinity;
  podAffinity?: K8sPodAffinity;
  podAntiAffinity?: K8sPodAffinity;
};

type K8sToleration = {
  key?: string;
  operator?: string;
  value?: string;
  effect?: string;
  tolerationSeconds?: number;
};

type K8sTopologySpread = {
  maxSkew: number;
  topologyKey: string;
  whenUnsatisfiable: string;
  labelSelector?: K8sLabelSelector;
  minDomains?: number;
  matchLabelKeys?: string[];
};

type K8sResources = {
  requests?: Record<string, string>;
  limits?: Record<string, string>;
};

type K8sPodSpec = {
  nodeSelector?: Record<string, string>;
  tolerations?: K8sToleration[];
  affinity?: K8sAffinity;
  topologySpreadConstraints?: K8sTopologySpread[];
  priorityClassName?: string;
};

type K8sContainer = {
  name: string;
  resources: K8sResources;
};

/**
 * Shallow-merges two records. Later keys win.
 */
function merge_record<V>(
  base: Record<string, V> | undefined,
  override: Record<string, V> | undefined,
): Record<string, V> | undefined {
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Merges two resource requirement blocks with shallow-merged requests/limits.
 */
function merge_resources(
  base: ResourceRequirementsType | undefined,
  override: ResourceRequirementsType | undefined,
): ResourceRequirementsType | undefined {
  if (!base) return override;
  if (!override) return base;
  const merged: ResourceRequirementsType = {};
  const requests = merge_record(base.requests, override.requests);
  if (requests) merged.requests = requests;
  const limits = merge_record(base.limits, override.limits);
  if (limits) merged.limits = limits;
  return merged;
}

/**
 * Picks override value if defined, otherwise base.
 */
function pick<T>(base: T | undefined, override: T | undefined): T | undefined {
  return override !== undefined ? override : base;
}

/**
 * Merges two workload-level scheduling blocks. Per-field replace semantics,
 * except node_selector/resources which shallow-merge.
 */
export function merge_workload_scheduling(
  base: WorkloadSchedulingType | undefined,
  override: WorkloadSchedulingType | undefined,
): WorkloadSchedulingType | undefined {
  if (!base) return override;
  if (!override) return base;

  const result: WorkloadSchedulingType = {};
  const kind = pick(base.kind, override.kind);
  if (kind !== undefined) result.kind = kind;
  const node_selector = merge_record(base.node_selector, override.node_selector);
  if (node_selector) result.node_selector = node_selector;

  const affinity = pick(base.affinity, override.affinity);
  if (affinity) result.affinity = affinity;

  const tolerations = pick(base.tolerations, override.tolerations);
  if (tolerations) result.tolerations = tolerations;

  const topology_spread = pick(base.topology_spread, override.topology_spread);
  if (topology_spread) result.topology_spread = topology_spread;

  const priority_class = pick(base.priority_class, override.priority_class);
  if (priority_class !== undefined) result.priority_class = priority_class;

  const resources = merge_resources(base.resources, override.resources);
  if (resources) result.resources = resources;

  if (base.containers || override.containers) {
    const containers: Record<string, { resources?: ResourceRequirementsType }> = {};
    for (const [name, cfg] of Object.entries(base.containers ?? {})) {
      if (cfg.resources) containers[name] = { resources: cfg.resources };
      else containers[name] = {};
    }
    for (const [name, cfg] of Object.entries(override.containers ?? {})) {
      const existing = containers[name];
      const merged_res = merge_resources(existing?.resources, cfg.resources);
      containers[name] = merged_res ? { resources: merged_res } : {};
    }
    result.containers = containers;
  }

  return result;
}

/**
 * Merges two full scheduling blocks (workload scheduling + `disabled` + per-workload overrides).
 */
export function merge_scheduling(
  base: SchedulingType | undefined,
  override: SchedulingType | undefined,
): SchedulingType | undefined {
  if (!base) return override;
  if (!override) return base;

  const merged_base = merge_workload_scheduling(base, override) ?? {};
  const result: SchedulingType = { ...merged_base };

  if (override.disabled !== undefined) {
    result.disabled = override.disabled;
  } else if (base.disabled !== undefined) {
    result.disabled = base.disabled;
  }

  if (base.workloads || override.workloads) {
    const workloads: Record<string, WorkloadSchedulingType> = { ...base.workloads };
    for (const [name, cfg] of Object.entries(override.workloads ?? {})) {
      const existing = workloads[name];
      const merged = merge_workload_scheduling(existing, cfg);
      if (merged) workloads[name] = merged;
    }
    if (Object.keys(workloads).length > 0) {
      result.workloads = workloads;
    }
  }

  return result;
}

/**
 * Resolves the effective scheduling block for a kustomization given all three
 * levels (cluster, template-config, kustomization-override).
 *
 * Returns `undefined` when nothing is configured or when `disabled: true`.
 */
export function resolve_scheduling(
  cluster: SchedulingType | undefined,
  template_config: SchedulingType | undefined,
  kustomization: SchedulingType | undefined,
): SchedulingType | undefined {
  const merged = merge_scheduling(merge_scheduling(cluster, template_config), kustomization);
  if (!merged) return undefined;
  if (merged.disabled) return undefined;
  return merged;
}

function to_k8s_match_expression(expr: MatchExpressionType): K8sMatchExpression {
  const out: K8sMatchExpression = { key: expr.key, operator: expr.operator };
  if (expr.values !== undefined) out.values = expr.values;
  return out;
}

function to_k8s_label_selector(selector: LabelSelectorType): K8sLabelSelector {
  const out: K8sLabelSelector = {};
  if (selector.match_labels) out.matchLabels = selector.match_labels;
  if (selector.match_expressions) {
    out.matchExpressions = selector.match_expressions.map(to_k8s_match_expression);
  }
  return out;
}

function to_k8s_node_selector_term(term: NodeSelectorTermType): K8sNodeSelectorTerm {
  const out: K8sNodeSelectorTerm = {};
  if (term.match_expressions) {
    out.matchExpressions = term.match_expressions.map(to_k8s_match_expression);
  }
  if (term.match_fields) {
    out.matchFields = term.match_fields.map(to_k8s_match_expression);
  }
  return out;
}

function to_k8s_node_affinity(affinity: NodeAffinityType): K8sNodeAffinity {
  const out: K8sNodeAffinity = {};
  if (affinity.required && affinity.required.length > 0) {
    out.requiredDuringSchedulingIgnoredDuringExecution = {
      nodeSelectorTerms: affinity.required.map(to_k8s_node_selector_term),
    };
  }
  if (affinity.preferred && affinity.preferred.length > 0) {
    out.preferredDuringSchedulingIgnoredDuringExecution = affinity.preferred.map((p) => ({
      weight: p.weight,
      preference: to_k8s_node_selector_term(p.preference),
    }));
  }
  return out;
}

function to_k8s_pod_affinity_term(term: PodAffinityTermType): K8sPodAffinityTerm {
  const out: K8sPodAffinityTerm = { topologyKey: term.topology_key };
  if (term.label_selector) out.labelSelector = to_k8s_label_selector(term.label_selector);
  if (term.namespaces) out.namespaces = term.namespaces;
  if (term.namespace_selector) {
    out.namespaceSelector = to_k8s_label_selector(term.namespace_selector);
  }
  return out;
}

function to_k8s_pod_affinity(affinity: PodAffinityType): K8sPodAffinity {
  const out: K8sPodAffinity = {};
  if (affinity.required && affinity.required.length > 0) {
    out.requiredDuringSchedulingIgnoredDuringExecution =
      affinity.required.map(to_k8s_pod_affinity_term);
  }
  if (affinity.preferred && affinity.preferred.length > 0) {
    out.preferredDuringSchedulingIgnoredDuringExecution = affinity.preferred.map((p) => ({
      weight: p.weight,
      podAffinityTerm: to_k8s_pod_affinity_term(p.pod_affinity_term),
    }));
  }
  return out;
}

function to_k8s_affinity(affinity: AffinityType): K8sAffinity | undefined {
  const out: K8sAffinity = {};
  if (affinity.node) {
    const node = to_k8s_node_affinity(affinity.node);
    if (Object.keys(node).length > 0) out.nodeAffinity = node;
  }
  if (affinity.pod) {
    const pod = to_k8s_pod_affinity(affinity.pod);
    if (Object.keys(pod).length > 0) out.podAffinity = pod;
  }
  if (affinity.pod_anti) {
    const anti = to_k8s_pod_affinity(affinity.pod_anti);
    if (Object.keys(anti).length > 0) out.podAntiAffinity = anti;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function to_k8s_toleration(t: TolerationType): K8sToleration {
  const out: K8sToleration = {};
  if (t.key !== undefined) out.key = t.key;
  if (t.operator !== undefined) out.operator = t.operator;
  if (t.value !== undefined) out.value = t.value;
  if (t.effect !== undefined) out.effect = t.effect;
  if (t.toleration_seconds !== undefined) out.tolerationSeconds = t.toleration_seconds;
  return out;
}

function to_k8s_topology_spread(c: TopologySpreadConstraintType): K8sTopologySpread {
  const out: K8sTopologySpread = {
    maxSkew: c.max_skew,
    topologyKey: c.topology_key,
    whenUnsatisfiable: c.when_unsatisfiable,
  };
  if (c.label_selector) out.labelSelector = to_k8s_label_selector(c.label_selector);
  if (c.min_domains !== undefined) out.minDomains = c.min_domains;
  if (c.match_label_keys) out.matchLabelKeys = c.match_label_keys;
  return out;
}

function to_k8s_resources(r: ResourceRequirementsType): K8sResources {
  const out: K8sResources = {};
  if (r.requests) out.requests = r.requests;
  if (r.limits) out.limits = r.limits;
  return out;
}

/**
 * Builds the pod-spec body (nodeSelector, tolerations, affinity, etc.) for a
 * workload-level scheduling block. Returns undefined if nothing to set.
 */
function build_pod_spec(scheduling: WorkloadSchedulingType): K8sPodSpec | undefined {
  const spec: K8sPodSpec = {};

  if (scheduling.node_selector && Object.keys(scheduling.node_selector).length > 0) {
    spec.nodeSelector = scheduling.node_selector;
  }
  if (scheduling.tolerations && scheduling.tolerations.length > 0) {
    spec.tolerations = scheduling.tolerations.map(to_k8s_toleration);
  }
  if (scheduling.affinity) {
    const affinity = to_k8s_affinity(scheduling.affinity);
    if (affinity) spec.affinity = affinity;
  }
  if (scheduling.topology_spread && scheduling.topology_spread.length > 0) {
    spec.topologySpreadConstraints = scheduling.topology_spread.map(to_k8s_topology_spread);
  }
  if (scheduling.priority_class !== undefined) {
    spec.priorityClassName = scheduling.priority_class;
  }

  return Object.keys(spec).length > 0 ? spec : undefined;
}

/**
 * Builds the container strategic-merge-patch entries for a scheduling block.
 *
 * Container targeting rules:
 *   - `resources` → primary container named `main` (single-container assumption).
 *     For multi-container pods, name the container explicitly via `containers[name].resources`.
 *   - `containers[name].resources` → named-container overrides.
 */
function build_containers_patch(scheduling: WorkloadSchedulingType): K8sContainer[] | undefined {
  const named = scheduling.containers ?? {};
  const has_named = Object.keys(named).length > 0;
  if (!scheduling.resources && !has_named) return undefined;

  const containers: K8sContainer[] = [];

  if (scheduling.resources) {
    containers.push({
      name: 'main',
      resources: to_k8s_resources(scheduling.resources),
    });
  }

  for (const [name, cfg] of Object.entries(named)) {
    if (!cfg.resources) continue;
    const existing_idx = containers.findIndex((c) => c.name === name);
    const entry: K8sContainer = {
      name,
      resources: to_k8s_resources(cfg.resources),
    };
    if (existing_idx >= 0) {
      containers[existing_idx] = entry;
    } else {
      containers.push(entry);
    }
  }

  return containers.length > 0 ? containers : undefined;
}

/**
 * Returns the apiVersion matching a workload kind.
 */
function api_version_for_kind(kind: string): string {
  switch (kind) {
    case 'Deployment':
    case 'StatefulSet':
    case 'DaemonSet':
      return 'apps/v1';
    case 'Job':
    case 'CronJob':
      return 'batch/v1';
    default:
      return 'apps/v1';
  }
}

type WorkloadPatchBody = {
  apiVersion: string;
  kind: string;
  metadata: { name: string };
  spec: Record<string, unknown>;
};

/**
 * Builds a strategic merge patch for a given workload kind and optional name.
 * Includes pod-template-level fields and container resources.
 */
function build_workload_patch(
  kind: string,
  name: string | undefined,
  scheduling: WorkloadSchedulingType,
): string | undefined {
  const pod_spec = build_pod_spec(scheduling);
  const containers = build_containers_patch(scheduling);
  if (!pod_spec && !containers) return undefined;

  const template_spec: { containers?: K8sContainer[] } & Partial<K8sPodSpec> = {};
  if (pod_spec) Object.assign(template_spec, pod_spec);
  if (containers) template_spec.containers = containers;

  const template_body = { spec: template_spec };
  const is_cronjob = kind === 'CronJob';
  const patch: WorkloadPatchBody = {
    apiVersion: api_version_for_kind(kind),
    kind,
    metadata: { name: name ?? 'placeholder' },
    spec: is_cronjob
      ? { jobTemplate: { spec: { template: template_body } } }
      : { template: template_body },
  };

  return YAML.stringify(patch, { indent: 2, lineWidth: 0 });
}

/**
 * Generates Kustomize patches from a resolved scheduling block.
 *
 * Emits:
 *   - One patch per workload kind for the kustomization-wide block (targeting
 *     by kind only, so it applies to every workload of that kind).
 *   - One patch per (kind × name) for any per-workload override.
 *
 * Per-workload entries don't carry a kind — a patch is emitted for every kind.
 * Kustomize no-ops patches without a matching target in the rendered output.
 */
export function generate_scheduling_patches(
  scheduling: SchedulingType | undefined,
): KustomizePatchType[] {
  if (!scheduling) return [];
  if (scheduling.disabled) return [];

  const patches: KustomizePatchType[] = [];

  const base: WorkloadSchedulingType = {};
  if (scheduling.node_selector) base.node_selector = scheduling.node_selector;
  if (scheduling.affinity) base.affinity = scheduling.affinity;
  if (scheduling.tolerations) base.tolerations = scheduling.tolerations;
  if (scheduling.topology_spread) base.topology_spread = scheduling.topology_spread;
  if (scheduling.priority_class !== undefined) base.priority_class = scheduling.priority_class;
  if (scheduling.resources) base.resources = scheduling.resources;
  if (scheduling.containers) base.containers = scheduling.containers;

  if (Object.keys(base).length > 0) {
    for (const kind of DEFAULT_WORKLOAD_KINDS) {
      const patch = build_workload_patch(kind, undefined, base);
      if (patch) {
        patches.push({
          patch,
          target: { kind },
        });
      }
    }
  }

  for (const [name, override] of Object.entries(scheduling.workloads ?? {})) {
    // If the entry declares a kind, emit a single targeted patch. Otherwise
    // fall back to emitting one per kind (Kustomize no-ops mismatches).
    const kinds: readonly WorkloadKindType[] = override.kind
      ? [override.kind]
      : DEFAULT_WORKLOAD_KINDS;
    for (const kind of kinds) {
      const patch = build_workload_patch(kind, name, override);
      if (patch) {
        patches.push({
          patch,
          target: { kind, name },
        });
      }
    }
  }

  return patches;
}
