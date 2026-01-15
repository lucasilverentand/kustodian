import * as path from 'node:path';

import { Errors, type ResultType, failure, is_success, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import {
  type NodeProfileType,
  node_profile_resource_to_profile,
  validate_node_profile_resource,
} from '@kustodian/schema';

import { file_exists, is_directory, list_files, read_multi_yaml_file } from './file.js';

/**
 * Standard directory name for profiles.
 */
export const PROFILES_DIR = 'profiles';

/**
 * Loaded profile with its source path.
 */
export interface LoadedProfileType {
  path: string;
  profile: NodeProfileType;
}

/**
 * Loads profiles from a single YAML file (supports multi-document).
 */
async function load_profiles_from_file(
  file_path: string,
): Promise<ResultType<NodeProfileType[], KustodianErrorType>> {
  const docs_result = await read_multi_yaml_file<unknown>(file_path);

  if (!is_success(docs_result)) {
    return docs_result;
  }

  const profiles: NodeProfileType[] = [];
  const errors: string[] = [];

  for (const doc of docs_result.value) {
    const validation = validate_node_profile_resource(doc);
    if (!validation.success) {
      const validation_errors = validation.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      errors.push(`${path.basename(file_path)}:\n  ${validation_errors.join('\n  ')}`);
      continue;
    }

    profiles.push(node_profile_resource_to_profile(validation.data));
  }

  if (errors.length > 0) {
    return failure(Errors.validation_error(`Failed to load profiles:\n${errors.join('\n')}`));
  }

  return success(profiles);
}

/**
 * Loads all profiles from the profiles directory.
 */
export async function load_all_profiles(
  project_root: string,
): Promise<ResultType<Map<string, NodeProfileType>, KustodianErrorType>> {
  const profiles_dir = path.join(project_root, PROFILES_DIR);
  const profiles_map = new Map<string, NodeProfileType>();

  // Return empty map if profiles directory doesn't exist
  if (!(await file_exists(profiles_dir))) {
    return success(profiles_map);
  }

  if (!(await is_directory(profiles_dir))) {
    return success(profiles_map);
  }

  const errors: string[] = [];

  // Load all YAML files from directory
  const yml_files = await list_files(profiles_dir, '.yml');
  const yaml_files = await list_files(profiles_dir, '.yaml');

  const all_files = [
    ...(is_success(yml_files) ? yml_files.value : []),
    ...(is_success(yaml_files) ? yaml_files.value : []),
  ];

  for (const file_path of all_files) {
    const result = await load_profiles_from_file(file_path);
    if (is_success(result)) {
      for (const profile of result.value) {
        if (profiles_map.has(profile.name)) {
          errors.push(`Duplicate profile name: ${profile.name}`);
          continue;
        }
        profiles_map.set(profile.name, profile);
      }
    } else {
      errors.push(result.error.message);
    }
  }

  if (errors.length > 0) {
    return failure(Errors.validation_error(`Failed to load profiles:\n${errors.join('\n')}`));
  }

  return success(profiles_map);
}

/**
 * Gets a profile by name from a profiles map.
 */
export function get_profile(
  profiles: Map<string, NodeProfileType>,
  name: string,
): ResultType<NodeProfileType, KustodianErrorType> {
  const profile = profiles.get(name);
  if (!profile) {
    return failure(Errors.profile_not_found(name));
  }
  return success(profile);
}
