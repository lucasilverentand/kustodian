import { describe, expect, it } from 'vitest';

import { create_plugin_registry } from '../src/registry.js';
import type {
  ResourceGeneratorPluginType,
  SecretProviderPluginType,
  ValidatorPluginType,
} from '../src/types.js';

describe('Plugin Registry', () => {
  const create_mock_secret_provider = (name: string, scheme: string): SecretProviderPluginType => ({
    manifest: { name, version: '1.0.0', type: 'secret-provider' },
    scheme,
    parse_ref: () => ({ success: true, value: {} }),
    generate: () => ({
      success: true,
      value: { api_version: 'v1', kind: 'Secret', metadata: { name: 'test' } },
    }),
  });

  const create_mock_generator = (name: string): ResourceGeneratorPluginType => ({
    manifest: { name, version: '1.0.0', type: 'resource-generator' },
    generate: () => ({ success: true, value: [] }),
  });

  const create_mock_validator = (name: string): ValidatorPluginType => ({
    manifest: { name, version: '1.0.0', type: 'validator' },
    validate: () => ({ success: true, value: undefined }),
  });

  describe('register', () => {
    it('should register a plugin', () => {
      // Arrange
      const registry = create_plugin_registry();
      const plugin = create_mock_secret_provider('doppler', 'doppler://');

      // Act
      const result = registry.register(plugin);

      // Assert
      expect(result.success).toBe(true);
      expect(registry.get('doppler')).toBe(plugin);
    });

    it('should reject duplicate plugin names', () => {
      // Arrange
      const registry = create_plugin_registry();
      const plugin1 = create_mock_secret_provider('test', 'test://');
      const plugin2 = create_mock_generator('test');

      registry.register(plugin1);

      // Act
      const result = registry.register(plugin2);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('get', () => {
    it('should return undefined for unregistered plugin', () => {
      // Arrange
      const registry = create_plugin_registry();

      // Act
      const result = registry.get('unknown');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('get_secret_providers', () => {
    it('should return only secret provider plugins', () => {
      // Arrange
      const registry = create_plugin_registry();
      registry.register(create_mock_secret_provider('doppler', 'doppler://'));
      registry.register(create_mock_generator('authentik'));
      registry.register(create_mock_secret_provider('1password', 'op://'));

      // Act
      const providers = registry.get_secret_providers();

      // Assert
      expect(providers).toHaveLength(2);
      expect(providers.map((p) => p.manifest.name)).toContain('doppler');
      expect(providers.map((p) => p.manifest.name)).toContain('1password');
    });
  });

  describe('get_secret_provider_by_scheme', () => {
    it('should return provider by scheme', () => {
      // Arrange
      const registry = create_plugin_registry();
      registry.register(create_mock_secret_provider('doppler', 'doppler://'));
      registry.register(create_mock_secret_provider('1password', 'op://'));

      // Act
      const provider = registry.get_secret_provider_by_scheme('op://');

      // Assert
      expect(provider?.manifest.name).toBe('1password');
    });

    it('should return undefined for unknown scheme', () => {
      // Arrange
      const registry = create_plugin_registry();

      // Act
      const provider = registry.get_secret_provider_by_scheme('unknown://');

      // Assert
      expect(provider).toBeUndefined();
    });
  });

  describe('get_resource_generators', () => {
    it('should return only resource generator plugins', () => {
      // Arrange
      const registry = create_plugin_registry();
      registry.register(create_mock_secret_provider('doppler', 'doppler://'));
      registry.register(create_mock_generator('authentik'));

      // Act
      const generators = registry.get_resource_generators();

      // Assert
      expect(generators).toHaveLength(1);
      expect(generators[0]?.manifest.name).toBe('authentik');
    });
  });

  describe('get_validators', () => {
    it('should return only validator plugins', () => {
      // Arrange
      const registry = create_plugin_registry();
      registry.register(create_mock_generator('gen'));
      registry.register(create_mock_validator('security'));

      // Act
      const validators = registry.get_validators();

      // Assert
      expect(validators).toHaveLength(1);
      expect(validators[0]?.manifest.name).toBe('security');
    });
  });

  describe('list', () => {
    it('should list all registered plugin names', () => {
      // Arrange
      const registry = create_plugin_registry();
      registry.register(create_mock_secret_provider('doppler', 'doppler://'));
      registry.register(create_mock_generator('authentik'));

      // Act
      const names = registry.list();

      // Assert
      expect(names).toHaveLength(2);
      expect(names).toContain('doppler');
      expect(names).toContain('authentik');
    });
  });
});
