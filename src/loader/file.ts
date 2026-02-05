import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { KustodianErrorType } from '../core/index.js';
import { Errors, type ResultType, failure, from_promise, success } from '../core/index.js';

import { parse_yaml, stringify_yaml } from './yaml.js';

/**
 * Checks if a file exists.
 */
export async function file_exists(file_path: string): Promise<boolean> {
  try {
    await fs.access(file_path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a path is a directory.
 */
export async function is_directory(dir_path: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dir_path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Reads a file and returns its contents as a string.
 */
export async function read_file(
  file_path: string,
): Promise<ResultType<string, KustodianErrorType>> {
  const exists = await file_exists(file_path);
  if (!exists) {
    return failure(Errors.file_not_found(file_path));
  }

  return from_promise(fs.readFile(file_path, 'utf-8'), (error) =>
    Errors.file_read_error(file_path, error),
  );
}

/**
 * Writes content to a file, creating directories as needed.
 */
export async function write_file(
  file_path: string,
  content: string,
): Promise<ResultType<void, KustodianErrorType>> {
  try {
    const dir = path.dirname(file_path);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file_path, content, 'utf-8');
    return success(undefined);
  } catch (error) {
    return failure(Errors.file_write_error(file_path, error));
  }
}

/**
 * Reads a YAML file and parses it.
 */
export async function read_yaml_file<T>(
  file_path: string,
): Promise<ResultType<T, KustodianErrorType>> {
  const content_result = await read_file(file_path);
  if (!content_result.success) {
    return content_result;
  }

  return parse_yaml<T>(content_result.value);
}

/**
 * Reads a multi-document YAML file and parses it.
 */
export async function read_multi_yaml_file<T>(
  file_path: string,
): Promise<ResultType<T[], KustodianErrorType>> {
  const content_result = await read_file(file_path);
  if (!content_result.success) {
    return content_result;
  }

  const { parse_multi_yaml } = await import('./yaml.js');
  return parse_multi_yaml<T>(content_result.value);
}

/**
 * Writes an object to a YAML file.
 */
export async function write_yaml_file<T>(
  file_path: string,
  data: T,
): Promise<ResultType<void, KustodianErrorType>> {
  const yaml_result = stringify_yaml(data);
  if (!yaml_result.success) {
    return yaml_result;
  }

  return write_file(file_path, yaml_result.value);
}

/**
 * Lists all files in a directory matching a pattern.
 */
export async function list_files(
  dir_path: string,
  extension?: string,
): Promise<ResultType<string[], KustodianErrorType>> {
  const exists = await is_directory(dir_path);
  if (!exists) {
    return failure(Errors.not_found('Directory', dir_path));
  }

  try {
    const entries = await fs.readdir(dir_path, { withFileTypes: true });
    let files = entries.filter((e) => e.isFile()).map((e) => path.join(dir_path, e.name));

    if (extension) {
      files = files.filter((f) => f.endsWith(extension));
    }

    return success(files);
  } catch (error) {
    return failure(Errors.file_read_error(dir_path, error));
  }
}

/**
 * Lists all subdirectories in a directory.
 */
export async function list_directories(
  dir_path: string,
): Promise<ResultType<string[], KustodianErrorType>> {
  const exists = await is_directory(dir_path);
  if (!exists) {
    return failure(Errors.not_found('Directory', dir_path));
  }

  try {
    const entries = await fs.readdir(dir_path, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(dir_path, e.name));

    return success(dirs);
  } catch (error) {
    return failure(Errors.file_read_error(dir_path, error));
  }
}
