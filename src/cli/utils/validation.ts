import type { KustodianErrorType } from '../../core/index.js';
import type { ResultType } from '../../core/index.js';
import { validate_template_requirements } from '../../generator/index.js';
import type { LoadedClusterType } from '../../loader/index.js';
import type { TemplateType } from '../../schema/index.js';

/**
 * Validates template requirements for a cluster.
 * Returns failure if any enabled template's requirements are not met.
 */
export function validate_cluster_template_requirements(
  loaded_cluster: LoadedClusterType,
  all_templates: { template: TemplateType; path: string }[],
): ResultType<void, KustodianErrorType> {
  const enabled_template_refs = loaded_cluster.cluster.spec.templates || [];
  if (enabled_template_refs.length === 0) {
    return { success: true as const, value: undefined };
  }

  const enabled_templates = all_templates
    .filter((t) => enabled_template_refs.some((ref) => ref.name === t.template.metadata.name))
    .map((t) => t.template);

  const requirements_result = validate_template_requirements(
    enabled_templates,
    loaded_cluster.nodes,
  );

  if (!requirements_result.valid) {
    console.error('\n  ✗ Template requirement validation failed:');
    for (const error of requirements_result.errors) {
      console.error(`    - ${error.template}: ${error.message}`);
    }
    return {
      success: false as const,
      error: {
        code: 'REQUIREMENT_VALIDATION_ERROR',
        message: 'Template requirements not met',
      },
    };
  }

  return { success: true as const, value: undefined };
}
