import { type ResultType, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import type {
  GeneratedResourceType,
  LegacyPluginRegistryType,
  PluginContextType,
} from '@kustodian/plugins';
import type { ClusterType, TemplateConfigType, TemplateType } from '@kustodian/schema';

import {
  DEFAULT_INTERVAL,
  DEFAULT_TIMEOUT,
  generate_depends_on,
  generate_flux_kustomization,
  generate_flux_name,
  generate_flux_oci_repository,
  generate_health_checks,
  resolve_kustomization,
} from './flux.js';
import { generate_namespace_resources } from './namespace.js';
import { serialize_resource, serialize_resources, write_generation_result } from './output.js';
import type {
  FluxKustomizationType,
  GenerateOptionsType,
  GeneratedKustomizationType,
  GenerationResultType,
  ResolvedKustomizationType,
  ResolvedTemplateType,
} from './types.js';
import { validate_dependencies } from './validation/index.js';

/**
 * Options for the Generator.
 */
export interface GeneratorOptionsType {
  flux_namespace?: string;
  git_repository_name?: string;
  base_path?: string;
}

/**
 * Generator hook phases.
 */
export type GeneratorHookPhaseType =
  | 'before_generate'
  | 'after_resolve_template'
  | 'after_generate_kustomization'
  | 'after_generate';

/**
 * Hook handler function type.
 */
export type GeneratorHookHandlerType = (
  phase: GeneratorHookPhaseType,
  context: GeneratorHookContextType,
) => void | Promise<void>;

/**
 * Context passed to generator hooks.
 */
export interface GeneratorHookContextType {
  cluster: ClusterType;
  templates?: ResolvedTemplateType[];
  kustomization?: ResolvedKustomizationType;
  flux_kustomization?: FluxKustomizationType;
  result?: GenerationResultType;
}

/**
 * Generator class for processing templates into Flux resources.
 */
export interface GeneratorType {
  /**
   * Registers a hook handler.
   */
  on_hook(handler: GeneratorHookHandlerType): void;

  /**
   * Resolves templates for a cluster.
   */
  resolve_templates(cluster: ClusterType, templates: TemplateType[]): ResolvedTemplateType[];

  /**
   * Generates Flux resources for a cluster.
   */
  generate(
    cluster: ClusterType,
    templates: TemplateType[],
    options?: GenerateOptionsType,
  ): Promise<ResultType<GenerationResultType, KustodianErrorType>>;

  /**
   * Generates resources from plugins.
   */
  generate_plugin_resources(
    cluster: ClusterType,
    templates: ResolvedTemplateType[],
  ): ResultType<GeneratedResourceType[], KustodianErrorType>;

  /**
   * Writes generation result to disk.
   */
  write(result: GenerationResultType): Promise<ResultType<string[], KustodianErrorType>>;
}

/**
 * Creates a new Generator instance.
 */
export function create_generator(
  options: GeneratorOptionsType = {},
  registry?: LegacyPluginRegistryType,
): GeneratorType {
  const flux_namespace = options.flux_namespace ?? 'flux-system';
  const git_repository_name = options.git_repository_name ?? 'flux-system';
  // base_path is available for future template path customization
  const _base_path = options.base_path ?? './templates';
  void _base_path; // Suppress unused variable warning

  const hooks: GeneratorHookHandlerType[] = [];

  async function run_hooks(
    phase: GeneratorHookPhaseType,
    context: GeneratorHookContextType,
  ): Promise<void> {
    for (const handler of hooks) {
      await handler(phase, context);
    }
  }

  function get_template_values(
    cluster: ClusterType,
    template_name: string,
  ): Record<string, string> {
    const template_config = cluster.spec.templates?.find(
      (t: TemplateConfigType) => t.name === template_name,
    );
    return template_config?.values ?? {};
  }

  function is_template_enabled(cluster: ClusterType, template_name: string): boolean {
    const template_config = cluster.spec.templates?.find(
      (t: TemplateConfigType) => t.name === template_name,
    );
    // Default to enabled if not specified
    return template_config?.enabled ?? true;
  }

  return {
    on_hook(handler) {
      hooks.push(handler);
    },

    resolve_templates(cluster, templates) {
      return templates.map((template) => {
        const values = get_template_values(cluster, template.metadata.name);
        const enabled = is_template_enabled(cluster, template.metadata.name);

        return {
          template,
          values,
          enabled,
        };
      });
    },

    async generate(cluster, templates, generate_options = {}) {
      const output_dir = generate_options.output_dir ?? './output';
      const skip_validation = generate_options.skip_validation ?? false;

      // Validate dependency graph before generation (unless skipped)
      if (!skip_validation) {
        const validation_result = validate_dependencies(templates);
        if (!validation_result.success) {
          return validation_result;
        }
      }

      // Detect source kind and repository name
      const source_kind = cluster.spec.oci ? 'OCIRepository' : 'GitRepository';
      const source_repository_name = git_repository_name;

      // Run before_generate hook
      await run_hooks('before_generate', { cluster });

      // Resolve templates
      const resolved_templates = this.resolve_templates(cluster, templates);

      // Run after_resolve_template hook for each
      for (const resolved of resolved_templates) {
        await run_hooks('after_resolve_template', {
          cluster,
          templates: [resolved],
        });
      }

      // Generate kustomizations
      const generated_kustomizations: GeneratedKustomizationType[] = [];

      for (const resolved of resolved_templates) {
        if (!resolved.enabled) {
          continue;
        }

        for (const kustomization of resolved.template.spec.kustomizations) {
          const resolved_kustomization = resolve_kustomization(
            resolved.template,
            kustomization,
            resolved.values,
          );

          // Generate Flux resource with configurable namespace
          const flux_kustomization = generate_flux_kustomization(
            resolved_kustomization,
            source_repository_name,
            source_kind,
          );

          // Override namespace to configured value
          flux_kustomization.metadata.namespace = flux_namespace;

          // Run after_generate_kustomization hook
          await run_hooks('after_generate_kustomization', {
            cluster,
            kustomization: resolved_kustomization,
            flux_kustomization,
          });

          generated_kustomizations.push({
            name: flux_kustomization.metadata.name,
            template: resolved.template.metadata.name,
            path: flux_kustomization.spec.path,
            flux_kustomization,
          });
        }
      }

      const result: GenerationResultType = {
        cluster: cluster.metadata.name,
        output_dir,
        kustomizations: generated_kustomizations,
      };

      // Generate OCIRepository if using OCI mode
      if (cluster.spec.oci) {
        result.oci_repository = generate_flux_oci_repository(
          cluster,
          cluster.spec.oci,
          source_repository_name,
          flux_namespace,
        );
      }

      // Run after_generate hook
      await run_hooks('after_generate', {
        cluster,
        templates: resolved_templates,
        result,
      });

      return success(result);
    },

    generate_plugin_resources(cluster, templates) {
      if (!registry) {
        return success([]);
      }

      const all_resources: GeneratedResourceType[] = [];

      // Generate resources from plugins
      for (const generator of registry.get_resource_generators()) {
        for (const resolved of templates) {
          if (!resolved.enabled) {
            continue;
          }

          const ctx: PluginContextType = {
            cluster,
            template: resolved.template,
          };

          const result = generator.generate(ctx);
          if (!result.success) {
            return result;
          }

          all_resources.push(...result.value);
        }
      }

      return success(all_resources);
    },

    async write(result) {
      return write_generation_result(result);
    },
  };
}

// Re-export commonly used utilities
export { serialize_resource, serialize_resources };
export { generate_namespace_resources };
export {
  DEFAULT_INTERVAL,
  DEFAULT_TIMEOUT,
  generate_depends_on,
  generate_flux_kustomization,
  generate_flux_name,
  generate_health_checks,
  resolve_kustomization,
};
