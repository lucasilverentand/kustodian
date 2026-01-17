/**
 * Authelia authentication provider plugin for Kustodian
 *
 * This plugin enables integration with Authelia for authentication and authorization.
 * It can generate OIDC client configurations, access control rules, and manage
 * authentication requirements for deployed applications.
 *
 * @packageDocumentation
 */

export { create_authelia_plugin, plugin as default } from './plugin.js';
export type {
  AuthConfigType,
  AuthProviderType,
  AutheliaPolicyType,
  AutheliaPluginOptionsType,
  OIDCClientConfigType,
  AccessControlRuleType,
  ProxyAuthConfigType,
  ConsentModeType,
  PKCEChallengeMethodType,
  TokenEndpointAuthMethodType,
} from './types.js';
export {
  generate_oidc_client,
  generate_access_control_rules,
  generate_authelia_config,
  config_to_yaml,
  yaml_to_config,
} from './generator.js';
export {
  check_authelia_available,
  hash_password,
  generate_random_secret,
  validate_access_control,
} from './executor.js';
