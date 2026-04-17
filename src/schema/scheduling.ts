import { z } from 'zod';

/**
 * Kubernetes node affinity / pod affinity term operators.
 * Mirrors `NodeSelectorOperator` from the k8s API.
 */
export const node_selector_operator_schema = z.enum([
  'In',
  'NotIn',
  'Exists',
  'DoesNotExist',
  'Gt',
  'Lt',
]);

export type NodeSelectorOperatorType = z.infer<typeof node_selector_operator_schema>;

/**
 * Single match expression used in node/pod affinity rules.
 */
export const match_expression_schema = z.object({
  key: z.string().min(1),
  operator: node_selector_operator_schema,
  values: z.array(z.string()).optional(),
});

export type MatchExpressionType = z.infer<typeof match_expression_schema>;

/**
 * Label selector used by pod (anti-)affinity topology terms.
 */
export const label_selector_schema = z.object({
  match_labels: z.record(z.string(), z.string()).optional(),
  match_expressions: z.array(match_expression_schema).optional(),
});

export type LabelSelectorType = z.infer<typeof label_selector_schema>;

/**
 * Node selector term - a set of match expressions / fields combined with AND.
 */
export const node_selector_term_schema = z.object({
  match_expressions: z.array(match_expression_schema).optional(),
  match_fields: z.array(match_expression_schema).optional(),
});

export type NodeSelectorTermType = z.infer<typeof node_selector_term_schema>;

/**
 * Preferred (soft) node-affinity entry with weight.
 */
export const preferred_node_affinity_schema = z.object({
  weight: z.number().int().min(1).max(100),
  preference: node_selector_term_schema,
});

export type PreferredNodeAffinityType = z.infer<typeof preferred_node_affinity_schema>;

/**
 * Node affinity (required + preferred lists of node selector terms).
 */
export const node_affinity_schema = z.object({
  required: z.array(node_selector_term_schema).optional(),
  preferred: z.array(preferred_node_affinity_schema).optional(),
});

export type NodeAffinityType = z.infer<typeof node_affinity_schema>;

/**
 * Pod affinity / anti-affinity topology term.
 */
export const pod_affinity_term_schema = z.object({
  label_selector: label_selector_schema.optional(),
  namespaces: z.array(z.string()).optional(),
  namespace_selector: label_selector_schema.optional(),
  topology_key: z.string().min(1),
});

export type PodAffinityTermType = z.infer<typeof pod_affinity_term_schema>;

/**
 * Preferred (soft) pod affinity entry with weight.
 */
export const preferred_pod_affinity_schema = z.object({
  weight: z.number().int().min(1).max(100),
  pod_affinity_term: pod_affinity_term_schema,
});

export type PreferredPodAffinityType = z.infer<typeof preferred_pod_affinity_schema>;

/**
 * Pod affinity or anti-affinity block (same shape for both).
 */
export const pod_affinity_schema = z.object({
  required: z.array(pod_affinity_term_schema).optional(),
  preferred: z.array(preferred_pod_affinity_schema).optional(),
});

export type PodAffinityType = z.infer<typeof pod_affinity_schema>;

/**
 * Full affinity block.
 */
export const affinity_schema = z.object({
  node: node_affinity_schema.optional(),
  pod: pod_affinity_schema.optional(),
  pod_anti: pod_affinity_schema.optional(),
});

export type AffinityType = z.infer<typeof affinity_schema>;

/**
 * Toleration operator.
 */
export const toleration_operator_schema = z.enum(['Equal', 'Exists']);

export type TolerationOperatorType = z.infer<typeof toleration_operator_schema>;

/**
 * Toleration effect.
 */
export const toleration_effect_schema = z.enum(['NoSchedule', 'PreferNoSchedule', 'NoExecute']);

export type TolerationEffectType = z.infer<typeof toleration_effect_schema>;

/**
 * Single toleration entry.
 */
export const toleration_schema = z.object({
  key: z.string().optional(),
  operator: toleration_operator_schema.optional(),
  value: z.string().optional(),
  effect: toleration_effect_schema.optional(),
  toleration_seconds: z.number().int().optional(),
});

