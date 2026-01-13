import type { RegistryAuthType } from './types.js';

/**
 * Gets authentication for Docker Hub from environment variables.
 */
export function get_dockerhub_auth(): RegistryAuthType | undefined {
  const username = process.env['DOCKER_USERNAME'];
  const password = process.env['DOCKER_PASSWORD'];

  if (username && password) {
    return { username, password };
  }

  return undefined;
}

/**
 * Gets authentication for GHCR from environment variables.
 */
export function get_ghcr_auth(): RegistryAuthType | undefined {
  const token = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'];

  if (token) {
    return { token };
  }

  return undefined;
}

/**
 * Gets authentication for a registry based on hostname.
 */
export function get_auth_for_registry(registry: string): RegistryAuthType | undefined {
  if (registry === 'docker.io' || registry === 'registry.hub.docker.com') {
    return get_dockerhub_auth();
  }

  if (registry === 'ghcr.io') {
    return get_ghcr_auth();
  }

  // Generic fallback
  const username = process.env['REGISTRY_USERNAME'];
  const password = process.env['REGISTRY_PASSWORD'];

  if (username && password) {
    return { username, password };
  }

  return undefined;
}
