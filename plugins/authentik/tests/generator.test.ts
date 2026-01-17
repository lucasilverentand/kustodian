import { describe, expect, it } from 'bun:test';

import {
  blueprint_to_yaml,
  generate_authentik_blueprint,
  generate_client_secret,
  generate_oauth2_provider,
  generate_proxy_provider,
  generate_saml_provider,
  yaml_to_blueprint,
} from '../src/generator.js';
import type { AuthConfigType, AuthentikPluginOptionsType } from '../src/types.js';

const default_options: AuthentikPluginOptionsType = {
  domain: 'auth.example.com',
  default_authorization_flow: 'implicit-consent',
  outpost_name: 'default-outpost',
  auto_generate_secrets: true,
  output_dir: './authentik-blueprints',
  blueprint_version: 1,
};

describe('generate_client_secret', () => {
  it('should generate a secret of specified length', () => {
    const secret = generate_client_secret(32);
    expect(secret).toHaveLength(32);
  });

  it('should generate a secret with default length', () => {
    const secret = generate_client_secret();
    expect(secret).toHaveLength(64);
  });

  it('should only contain valid characters', () => {
    const secret = generate_client_secret(100);
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('generate_oauth2_provider', () => {
  it('should generate OAuth2 provider configuration', () => {
    const auth_config: AuthConfigType = {
      provider: 'oauth2',
      app_name: 'test-app',
      oauth2: {
        client_id: 'test-client',
        redirect_uris: ['https://example.com/callback'],
      },
    };

    const result = generate_oauth2_provider(auth_config, default_options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.model).toBe('authentik_providers_oauth2.oauth2provider');
      expect(result.value.attrs.client_id).toBe('test-client');
      expect(result.value.attrs.redirect_uris).toBe('https://example.com/callback');
      expect(result.value.attrs.client_type).toBe('confidential');
    }
  });

  it('should auto-generate client secret for confidential clients', () => {
    const auth_config: AuthConfigType = {
      provider: 'oauth2',
      app_name: 'test-app',
      oauth2: {
        client_id: 'test-client',
        client_type: 'confidential',
        redirect_uris: ['https://example.com/callback'],
      },
    };

    const result = generate_oauth2_provider(auth_config, default_options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.attrs.client_secret).toBeDefined();
      expect(result.value.attrs.client_secret?.length).toBeGreaterThan(0);
    }
  });

  it('should not generate secret for public clients', () => {
    const auth_config: AuthConfigType = {
      provider: 'oauth2',
      app_name: 'test-app',
      oauth2: {
        client_id: 'test-client',
        client_type: 'public',
        redirect_uris: ['https://example.com/callback'],
      },
    };

    const result = generate_oauth2_provider(auth_config, default_options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.attrs.client_secret).toBeUndefined();
    }
  });

  it('should fail for non-oauth2 provider', () => {
    const auth_config: AuthConfigType = {
      provider: 'saml',
      app_name: 'test-app',
    };

    const result = generate_oauth2_provider(auth_config, default_options);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_CONFIG');
    }
  });
});

describe('generate_saml_provider', () => {
  it('should generate SAML provider configuration', () => {
    const auth_config: AuthConfigType = {
      provider: 'saml',
      app_name: 'test-app',
      saml: {
        acs_url: 'https://example.com/saml/acs',
        issuer: 'https://example.com',
      },
    };

    const result = generate_saml_provider(auth_config, default_options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.model).toBe('authentik_providers_saml.samlprovider');
      expect(result.value.attrs.acs_url).toBe('https://example.com/saml/acs');
      expect(result.value.attrs.issuer).toBe('https://example.com');
      expect(result.value.attrs.sp_binding).toBe('post');
    }
  });

  it('should fail for missing required fields', () => {
    const auth_config: AuthConfigType = {
      provider: 'saml',
      app_name: 'test-app',
      saml: {
        acs_url: 'https://example.com/saml/acs',
      },
    };

    const result = generate_saml_provider(auth_config, default_options);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_CONFIG');
    }
  });
});

describe('generate_proxy_provider', () => {
  it('should generate Proxy provider configuration', () => {
    const auth_config: AuthConfigType = {
      provider: 'proxy',
      app_name: 'test-app',
      proxy: {
        external_host: 'https://app.example.com',
        internal_host: 'http://app.svc:8080',
      },
    };

    const result = generate_proxy_provider(auth_config, default_options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.model).toBe('authentik_providers_proxy.proxyprovider');
      expect(result.value.attrs.external_host).toBe('https://app.example.com');
      expect(result.value.attrs.internal_host).toBe('http://app.svc:8080');
      expect(result.value.attrs.mode).toBe('forward_single');
    }
  });

  it('should fail for missing external_host', () => {
    const auth_config: AuthConfigType = {
      provider: 'proxy',
      app_name: 'test-app',
      proxy: {},
    };

    const result = generate_proxy_provider(auth_config, default_options);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_CONFIG');
    }
  });
});

describe('generate_authentik_blueprint', () => {
  it('should generate complete blueprint for OAuth2', () => {
    const auth_config: AuthConfigType = {
      provider: 'oauth2',
      app_name: 'test-app',
      app_display_name: 'Test Application',
      oauth2: {
        client_id: 'test-client',
        redirect_uris: ['https://example.com/callback'],
      },
    };

    const result = generate_authentik_blueprint(auth_config, default_options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.version).toBe(1);
      expect(result.value.metadata.name).toBe('test-app-blueprint');
      expect(result.value.entries).toHaveLength(2); // Provider + Application
    }
  });

  it('should generate complete blueprint for SAML', () => {
    const auth_config: AuthConfigType = {
      provider: 'saml',
      app_name: 'test-app',
      saml: {
        acs_url: 'https://example.com/saml/acs',
        issuer: 'https://example.com',
      },
    };

    const result = generate_authentik_blueprint(auth_config, default_options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.entries).toHaveLength(2);
    }
  });

  it('should generate complete blueprint for Proxy', () => {
    const auth_config: AuthConfigType = {
      provider: 'proxy',
      app_name: 'test-app',
      proxy: {
        external_host: 'https://app.example.com',
      },
    };

    const result = generate_authentik_blueprint(auth_config, default_options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.entries).toHaveLength(2);
    }
  });
});

describe('blueprint_to_yaml and yaml_to_blueprint', () => {
  it('should convert blueprint to YAML and back', () => {
    const auth_config: AuthConfigType = {
      provider: 'oauth2',
      app_name: 'test-app',
      oauth2: {
        client_id: 'test-client',
        redirect_uris: ['https://example.com/callback'],
      },
    };

    const blueprint_result = generate_authentik_blueprint(auth_config, default_options);
    expect(blueprint_result.success).toBe(true);
    if (!blueprint_result.success) return;

    const yaml_string = blueprint_to_yaml(blueprint_result.value);
    expect(yaml_string).toContain('version: 1');
    expect(yaml_string).toContain('test-app-blueprint');

    const parsed_result = yaml_to_blueprint(yaml_string);
    expect(parsed_result.success).toBe(true);
    if (parsed_result.success) {
      expect(parsed_result.value.version).toBe(blueprint_result.value.version);
      expect(parsed_result.value.metadata.name).toBe(blueprint_result.value.metadata.name);
    }
  });
});
