import * as path from 'node:path';
import {
  type KustodianErrorType,
  type ResultType,
  failure,
  is_success,
  success,
} from '../core/index.js';
import { type LoadedTemplateType, list_directories, load_template } from '../loader/index.js';
import type { TemplateSourceType } from '../schema/index.js';
import { type CreateResolverOptionsType, create_source_resolver } from './resolver.js';
import type { FetchOptionsType, ResolvedSourceType } from './types.js';

/**
 * A loaded template with source information.
 */
export interface SourcedTemplateType extends LoadedTemplateType {
  /** Name of the source this template came from */
  source_name: string;
}

/**
 * Result of loading templates from sources.
 */
export interface LoadedSourcesResultType {
  /** All loaded templates from all sources */
  templates: SourcedTemplateType[];
  /** Successfully resolved sources */
  resolved: ResolvedSourceType[];
}

/**
 * Options for loading templates from sources.
 */
export interface LoadSourcesOptionsType extends FetchOptionsType, CreateResolverOptionsType {
  /** Run fetches in parallel (default: true) */
  parallel?: boolean;
}

/**
 * Loads templates from all configured sources.
 * Fetches from remote (or cache) and loads all template.yaml files found.
 */
export async function load_templates_from_sources(
  sources: TemplateSourceType[],
  options?: LoadSourcesOptionsType,
): Promise<ResultType<LoadedSourcesResultType, KustodianErrorType>> {
  if (sources.length === 0) {
    return success({ templates: [], resolved: [] });
  }

  // Fetch all sources
  const resolver = create_source_resolver(options);
  const fetch_result = await resolver.resolve_all(sources, options);

  if (!fetch_result.success) {
    return fetch_result;
  }

  // Load templates from each fetched source
  const all_templates: SourcedTemplateType[] = [];
  const errors: string[] = [];

  for (const resolved of fetch_result.value) {
    const templates_result = await load_templates_from_path(resolved.fetch_result.path);

    if (is_success(templates_result)) {
      // Add source name to each template
      for (const loaded of templates_result.value) {
        all_templates.push({
          ...loaded,
          source_name: resolved.source.name,
        });
      }
    } else {
      errors.push(`${resolved.source.name}: ${templates_result.error.message}`);
    }
  }

  if (errors.length > 0) {
    return failure({
      code: 'VALIDATION_ERROR',
      message: `Failed to load templates from sources:\n${errors.join('\n')}`,
    });
  }

  return success({
    templates: all_templates,
    resolved: fetch_result.value,
  });
}

/**
 * Loads all templates from a directory path.
 * Looks for subdirectories containing template.yaml files.
 */
async function load_templates_from_path(
  source_path: string,
): Promise<ResultType<LoadedTemplateType[], KustodianErrorType>> {
  // List all subdirectories that might be templates
  const dirs_result = await list_directories(source_path);

  if (!is_success(dirs_result)) {
    // Check if this path itself is a template
    const direct_result = await load_template(source_path);
    if (is_success(direct_result)) {
      return success([direct_result.value]);
    }
    return failure({
      code: 'NOT_FOUND',
      message: `No templates found in ${source_path}`,
    });
  }

  const templates: LoadedTemplateType[] = [];
  const errors: string[] = [];

  for (const dir of dirs_result.value) {
    const result = await load_template(dir);
    if (is_success(result)) {
      templates.push(result.value);
    } else {
      // Only log errors for directories that look like templates
      // (i.e., they have a template.yaml that failed validation)
      if (result.error.code === 'SCHEMA_VALIDATION_ERROR') {
        errors.push(`${path.basename(dir)}: ${result.error.message}`);
      }
    }
  }

  if (templates.length === 0 && errors.length > 0) {
    return failure({
      code: 'VALIDATION_ERROR',
      message: `Failed to load templates:\n${errors.join('\n')}`,
    });
  }

  return success(templates);
}
