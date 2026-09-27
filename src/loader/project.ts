import * as path from 'node:path';
import type { KustodianErrorType } from '../core/index.js';
import { Errors, type ResultType, failure, is_success, success } from '../core/index.js';
import {
  type ClusterType,
  type NodeProfileType,
  type NodeSchemaType,
  type ProjectType as ProjectConfigType,
  type TemplateType,
  node_resource_to_node,
  validate_cluster,
  validate_node_resource,
  validate_project,
  validate_template,
} from '../schema/index.js';

import { file_exists, list_directories, list_files, read_yaml_file } from './file.js';
import { load_all_profiles } from './profile.js';

/**
 * Standard file names used in Kustodian projects.
 */
export const StandardFiles = {
  TEMPLATE: 'template.yaml',
  CLUSTER: 'cluster.yaml',
  NODES: 'nodes.yaml',
  PROJECT: 'kustodian.yaml',
} as const;

/**
 * Standard directory names used in Kustodian projects.
 */
export const StandardDirs = {
  TEMPLATES: 'templates',
  CLUSTERS: 'clusters',
  NODES: 'nodes',
  PROFILES: 'profiles',
} as const;

/**
 * Loaded template with its source path.
 *
 * `source_name` is set when the template was fetched from a configured
 * external source (`spec.template_sources` in `kustodian.yaml`); it is
 * absent for templates loaded from the local `templates/` directory.
 */
export interface LoadedTemplateType {
  path: string;
  template: TemplateType;
  source_name?: string;
}

/**
 * Loaded cluster with its source path.
 */
export interface LoadedClusterType {
  path: string;
  cluster: ClusterType;
  nodes: NodeSchemaType[];
}

/**
 * Finds a cluster by name or code.
 * Matches against metadata.name first, then metadata.code.
 */
export function find_cluster(
  clusters: LoadedClusterType[],
  identifier: string,
): LoadedClusterType | undefined {
  return (
    clusters.find((c) => c.cluster.metadata.name === identifier) ??
    clusters.find((c) => c.cluster.metadata.code === identifier)
  );
}

/**
 * Filters clusters by name or code.
 * Matches against metadata.name first, then metadata.code.
 */
export function filter_clusters(
  clusters: LoadedClusterType[],
  identifier: string,
): LoadedClusterType[] {
  return clusters.filter(
    (c) => c.cluster.metadata.name === identifier || c.cluster.metadata.code === identifier,
  );
}

/**
 * A fully loaded Kustodian project.
 *
 * `templates` contains both local templates (from `templates/`) and any
 * templates fetched from `spec.template_sources` when sources were
 * resolved. Source-fetched templates carry a `source_name`.
 */
export interface ProjectType {
  root: string;
  config?: ProjectConfigType;
  templates: LoadedTemplateType[];
  clusters: LoadedClusterType[];
  profiles: Map<string, NodeProfileType>;
  /** Resolved external sources, when sources were fetched. */
  resolved_sources?: ResolvedSourceSummaryType[];
}

/**
 * Summary of a resolved external source, attached to ProjectType when
 * sources were fetched. Mirrors the shape needed by callers without
 * pulling the full `sources` package types into the loader interface.
 */
export interface ResolvedSourceSummaryType {
  name: string;
  version: string;
  from_cache: boolean;
  fetched_at: Date;
  path: string;
}

/**
 * Options for `load_project`. By default no network I/O is performed —
 * pass `fetch_sources: true` to also fetch and merge templates from
 * `spec.template_sources`.
 */
export interface LoadProjectOptionsType {
  fetch_sources?: boolean;
  cache_dir?: string;
  force_refresh?: boolean;
}

/**
 * Finds the project root by looking for kustodian.yaml.
 */
