# @kustodian/plugin-authelia

Authelia authentication provider plugin for Kustodian. This plugin enables integration with Authelia for authentication and authorization in your Kubernetes applications.

## Features

- 🔐 **OIDC Client Generation** - Automatically generate Authelia OIDC client configurations
- 🛡️ **Access Control Rules** - Define access control rules for your applications
- 🔑 **Secret Management** - Generate and hash secrets for OIDC clients
- ✅ **Configuration Validation** - Validate Authelia configurations using the CLI
- 📝 **YAML Export** - Export configurations as Authelia-compatible YAML

## Installation

```bash
pnpm add @kustodian/plugin-authelia
```

## Prerequisites

For full functionality, install the Authelia CLI:

```bash
# macOS
brew install authelia

# Linux
# See: https://www.authelia.com/integration/deployment/installation/
```

## Usage

### Basic Plugin Setup

```typescript
import { create_authelia_plugin } from '@kustodian/plugin-authelia';

const authelia_plugin = create_authelia_plugin({
  domain: 'auth.example.com',
  default_policy: 'two_factor',
  auto_generate_secrets: true,
  output_dir: './authelia-config',
});
```

### CLI Commands

The plugin provides several CLI commands:

```bash
# Check Authelia CLI availability
kustodian authelia check

# Generate a hashed password
kustodian authelia hash-password <password> [algorithm]

# Generate a random secret
kustodian authelia generate-secret [length]

# Generate OIDC client configuration
kustodian authelia generate-client <app-name> <redirect-uri>

# Validate Authelia configuration file
kustodian authelia validate-config <config-path>
```

### Programmatic Usage

#### Generate OIDC Client Configuration

```typescript
import { generate_oidc_client } from '@kustodian/plugin-authelia';

const auth_config = {
  provider: 'oidc' as const,
  app_name: 'grafana',
  app_display_name: 'Grafana',
  external_host: 'https://grafana.example.com',
  oidc: {
    client_id: 'grafana',
    redirect_uris: ['https://grafana.example.com/login/generic_oauth'],
    scopes: ['openid', 'profile', 'email', 'groups'],
  },
};

const options = {
  domain: 'auth.example.com',
  default_policy: 'two_factor' as const,
  hash_algorithm: 'pbkdf2' as const,
  auto_generate_secrets: true,
  output_dir: './authelia-config',
};

const result = generate_oidc_client(auth_config, options);

if (result.success) {
  console.log('Generated client:', result.value);
}
```

#### Generate Access Control Rules

```typescript
import { generate_access_control_rules } from '@kustodian/plugin-authelia';

const auth_config = {
  provider: 'proxy' as const,
  app_name: 'my-app',
  external_host: 'https://app.example.com',
  proxy: {
    external_host: 'https://app.example.com',
    internal_host: 'http://app.svc.cluster.local:8080',
    policy: 'two_factor' as const,
    skip_path_regex: '^/api/health.*',
  },
};

const result = generate_access_control_rules(auth_config, options);

if (result.success) {
  console.log('Generated rules:', result.value);
}
```

#### Generate Complete Authelia Configuration

```typescript
import {
  generate_authelia_config,
  config_to_yaml,
} from '@kustodian/plugin-authelia';

const auth_configs = [
  {
    provider: 'oidc' as const,
    app_name: 'app1',
    external_host: 'https://app1.example.com',
    oidc: {
      client_id: 'app1',
      redirect_uris: ['https://app1.example.com/callback'],
    },
  },
  {
    provider: 'oidc' as const,
    app_name: 'app2',
    external_host: 'https://app2.example.com',
    oidc: {
      client_id: 'app2',
      redirect_uris: ['https://app2.example.com/callback'],
    },
  },
];

const config_result = generate_authelia_config(auth_configs, options);

if (config_result.success) {
  const yaml_result = config_to_yaml(config_result.value);
  if (yaml_result.success) {
    console.log(yaml_result.value);
  }
}
```

## Configuration

### Plugin Options