export type TolerationType = z.infer<typeof toleration_schema>;

/**
 * When-unsatisfiable behavior for topology spread constraints.
 */
export const when_unsatisfiable_schema = z.enum(['DoNotSchedule', 'ScheduleAnyway']);

export type WhenUnsatisfiableType = z.infer<typeof when_unsatisfiable_schema>;

/**
 * Single topology spread constraint.
 */
export const topology_spread_constraint_schema = z.object({
  max_skew: z.number().int().positive(),
  topology_key: z.string().min(1),
  when_unsatisfiable: when_unsatisfiable_schema,
  label_selector: label_selector_schema.optional(),
  min_domains: z.number().int().positive().optional(),
  match_label_keys: z.array(z.string()).optional(),
});

export type TopologySpreadConstraintType = z.infer<typeof topology_spread_constraint_schema>;

/**
 * Resource requirements for a container.
 */
export const resource_requirements_schema = z.object({
  requests: z.record(z.string(), z.string()).optional(),
  limits: z.record(z.string(), z.string()).optional(),
});

export type ResourceRequirementsType = z.infer<typeof resource_requirements_schema>;

/**
 * Per-container resource override (used when a workload has multiple containers).
 */
export const container_scheduling_schema = z.object({
  resources: resource_requirements_schema.optional(),
});

export type ContainerSchedulingType = z.infer<typeof container_scheduling_schema>;

/**
 * Kubernetes workload kinds that scheduling patches can target.
 */
export const workload_kind_schema = z.enum([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
]);

export type WorkloadKindType = z.infer<typeof workload_kind_schema>;

/**
 * Per-workload scheduling override. Identified by workload name (matches
 * `metadata.name` of Deployment/StatefulSet/DaemonSet/Job/CronJob).
 *
 * When a workload has multiple containers, use `containers` to target a specific
 * container by name for resource overrides. Otherwise the top-level `resources`
 * applies to the single primary container.
 *
 * `kind` is optional. When set, the generator emits a single patch targeting
 * that kind/name; when absent, a patch is emitted per kind (Kustomize no-ops
 * targets that don't exist).
 */
export const workload_scheduling_schema = z.object({
  kind: workload_kind_schema.optional(),
  node_selector: z.record(z.string(), z.string()).optional(),
  affinity: affinity_schema.optional(),
  tolerations: z.array(toleration_schema).optional(),
  topology_spread: z.array(topology_spread_constraint_schema).optional(),
  priority_class: z.string().min(1).optional(),
  resources: resource_requirements_schema.optional(),
  containers: z.record(z.string(), container_scheduling_schema).optional(),
});

export type WorkloadSchedulingType = z.infer<typeof workload_scheduling_schema>;

/**
 * Scheduling block. Usable at cluster, cluster.templates[], and
 * cluster.templates[].kustomizations[name] levels.
 *
 * Merge semantics (cluster -> template -> kustomization -> workload):
 *   - scalars and lists replace at each lower level
 *   - node_selector shallow-merges (keys from lower levels override)
 *   - resources: shallow-merge requests/limits maps
 *   - disabled: true at kustomization level opts out of all scheduling for that kustomization
 *   - workloads: per-workload overrides, keyed by workload name
 */
export const scheduling_schema = z.object({
  node_selector: z.record(z.string(), z.string()).optional(),
  affinity: affinity_schema.optional(),
  tolerations: z.array(toleration_schema).optional(),
  topology_spread: z.array(topology_spread_constraint_schema).optional(),
  priority_class: z.string().min(1).optional(),
  resources: resource_requirements_schema.optional(),
  containers: z.record(z.string(), container_scheduling_schema).optional(),
  /** When true at the kustomization level, no scheduling patches are emitted. */
  disabled: z.boolean().optional(),
  /** Per-workload overrides keyed by workload metadata.name. */
  workloads: z.record(z.string(), workload_scheduling_schema).optional(),
});

export type SchedulingType = z.infer<typeof scheduling_schema>;
