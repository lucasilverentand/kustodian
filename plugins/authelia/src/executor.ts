import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { create_error, success, type ResultType, type KustodianErrorType } from '@kustodian/core';

const exec_async = promisify(exec);

/**
 * Check if authelia CLI is available
 */
export async function check_authelia_available(): Promise<
  ResultType<string, KustodianErrorType>
> {
  try {
    const { stdout } = await exec_async('authelia --version', { timeout: 5000 });
    const version = stdout.trim();
    return success(version);
  } catch (error) {
    return {
      success: false,
      error: create_error(
        'AUTHELIA_CLI_NOT_FOUND',
        'Authelia CLI not found. Install from: https://www.authelia.com/integration/deployment/installation/',
        error,
      ),
    };
  }
}

/**
 * Generate a hashed password using Authelia CLI
 * @param password - Plain text password to hash
 * @param algorithm - Hashing algorithm (pbkdf2 or argon2)
 */
export async function hash_password(
  password: string,
  algorithm: 'pbkdf2' | 'argon2' = 'pbkdf2',
): Promise<ResultType<string, KustodianErrorType>> {
  try {
    const cmd =
      algorithm === 'argon2'
        ? `authelia crypto hash generate argon2 --password '${password}'`
        : `authelia crypto hash generate pbkdf2 --password '${password}'`;

    const { stdout } = await exec_async(cmd, { timeout: 10000 });

    // Extract the hash from output (format: "Digest: $hash...")
    const hash_match = stdout.match(/Digest: (.+)/);
    if (!hash_match?.[1]) {
      return {
        success: false,
        error: create_error(
          'AUTHELIA_HASH_GENERATION_FAILED',
          'Failed to extract hash from authelia output',
        ),
      };
    }

    return success(hash_match[1].trim());
  } catch (error) {
    return {
      success: false,
      error: create_error(
        'AUTHELIA_HASH_GENERATION_FAILED',
        `Failed to hash password: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
    };
  }
}

/**
 * Generate a random secret suitable for OIDC client secrets
 */
export async function generate_random_secret(length = 64): Promise<
  ResultType<string, KustodianErrorType>
> {
  try {
    const { stdout } = await exec_async(`authelia crypto rand --length ${length} --charset alphanumeric`, {
      timeout: 5000,
    });
    return success(stdout.trim());
  } catch (error) {
    return {
      success: false,
      error: create_error(
        'AUTHELIA_SECRET_GENERATION_FAILED',
        `Failed to generate random secret: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
    };
  }
}

/**
 * Validate access control configuration using Authelia CLI
 */
export async function validate_access_control(
  config_path: string,
): Promise<ResultType<boolean, KustodianErrorType>> {
  try {
    await exec_async(`authelia validate-config ${config_path}`, { timeout: 10000 });
    return success(true);
  } catch (error) {
    return {
      success: false,
      error: create_error(
        'AUTHELIA_CONFIG_VALIDATION_FAILED',
        `Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
    };
  }
}
