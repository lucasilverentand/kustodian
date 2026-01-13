/**
 * Base error type for all Kustodian errors.
 */
export interface KustodianErrorType {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}

/**
 * Creates a Kustodian error.
 */
export function create_error(code: string, message: string, cause?: unknown): KustodianErrorType {
  return { code, message, cause };
}

/**
 * Error codes for common operations.
 */
export const ErrorCodes = {
  // General errors
  UNKNOWN: 'UNKNOWN',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // IO errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  DIRECTORY_NOT_FOUND: 'DIRECTORY_NOT_FOUND',

  // Parsing errors
  PARSE_ERROR: 'PARSE_ERROR',
  YAML_PARSE_ERROR: 'YAML_PARSE_ERROR',
  JSON_PARSE_ERROR: 'JSON_PARSE_ERROR',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SCHEMA_VALIDATION_ERROR: 'SCHEMA_VALIDATION_ERROR',

  // Configuration errors
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  CONFIG_INVALID: 'CONFIG_INVALID',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  CLUSTER_NOT_FOUND: 'CLUSTER_NOT_FOUND',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  TIMEOUT: 'TIMEOUT',

  // SSH errors
  SSH_CONNECTION_ERROR: 'SSH_CONNECTION_ERROR',
  SSH_AUTH_ERROR: 'SSH_AUTH_ERROR',
  SSH_COMMAND_ERROR: 'SSH_COMMAND_ERROR',

  // Kubernetes errors
  K8S_CONNECTION_ERROR: 'K8S_CONNECTION_ERROR',
  K8S_API_ERROR: 'K8S_API_ERROR',
  NODE_NOT_READY: 'NODE_NOT_READY',

  // Bootstrap errors
  BOOTSTRAP_ERROR: 'BOOTSTRAP_ERROR',
  BOOTSTRAP_STATE_ERROR: 'BOOTSTRAP_STATE_ERROR',
  CLUSTER_PROVIDER_ERROR: 'CLUSTER_PROVIDER_ERROR',

  // Plugin errors
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
  PLUGIN_LOAD_ERROR: 'PLUGIN_LOAD_ERROR',
  PLUGIN_EXECUTION_ERROR: 'PLUGIN_EXECUTION_ERROR',

  // Dependency graph errors
  DEPENDENCY_CYCLE: 'DEPENDENCY_CYCLE',
  DEPENDENCY_MISSING: 'DEPENDENCY_MISSING',
  DEPENDENCY_SELF_REFERENCE: 'DEPENDENCY_SELF_REFERENCE',
  DEPENDENCY_VALIDATION_ERROR: 'DEPENDENCY_VALIDATION_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Error factory functions for common error types.
 */
export const Errors = {
  unknown(message: string, cause?: unknown): KustodianErrorType {
    return create_error(ErrorCodes.UNKNOWN, message, cause);
  },

  invalid_argument(argument: string, reason: string): KustodianErrorType {
    return create_error(ErrorCodes.INVALID_ARGUMENT, `Invalid argument '${argument}': ${reason}`);
  },

  not_found(resource: string, identifier: string): KustodianErrorType {
    return create_error(ErrorCodes.NOT_FOUND, `${resource} '${identifier}' not found`);
  },

  already_exists(resource: string, identifier: string): KustodianErrorType {
    return create_error(ErrorCodes.ALREADY_EXISTS, `${resource} '${identifier}' already exists`);
  },

  file_not_found(path: string): KustodianErrorType {
    return create_error(ErrorCodes.FILE_NOT_FOUND, `File not found: ${path}`);
  },

  file_read_error(path: string, cause?: unknown): KustodianErrorType {
    return create_error(ErrorCodes.FILE_READ_ERROR, `Failed to read file: ${path}`, cause);
  },

  file_write_error(path: string, cause?: unknown): KustodianErrorType {
    return create_error(ErrorCodes.FILE_WRITE_ERROR, `Failed to write file: ${path}`, cause);
  },

  parse_error(format: string, message: string, cause?: unknown): KustodianErrorType {
    return create_error(ErrorCodes.PARSE_ERROR, `Failed to parse ${format}: ${message}`, cause);
  },

  yaml_parse_error(message: string, cause?: unknown): KustodianErrorType {
    return create_error(ErrorCodes.YAML_PARSE_ERROR, `YAML parse error: ${message}`, cause);
  },

  validation_error(message: string, cause?: unknown): KustodianErrorType {
    return create_error(ErrorCodes.VALIDATION_ERROR, message, cause);
  },

  schema_validation_error(errors: string[]): KustodianErrorType {
    return create_error(
      ErrorCodes.SCHEMA_VALIDATION_ERROR,
      `Schema validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  },

  config_not_found(config_type: string, path: string): KustodianErrorType {
    return create_error(
      ErrorCodes.CONFIG_NOT_FOUND,
      `${config_type} configuration not found at: ${path}`,
    );
  },

  template_not_found(name: string): KustodianErrorType {
    return create_error(ErrorCodes.TEMPLATE_NOT_FOUND, `Template '${name}' not found`);
  },

  cluster_not_found(name: string): KustodianErrorType {
    return create_error(ErrorCodes.CLUSTER_NOT_FOUND, `Cluster '${name}' not found`);
  },

  ssh_connection_error(host: string, cause?: unknown): KustodianErrorType {
    return create_error(
      ErrorCodes.SSH_CONNECTION_ERROR,
      `Failed to connect to ${host} via SSH`,
      cause,
    );
  },

  ssh_auth_error(host: string, cause?: unknown): KustodianErrorType {
    return create_error(ErrorCodes.SSH_AUTH_ERROR, `SSH authentication failed for ${host}`, cause);
  },

  bootstrap_error(message: string, cause?: unknown): KustodianErrorType {
    return create_error(ErrorCodes.BOOTSTRAP_ERROR, `Bootstrap failed: ${message}`, cause);
  },

  plugin_not_found(name: string): KustodianErrorType {
    return create_error(ErrorCodes.PLUGIN_NOT_FOUND, `Plugin '${name}' not found`);
  },

  plugin_load_error(name: string, cause?: unknown): KustodianErrorType {
    return create_error(ErrorCodes.PLUGIN_LOAD_ERROR, `Failed to load plugin '${name}'`, cause);
  },

  dependency_cycle(cycle: string[]): KustodianErrorType {
    const cycle_str = cycle.join(' → ');
    return create_error(ErrorCodes.DEPENDENCY_CYCLE, `Dependency cycle detected: ${cycle_str}`);
  },

  dependency_missing(source: string, target: string): KustodianErrorType {
    return create_error(
      ErrorCodes.DEPENDENCY_MISSING,
      `Kustomization '${source}' depends on '${target}' which does not exist`,
    );
  },

  dependency_self_reference(node: string): KustodianErrorType {
    return create_error(
      ErrorCodes.DEPENDENCY_SELF_REFERENCE,
      `Kustomization '${node}' cannot depend on itself`,
    );
  },

  dependency_validation_error(errors: string[]): KustodianErrorType {
    return create_error(
      ErrorCodes.DEPENDENCY_VALIDATION_ERROR,
      `Dependency validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  },
} as const;

/**
 * Formats a KustodianError for display.
 */
export function format_error(error: KustodianErrorType): string {
  let message = `[${error.code}] ${error.message}`;
  if (error.cause) {
    message += `\nCaused by: ${String(error.cause)}`;
  }
  return message;
}

/**
 * Type guard to check if an error is a KustodianError.
 */
export function is_kustodian_error(error: unknown): error is KustodianErrorType {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as KustodianErrorType).code === 'string' &&
    typeof (error as KustodianErrorType).message === 'string'
  );
}
