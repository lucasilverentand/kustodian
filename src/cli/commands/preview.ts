import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { is_success, success } from '../../core/index.js';
import { create_generator } from '../../generator/generator.js';
import { write_generation_result } from '../../generator/output.js';
import type { OutputFormatType } from '../../generator/output.js';
import type { LoadedClusterType } from '../../loader/index.js';
import { define_command } from '../command.js';
import type { ContainerType } from '../container.js';
import { PLUGIN_REGISTRY_ID } from '../services.js';
import { resolve_defaults } from '../utils/defaults.js';
import { load_and_resolve_project } from '../utils/project.js';
import { build_node_list, resolve_provider_options } from '../utils/provider.js';

function detect_editor(): string {
  try {
    execSync('command -v nvim', { stdio: 'ignore' });
    return 'nvim';
  } catch {
    return 'vi';
  }
}

/**
 * Generates the provider config preview and writes it to the output directory.
 * Returns the written file path, or undefined if not applicable.
 */
async function generate_provider_preview(
  loaded_cluster: LoadedClusterType,
  output_dir: string,
  container: ContainerType,
): Promise<string | undefined> {
  // Try to resolve the provider from the plugin registry
  const registry_result = container.resolve(PLUGIN_REGISTRY_ID);
  if (!is_success(registry_result)) {
    return undefined;
  }

  // Use the first available provider (typically k0s)
  const available_providers = registry_result.value.get_providers();
  const provider_name = available_providers[0]?.name;
  if (!provider_name) {
    return undefined;
  }

  const options = resolve_provider_options(loaded_cluster, provider_name);
  const provider = registry_result.value.create_provider(provider_name, options);

  if (!provider?.get_config_preview) {
    return undefined;
  }

  const node_list = build_node_list(loaded_cluster);
  const preview_result = provider.get_config_preview(node_list);
  if (!preview_result.success) {
    return undefined;
  }

  // Write config to output directory
  const provider_dir = path.join(output_dir, provider_name);
  fs.mkdirSync(provider_dir, { recursive: true });
  const config_file = path.join(provider_dir, `${provider_name}ctl.yaml`);
  fs.writeFileSync(config_file, preview_result.value, 'utf-8');

  return config_file;
}

/**
 * Preview command - generates Flux manifests and opens them for inspection.
 */
