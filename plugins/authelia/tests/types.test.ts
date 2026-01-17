import { describe, expect, test } from 'bun:test';
import {
  access_control_rule_schema,
  auth_config_schema,
  authelia_plugin_options_schema,
  oidc_client_config_schema,
} from '../src/types.js';

describe('Type Schema Validation', () => {
  test('validates OIDC client config', () => {
    const valid_config = {
      client_id: 'test-app',
      redirect_uris: ['https://app.example.com/callback'],
    };

    const result = oidc_client_config_schema.safeParse(valid_config);
    expect(result.success).toBe(true);
  });

  test('applies defaults to OIDC client config', () => {
    const minimal_config = {
      client_id: 'test-app',
      redirect_uris: ['https://app.example.com/callback'],
    };

    const parsed = oidc_client_config_schema.parse(minimal_config);
    expect(parsed.public).toBe(false);
    expect(parsed.require_pkce).toBe(true);
    expect(parsed.pkce_challenge_method).toBe('S256');
    expect(parsed.scopes).toContain('openid');
  });

  test('validates access control rule', () => {
    const valid_rule = {
      domain: 'app.example.com',
      policy: 'two_factor',
    };

    const result = access_control_rule_schema.safeParse(valid_rule);
    expect(result.success).toBe(true);
  });

  test('validates auth config', () => {
    const valid_config = {
      provider: 'oidc',
      app_name: 'test-app',
      oidc: {
        client_id: 'test-app',
        redirect_uris: ['https://app.example.com/callback'],
      },
    };

    const result = auth_config_schema.safeParse(valid_config);
    expect(result.success).toBe(true);
  });

  test('validates plugin options', () => {
    const valid_options = {
      domain: 'auth.example.com',
    };

    const result = authelia_plugin_options_schema.safeParse(valid_options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_policy).toBe('two_factor');
      expect(result.data.hash_algorithm).toBe('pbkdf2');
      expect(result.data.auto_generate_secrets).toBe(true);
    }
  });

  test('rejects invalid policy', () => {
    const invalid_rule = {
      domain: 'app.example.com',
      policy: 'invalid_policy',
    };

    const result = access_control_rule_schema.safeParse(invalid_rule);
    expect(result.success).toBe(false);
  });

  test('rejects invalid provider type', () => {
    const invalid_config = {
      provider: 'invalid_provider',
      app_name: 'test-app',
    };

    const result = auth_config_schema.safeParse(invalid_config);
    expect(result.success).toBe(false);
  });
});
