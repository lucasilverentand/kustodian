// Types
export type {
  ImageReferenceType,
  RegistryAuthType,
  RegistryClientConfigType,
  RegistryClientType,
  TagInfoType,
  VersionCheckResultType,
} from './types.js';

// Client utilities
export {
  parse_image_reference,
  detect_registry_type,
  create_registry_client,
  create_client_for_image,
} from './client.js';

// Registry implementations
export { create_dockerhub_client } from './dockerhub.js';
export { create_ghcr_client } from './ghcr.js';

// Auth utilities
export { get_dockerhub_auth, get_ghcr_auth, get_auth_for_registry } from './auth.js';

// Version utilities
export {
  DEFAULT_SEMVER_PATTERN,
  filter_semver_tags,
  find_latest_matching,
  check_version_update,
} from './version.js';
