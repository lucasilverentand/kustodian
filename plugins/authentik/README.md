# @kustodian/plugin-authentik

Authentik authentication provider plugin for Kustodian. This plugin enables integration with Authentik for authentication and authorization in your Kubernetes applications.

## Features

- 🔐 **OAuth2/OIDC Provider** - Configure OAuth2 and OIDC clients for modern applications
- 🛡️ **SAML Provider** - Support for legacy applications using SAML authentication
- 🔀 **Proxy/Forward Auth** - Protect applications with forward authentication
- 📝 **Blueprint Generation** - Generate Authentik blueprints for GitOps workflows
- 🔑 **Secret Management** - Automatically generate secure client secrets
- ✅ **Validation** - Validate Authentik blueprint configurations

## Installation

```bash
bun add @kustodian/plugin-authentik
```

## Prerequisites

Optional: For enhanced functionality, install the Authentik CLI:

```bash
# Installation instructions available at:
# https://goauthentik.io/docs/installation/
```

## Usage

### Basic Plugin Setup

```typescript
import { create_authentik_plugin } from '@kustodian/plugin-authentik';

const authentik_plugin = create_authentik_plugin({
  domain: 'auth.example.com',
  default_authorization_flow: 'implicit-consent',
  outpost_name: 'default-outpost',
  auto_generate_secrets: true,
  output_dir: './authentik-blueprints',
});
```

### CLI Commands

The plugin provides several CLI commands:

```bash
# Check Authentik CLI availability
kustodian authentik check

# Generate a random secret for OAuth2 clients
kustodian authentik generate-secret [length]

# Generate Authentik blueprint
kustodian authentik generate-blueprint <app-name> <provider-type> <config-json>

# Validate blueprint file
kustodian authentik validate-blueprint <blueprint-path>
```

### Programmatic Usage

#### Generate OAuth2 Provider

```typescript
import { generate_oauth2_provider } from '@kustodian/plugin-authentik';

const auth_config = {
  provider: 'oauth2' as const,
  app_name: 'grafana',
  app_display_name: 'Grafana',
  app_launch_url: 'https://grafana.example.com',
  oauth2: {
    client_id: 'grafana',
    client_type: 'confidential' as const,
    redirect_uris: ['https://grafana.example.com/login/generic_oauth'],
  },
};

const options = {
  domain: 'auth.example.com',
  default_authorization_flow: 'implicit-consent' as const,
  outpost_name: 'default-outpost',
  auto_generate_secrets: true,
  output_dir: './authentik-blueprints',
  blueprint_version: 1,
};

const result = generate_oauth2_provider(auth_config, options);

if (result.success) {
  console.log('Generated OAuth2 provider:', result.value);
}
```

#### Generate SAML Provider

```typescript
import { generate_saml_provider } from '@kustodian/plugin-authentik';

const auth_config = {
  provider: 'saml' as const,
  app_name: 'legacy-app',
  saml: {
    acs_url: 'https://app.example.com/saml/acs',
    issuer: 'https://app.example.com',
    sp_binding: 'post' as const,
  },
};

const result = generate_saml_provider(auth_config, options);
```

#### Generate Proxy Provider

```typescript
import { generate_proxy_provider } from '@kustodian/plugin-authentik';

const auth_config = {
  provider: 'proxy' as const,
  app_name: 'qbittorrent',
  proxy: {
    external_host: 'https://qbittorrent.example.com',
    internal_host: 'http://qbittorrent.media.svc:8080',
    mode: 'forward_single' as const,
  },
};

const result = generate_proxy_provider(auth_config, options);
```

#### Generate Complete Blueprint

```typescript
import { generate_authentik_blueprint, blueprint_to_yaml } from '@kustodian/plugin-authentik';

const auth_config = {
  provider: 'oauth2' as const,
  app_name: 'grafana',
  app_display_name: 'Grafana',
  app_description: 'Monitoring and observability platform',
  app_icon: 'https://grafana.com/static/img/menu/grafana2.svg',
  app_group: 'Monitoring',
  app_launch_url: 'https://grafana.example.com',
  oauth2: {
    client_id: 'grafana',
    redirect_uris: ['https://grafana.example.com/login/generic_oauth'],
  },
};

const blueprint_result = generate_authentik_blueprint(auth_config, options);

if (blueprint_result.success) {
  // Export as YAML
  const yaml_content = blueprint_to_yaml(blueprint_result.value);
  console.log(yaml_content);
}
```

## Provider Types

### OAuth2/OIDC

Suitable for modern applications that support OpenID Connect:

```typescript
{
  provider: 'oauth2',
  oauth2: {
    client_id: 'my-app',
    client_type: 'confidential', // or 'public'
    redirect_uris: ['https://app.example.com/callback'],
    // Optional configuration
    authorization_flow: 'implicit-consent',
    signing_key: 'certificate-slug',
    include_claims_in_id_token: true,
    access_token_validity: 'minutes=10',
    refresh_token_validity: 'days=30',
  }
}
```

### SAML

For legacy enterprise applications:

```typescript
{
  provider: 'saml',
  saml: {
    acs_url: 'https://app.example.com/saml/acs',
    issuer: 'https://app.example.com',
    sp_binding: 'post', // or 'redirect'
    // Optional configuration
    name_id_policy: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
    signing_kp: 'certificate-slug',
  }
}
```

### Proxy (Forward Auth)

For applications that don't natively support SSO:

```typescript
{
  provider: 'proxy',
  proxy: {
    external_host: 'https://app.example.com',
    internal_host: 'http://app.svc:8080',
    mode: 'forward_single', // 'proxy', 'forward_domain'
    // Optional configuration
    skip_path_regex: '/api/health|/public/.*',
    intercept_header_auth: true,
  }
}
```

## Blueprint Structure

Generated blueprints follow the Authentik Blueprint format:

```yaml
version: 1
metadata:
  name: app-name-blueprint
  labels:
    app.kubernetes.io/name: app-name
    app.kubernetes.io/managed-by: kustodian
entries:
  - model: authentik_providers_oauth2.oauth2provider
    identifiers:
      name: app-name-oauth2
    attrs:
      # Provider configuration
  - model: authentik_core.application
    identifiers:
      slug: app-name
    attrs:
      # Application configuration
```

## Template Integration

Use in Kustodian templates:

```yaml
apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: monitoring
spec:
  kustomizations:
    - name: grafana
      path: grafana
      auth:
        provider: oauth2
        app_name: grafana
        app_display_name: Grafana
        app_icon: https://grafana.com/static/img/menu/grafana2.svg
        app_group: Monitoring
        app_launch_url: https://grafana.${cluster_domain}
        oauth2:
          client_id: grafana
          redirect_uris:
            - https://grafana.${cluster_domain}/login/generic_oauth
```

## API Reference

See [TypeScript definitions](./src/types.ts) for complete type information.

### Main Functions

- `create_authentik_plugin(options)` - Create plugin instance
- `generate_oauth2_provider(config, options)` - Generate OAuth2 provider
- `generate_saml_provider(config, options)` - Generate SAML provider
- `generate_proxy_provider(config, options)` - Generate Proxy provider
- `generate_authentik_blueprint(config, options)` - Generate complete blueprint
- `blueprint_to_yaml(blueprint)` - Convert blueprint to YAML
- `yaml_to_blueprint(yaml)` - Parse YAML to blueprint
- `check_authentik_available()` - Check CLI availability
- `validate_blueprint(path)` - Validate blueprint file
- `generate_random_secret(length)` - Generate secure random secret

## License

MIT
