import { get_auth_for_registry } from './auth.js';
import { create_dockerhub_client } from './dockerhub.js';
import { create_ghcr_client } from './ghcr.js';
import type { ImageReferenceType, RegistryClientConfigType, RegistryClientType } from './types.js';

/**
 * Parses an image string into its components.
 *
 * Supports various formats:
 * - nginx -> docker.io/library/nginx
 * - prom/prometheus -> docker.io/prom/prometheus
 * - ghcr.io/org/image -> ghcr.io/org/image
 * - ghcr.io/org/image:tag -> ghcr.io/org/image:tag
 */
export function parse_image_reference(image: string): ImageReferenceType {
  let registry = 'docker.io';
  let namespace = 'library';
  let repository: string;
  let tag: string | undefined;

  // Split tag if present
  const colonIndex = image.lastIndexOf(':');
  let imagePart = image;

  // Only treat as tag if there's no slash after the colon (to handle ports)
  if (colonIndex > 0 && !image.slice(colonIndex).includes('/')) {
    imagePart = image.slice(0, colonIndex);
    tag = image.slice(colonIndex + 1);
  }

  const parts = imagePart.split('/');

  if (parts.length === 1 && parts[0]) {
    // Simple image name: nginx -> docker.io/library/nginx
    repository = parts[0];
  } else if (parts.length === 2 && parts[0] && parts[1]) {
    if (parts[0].includes('.') || parts[0].includes(':')) {
      // Custom registry without namespace: registry.io/image
      registry = parts[0];
      namespace = 'library';
      repository = parts[1];
    } else {
      // Docker Hub with namespace: prom/prometheus
      namespace = parts[0];
      repository = parts[1];
    }
  } else if (parts.length >= 3 && parts[0] && parts[1]) {
    // Full path: ghcr.io/org/image
    registry = parts[0];
    namespace = parts[1];
    repository = parts.slice(2).join('/');
  } else {
    // Fallback - should not happen with valid input
    repository = imagePart;
  }

  return { registry, namespace, repository, tag };
}

/**
 * Detects the registry type from an image reference.
 */
export function detect_registry_type(image: ImageReferenceType): 'dockerhub' | 'ghcr' {
  if (image.registry === 'ghcr.io') {
    return 'ghcr';
  }

  // Default to Docker Hub
  return 'dockerhub';
}

/**
 * Creates a registry client for the given registry type.
 */
export function create_registry_client(
  registry_type: 'dockerhub' | 'ghcr',
  config?: RegistryClientConfigType,
): RegistryClientType {
  switch (registry_type) {
    case 'ghcr':
      return create_ghcr_client(config);
    default:
      return create_dockerhub_client(config);
  }
}

/**
 * Creates a registry client with auto-detected type and authentication.
 */
export function create_client_for_image(image: ImageReferenceType): RegistryClientType {
  const registry_type = detect_registry_type(image);
  const auth = get_auth_for_registry(image.registry);

  return create_registry_client(registry_type, { auth });
}
