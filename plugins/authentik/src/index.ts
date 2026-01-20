/**
 * Authentik authentication provider plugin for Kustodian
 *
 * This plugin enables integration with Authentik for authentication and authorization.
 * It can generate OAuth2, SAML, and Proxy provider configurations, create Authentik
 * blueprints, and manage authentication requirements for deployed applications.
 *
 * @packageDocumentation
 */

export {
  check_authentik_available,
  generate_random_secret,
  validate_blueprint,
} from './executor.js';
export {
  blueprint_to_yaml,
  generate_application,
  generate_authentik_blueprint,
  generate_client_secret,
  generate_oauth2_provider,
  generate_proxy_provider,
  generate_saml_provider,
  yaml_to_blueprint,
} from './generator.js';
export { create_authentik_plugin, plugin as default } from './plugin.js';
export type {
  AuthConfigType,
  AuthentikApplicationType,
  AuthentikBlueprintType,
  AuthentikFlowType,
  AuthentikOAuth2ProviderType,
  AuthentikPluginOptionsType,
  AuthentikProxyProviderType,
  AuthentikSAMLProviderType,
  AuthProviderType,
  ClientTypeType,
  OAuth2ProviderConfigType,
  ProxyModeType,
  ProxyProviderConfigType,
  SAMLBindingType,
  SAMLNameIDPolicyType,
  SAMLProviderConfigType,
} from './types.js';
