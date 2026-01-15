# @kustodian/plugin-doppler

Doppler secret provider plugin for [Kustodian](https://github.com/lucasilverentand/kustodian). Enables seamless integration with [Doppler](https://www.doppler.com/) for secure secret management in your Kubernetes configurations.

## Installation

```bash
bun add @kustodian/plugin-doppler
```

## Prerequisites

- [Doppler CLI](https://docs.doppler.com/docs/install-cli) installed and available in your PATH
- Authentication configured via `doppler login` or `DOPPLER_TOKEN` environment variable

## Usage

```typescript
import { create_doppler_plugin } from '@kustodian/plugin-doppler';

// Create with default options
const plugin = create_doppler_plugin();

// Or with custom options
const plugin = create_doppler_plugin({
  token: process.env.DOPPLER_TOKEN,  // Optional: override token
  timeout: 30000,                     // Optional: CLI timeout in ms
  fail_on_missing: true,              // Optional: fail if secrets are missing
});
```

### CLI Commands

The plugin provides CLI commands for working with Doppler:

```bash
# Check Doppler CLI availability
kustodian doppler check

# Test reading a secret
kustodian doppler test <project> <config> <secret>

# List available secrets in a config
kustodian doppler list-secrets <project> <config>
```

### Programmatic API

```typescript
import {
  check_doppler_available,
  doppler_secret_get,
  doppler_secrets_download,
  resolve_doppler_substitutions,
} from '@kustodian/plugin-doppler';

// Check if Doppler CLI is available
const available = await check_doppler_available();

// Get a single secret
const secret = await doppler_secret_get('my-project', 'production', 'API_KEY');

// Download all secrets for a project/config
const secrets = await doppler_secrets_download('my-project', 'production');

// Resolve substitutions (batched by project/config for efficiency)
const resolved = await resolve_doppler_substitutions([
  { name: 'api_key', project: 'my-project', config: 'production', secret: 'API_KEY' },
  { name: 'db_url', project: 'my-project', config: 'production', secret: 'DATABASE_URL' },
]);
```

## License

MIT
