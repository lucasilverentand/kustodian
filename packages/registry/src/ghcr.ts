import { type ResultType, failure, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import type {
  ImageReferenceType,
  RegistryClientConfigType,
  RegistryClientType,
  TagInfoType,
} from './types.js';

const GHCR_URL = 'https://ghcr.io/v2';
const GHCR_AUTH_URL = 'https://ghcr.io/token';
const DEFAULT_TIMEOUT = 30000;

interface GhcrTokenResponse {
  token: string;
}

interface GhcrTagsResponse {
  name: string;
  tags: string[];
}

/**
 * Creates an abort signal with timeout.
 */
function create_abort_signal(timeout_ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout_ms);
  return controller.signal;
}

/**
 * Gets an authentication token for GHCR.
 */
async function get_ghcr_token(
  image: ImageReferenceType,
  config?: RegistryClientConfigType,
): Promise<ResultType<string, KustodianErrorType>> {
  const scope = `repository:${image.namespace}/${image.repository}:pull`;
  const url = `${GHCR_AUTH_URL}?service=ghcr.io&scope=${encodeURIComponent(scope)}`;

  const headers: Record<string, string> = {};

  // GHCR supports token-based auth or username/password
  if (config?.auth?.token) {
    // Use bearer token (GitHub PAT)
    headers['Authorization'] = `Bearer ${config.auth.token}`;
  } else if (config?.auth?.username && config.auth.password) {
    const credentials = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString(
      'base64',
    );
    headers['Authorization'] = `Basic ${credentials}`;
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: create_abort_signal(config?.timeout ?? DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      return failure({
        code: 'REGISTRY_AUTH_ERROR',
        message: `GHCR auth failed: ${response.status} ${response.statusText}`,
      });
    }

    const data = (await response.json()) as GhcrTokenResponse;

    if (!data.token) {
      return failure({
        code: 'REGISTRY_AUTH_ERROR',
        message: 'No token returned from GHCR auth',
      });
    }

    return success(data.token);
  } catch (error) {
    return failure({
      code: 'REGISTRY_ERROR',
      message: `GHCR auth request failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Creates a GitHub Container Registry client.
 */
export function create_ghcr_client(config?: RegistryClientConfigType): RegistryClientType {
  return {
    async list_tags(
      image: ImageReferenceType,
    ): Promise<ResultType<TagInfoType[], KustodianErrorType>> {
      // Get auth token
      const token_result = await get_ghcr_token(image, config);
      if (!token_result.success) {
        return token_result;
      }

      const url = `${GHCR_URL}/${image.namespace}/${image.repository}/tags/list`;

      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token_result.value}`,
            Accept: 'application/json',
          },
          signal: create_abort_signal(config?.timeout ?? DEFAULT_TIMEOUT),
        });

        if (!response.ok) {
          return failure({
            code: 'REGISTRY_ERROR',
            message: `Failed to fetch tags: ${response.status} ${response.statusText}`,
          });
        }

        const data = (await response.json()) as GhcrTagsResponse;

        const tags: TagInfoType[] = (data.tags || []).map((name) => ({ name }));

        return success(tags);
      } catch (error) {
        return failure({
          code: 'REGISTRY_ERROR',
          message: `Failed to fetch tags: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
