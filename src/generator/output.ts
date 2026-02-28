import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import type { KustodianErrorType } from '../core/index.js';
import { Errors, type ResultType, failure, success } from '../core/index.js';

import type { FluxKustomizationType, GenerationResultType } from './types.js';

/**
 * Output format options.
 */
export type OutputFormatType = 'yaml' | 'json';

/**
 * Options for writing output.
 */
export interface WriteOptionsType {
  format?: OutputFormatType;
  create_dirs?: boolean;
}

/**
 * Serializes a resource to YAML or JSON.
 */
export function serialize_resource<T>(resource: T, format: OutputFormatType = 'yaml'): string {
  if (format === 'json') {
    return JSON.stringify(resource, null, 2);
  }

  return YAML.stringify(resource, {
    indent: 2,
    lineWidth: 0,
    singleQuote: false,
  });
}

/**
 * Serializes multiple resources to a single YAML document with separators.
 */
export function serialize_resources<T>(resources: T[], format: OutputFormatType = 'yaml'): string {
  if (format === 'json') {
    return JSON.stringify(resources, null, 2);
  }

  return resources.map((r) => serialize_resource(r, format)).join('---\n');
}

/**
 * Ensures a directory exists, creating it if necessary.
 */
export async function ensure_directory(
  dir_path: string,
): Promise<ResultType<void, KustodianErrorType>> {
  try {
    await fs.mkdir(dir_path, { recursive: true });
    return success(undefined);
  } catch (error) {
    return failure(Errors.file_write_error(dir_path, error));
  }
}

/**
 * Writes content to a file.
 */
export async function write_file(
  file_path: string,
  content: string,
  options: WriteOptionsType = {},
): Promise<ResultType<void, KustodianErrorType>> {
  const { create_dirs = true } = options;

  if (create_dirs) {
    const dir = path.dirname(file_path);
    const dir_result = await ensure_directory(dir);
    if (!dir_result.success) {
      return dir_result;
    }
  }

  try {
    await fs.writeFile(file_path, content, 'utf-8');
    return success(undefined);
  } catch (error) {
    return failure(Errors.file_write_error(file_path, error));
  }
}

/**
 * Writes a Flux Kustomization resource to a file.
 */
export async function write_flux_kustomization(
  kustomization: FluxKustomizationType,
  output_dir: string,
  options: WriteOptionsType = {},
): Promise<ResultType<string, KustodianErrorType>> {
  const format = options.format ?? 'yaml';
  const ext = format === 'json' ? 'json' : 'yaml';
  const file_path = path.join(output_dir, `${kustomization.metadata.name}.${ext}`);

  const content = serialize_resource(kustomization, format);
  const result = await write_file(file_path, content, options);

  if (!result.success) {
    return result;
  }

  return success(file_path);
}

/**
 * Writes all generated kustomizations to a structured output directory.
 *
 * Output structure:
 * ```
 * {output_dir}/
 * ├── flux-system/
 * │   ├── kustomization.yaml    # Root kustomization referencing all templates
 * │   ├── oci-repository.yaml   # OCI source (if configured)
 * │   └── gotk-patches.yaml     # Controller patches (if flux.controllers configured)
 * └── templates/
 *     ├── {template-name}/
 *     │   └── {kustomization-name}.yaml
 *     └── ...
 * ```
 */
