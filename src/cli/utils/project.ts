import type { KustodianErrorType } from '../../core/index.js';
import { type ResultType, is_success, success } from '../../core/index.js';
import {
  type LoadedClusterType,
  type ProjectType,
  find_cluster,
  find_project_root,
  load_project,
} from '../../loader/index.js';

export interface LoadedProjectType {
  project_root: string;
  project: ProjectType;
  target_clusters: LoadedClusterType[];
}

/**
 * Loads a project and resolves target clusters in one step.
 * Handles find_project_root → load_project → find_cluster with console logging.
 */
export async function load_and_resolve_project(
  project_path: string,
  cluster_filter?: string,
): Promise<ResultType<LoadedProjectType, KustodianErrorType>> {
  console.log('\nLoading project configuration...');
  const root_result = await find_project_root(project_path);
  if (!is_success(root_result)) {
    console.error(`  ✗ Error: ${root_result.error.message}`);
    return root_result;
  }

  const project_root = root_result.value;
  console.log(`  → Project root: ${project_root}`);

  const project_result = await load_project(project_root);
  if (!is_success(project_result)) {
    console.error(`  ✗ Error: ${project_result.error.message}`);
    return project_result;
  }

  const project = project_result.value;
  console.log(`  ✓ Loaded ${project.templates.length} templates`);

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
