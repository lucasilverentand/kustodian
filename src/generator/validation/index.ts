import type { KustodianErrorType } from '../../core/index.js';
import { type ResultType, failure, success } from '../../core/index.js';
import type { ClusterType, TemplateType } from '../../schema/index.js';

import { detect_cycles } from './cycle-detection.js';
import { validate_enablement_dependencies } from './enablement.js';
import { build_dependency_graph } from './graph.js';
import type { GraphValidationResultType } from './types.js';

export { detect_cycles, has_cycles } from './cycle-detection.js';
export type { MissingDependencyErrorType } from './enablement.js';
export { validate_enablement_dependencies } from './enablement.js';

// Re-export functions
export { build_dependency_graph, get_all_nodes, get_node } from './graph.js';
export {
  create_node_id,
  is_parse_error,
  parse_dependency_ref,
  parse_node_id,
  resolve_dependency_ref,
} from './reference.js';
export type {
  RequirementValidationErrorType,
  RequirementValidationResultType,
} from './requirements.js';
export { validate_template_requirements } from './requirements.js';
// Re-export types
export type {
  BuildGraphResultType,
  CycleDetectionResultType,
  CycleErrorType,
  DependencyRefType,
  GraphNodeType,
  GraphValidationErrorType,
  GraphValidationResultType,
  InvalidReferenceErrorType,
  MissingReferenceErrorType,
  SelfReferenceErrorType,
} from './types.js';

/**
 * Validates the dependency graph for a set of templates.
 *
 * Performs the following validations:
 * 1. Reference validation: Ensures all `depends_on` references point to existing kustomizations
 * 2. Self-reference detection: Detects kustomizations that depend on themselves
 * 3. Cycle detection: Detects circular dependencies using DFS
 * 4. Topological sorting: Computes deployment order if the graph is valid
 *
 * @param templates - Array of templates to validate
 * @returns Detailed validation result including errors and deployment order
 */
export function validate_dependency_graph(templates: TemplateType[]): GraphValidationResultType {
  // Build the dependency graph (validates references)
  const { nodes, errors } = build_dependency_graph(templates);

  // Detect cycles in the graph
  const { cycles, topological_order } = detect_cycles(nodes);

  // Combine all errors
  const all_errors = [...errors, ...cycles];

  const result: GraphValidationResultType = {
    valid: all_errors.length === 0,
    errors: all_errors,
  };

  if (topological_order !== null) {
    return { ...result, topological_order };
  }

  return result;
}

/**
 * Validates the dependency graph and returns a Result type.
 *
 * This is the main integration point for the generator pipeline.
 * Returns a success with the topological order, or a failure with
 * detailed error information.
 *
 * @param cluster - Cluster configuration
 * @param templates - Array of templates to validate
 * @returns Result with topological order on success, or error on failure
 */
export function validate_dependencies(
  cluster: ClusterType,
  templates: TemplateType[],
): ResultType<string[], KustodianErrorType> {
  const result = validate_dependency_graph(templates);
  const enablement_errors = validate_enablement_dependencies(cluster, templates);

  // Combine all errors
  const all_errors = [...result.errors, ...enablement_errors];

  if (all_errors.length > 0) {
    const error_messages = all_errors.map((e) => e.message);
    return failure({
      code: 'DEPENDENCY_VALIDATION_ERROR',
      message: `Dependency validation failed:\n${error_messages.map((m) => `  - ${m}`).join('\n')}`,
    });
  }

  return success(result.topological_order ?? []);
}
