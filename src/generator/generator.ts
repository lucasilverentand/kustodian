import type { KustodianErrorType } from '../core/index.js';
import { type ResultType, is_success, success } from '../core/index.js';
import type { GeneratedResourceType, PluginRegistryType } from '../plugins/index.js';
import type { ClusterType, TemplateType } from '../schema/index.js';

import {
  DEFAULT_INTERVAL,
  DEFAULT_RETRY_INTERVAL,
  DEFAULT_TIMEOUT,
  generate_depends_on,
  generate_flux_controller_patches,
  generate_flux_kustomization,
  generate_flux_name,
  generate_flux_oci_repository,
  generate_health_checks,
  resolve_kustomization,
} from './flux.js';
import { get_template_config, resolve_kustomization_state } from './kustomization-resolution.js';
import { serialize_resource, serialize_resources, write_generation_result } from './output.js';
import { resolve_external_substitutions } from './substitution.js';
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
  /** Map of template names to their source paths (relative to project root) */
  template_paths?: Map<string, string>;
  /** Reconciliation interval for Flux resources */
  flux_reconciliation_interval?: string;
  /** Timeout for Flux reconciliation */
  flux_reconciliation_timeout?: string;
  /** Retry interval for failed reconciliations */
  flux_reconciliation_retry_interval?: string;
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
  ): Promise<ResultType<GeneratedResourceType[], KustodianErrorType>>;

  /**
   * Writes generation result to disk.
   */
  write(result: GenerationResultType): Promise<ResultType<string[], KustodianErrorType>>;
}

/**
 * Creates a new Generator instance.
 *
 * @param options - Generator configuration options
 * @param registry - Plugin registry with generators and substitution providers
 */
export function create_generator(
  options: GeneratorOptionsType = {},
  registry?: PluginRegistryType,
): GeneratorType {
  const flux_namespace = options.flux_namespace ?? 'flux-system';
  const git_repository_name = options.git_repository_name ?? 'flux-system';
  // base_path is available for future template path customization
  const _base_path = options.base_path ?? './templates';
  void _base_path; // Suppress unused variable warning
  const template_paths = options.template_paths;
  const flux_reconciliation_interval = options.flux_reconciliation_interval ?? '10m';
  const flux_reconciliation_timeout = options.flux_reconciliation_timeout ?? '5m';
  const flux_reconciliation_retry_interval = options.flux_reconciliation_retry_interval ?? '1m';

  const hooks: GeneratorHookHandlerType[] = [];

  async function run_hooks(
    phase: GeneratorHookPhaseType,
    context: GeneratorHookContextType,
  ): Promise<void> {
    for (const handler of hooks) {
      await handler(phase, context);
    }
  }

  return {
    on_hook(handler) {
      hooks.push(handler);
    },

    resolve_templates(cluster, templates) {
      const template_map = new Map(templates.map((t) => [t.metadata.name, t]));
      const cluster_values = cluster.spec.values ?? {};
      const config_entries = cluster.spec.templates ?? [];

      const resolved: ResolvedTemplateType[] = [];
      for (const config_entry of config_entries) {
        const template_name = config_entry.template ?? config_entry.name;
        const template = template_map.get(template_name);
        if (!template) {
          // Template not found — validation catches this, skip here
          continue;
        }

        const instance_name = config_entry.name;
        const template_values = config_entry.values ?? {};
        const values = { ...cluster_values, ...template_values };

        resolved.push({ template, instance_name, values, enabled: true });
      }
      return resolved;
    },

    async generate(cluster, templates, generate_options = {}) {
      const output_dir = generate_options.output_dir ?? './output';
      const skip_validation = generate_options.skip_validation ?? false;

      // Validate dependency graph before generation (unless skipped)
      if (!skip_validation) {
        const validation_result = validate_dependencies(cluster, templates);
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

      // Resolve external substitutions via plugins (if registry provided)
      const external_values: Record<string, string> = {};
      if (registry) {
        const external_result = await resolve_external_substitutions(
          resolved_templates,
          cluster,
          registry,
        );
        if (!is_success(external_result)) {
          return external_result;
        }
        Object.assign(external_values, external_result.value);
      }

      // Generate kustomizations
      const generated_kustomizations: GeneratedKustomizationType[] = [];

      for (const resolved of resolved_templates) {
        if (!resolved.enabled) {
          continue;
        }

        // Get template configuration from cluster for kustomization overrides
        // Use instance_name since that's the cluster config entry's `name` field
        const template_config = get_template_config(cluster, resolved.instance_name);

        for (const kustomization of resolved.template.spec.kustomizations) {
          // Resolve kustomization state (preservation policy + scheduling)
          const kustomization_state = resolve_kustomization_state(
            kustomization,
            template_config,
            kustomization.name,
            cluster,
          );

          // Merge external (plugin-provided) values with template values
          // External values have lower precedence than template-specific values
          const merged_values = {
            ...external_values,
            ...resolved.values,
          };

          const resolved_kustomization = resolve_kustomization(
            resolved.template,
            kustomization,
            merged_values,
          );

          // Generate Flux resource with configurable namespace
          // Look up the template source path if available
          const template_source_path = template_paths?.get(resolved.template.metadata.name);
          const flux_kustomization = generate_flux_kustomization(
            resolved_kustomization,
            source_repository_name,
            source_kind,
            kustomization_state.preservation,
            template_source_path,
            flux_reconciliation_interval,
            flux_reconciliation_timeout,
            flux_reconciliation_retry_interval,
            resolved.instance_name,
            kustomization_state.scheduling,
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
          flux_reconciliation_interval,
        );
      }

      // Generate controller patches if flux config is present
      if (cluster.spec.flux) {
        const patches = generate_flux_controller_patches(cluster.spec.flux);
        if (patches) {
          result.controller_patches = patches;
        }
      }

      // Run after_generate hook
      await run_hooks('after_generate', {
        cluster,
        templates: resolved_templates,
        result,
      });

      return success(result);
    },

    async generate_plugin_resources(cluster, templates) {
      if (!registry) {
        return success([]);
      }

      const all_resources: GeneratedResourceType[] = [];

      for (const generator of registry.get_generators()) {
        for (const resolved of templates) {
          if (!resolved.enabled) {
            continue;
          }

          const ctx = {
            cluster,
            template: resolved.template,
            config: {},
            all_objects: new Map<string, unknown[]>(),
          };

          const result = await generator.generate(resolved.template, ctx);
          if (!is_success(result)) {
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
export {
  DEFAULT_INTERVAL,
  DEFAULT_RETRY_INTERVAL,
  DEFAULT_TIMEOUT,
  generate_depends_on,
  generate_flux_kustomization,
  generate_flux_name,
  generate_health_checks,
  resolve_kustomization,
};
