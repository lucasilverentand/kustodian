import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Errors, type ResultType, failure, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import YAML from 'yaml';

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
 * Writes all generated kustomizations to the output directory.
 */
export async function write_generation_result(
  result: GenerationResultType,
  options: WriteOptionsType = {},
): Promise<ResultType<string[], KustodianErrorType>> {
  const format = options.format ?? 'yaml';
  const written_files: string[] = [];

  for (const generated of result.kustomizations) {
    const file_result = await write_flux_kustomization(
      generated.flux_kustomization,
      result.output_dir,
      options,
    );

    if (!file_result.success) {
      return file_result;
    }

    written_files.push(file_result.value);
  }

  // Write a kustomization.yaml that includes all generated files
  const kustomization_path = path.join(result.output_dir, 'kustomization.yaml');
  const kustomization_content = serialize_resource(
    {
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      resources: result.kustomizations.map((k) => {
        const ext = format === 'json' ? 'json' : 'yaml';
        return `${k.flux_kustomization.metadata.name}.${ext}`;
      }),
    },
    'yaml',
  );

  const kustomization_result = await write_file(kustomization_path, kustomization_content, options);
  if (!kustomization_result.success) {
    return kustomization_result;
  }

  written_files.push(kustomization_path);

  return success(written_files);
}

/**
 * Gets the file extension for a format.
 */
export function get_extension(format: OutputFormatType): string {
  return format === 'json' ? 'json' : 'yaml';
}
