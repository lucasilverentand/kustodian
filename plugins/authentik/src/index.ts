/**
 * Authentik authentication provider plugin for Kustodian
 *
 * This plugin enables integration with Authentik for authentication and authorization.
 * It can generate OAuth2, SAML, and Proxy provider configurations, create Authentik
 * blueprints, and manage authentication requirements for deployed applications.
 *
 * @packageDocumentation
 */

export { create_authentik_plugin, plugin as default } from './plugin.js';
export type {
  AuthConfigType,
  AuthProviderType,
  AuthentikPluginOptionsType,
  OAuth2ProviderConfigType,
  SAMLProviderConfigType,
  ProxyProviderConfigType,
  AuthentikBlueprintType,
  AuthentikApplicationType,
  AuthentikOAuth2ProviderType,
  AuthentikSAMLProviderType,
  AuthentikProxyProviderType,
  ClientTypeType,
  ProxyModeType,
  SAMLBindingType,
  SAMLNameIDPolicyType,
  AuthentikFlowType,
} from './types.js';
export {
  generate_authentik_blueprint,
  generate_oauth2_provider,
  generate_saml_provider,
  generate_proxy_provider,
  generate_application,
  generate_client_secret,
  blueprint_to_yaml,
  yaml_to_blueprint,
} from './generator.js';
export {
  check_authentik_available,
  validate_blueprint,
  generate_random_secret,
} from './executor.js';
