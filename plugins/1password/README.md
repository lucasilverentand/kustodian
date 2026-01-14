# @kustodian/plugin-1password

1Password secret provider plugin for [Kustodian](https://github.com/lucasilverentand/kustodian). Securely inject secrets from 1Password into your Kubernetes manifests using the 1Password CLI.

## Installation

```bash
bun add @kustodian/plugin-1password
```

## Prerequisites

- [1Password CLI](https://developer.1password.com/docs/cli/) (`op`) installed and available in your PATH
- Authentication configured via service account token or interactive sign-in

## Usage

### As a Kustodian Plugin

```typescript
import { create_onepassword_plugin } from '@kustodian/plugin-1password';

const plugin = create_onepassword_plugin({
  service_account_token: process.env.OP_SERVICE_ACCOUNT_TOKEN,
  timeout: 30000,
  fail_on_missing: true,
});
```

### Direct Secret Access

```typescript
import { op_read, op_read_batch, check_op_available } from '@kustodian/plugin-1password';

// Check CLI availability
const check = await check_op_available();
if (check.success) {
  console.log(`1Password CLI version: ${check.value}`);
}

// Read a single secret
const secret = await op_read('op://vault/item/field');

// Read multiple secrets
const secrets = await op_read_batch([
  'op://vault/item/username',
  'op://vault/item/password',
]);
```

### Secret Reference Format

Secrets are referenced using the standard 1Password URI format:

```
op://vault/item/field
op://vault/item/section/field
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `service_account_token` | `string` | `undefined` | Service account token (can also use `OP_SERVICE_ACCOUNT_TOKEN` env var) |
| `timeout` | `number` | `30000` | CLI operation timeout in milliseconds |
| `fail_on_missing` | `boolean` | `true` | Whether to fail when a secret is not found |

## CLI Commands

The plugin provides CLI commands when registered with Kustodian:

- `1password check` - Verify CLI availability and authentication
- `1password test <ref>` - Test reading a secret reference

## License

MIT