export async function find_project_root(
  start_path: string,
): Promise<ResultType<string, KustodianErrorType>> {
  let current = path.resolve(start_path);
  const root = path.parse(current).root;

  while (current !== root) {
    const project_file = path.join(current, StandardFiles.PROJECT);
    if (await file_exists(project_file)) {
      return success(current);
    }
    current = path.dirname(current);
  }

  return failure(
    Errors.config_not_found('Project', `${StandardFiles.PROJECT} not found in parent directories`),
  );
}

/**
 * Loads a single template from its directory.
 */
export async function load_template(
  template_dir: string,
): Promise<ResultType<LoadedTemplateType, KustodianErrorType>> {
  const template_path = path.join(template_dir, StandardFiles.TEMPLATE);
  const yaml_result = await read_yaml_file<unknown>(template_path);

  if (!is_success(yaml_result)) {
    return yaml_result;
  }

  const validation = validate_template(yaml_result.value);
  if (!validation.success) {
    const errors = validation.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    return failure(Errors.schema_validation_error(errors));
  }

  return success({
    path: template_dir,
    template: validation.data,
  });
}

/**
 * Loads nodes from a single YAML file (supports multi-document).
 */
async function load_nodes_from_file(
  file_path: string,
): Promise<ResultType<NodeSchemaType[], KustodianErrorType>> {
  const { read_multi_yaml_file } = await import('./file.js');
  const docs_result = await read_multi_yaml_file<unknown>(file_path);

  if (!is_success(docs_result)) {
    return docs_result;
  }

  const nodes: NodeSchemaType[] = [];
  const errors: string[] = [];

  for (const doc of docs_result.value) {
    const validation = validate_node_resource(doc);
    if (!validation.success) {
      const validation_errors = validation.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      errors.push(`${path.basename(file_path)}:\n  ${validation_errors.join('\n  ')}`);
      continue;
    }

    nodes.push(node_resource_to_node(validation.data));
  }

  if (errors.length > 0) {
    return failure(Errors.validation_error(`Failed to load nodes:\n${errors.join('\n')}`));
  }

  return success(nodes);
}

/**
 * Loads all node files from specified paths (files or directories).
 */
export async function load_cluster_nodes(
  cluster_dir: string,
  node_file_paths?: string[],
): Promise<ResultType<NodeSchemaType[], KustodianErrorType>> {
  const nodes: NodeSchemaType[] = [];
  const errors: string[] = [];

  // If no paths specified, try default nodes/ directory
  const paths_to_scan = node_file_paths || [StandardDirs.NODES];

  for (const ref_path of paths_to_scan) {
    const full_path = path.isAbsolute(ref_path) ? ref_path : path.join(cluster_dir, ref_path);

    // Check if it's a directory
    const { is_directory } = await import('./file.js');
    if (await is_directory(full_path)) {
      // Load all YAML files from directory
      const yml_files = await list_files(full_path, '.yml');
      const yaml_files = await list_files(full_path, '.yaml');

      const all_files = [
        ...(is_success(yml_files) ? yml_files.value : []),
        ...(is_success(yaml_files) ? yaml_files.value : []),
      ];

      for (const file_path of all_files) {
        const result = await load_nodes_from_file(file_path);
        if (is_success(result)) {
          nodes.push(...result.value);
        } else {
          errors.push(result.error.message);
        }
      }
    } else if (await file_exists(full_path)) {
      // Load single file (may contain multiple documents)
      const result = await load_nodes_from_file(full_path);
      if (is_success(result)) {
        nodes.push(...result.value);
      } else {
        errors.push(result.error.message);
      }
    }
  }

  if (errors.length > 0) {
    return failure(Errors.validation_error(`Failed to load nodes:\n${errors.join('\n')}`));
  }

  return success(nodes);
}

/**
 * Loads a single cluster from its directory.
 */
