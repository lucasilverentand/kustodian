import { z } from 'zod';

/**
 * Authelia access control policy types
 */
export const authelia_policy_schema = z.enum(['bypass', 'one_factor', 'two_factor', 'deny']);
export type AutheliaPolicyType = z.infer<typeof authelia_policy_schema>;

/**
 * Authelia PKCE challenge method
 */
export const pkce_challenge_method_schema = z.enum(['plain', 'S256']);
export type PKCEChallengeMethodType = z.infer<typeof pkce_challenge_method_schema>;

/**
 * Authelia token endpoint auth method
 */
export const token_endpoint_auth_method_schema = z.enum([
  'client_secret_basic',
  'client_secret_post',
  'client_secret_jwt',
  'private_key_jwt',
  'none',
]);
export type TokenEndpointAuthMethodType = z.infer<typeof token_endpoint_auth_method_schema>;

/**
 * Authelia consent mode
 */
export const consent_mode_schema = z.enum(['explicit', 'implicit', 'pre-configured']);
export type ConsentModeType = z.infer<typeof consent_mode_schema>;

/**
 * Authentication provider types supported by the plugin
 */
export const auth_provider_schema = z.enum(['oidc', 'proxy', 'header']);
export type AuthProviderType = z.infer<typeof auth_provider_schema>;

/**
 * OIDC client configuration for Authelia
 */
export const oidc_client_config_schema = z.object({
  /** Unique client identifier */
  client_id: z.string(),
  /** Display name for the client */
  client_name: z.string().optional(),
  /** Client secret (will be hashed) */
  client_secret: z.string().optional(),
  /** Whether this is a public client (no secret) */
  public: z.boolean().default(false),
  /** Authorization policy (default: two_factor) */
  authorization_policy: authelia_policy_schema.default('two_factor'),
  /** Require PKCE for authorization code flow */
  require_pkce: z.boolean().default(true),
  /** PKCE challenge method */
  pkce_challenge_method: pkce_challenge_method_schema.default('S256'),
  /** Redirect URIs for OAuth callbacks */
  redirect_uris: z.array(z.string()),
  /** Scopes to grant (default: openid, profile, email, groups) */
  scopes: z.array(z.string()).default(['openid', 'profile', 'email', 'groups']),
  /** Response types (default: code) */
  response_types: z.array(z.string()).default(['code']),
  /** Grant types (default: authorization_code) */
  grant_types: z.array(z.string()).default(['authorization_code']),
  /** Token endpoint authentication method */
  token_endpoint_auth_method: token_endpoint_auth_method_schema.default('client_secret_basic'),
  /** Consent mode */
  consent_mode: consent_mode_schema.optional(),
  /** Pre-configured consent duration (e.g., '1 week') */
  pre_configured_consent_duration: z.string().optional(),
  /** Audience for the client */
  audience: z.array(z.string()).optional(),
  /** Additional Authelia client options */
  additional_options: z.record(z.unknown()).optional(),
});
export type OIDCClientConfigType = z.infer<typeof oidc_client_config_schema>;

/**
 * Access control rule configuration for Authelia
 */
export const access_control_rule_schema = z.object({
  /** Domain(s) to match */
  domain: z.union([z.string(), z.array(z.string())]),
  /** Domain regex pattern (alternative to domain) */
  domain_regex: z.string().optional(),
  /** Policy to apply */
  policy: authelia_policy_schema,
  /** Networks to match */
  networks: z.array(z.string()).optional(),
  /** Subject(s) to match (users/groups) */
  subject: z.union([z.string(), z.array(z.string()), z.array(z.array(z.string()))]).optional(),
  /** HTTP methods to match */
  methods: z.array(z.string()).optional(),
  /** Resource patterns to match */
  resources: z.array(z.string()).optional(),
  /** Query parameter conditions */
  query: z.array(z.array(z.record(z.unknown()))).optional(),
});
export type AccessControlRuleType = z.infer<typeof access_control_rule_schema>;

/**
 * Proxy/Forward Auth configuration
 */
export const proxy_auth_config_schema = z.object({
  /** External host for the application */
  external_host: z.string(),
  /** Internal service host */
  internal_host: z.string(),
  /** Paths to skip authentication */
  skip_path_regex: z.string().optional(),
  /** Access control policy */
  policy: authelia_policy_schema.default('two_factor'),
  /** Allowed networks */
  networks: z.array(z.string()).optional(),
  /** Allowed subjects (users/groups) */
  subject: z.union([z.string(), z.array(z.string())]).optional(),
});
export type ProxyAuthConfigType = z.infer<typeof proxy_auth_config_schema>;

/**
 * Authentication configuration in template kustomizations
 */
export const auth_config_schema = z.object({
  /** Authentication provider type */
  provider: auth_provider_schema,
  /** Application name (used as client_id for OIDC) */
  app_name: z.string(),
  /** Display name for the application */
  app_display_name: z.string().optional(),
  /** Application description */
  app_description: z.string().optional(),
  /** Application icon URL */
  app_icon: z.string().optional(),
  /** Application group/category */
  app_group: z.string().optional(),
  /** Application launch URL */
  app_launch_url: z.string().optional(),
  /** External host (for proxy/access control) */
  external_host: z.string().optional(),
  /** Internal service host (for proxy) */
  internal_host: z.string().optional(),
  /** OIDC-specific configuration */
  oidc: oidc_client_config_schema.partial().optional(),
  /** Proxy-specific configuration */
  proxy: proxy_auth_config_schema.partial().optional(),
  /** Custom access control rules */
  access_control: z.array(access_control_rule_schema).optional(),
});
export type AuthConfigType = z.infer<typeof auth_config_schema>;

/**
 * Authelia plugin options
 */
export const authelia_plugin_options_schema = z.object({
  /** Authelia domain (e.g., auth.example.com) */
  domain: z.string().optional(),
  /** Default authorization policy */
  default_policy: authelia_policy_schema.default('two_factor'),
  /** Secret hashing algorithm (for client secrets) */
  hash_algorithm: z.enum(['pbkdf2', 'argon2']).default('pbkdf2'),
  /** Whether to generate client secrets automatically */
  auto_generate_secrets: z.boolean().default(true),
  /** Output directory for generated configurations */
  output_dir: z.string().default('./authelia-config'),
});
export type AutheliaPluginOptionsType = z.infer<typeof authelia_plugin_options_schema>;

/**
 * Generated Authelia configuration
 */
export interface AutheliaConfigType {
  identity_providers?: {
    oidc?: {
      clients?: OIDCClientConfigType[];
    };
  };
  access_control?: {
    default_policy?: AutheliaPolicyType;
    rules?: AccessControlRuleType[];
  };
}
