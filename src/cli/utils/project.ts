import type { KustodianErrorType } from '../../core/index.js';
import { type ResultType, is_success, success } from '../../core/index.js';
import {
  type LoadedClusterType,
  type ProjectType,
  find_cluster,
  find_project_root,
  load_project,
} from '../../loader/index.js';

/**
 * Sanitizes a string for use in file paths by replacing non-alphanumeric characters.
 */
export function sanitize_filename_part(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export interface LoadedProjectType {
  project_root: string;
  project: ProjectType;
  target_clusters: LoadedClusterType[];
}

/**
 * Options for `load_and_resolve_project`.
 *
 * `fetch_sources` defaults to `true` so commands like apply/diff/validate
 * transparently pull templates from configured external sources. Pass
 * `false` to skip the network and use only local templates.
 */
export interface LoadAndResolveOptions {
  fetch_sources?: boolean;
  force_refresh?: boolean;
}

/**
 * Loads a project and resolves target clusters in one step.
 * Handles find_project_root → load_project → find_cluster with console logging.
 */
export async function load_and_resolve_project(
  project_path: string,
  cluster_filter?: string,
  options?: LoadAndResolveOptions,
): Promise<ResultType<LoadedProjectType, KustodianErrorType>> {
  console.log('\nLoading project configuration...');
  const root_result = await find_project_root(project_path);
  if (!is_success(root_result)) {
    console.error(`  ✗ Error: ${root_result.error.message}`);
    return root_result;
  }

  const project_root = root_result.value;
  console.log(`  → Project root: ${project_root}`);

  const fetch_sources = options?.fetch_sources ?? true;
  const load_options: { fetch_sources: boolean; force_refresh?: boolean } = { fetch_sources };
  if (options?.force_refresh !== undefined) {
    load_options.force_refresh = options.force_refresh;
  }
  const project_result = await load_project(project_root, load_options);
  if (!is_success(project_result)) {
    console.error(`  ✗ Error: ${project_result.error.message}`);
    return project_result;
  }

  const project = project_result.value;
  if (project.resolved_sources && project.resolved_sources.length > 0) {
    for (const src of project.resolved_sources) {
      const status = src.from_cache ? '(cached)' : '(fetched)';
      console.log(`  → Source ${src.name} @ ${src.version} ${status}`);
    }
  }
  const local_count = project.templates.filter((t) => !t.source_name).length;
  const sourced_count = project.templates.length - local_count;
  if (sourced_count > 0) {
    console.log(
      `  ✓ Loaded ${project.templates.length} templates (${local_count} local, ${sourced_count} from sources)`,
    );
  } else {
    console.log(`  ✓ Loaded ${project.templates.length} templates`);
  }

  let target_clusters: LoadedClusterType[];
  if (cluster_filter) {
    const found = find_cluster(project.clusters, cluster_filter);
    if (!found) {
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Cluster '${cluster_filter}' not found` },
      };
    }
    target_clusters = [found];
  } else {
    target_clusters = project.clusters;
  }

  if (target_clusters.length === 0) {
    return {
      success: false as const,
      error: { code: 'NOT_FOUND', message: 'No clusters found in project' },
    };
  }

  return success({ project_root, project, target_clusters });
}
