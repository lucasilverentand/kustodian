import { parse, parseAllDocuments, stringify } from 'yaml';
import type { KustodianErrorType } from '../core/index.js';
import { Errors, type ResultType, failure, success } from '../core/index.js';

/**
 * Parses a YAML string into an object.
 */
export function parse_yaml<T>(content: string): ResultType<T, KustodianErrorType> {
  try {
    const result = parse(content) as T;
    return success(result);
  } catch (error) {
    return failure(
      Errors.yaml_parse_error(error instanceof Error ? error.message : String(error), error),
    );
  }
}

/**
 * Parses a multi-document YAML string (separated by ---) into an array of objects.
 */
export function parse_multi_yaml<T>(content: string): ResultType<T[], KustodianErrorType> {
  try {
    const docs = parseAllDocuments(content);
    const results = docs.map((doc) => doc.toJSON() as T);
    return success(results);
  } catch (error) {
    return failure(
      Errors.yaml_parse_error(error instanceof Error ? error.message : String(error), error),
    );
  }
}

/**
 * Converts an object to a YAML string.
 */
export function stringify_yaml<T>(data: T): ResultType<string, KustodianErrorType> {
  try {
    const result = stringify(data, {
      indent: 2,
      lineWidth: 0,
      singleQuote: false,
    });
    return success(result);
  } catch (error) {
    return failure(
      Errors.parse_error('YAML', error instanceof Error ? error.message : String(error), error),
    );
  }
}