export async function write_generation_result(
  result: GenerationResultType,
  options: WriteOptionsType = {},
): Promise<ResultType<string[], KustodianErrorType>> {
  const format = options.format ?? 'yaml';
  const ext = format === 'json' ? 'json' : 'yaml';
  const written_files: string[] = [];

  const flux_system_dir = path.join(result.output_dir, 'flux-system');
  const templates_dir = path.join(result.output_dir, 'templates');

  // Write OCIRepository to flux-system directory if present
  if (result.oci_repository) {
    const oci_path = path.join(flux_system_dir, `oci-repository.${ext}`);
    const oci_content = serialize_resource(result.oci_repository, format);
    const oci_result = await write_file(oci_path, oci_content, options);

    if (!oci_result.success) {
      return oci_result;
    }

    written_files.push(oci_path);
  }

  // Write controller patches to flux-system directory if present
  if (result.controller_patches && result.controller_patches.length > 0) {
    const patches_path = path.join(flux_system_dir, 'gotk-patches.yaml');
    const patches_content = serialize_resource(result.controller_patches, format);
    const patches_result = await write_file(patches_path, patches_content, options);

    if (!patches_result.success) {
      return patches_result;
    }

    written_files.push(patches_path);
  }

  // Write each kustomization to templates/{template-name}/{kustomization-name}.yaml
  for (const generated of result.kustomizations) {
    const template_dir = path.join(templates_dir, generated.template);
    const file_path = path.join(
      template_dir,
      `${generated.flux_kustomization.metadata.name}.${ext}`,
    );

    const content = serialize_resource(generated.flux_kustomization, format);
    const file_result = await write_file(file_path, content, options);

    if (!file_result.success) {
      return file_result;
    }

    written_files.push(file_path);
  }

  // Write root kustomization.yaml in flux-system directory
  const kustomization_path = path.join(flux_system_dir, 'kustomization.yaml');
  const resources: string[] = [];

  // Add OCI repository reference if present
  if (result.oci_repository) {
    resources.push(`oci-repository.${ext}`);
  }

  // Add references to all template kustomizations with relative paths
  resources.push(
    ...result.kustomizations.map((k) => {
      return `../templates/${k.template}/${k.flux_kustomization.metadata.name}.${ext}`;
    }),
  );

  // Sort resources for deterministic output
  resources.sort();

  // Build kustomization object
  const kustomization_obj: {
    apiVersion: string;
    kind: string;
    resources: string[];
    patches?: Array<{ path: string; target: { kind: string; name: string } }>;
  } = {
    apiVersion: 'kustomize.config.k8s.io/v1beta1',
    kind: 'Kustomization',
    resources,
  };

  // Add patches reference if controller patches are present
  if (result.controller_patches && result.controller_patches.length > 0) {
    kustomization_obj.patches = [
      {
        path: 'gotk-patches.yaml',
        target: {
          kind: 'Deployment',
          name: '(kustomize-controller|helm-controller|source-controller)',
        },
      },
    ];
  }

  const kustomization_content = serialize_resource(kustomization_obj, 'yaml');

  const kustomization_result = await write_file(kustomization_path, kustomization_content, options);
  if (!kustomization_result.success) {
    return kustomization_result;
  }

  written_files.push(kustomization_path);

  // Clean orphaned files from templates directory
  const orphans = await clean_orphaned_files(result.output_dir, written_files);
  if (orphans.length > 0) {
    console.log(`Cleaned ${orphans.length} orphaned file(s) from templates/`);
  }

  return success(written_files);
}

/**
 * Removes files from `{output_dir}/templates/` that were not part of the current generation.
 * Also removes empty template directories left behind after deletions.
 */
export async function clean_orphaned_files(
  output_dir: string,
  written_files: string[],
): Promise<string[]> {
  const templates_dir = path.join(output_dir, 'templates');
  const written_set = new Set(written_files.map((f) => path.resolve(f)));
  const deleted: string[] = [];

  let template_names: string[];
  try {
    template_names = await fs.readdir(templates_dir);
  } catch {
    // templates/ doesn't exist yet (first run) — nothing to clean
    return deleted;
  }

  for (const template_name of template_names) {
    const template_path = path.join(templates_dir, template_name);
    const template_stat = await fs.stat(template_path).catch(() => null);
    if (!template_stat?.isDirectory()) continue;

    let file_names: string[];
    try {
      file_names = await fs.readdir(template_path);
    } catch {
      continue;
    }

    for (const file_name of file_names) {
      const file_path = path.resolve(path.join(template_path, file_name));
      const file_stat = await fs.stat(file_path).catch(() => null);
      if (!file_stat?.isFile()) continue;

      if (!written_set.has(file_path)) {
        try {
          await fs.unlink(file_path);
          deleted.push(file_path);
        } catch (error) {
          console.warn(`Failed to remove orphaned file ${file_path}:`, error);
        }
      }
    }

    // Remove the template directory if it's now empty
    try {
      await fs.rmdir(template_path);
    } catch {
      // Directory not empty — expected, ignore
    }
  }

  return deleted;
}

/**
 * Gets the file extension for a format.
 */
export function get_extension(format: OutputFormatType): string {
  return format === 'json' ? 'json' : 'yaml';
}
