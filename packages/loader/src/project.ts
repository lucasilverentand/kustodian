import * as path from 'node:path';

import { Errors, type ResultType, failure, is_success, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import {
  type ClusterType,
  type TemplateType,
  validate_cluster,
  validate_template,
} from '@kustodian/schema';

import { file_exists, list_directories, read_yaml_file } from './file.js';

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
} as const;

/**
 * Loaded template with its source path.
 */
export interface LoadedTemplateType {
  path: string;
  template: TemplateType;
}

/**
 * Loaded cluster with its source path.
 */
export interface LoadedClusterType {
  path: string;
  cluster: ClusterType;
}

/**
 * A fully loaded Kustodian project.
 */
export interface ProjectType {
  root: string;
  templates: LoadedTemplateType[];
  clusters: LoadedClusterType[];
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

  return success({
    path: cluster_dir,
    cluster: validation.data,
  });
}

/**
 * Loads all templates from the templates directory.
 */
export async function load_all_templates(
  project_root: string,
): Promise<ResultType<LoadedTemplateType[], KustodianErrorType>> {
  const templates_dir = path.join(project_root, StandardDirs.TEMPLATES);
  const dirs_result = await list_directories(templates_dir);

  if (!is_success(dirs_result)) {
    // Return empty array if templates directory doesn't exist
    if (dirs_result.error.code === 'NOT_FOUND') {
      return success([]);
    }
    return dirs_result;
  }

  const templates: LoadedTemplateType[] = [];
  const errors: string[] = [];

  for (const dir of dirs_result.value) {
    const result = await load_template(dir);
    if (is_success(result)) {
      templates.push(result.value);
    } else {
      errors.push(`${path.basename(dir)}: ${result.error.message}`);
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
 */
export async function load_project(
  project_root: string,
): Promise<ResultType<ProjectType, KustodianErrorType>> {
  // Verify project exists
  const project_file = path.join(project_root, StandardFiles.PROJECT);
  if (!(await file_exists(project_file))) {
    return failure(Errors.config_not_found('Project', project_file));
  }

  // Load templates
  const templates_result = await load_all_templates(project_root);
  if (!is_success(templates_result)) {
    return templates_result;
  }

  // Load clusters
  const clusters_result = await load_all_clusters(project_root);
  if (!is_success(clusters_result)) {
    return clusters_result;
  }

  return success({
    root: project_root,
    templates: templates_result.value,
    clusters: clusters_result.value,
  });
}
