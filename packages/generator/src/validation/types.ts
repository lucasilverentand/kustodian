/**
 * Node in the dependency graph.
 */
export interface GraphNodeType {
  /** Unique identifier: `${template}/${kustomization}` */
  readonly id: string;
  /** Template name */
  readonly template: string;
  /** Kustomization name */
  readonly kustomization: string;
  /** Resolved dependency IDs */
  readonly dependencies: string[];
}

/**
 * Parsed dependency reference for string-based dependencies.
 */
export interface ParsedDependencyRefType {
  /** Template name (undefined for within-template refs) */
  readonly template?: string;
  /** Kustomization name */
  readonly kustomization: string;
  /** Original reference string */
  readonly raw: string;
}

/**
 * Raw external dependency reference.
 */
export interface RawDependencyRefType {
  /** Flux Kustomization name */
  readonly name: string;
  /** Flux Kustomization namespace */
  readonly namespace: string;
}

/**
 * Union type for all parsed dependency references.
 */
export type DependencyRefType = ParsedDependencyRefType | RawDependencyRefType;

/**
 * Type guard to check if a dependency reference is a raw reference.
 */
export function is_raw_dependency_ref(ref: DependencyRefType): ref is RawDependencyRefType {
  return 'name' in ref && 'namespace' in ref;
}

/**
 * Type guard to check if a dependency reference is a parsed string reference.
 */
export function is_parsed_dependency_ref(ref: DependencyRefType): ref is ParsedDependencyRefType {
  return 'kustomization' in ref;
}

/**
 * Cycle error - circular dependency detected.
 */
export interface CycleErrorType {
  readonly type: 'cycle';
  /** Array of node IDs forming the cycle */
  readonly cycle: string[];
  readonly message: string;
}

/**
 * Missing reference error - dependency target doesn't exist.
 */
export interface MissingReferenceErrorType {
  readonly type: 'missing_reference';
  /** Node ID that has the reference */
  readonly source: string;
  /** Missing target reference */
  readonly target: string;
  readonly message: string;
}

/**
 * Self-reference error - kustomization depends on itself.
 */
export interface SelfReferenceErrorType {
  readonly type: 'self_reference';
  readonly node: string;
  readonly message: string;
}

/**
 * Invalid reference format error.
 */
export interface InvalidReferenceErrorType {
  readonly type: 'invalid_reference';
  readonly source: string;
  readonly reference: string;
  readonly message: string;
}

/**
 * Union of all graph validation error types.
 */
export type GraphValidationErrorType =
  | CycleErrorType
  | MissingReferenceErrorType
  | SelfReferenceErrorType
  | InvalidReferenceErrorType;

/**
 * Result of graph validation.
 */
export interface GraphValidationResultType {
  /** Whether the graph is valid (no errors) */
  readonly valid: boolean;
  /** All validation errors found */
  readonly errors: GraphValidationErrorType[];
  /** Deployment order if valid (topologically sorted) */
  readonly topological_order?: string[];
}

/**
 * Result of building the dependency graph.
 */
export interface BuildGraphResultType {
  /** All nodes in the graph */
  readonly nodes: Map<string, GraphNodeType>;
  /** Errors encountered during graph building */
  readonly errors: GraphValidationErrorType[];
}

/**
 * Result of cycle detection.
 */
export interface CycleDetectionResultType {
  /** All cycles found */
  readonly cycles: CycleErrorType[];
  /** Topological order if no cycles found, null otherwise */
  readonly topological_order: string[] | null;
}