export const preview_command = define_command({
  name: 'preview',
  description: 'Preview generated manifests (Flux + provider config) for a cluster',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Cluster name or code (defaults to all clusters)',
      type: 'string',
    },
    {
      name: 'template',
      short: 't',
      description: 'Filter to specific template(s), comma-separated',
      type: 'string',
    },
    {
      name: 'project',
      short: 'p',
      description: 'Path to project root (defaults to current directory)',
      type: 'string',
    },
    {
      name: 'output-dir',
      short: 'o',
      description: 'Write to this directory instead of opening in editor',
      type: 'string',
    },
    {
      name: 'format',
      short: 'f',
      description: 'Output format: yaml or json',
      type: 'string',
      default_value: 'yaml',
    },
  ],
  handler: async (ctx, container) => {
    const cluster_filter = ctx.options['cluster'] as string | undefined;
    const template_filter = ctx.options['template'] as string | undefined;
    const project_path = (ctx.options['project'] as string) || process.cwd();
    const output_dir_option = ctx.options['output-dir'] as string | undefined;
    const format = (ctx.options['format'] as OutputFormatType) || 'yaml';

    const project_result = await load_and_resolve_project(project_path, cluster_filter);
    if (!is_success(project_result)) {
      return project_result;
    }

    const { project_root, project, target_clusters } = project_result.value;

    // Filter templates if --template specified
    const template_names = template_filter
      ? template_filter.split(',').map((t) => t.trim())
      : undefined;

    let templates = project.templates;
    if (template_names) {
      templates = templates.filter((t) => template_names.includes(t.template.metadata.name));

      if (templates.length === 0) {
        return {
          success: false as const,
          error: {
            code: 'NOT_FOUND',
            message: `No matching templates found for: ${template_names.join(', ')}`,
          },
        };
      }
    }

    const is_multi = target_clusters.length > 1;
    const use_temp = !output_dir_option;
    const base_output_dir =
      output_dir_option ??
      path.join(
        tmpdir(),
        `kustodian-preview-${is_multi ? 'all' : target_clusters[0]?.cluster.metadata.name}`,
      );
    let total_written = 0;

    for (const loaded_cluster of target_clusters) {
      const cluster_name = loaded_cluster.cluster.metadata.name;

      if (is_multi) {
        console.log(`\nGenerating preview for cluster: ${cluster_name}`);
      }

      // Filter the cluster's template list so only selected templates are "enabled"
      let cluster_for_generation = loaded_cluster.cluster;
      if (template_names && cluster_for_generation.spec.templates) {
        cluster_for_generation = {
          ...cluster_for_generation,
          spec: {
            ...cluster_for_generation.spec,
            templates: cluster_for_generation.spec.templates.filter((t) =>
              template_names.includes(t.name),
            ),
          },
        };
      }

      const defaults = resolve_defaults(loaded_cluster.cluster, project.config);

      // Build template_paths map
      const templates_dir = path.join(project_root, 'templates');
      const template_paths = new Map<string, string>();
      for (const t of templates) {
        const relative_path = path.relative(templates_dir, t.path);
        template_paths.set(t.template.metadata.name, relative_path);
      }

      // Determine output directory (use subdirs for multi-cluster)
      const output_dir = is_multi ? path.join(base_output_dir, cluster_name) : base_output_dir;

      // Create generator and generate
      const generator = create_generator({
        flux_namespace: defaults.flux_namespace,
        git_repository_name: defaults.oci_repository_name,
        template_paths,
        flux_reconciliation_interval: defaults.flux_reconciliation_interval,
        flux_reconciliation_timeout: defaults.flux_reconciliation_timeout,
        flux_reconciliation_retry_interval: defaults.flux_reconciliation_retry_interval,
      });

      const gen_result = await generator.generate(
        cluster_for_generation,
        templates.map((t) => t.template),
        { output_dir, skip_validation: !!template_names },
      );

      if (!is_success(gen_result)) {
        console.error(`Error: ${gen_result.error.message}`);
        return gen_result;
      }

      // Write files
      const write_result = await write_generation_result(gen_result.value, { format });
      if (!is_success(write_result)) {
        console.error(`Error: ${write_result.error.message}`);
        return write_result;
      }

      const written_files = write_result.value;
      total_written += written_files.length;

      // Generate provider config preview if cluster has nodes
      if (loaded_cluster.nodes.length > 0) {
        const provider_file = await generate_provider_preview(
          loaded_cluster,
          output_dir,
          container,
        );
        if (provider_file) {
          written_files.push(provider_file);
          total_written += 1;
        }
      }

      if (!use_temp) {
        console.log(`\nGenerated ${written_files.length} files in ${output_dir}:\n`);
        for (const file of written_files) {
          console.log(`  ${path.relative(output_dir, file)}`);
        }
      }
    }

    if (!use_temp) {
      return success(undefined);
    }

    // Temp mode: open editor, then clean up
    const editor = process.env['VISUAL'] || process.env['EDITOR'] || detect_editor();
    console.log(`Opening ${editor} with ${total_written} generated manifests...`);

    const cleanup = () => {
      try {
        fs.rmSync(base_output_dir, { recursive: true, force: true });
        console.log(`Cleaned up ${base_output_dir}`);
      } catch {
        // Best-effort cleanup
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    try {
      spawnSync(editor, [base_output_dir], { stdio: 'inherit' });
    } finally {
      cleanup();
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
    }

    return success(undefined);
  },
});