| Option                  | Type                        | Default               | Description                                    |
| ----------------------- | --------------------------- | --------------------- | ---------------------------------------------- |
| `domain`                | `string`                    | `undefined`           | Authelia domain (e.g., auth.example.com)       |
| `default_policy`        | `AutheliaPolicyType`        | `'two_factor'`        | Default authorization policy                   |
| `hash_algorithm`        | `'pbkdf2' \| 'argon2'`      | `'pbkdf2'`            | Secret hashing algorithm                       |
| `auto_generate_secrets` | `boolean`                   | `true`                | Auto-generate client secrets                   |
| `output_dir`            | `string`                    | `'./authelia-config'` | Output directory for generated configurations  |

### Auth Provider Types

- **`oidc`** - OpenID Connect provider
- **`proxy`** - Forward authentication/proxy mode
- **`header`** - Header-based authentication

### Authorization Policies

- **`bypass`** - No authentication required
- **`one_factor`** - Single-factor authentication (username + password)
- **`two_factor`** - Two-factor authentication (MFA required)
- **`deny`** - Deny all access

## Examples

### Example 1: Grafana with OIDC

```typescript
const grafana_config = {
  provider: 'oidc' as const,
  app_name: 'grafana',
  app_display_name: 'Grafana',
  app_description: 'Monitoring and observability platform',
  app_launch_url: 'https://grafana.example.com',
  external_host: 'https://grafana.example.com',
  oidc: {
    client_id: 'grafana',
    redirect_uris: ['https://grafana.example.com/login/generic_oauth'],
    scopes: ['openid', 'profile', 'email', 'groups'],
    authorization_policy: 'two_factor' as const,
  },
};
```

### Example 2: Forward Auth for Internal App

```typescript
const internal_app_config = {
  provider: 'proxy' as const,
  app_name: 'internal-tool',
  app_display_name: 'Internal Tool',
  external_host: 'https://internal.example.com',
  proxy: {
    external_host: 'https://internal.example.com',
    internal_host: 'http://internal-tool.default.svc.cluster.local:80',
    policy: 'two_factor' as const,
    skip_path_regex: '^/(health|metrics)$',
    networks: ['10.0.0.0/8'], // Only allow from internal network
  },
};
```

### Example 3: Public App with Bypass

```typescript
const public_app_config = {
  provider: 'proxy' as const,
  app_name: 'public-site',
  external_host: 'https://public.example.com',
  proxy: {
    external_host: 'https://public.example.com',
    internal_host: 'http://public-site.default.svc.cluster.local:80',
    policy: 'bypass' as const, // No authentication required
  },
};
```

## Integration with Kustodian

The plugin integrates with Kustodian's template system through hooks:

1. **`generator:after_resolve`** - Extracts auth configurations from templates
2. **`generator:before`** - Injects generated Authelia configurations

### Template Integration (Future)

```yaml
# Future feature - not yet implemented
apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: grafana
spec:
  kustomizations:
    - name: grafana
      path: grafana
      auth:
        provider: oidc
        app_name: grafana
        app_display_name: Grafana
        oidc:
          redirect_uris:
            - https://grafana.${cluster_domain}/login/generic_oauth
```

## Development

### Running Tests

```bash
cd plugins/authelia
bun test
```

### Type Checking

```bash
pnpm run typecheck
```

## API Reference

See the [TypeScript types](./src/types.ts) for complete API documentation.

## Related Documentation

- [Authelia Documentation](https://www.authelia.com/)
- [Authelia Access Control](https://www.authelia.com/configuration/security/access-control/)
- [Authelia OIDC](https://www.authelia.com/configuration/identity-providers/openid-connect/)

## License

MIT

## Sources

This plugin was implemented using the official Authelia documentation:

- [Access Control Configuration](https://www.authelia.com/configuration/security/access-control/)
- [OIDC Clients Configuration](https://www.authelia.com/configuration/identity-providers/openid-connect/clients.md)
- [Authelia GitHub Repository](https://github.com/authelia/authelia)
