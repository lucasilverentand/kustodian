import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

import { type ResultType, create_error, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';

import { yaml_to_blueprint } from './generator.js';

const exec_async = promisify(exec);

/**
 * Check if Authentik CLI is available.
 */
export async function check_authentik_available(): Promise<ResultType<string, KustodianErrorType>> {
  try {
    const { stdout } = await exec_async('ak --version', { timeout: 5000 });
    const version = stdout.trim();
    return success(version);
  } catch (error) {
    return {
      success: false,
      error: create_error(
        'AUTHENTIK_CLI_NOT_FOUND',
        'Authentik CLI not found. Install from: https://goauthentik.io/docs/installation/',
        error,
      ),
    };
  }
}

/**
 * Validate Authentik blueprint file.
 */
export async function validate_blueprint(
  blueprint_path: string,
): Promise<ResultType<void, KustodianErrorType>> {
  try {
    // Read the blueprint file
    const blueprint_content = readFileSync(blueprint_path, 'utf-8');

    // Parse YAML to validate structure
    const parse_result = yaml_to_blueprint(blueprint_content);
    if (!parse_result.success) {
      return parse_result;
    }

    const blueprint = parse_result.value;

    // Basic validation
    if (!blueprint.version || !blueprint.metadata || !blueprint.entries) {
      return {
        success: false,
        error: create_error(
          'INVALID_BLUEPRINT',
          'Blueprint must have version, metadata, and entries',
        ),
      };
    }

    if (blueprint.entries.length === 0) {
      return {
        success: false,
        error: create_error('INVALID_BLUEPRINT', 'Blueprint must have at least one entry'),
      };
    }

    // Validate each entry has required fields
    for (const entry of blueprint.entries) {
      if (!entry.model || !entry.identifiers) {
        return {
          success: false,
          error: create_error(
            'INVALID_BLUEPRINT',
            'Each blueprint entry must have model and identifiers',
          ),
        };
      }
    }

    return success(undefined);
  } catch (error) {
    return {
      success: false,
      error: create_error(
        'VALIDATION_ERROR',
        `Failed to validate blueprint: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
    };
  }
}

/**
 * Generate random secret (for OAuth2 clients).
 */
export async function generate_random_secret(
  length = 64,
): Promise<ResultType<string, KustodianErrorType>> {
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    const randomArray = new Uint8Array(length);
    crypto.getRandomValues(randomArray);
    for (const value of randomArray) {
      result += chars[value % chars.length];
    }
    return success(result);
  } catch (error) {
    return {
      success: false,
      error: create_error(
        'GENERATION_ERROR',
        `Failed to generate secret: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
    };
  }
}
