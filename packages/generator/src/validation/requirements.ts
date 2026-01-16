import type { NodeSchemaType, TemplateRequirementType, TemplateType } from '@kustodian/schema';

/**
 * Validation error for a template requirement.
 */
export interface RequirementValidationErrorType {
  template: string;
  requirement: TemplateRequirementType;
  message: string;
}

/**
 * Result of validating template requirements against cluster nodes.
 */
export interface RequirementValidationResultType {
  valid: boolean;
  errors: RequirementValidationErrorType[];
}

/**
 * Checks if a node label matches the requirement.
 */
function node_matches_label_requirement(
  node: NodeSchemaType,
  key: string,
  value?: string,
): boolean {
  if (!node.labels) {
    return false;
  }

  const label_value = node.labels[key];

  // Label must exist
  if (label_value === undefined) {
    return false;
  }

  // If no specific value required, just presence is enough
  if (value === undefined) {
    return true;
  }

  // Check if label value matches
  // Node labels can be string, boolean, or number, so convert both to strings for comparison
  return String(label_value) === value;
}

/**
 * Validates node label requirements for a template against cluster nodes.
 */
function validate_node_label_requirements(
  template: TemplateType,
  nodes: NodeSchemaType[],
): RequirementValidationErrorType[] {
  const errors: RequirementValidationErrorType[] = [];

  if (!template.spec.requirements) {
    return errors;
  }

  for (const requirement of template.spec.requirements) {
    if (requirement.type !== 'nodeLabel') {
      continue;
    }

    const matching_nodes = nodes.filter((node) =>
      node_matches_label_requirement(node, requirement.key, requirement.value),
    );

    if (matching_nodes.length < requirement.atLeast) {
      const value_part = requirement.value !== undefined ? `=${requirement.value}` : '';
      const message = `Template requires at least ${requirement.atLeast} node(s) with label '${requirement.key}${value_part}', but found ${matching_nodes.length}`;

      errors.push({
        template: template.metadata.name,
        requirement,
        message,
      });
    }
  }

  return errors;
}

/**
 * Validates all template requirements against cluster nodes.
 *
 * @param templates - Templates to validate (only enabled ones should be passed)
 * @param nodes - Cluster nodes to validate against
 * @returns Validation result with any requirement errors
 */
export function validate_template_requirements(
  templates: TemplateType[],
  nodes: NodeSchemaType[],
): RequirementValidationResultType {
  const all_errors: RequirementValidationErrorType[] = [];

  for (const template of templates) {
    const errors = validate_node_label_requirements(template, nodes);
    all_errors.push(...errors);
  }

  return {
    valid: all_errors.length === 0,
    errors: all_errors,
  };
}
