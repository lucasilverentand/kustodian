import { describe, expect, test } from 'bun:test';
import {
  config_to_yaml,
  generate_access_control_rules,
  generate_authelia_config,
  generate_oidc_client,
  yaml_to_config,
} from '../src/generator.js';
import type {
  AuthConfigType,
  AutheliaConfigType,
  AutheliaPluginOptionsType,
} from '../src/types.js';

const default_options: AutheliaPluginOptionsType = {
  domain: 'auth.example.com',
  default_policy: 'two_factor',
  hash_algorithm: 'pbkdf2',
  auto_generate_secrets: true,
  output_dir: './authelia-config',
};

describe('OIDC Client Generation', () => {
  test('generates basic OIDC client', () => {
    const auth_config: AuthConfigType = {
      provider: 'oidc',
      app_name: 'test-app',
      app_display_name: 'Test Application',
      oidc: {
        client_id: 'test-app',
        redirect_uris: ['https://app.example.com/callback'],
      },
    };

    const result = generate_oidc_client(auth_config, default_options);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.client_id).toBe('test-app');
      expect(result.value.client_name).toBe('Test Application');
      expect(result.value.redirect_uris).toContain('https://app.example.com/callback');
      expect(result.value.authorization_policy).toBe('two_factor');
    }
  });

  test('generates client secret placeholder for confidential clients', () => {
    const auth_config: AuthConfigType = {
      provider: 'oidc',
      app_name: 'my-app',
      oidc: {
        client_id: 'my-app',
        public: false,
        redirect_uris: ['https://app.example.com/callback'],
      },
    };

    const result = generate_oidc_client(auth_config, default_options);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.client_secret).toContain('MY_APP_CLIENT_SECRET');
    }
  });

  test('does not generate secret for public clients', () => {
    const auth_config: AuthConfigType = {
      provider: 'oidc',
      app_name: 'public-app',
      oidc: {
        client_id: 'public-app',
        public: true,
        redirect_uris: ['https://app.example.com/callback'],
      },
    };

    const result = generate_oidc_client(auth_config, default_options);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.client_secret).toBeUndefined();
    }
  });

  test('applies PKCE settings', () => {
    const auth_config: AuthConfigType = {
      provider: 'oidc',
      app_name: 'pkce-app',
      oidc: {
        client_id: 'pkce-app',
        require_pkce: true,
        pkce_challenge_method: 'S256',
        redirect_uris: ['https://app.example.com/callback'],
      },
    };

    const result = generate_oidc_client(auth_config, default_options);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.require_pkce).toBe(true);
      expect(result.value.pkce_challenge_method).toBe('S256');
    }
  });
});

describe('Access Control Rules Generation', () => {
  test('generates rules for OIDC provider', () => {
    const auth_config: AuthConfigType = {
      provider: 'oidc',
      app_name: 'test-app',
      external_host: 'https://app.example.com',
      oidc: {
        client_id: 'test-app',
        redirect_uris: ['https://app.example.com/callback'],
      },
    };

    const result = generate_access_control_rules(auth_config, default_options);

    expect(result.success).toBe(true);
    if (result.success && result.value[0]) {
      expect(result.value.length).toBe(1);
      expect(result.value[0].domain).toBe('app.example.com');
      expect(result.value[0].policy).toBe('two_factor');
    }
  });

  test('generates rules for proxy provider', () => {
    const auth_config: AuthConfigType = {
      provider: 'proxy',
      app_name: 'test-app',
      external_host: 'https://app.example.com',
      proxy: {
        external_host: 'https://app.example.com',
        internal_host: 'http://app.svc.cluster.local:8080',
        policy: 'one_factor',
      },
    };

    const result = generate_access_control_rules(auth_config, default_options);

    expect(result.success).toBe(true);
    if (result.success && result.value[0]) {
      expect(result.value.length).toBe(1);
      expect(result.value[0].domain).toBe('app.example.com');
      expect(result.value[0].policy).toBe('one_factor');
    }
  });

  test('generates bypass rule for skip_path_regex', () => {
    const auth_config: AuthConfigType = {
      provider: 'proxy',
      app_name: 'test-app',
      external_host: 'https://app.example.com',
      proxy: {
        external_host: 'https://app.example.com',
        internal_host: 'http://app.svc.cluster.local:8080',
        policy: 'two_factor',
        skip_path_regex: '^/api/health.*',
      },
    };

    const result = generate_access_control_rules(auth_config, default_options);

    expect(result.success).toBe(true);
    if (result.success && result.value[0] && result.value[1]) {
      expect(result.value.length).toBe(2);
      // First rule should be bypass for health check
      expect(result.value[0].policy).toBe('bypass');
      expect(result.value[0].resources).toContain('^/api/health.*');
      // Second rule should be the main policy
      expect(result.value[1].policy).toBe('two_factor');
    }
  });
});

describe('Complete Config Generation', () => {
  test('generates complete Authelia config', () => {
    const auth_configs: AuthConfigType[] = [
      {
        provider: 'oidc',
        app_name: 'app1',
        external_host: 'https://app1.example.com',
        oidc: {
          client_id: 'app1',
          redirect_uris: ['https://app1.example.com/callback'],
        },
      },
      {
        provider: 'oidc',
        app_name: 'app2',
        external_host: 'https://app2.example.com',
        oidc: {
          client_id: 'app2',
          redirect_uris: ['https://app2.example.com/callback'],
        },
      },
    ];

    const result = generate_authelia_config(auth_configs, default_options);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.identity_providers?.oidc?.clients).toHaveLength(2);
      expect(result.value.access_control?.default_policy).toBe('two_factor');
      expect(result.value.access_control?.rules).toHaveLength(2);
    }
  });
});

describe('YAML Serialization', () => {
  test('converts config to YAML', () => {
    const config: AutheliaConfigType = {
      identity_providers: {
        oidc: {
          clients: [
            {
              client_id: 'test-app',
              public: false,
              authorization_policy: 'two_factor',
              require_pkce: true,
              pkce_challenge_method: 'S256',
              redirect_uris: ['https://app.example.com/callback'],
              scopes: ['openid', 'profile', 'email'],
              response_types: ['code'],
              grant_types: ['authorization_code'],
              token_endpoint_auth_method: 'client_secret_basic',
            },
          ],
        },
      },
      access_control: {
        default_policy: 'two_factor',
        rules: [
          {
            domain: 'app.example.com',
            policy: 'two_factor',
          },
        ],
      },
    };

    const result = config_to_yaml(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toContain('identity_providers');
      expect(result.value).toContain('oidc');
      expect(result.value).toContain('clients');
      expect(result.value).toContain('test-app');
    }
  });

  test('parses YAML to config', () => {
    const yaml_string = `
identity_providers:
  oidc:
    clients:
      - client_id: test-app
        public: false
        redirect_uris:
          - https://app.example.com/callback
access_control:
  default_policy: two_factor
  rules:
    - domain: app.example.com
      policy: two_factor
`;

    const result = yaml_to_config(yaml_string);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.identity_providers?.oidc?.clients?.[0]?.client_id).toBe('test-app');
      expect(result.value.access_control?.default_policy).toBe('two_factor');
    }
  });
});
