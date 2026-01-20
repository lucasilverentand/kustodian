// Types

// Auth utilities
export { get_auth_for_registry, get_dockerhub_auth, get_ghcr_auth } from './auth.js';

// Client utilities
export {
  create_client_for_image,
  create_registry_client,
  detect_registry_type,
  parse_image_reference,
} from './client.js';

// Registry implementations
export { create_dockerhub_client } from './dockerhub.js';
export { create_ghcr_client } from './ghcr.js';
export { create_helm_client } from './helm.js';
export type {
  ImageReferenceType,
  RegistryAuthType,
  RegistryClientConfigType,
  RegistryClientType,
  TagInfoType,
  VersionCheckResultType,
} from './types.js';

// Version utilities
export {
  check_version_update,
  DEFAULT_SEMVER_PATTERN,
  filter_semver_tags,
  find_latest_matching,
} from './version.js';
