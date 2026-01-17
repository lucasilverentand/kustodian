import { z } from 'zod';

/**
 * Authentik authorization flow types
 */
export const authentik_flow_schema = z.enum([
  'implicit-consent',
  'explicit-consent',
  'default-provider-authorization-implicit-consent',
  'default-provider-authorization-explicit-consent',
]);
export type AuthentikFlowType = z.infer<typeof authentik_flow_schema>;

/**
 * Authentik provider types
 */
export const auth_provider_schema = z.enum(['oauth2', 'saml', 'proxy']);
export type AuthProviderType = z.infer<typeof auth_provider_schema>;

/**
 * OAuth2/OIDC client types
 */
export const client_type_schema = z.enum(['confidential', 'public']);
export type ClientTypeType = z.infer<typeof client_type_schema>;

/**
 * Authentik proxy mode types
 */
export const proxy_mode_schema = z.enum(['proxy', 'forward_single', 'forward_domain']);
export type ProxyModeType = z.infer<typeof proxy_mode_schema>;

/**
 * SAML SP binding types
 */
export const saml_binding_schema = z.enum(['post', 'redirect']);
export type SAMLBindingType = z.infer<typeof saml_binding_schema>;

/**
 * SAML NameID policy types
 */
export const saml_nameid_policy_schema = z.enum([
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:WindowsDomainQualifiedName',
]);
export type SAMLNameIDPolicyType = z.infer<typeof saml_nameid_policy_schema>;

/**
 * OAuth2/OIDC provider configuration for Authentik
 */
export const oauth2_provider_config_schema = z.object({
  /** Unique client identifier */
  client_id: z.string(),
  /** Client type (confidential or public) */
  client_type: client_type_schema.default('confidential'),
  /** Client secret (will be generated if not provided) */
  client_secret: z.string().optional(),
  /** Redirect URIs for OAuth callbacks */
  redirect_uris: z.array(z.string()),
  /** Authorization flow slug */
  authorization_flow: authentik_flow_schema.optional(),
  /** Signing key (optional, for JWT signing) */
  signing_key: z.string().optional(),
  /** Include claims in ID token */
  include_claims_in_id_token: z.boolean().default(true),
  /** Additional scopes beyond openid */
  additional_scopes: z.array(z.string()).optional(),
  /** Access token validity in seconds */
  access_token_validity: z.string().default('minutes=10'),
  /** Refresh token validity in seconds */
  refresh_token_validity: z.string().default('days=30'),
  /** Subject mode: based_on_username, based_on_user_email, based_on_user_uuid, based_on_hashed_user_identifier */
  sub_mode: z.string().default('hashed_user_identifier'),
  /** Issue refresh tokens */
  issue_refresh_tokens: z.boolean().default(true),
});
export type OAuth2ProviderConfigType = z.infer<typeof oauth2_provider_config_schema>;

/**
 * SAML provider configuration for Authentik
 */
