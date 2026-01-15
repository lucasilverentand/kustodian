import { type ResultType, failure, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import type {
  ImageReferenceType,
  RegistryClientConfigType,
  RegistryClientType,
  TagInfoType,
} from './types.js';

const DOCKERHUB_AUTH_URL = 'https://auth.docker.io/token';
const DOCKERHUB_REGISTRY_URL = 'https://registry-1.docker.io/v2';
const DEFAULT_TIMEOUT = 30000;

interface DockerHubTokenResponse {
  token: string;
  access_token?: string;
  expires_in?: number;
}

interface DockerHubTagsResponse {
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
 * Gets an authentication token for Docker Hub.
 */
async function get_dockerhub_token(
  image: ImageReferenceType,
  config?: RegistryClientConfigType,
): Promise<ResultType<string, KustodianErrorType>> {
  const scope = `repository:${image.namespace}/${image.repository}:pull`;
  const url = `${DOCKERHUB_AUTH_URL}?service=registry.docker.io&scope=${encodeURIComponent(scope)}`;

  const headers: Record<string, string> = {};

  if (config?.auth?.username && config.auth.password) {
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
        message: `Docker Hub auth failed: ${response.status} ${response.statusText}`,
      });
    }

    const data = (await response.json()) as DockerHubTokenResponse;
    const token = data.token || data.access_token;

    if (!token) {
      return failure({
        code: 'REGISTRY_AUTH_ERROR',
        message: 'No token returned from Docker Hub auth',
      });
    }

    return success(token);
  } catch (error) {
    return failure({
      code: 'REGISTRY_ERROR',
      message: `Docker Hub auth request failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Creates a Docker Hub registry client.
 */
export function create_dockerhub_client(config?: RegistryClientConfigType): RegistryClientType {
  return {
    async list_tags(
      image: ImageReferenceType,
    ): Promise<ResultType<TagInfoType[], KustodianErrorType>> {
      // Get auth token
      const token_result = await get_dockerhub_token(image, config);
      if (!token_result.success) {
        return token_result;
      }

      const url = `${DOCKERHUB_REGISTRY_URL}/${image.namespace}/${image.repository}/tags/list`;

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

        const data = (await response.json()) as DockerHubTagsResponse;

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