export async function load_cluster(
  cluster_dir: string,
): Promise<ResultType<LoadedClusterType, KustodianErrorType>> {
  const cluster_path = path.join(cluster_dir, StandardFiles.CLUSTER);
  const yaml_result = await read_yaml_file<unknown>(cluster_path);

  if (!is_success(yaml_result)) {
    return yaml_result;
  }

  const validation = validate_cluster(yaml_result.value);
  if (!validation.success) {
    const errors = validation.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    return failure(Errors.schema_validation_error(errors));
  }

  // Load nodes from specified paths or default nodes/ directory
  const node_file_paths = validation.data.spec?.nodes;
  const nodes_result = await load_cluster_nodes(cluster_dir, node_file_paths);
  if (!is_success(nodes_result)) {
    return nodes_result;
  }

  return success({
    path: cluster_dir,
    cluster: validation.data,
    nodes: nodes_result.value,
  });
}

/**
 * Recursively finds all directories containing template.yaml files.
 *
 * Treats a directory as a template root as soon as it contains a
 * `template.yaml`, and stops descending — kustomization sub-directories
 * referenced from the template are not themselves templates.
 *
 * Exported so source-fetched repos (which may be single-template at the
 * root or multi-template nested) can reuse the same discovery rules.
 */
export async function find_template_directories(dir: string): Promise<string[]> {
  const template_path = path.join(dir, StandardFiles.TEMPLATE);

  // If this directory has a template.yaml, return it
  if (await file_exists(template_path)) {
    return [dir];
  }

  // Otherwise, recursively check subdirectories
  const subdirs_result = await list_directories(dir);
  if (!is_success(subdirs_result)) {
    return [];
  }

  const template_dirs: string[] = [];
  for (const subdir of subdirs_result.value) {
    const found = await find_template_directories(subdir);
    template_dirs.push(...found);
  }

  return template_dirs;
}

/**
 * Loads all templates from the templates directory.
 * Supports both flat and nested directory structures.
 */
export async function load_all_templates(
  project_root: string,
): Promise<ResultType<LoadedTemplateType[], KustodianErrorType>> {
  const templates_dir = path.join(project_root, StandardDirs.TEMPLATES);

  // Check if templates directory exists
  if (!(await file_exists(templates_dir))) {
    return success([]);
  }

  // Find all directories containing template.yaml (recursively)
  const template_dirs = await find_template_directories(templates_dir);

  const templates: LoadedTemplateType[] = [];
  const errors: string[] = [];

  for (const dir of template_dirs) {
    const result = await load_template(dir);
    if (is_success(result)) {
      templates.push(result.value);
    } else {
      const relative_path = path.relative(templates_dir, dir);
      errors.push(`${relative_path}: ${result.error.message}`);
    }
  }

  if (errors.length > 0) {
    return failure(Errors.validation_error(`Failed to load templates:\n${errors.join('\n')}`));
  }

  return success(templates);
}

/**
 * Loads all clusters from the clusters directory.
 */
export async function load_all_clusters(
  project_root: string,
): Promise<ResultType<LoadedClusterType[], KustodianErrorType>> {
  const clusters_dir = path.join(project_root, StandardDirs.CLUSTERS);
  const dirs_result = await list_directories(clusters_dir);

  if (!is_success(dirs_result)) {
    // Return empty array if clusters directory doesn't exist
    if (dirs_result.error.code === 'NOT_FOUND') {
      return success([]);
    }
    return dirs_result;
  }

  const clusters: LoadedClusterType[] = [];
  const errors: string[] = [];

  for (const dir of dirs_result.value) {
    const result = await load_cluster(dir);
    if (is_success(result)) {
      clusters.push(result.value);
    } else {
      errors.push(`${path.basename(dir)}: ${result.error.message}`);
    }
  }

  if (errors.length > 0) {
    return failure(Errors.validation_error(`Failed to load clusters:\n${errors.join('\n')}`));
  }

  return success(clusters);
}

/**
 * Loads a complete Kustodian project.
 *
 * Pass `options.fetch_sources` to also pull templates from any external
 * sources configured under `spec.template_sources` in `kustodian.yaml`.
 * Source-fetched templates are merged into `templates` and tagged with
 * `source_name`; resolved source metadata is attached as
 * `resolved_sources`.
 */