export const saml_provider_config_schema = z.object({
  /** ACS (Assertion Consumer Service) URL */
  acs_url: z.string().url(),
  /** Entity ID / Issuer */
  issuer: z.string(),
  /** SP (Service Provider) binding method */
  sp_binding: saml_binding_schema.default('post'),
  /** Audience for SAML assertions */
  audience: z.string().optional(),
  /** Authorization flow slug */
  authorization_flow: authentik_flow_schema.optional(),
  /** Signing certificate */
  signing_kp: z.string().optional(),
  /** NameID policy */
  name_id_policy: saml_nameid_policy_schema.default(
    'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  ),
  /** Assertion validity (not before) in seconds */
  assertion_valid_not_before: z.string().default('minutes=5'),
  /** Assertion validity (not on or after) in seconds */
  assertion_valid_not_on_or_after: z.string().default('minutes=5'),
  /** Session validity (not on or after) in seconds */
  session_valid_not_on_or_after: z.string().default('minutes=86400'),
});
export type SAMLProviderConfigType = z.infer<typeof saml_provider_config_schema>;

/**
 * Proxy provider configuration for Authentik
 */
export const proxy_provider_config_schema = z.object({
  /** External host (public URL) */
  external_host: z.string().url(),
  /** Internal host (backend service URL) */
  internal_host: z.string().url().optional(),
  /** Internal host (SSL validation) */
  internal_host_ssl_validation: z.boolean().default(true),
  /** Certificate for internal SSL */
  certificate: z.string().optional(),
  /** Skip path regex (paths to skip authentication) */
  skip_path_regex: z.string().optional(),
  /** Basic auth enabled */
  basic_auth_enabled: z.boolean().default(false),
  /** Basic auth password attribute */
  basic_auth_password_attribute: z.string().optional(),
  /** Basic auth user attribute */
  basic_auth_user_attribute: z.string().optional(),
  /** Mode: proxy, forward_single, or forward_domain */
  mode: proxy_mode_schema.default('forward_single'),
  /** Authorization flow slug */
  authorization_flow: authentik_flow_schema.optional(),
  /** Access token validity in seconds */
  access_token_validity: z.string().default('minutes=10'),
  /** Intercept header auth */
  intercept_header_auth: z.boolean().default(true),
});
export type ProxyProviderConfigType = z.infer<typeof proxy_provider_config_schema>;

/**
 * Authentication configuration in template kustomizations
 */
export const auth_config_schema = z.object({
  /** Authentication provider type */
  provider: auth_provider_schema,
  /** Application name (used as identifier) */
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
  /** OAuth2/OIDC-specific configuration */
  oauth2: oauth2_provider_config_schema.partial().optional(),
  /** SAML-specific configuration */
  saml: saml_provider_config_schema.partial().optional(),
  /** Proxy-specific configuration */
  proxy: proxy_provider_config_schema.partial().optional(),
});
export type AuthConfigType = z.infer<typeof auth_config_schema>;

/**
 * Authentik plugin options
 */
export const authentik_plugin_options_schema = z.object({
  /** Authentik domain (e.g., authentik.example.com) */
  domain: z.string().optional(),
  /** Default authorization flow */
  default_authorization_flow: authentik_flow_schema.default('implicit-consent'),
  /** Default proxy outpost name */
  outpost_name: z.string().default('default-outpost'),
  /** Whether to generate client secrets automatically */
  auto_generate_secrets: z.boolean().default(true),
  /** Output directory for generated blueprints */
  output_dir: z.string().default('./authentik-blueprints'),
  /** Blueprint version */
  blueprint_version: z.number().default(1),
});
export type AuthentikPluginOptionsType = z.infer<typeof authentik_plugin_options_schema>;

/**
 * Authentik application blueprint
 */
export interface AuthentikApplicationType {
  identifiers: {
    slug: string;
  };
  model: 'authentik_core.application';
  attrs: {
    name: string;
    slug: string;
    provider?: string;
    meta_description?: string;
    meta_icon?: string;
    group?: string;
    meta_launch_url?: string;
    policy_engine_mode?: string;
  };
}

/**
 * Authentik provider blueprint (OAuth2)
 */
export interface AuthentikOAuth2ProviderType {
  identifiers: {
    name: string;
  };
  model: 'authentik_providers_oauth2.oauth2provider';
  attrs: {
    name: string;
    client_id: string;
    client_type: string;
    client_secret?: string;
    redirect_uris: string;
    authorization_flow?: string;
    signing_key?: string;
    include_claims_in_id_token: boolean;
    access_token_validity: string;
    refresh_token_validity: string;
    sub_mode: string;
    issue_refresh_tokens: boolean;
    property_mappings?: string[];
  };
}

/**
 * Authentik provider blueprint (SAML)
 */
export interface AuthentikSAMLProviderType {
  identifiers: {
    name: string;
  };
  model: 'authentik_providers_saml.samlprovider';
  attrs: {
    name: string;
    acs_url: string;
    issuer: string;
    sp_binding: string;
    audience?: string;
    authorization_flow?: string;
    signing_kp?: string;
    name_id_mapping?: string;
    assertion_valid_not_before: string;
    assertion_valid_not_on_or_after: string;
    session_valid_not_on_or_after: string;
    property_mappings?: string[];
  };
}

/**
 * Authentik provider blueprint (Proxy)
 */
export interface AuthentikProxyProviderType {
  identifiers: {
    name: string;
  };
  model: 'authentik_providers_proxy.proxyprovider';
  attrs: {
    name: string;
    external_host: string;
    internal_host?: string;
    internal_host_ssl_validation: boolean;
    certificate?: string;
    skip_path_regex?: string;
    basic_auth_enabled: boolean;
    basic_auth_password_attribute?: string;
    basic_auth_user_attribute?: string;
    mode: string;
    authorization_flow?: string;
    access_token_validity: string;
    intercept_header_auth: boolean;
    property_mappings?: string[];
  };
}

/**
 * Authentik blueprint structure
 */
export interface AuthentikBlueprintType {
  version: number;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  entries: Array<
    | AuthentikApplicationType
    | AuthentikOAuth2ProviderType
    | AuthentikSAMLProviderType
    | AuthentikProxyProviderType
  >;
}
