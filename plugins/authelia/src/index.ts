/**
 * Authelia authentication provider plugin for Kustodian
 *
 * This plugin enables integration with Authelia for authentication and authorization.
 * It can generate OIDC client configurations, access control rules, and manage
 * authentication requirements for deployed applications.
 *
 * @packageDocumentation
 */

export {
  check_authelia_available,
  generate_random_secret,
  hash_password,
  validate_access_control,
} from './executor.js';
export {
  config_to_yaml,
  generate_access_control_rules,
  generate_authelia_config,
  generate_oidc_client,
  yaml_to_config,
} from './generator.js';
export { create_authelia_plugin, plugin as default } from './plugin.js';
export type {
  AccessControlRuleType,
  AuthConfigType,
  AutheliaPluginOptionsType,
  AutheliaPolicyType,
  AuthProviderType,
  ConsentModeType,
  OIDCClientConfigType,
  PKCEChallengeMethodType,
  ProxyAuthConfigType,
  TokenEndpointAuthMethodType,
} from './types.js';
