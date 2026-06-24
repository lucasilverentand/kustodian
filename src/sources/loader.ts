import * as path from 'node:path';
import {
  type KustodianErrorType,
  type ResultType,
  failure,
  is_success,
  success,
} from '../core/index.js';
import {
  type LoadedTemplateType,
  find_template_directories,
  load_template,
} from '../loader/index.js';
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
 *
 * Walks the tree looking for `template.yaml` files. Stops at the first
 * one found in a given branch, which lets the same logic handle both:
 *
 *   - Single-template repos (root has `template.yaml`)
 *   - Multi-template repos (each subdirectory under the root or some
 *     prefix path holds its own `template.yaml`)
 */
async function load_templates_from_path(
  source_path: string,
): Promise<ResultType<LoadedTemplateType[], KustodianErrorType>> {
  const template_dirs = await find_template_directories(source_path);

  if (template_dirs.length === 0) {
    return failure({
      code: 'NOT_FOUND',
      message: `No templates found in ${source_path}`,
    });
  }

  const templates: LoadedTemplateType[] = [];
  const errors: string[] = [];

  for (const dir of template_dirs) {
    const result = await load_template(dir);
    if (is_success(result)) {
      templates.push(result.value);
    } else {
      const relative = path.relative(source_path, dir) || '.';
      errors.push(`${relative}: ${result.error.message}`);
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
