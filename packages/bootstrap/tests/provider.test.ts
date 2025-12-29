import { describe, expect, it } from 'vitest';

import {
  type ClusterProviderType,
  create_mock_provider,
  create_provider_registry,
} from '../src/provider.js';

describe('Provider', () => {
  describe('create_mock_provider', () => {
    it('should create a mock provider with correct name', () => {
      // Act
      const provider = create_mock_provider();

      // Assert
      expect(provider.name).toBe('mock');
    });

    it('should validate successfully', () => {
      // Arrange
      const provider = create_mock_provider();

      // Act
      const result = provider.validate({ cluster: 'test', nodes: [] });

      // Assert
      expect(result.success).toBe(true);
    });

    it('should install successfully', async () => {
      // Arrange
      const provider = create_mock_provider();

      // Act
      const result = await provider.install({ cluster: 'test', nodes: [] }, {});

      // Assert
      expect(result.success).toBe(true);
    });

    it('should return mock kubeconfig', async () => {
      // Arrange
      const provider = create_mock_provider();

      // Act
      const result = await provider.get_kubeconfig({ cluster: 'test', nodes: [] });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('mock-kubeconfig');
      }
    });

    it('should reset successfully', async () => {
      // Arrange
      const provider = create_mock_provider();

      // Act
      const result = await provider.reset({ cluster: 'test', nodes: [] }, {});

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('create_provider_registry', () => {
    it('should create an empty registry', () => {
      // Act
      const registry = create_provider_registry();

      // Assert
      expect(registry.list()).toEqual([]);
      expect(registry.get_default()).toBeUndefined();
    });

    it('should register a provider', () => {
      // Arrange
      const registry = create_provider_registry();
      const provider = create_mock_provider();

      // Act
      registry.register(provider);

      // Assert
      expect(registry.list()).toEqual(['mock']);
    });

    it('should get a registered provider by name', () => {
      // Arrange
      const registry = create_provider_registry();
      const provider = create_mock_provider();
      registry.register(provider);

      // Act
      const result = registry.get('mock');

      // Assert
      expect(result).toBe(provider);
    });

    it('should return undefined for unknown provider', () => {
      // Arrange
      const registry = create_provider_registry();

      // Act
      const result = registry.get('unknown');

      // Assert
      expect(result).toBeUndefined();
    });

    it('should set first registered provider as default', () => {
      // Arrange
      const registry = create_provider_registry();
      const provider = create_mock_provider();

      // Act
      registry.register(provider);

      // Assert
      expect(registry.get_default()).toBe(provider);
    });

    it('should not change default when registering additional providers', () => {
      // Arrange
      const registry = create_provider_registry();
      const first_provider: ClusterProviderType = {
        ...create_mock_provider(),
        name: 'first',
      };
      const second_provider: ClusterProviderType = {
        ...create_mock_provider(),
        name: 'second',
      };

      // Act
      registry.register(first_provider);
      registry.register(second_provider);

      // Assert
      expect(registry.get_default()).toBe(first_provider);
      expect(registry.list()).toEqual(['first', 'second']);
    });

    it('should get provider registered second', () => {
      // Arrange
      const registry = create_provider_registry();
      const first_provider: ClusterProviderType = {
        ...create_mock_provider(),
        name: 'first',
      };
      const second_provider: ClusterProviderType = {
        ...create_mock_provider(),
        name: 'second',
      };
      registry.register(first_provider);
      registry.register(second_provider);

      // Act
      const result = registry.get('second');

      // Assert
      expect(result).toBe(second_provider);
    });
  });
});