export async function load_project(
  project_root: string,
  options?: LoadProjectOptionsType,
): Promise<ResultType<ProjectType, KustodianErrorType>> {
  // Verify project exists
  const project_file = path.join(project_root, StandardFiles.PROJECT);
  if (!(await file_exists(project_file))) {
    return failure(Errors.config_not_found('Project', project_file));
  }

  // Load project config if kustodian.yaml exists
  let project_config: ProjectConfigType | undefined;
  const yaml_result = await read_yaml_file<unknown>(project_file);
  if (is_success(yaml_result)) {
    const validation = validate_project(yaml_result.value);
    if (validation.success) {
      project_config = validation.data;
    }
    // Note: Validation errors are non-fatal for backward compatibility
  }

  // Load profiles first (they may be referenced by nodes)
  const profiles_result = await load_all_profiles(project_root);
  if (!is_success(profiles_result)) {
    return profiles_result;
  }

  // Load local templates
  const templates_result = await load_all_templates(project_root);
  if (!is_success(templates_result)) {
    return templates_result;
  }

  // Load clusters
  const clusters_result = await load_all_clusters(project_root);
  if (!is_success(clusters_result)) {
    return clusters_result;
  }

  const all_templates: LoadedTemplateType[] = [...templates_result.value];
  let resolved_sources: ResolvedSourceSummaryType[] | undefined;

  // Fetch external sources when requested
  const sources = project_config?.spec?.template_sources ?? [];
  if (options?.fetch_sources && sources.length > 0) {
    // Dynamic import to avoid pulling the network/cache stack into callers
    // that just need local project loading.
    const { load_templates_from_sources, DEFAULT_CACHE_DIR } = await import('../sources/index.js');
    const cache_dir = options.cache_dir ?? path.join(project_root, DEFAULT_CACHE_DIR);

    const fetch_options: { cache_dir: string; force_refresh?: boolean } = { cache_dir };
    if (options.force_refresh !== undefined) {
      fetch_options.force_refresh = options.force_refresh;
    }
    const sources_result = await load_templates_from_sources(sources, fetch_options);
    if (!is_success(sources_result)) {
      return sources_result;
    }

    // Detect name collisions between local and sourced templates
    const local_names = new Set(templates_result.value.map((t) => t.template.metadata.name));
    const conflicts: string[] = [];
    for (const sourced of sources_result.value.templates) {
      if (local_names.has(sourced.template.metadata.name)) {
        conflicts.push(
          `${sourced.template.metadata.name} (from source '${sourced.source_name}' clashes with local template)`,
        );
        continue;
      }
      all_templates.push({
        path: sourced.path,
        template: sourced.template,
        source_name: sourced.source_name,
      });
    }

    // Detect collisions between sourced templates from different sources
    const seen = new Map<string, string>();
    for (const sourced of sources_result.value.templates) {
      const existing = seen.get(sourced.template.metadata.name);
      if (existing && existing !== sourced.source_name) {
        conflicts.push(
          `${sourced.template.metadata.name} (provided by both source '${existing}' and source '${sourced.source_name}')`,
        );
      }
      seen.set(sourced.template.metadata.name, sourced.source_name);
    }

    if (conflicts.length > 0) {
      return failure(
        Errors.validation_error(`Template name conflicts:\n  ${conflicts.join('\n  ')}`),
      );
    }

    resolved_sources = sources_result.value.resolved.map((r) => ({
      name: r.source.name,
      version: r.fetch_result.version,
      from_cache: r.fetch_result.from_cache,
      fetched_at: r.fetch_result.fetched_at,
      path: r.fetch_result.path,
    }));
  }

  const result: ProjectType = {
    root: project_root,
    templates: all_templates,
    clusters: clusters_result.value,
    profiles: profiles_result.value,
  };

  if (project_config) {
    result.config = project_config;
  }
  if (resolved_sources) {
    result.resolved_sources = resolved_sources;
  }

  return success(result);
}
