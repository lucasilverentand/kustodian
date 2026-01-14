# @kustodian/registry

Container registry client for fetching image tags from Docker Hub and GitHub Container Registry (GHCR).

## Installation

```bash
bun add @kustodian/registry
```

## API

### Client Functions

- **`parse_image_reference(image: string)`** - Parse an image string into its components (registry, namespace, repository, tag)
- **`detect_registry_type(image)`** - Auto-detect registry type from an image reference
- **`create_registry_client(type, config?)`** - Create a client for a specific registry type
- **`create_client_for_image(image)`** - Create a client with auto-detected type and authentication
- **`create_dockerhub_client(config?)`** - Create a Docker Hub client
- **`create_ghcr_client(config?)`** - Create a GitHub Container Registry client

### Authentication

- **`get_dockerhub_auth()`** - Get Docker Hub auth from `DOCKER_USERNAME` and `DOCKER_PASSWORD`
- **`get_ghcr_auth()`** - Get GHCR auth from `GITHUB_TOKEN` or `GH_TOKEN`
- **`get_auth_for_registry(registry)`** - Get auth for a registry by hostname

### Version Utilities

- **`filter_semver_tags(tags, options?)`** - Filter tags to semver-valid versions
- **`find_latest_matching(versions, constraint?)`** - Find the latest version matching a constraint
- **`check_version_update(current, available, constraint?)`** - Check if a newer version is available
- **`DEFAULT_SEMVER_PATTERN`** - Default regex for semver-like tags

### Types

- `ImageReferenceType` - Parsed image reference components
- `RegistryAuthType` - Authentication configuration
- `RegistryClientType` - Registry client interface
- `RegistryClientConfigType` - Client configuration options
- `TagInfoType` - Tag information from registry
- `VersionCheckResultType` - Version check result

## Usage

```typescript
import {
  parse_image_reference,
  create_client_for_image,
  filter_semver_tags,
  check_version_update,
} from '@kustodian/registry';

// Parse image reference
const image = parse_image_reference('ghcr.io/org/app:v1.0.0');

// Create client and fetch tags
const client = create_client_for_image(image);
const result = await client.list_tags(image);

if (result.success) {
  // Filter to semver tags and check for updates
  const versions = filter_semver_tags(result.value);
  const update = check_version_update('1.0.0', versions);

  if (update.has_update) {
    console.log(`Update available: ${update.latest_version}`);
  }
}
```

## License

MIT

## Links

- [Repository](https://github.com/lucasilverentand/kustodian)
