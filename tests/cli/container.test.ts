import { describe, expect, it } from 'bun:test';

import { create_container, create_service_id } from '../../src/cli/container.js';
import { is_success } from '../../src/core/index.js';

describe('Container', () => {
  describe('create_service_id', () => {
    it('should create a unique symbol', () => {
      // Act
      const id1 = create_service_id<string>('TestService');
      const id2 = create_service_id<string>('TestService');

      // Assert
      expect(typeof id1).toBe('symbol');
      expect(id1).not.toBe(id2);
    });
  });

  describe('create_container', () => {
    it('should register and resolve a singleton', () => {
      // Arrange
      const container = create_container();
      const id = create_service_id<{ value: number }>('Counter');
      let calls = 0;

      // Act
      container.register_singleton(id, () => {
        calls++;
        return { value: 42 };
      });

      const first = container.resolve(id);
      const second = container.resolve(id);

      // Assert
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (is_success(first) && is_success(second)) {
        expect(first.value.value).toBe(42);
        expect(first.value).toBe(second.value);
      }
      expect(calls).toBe(1);
    });

    it('should register and resolve a transient', () => {
      // Arrange
      const container = create_container();
      const id = create_service_id<{ id: number }>('Instance');
      let counter = 0;

      // Act
      container.register_transient(id, () => {
        counter++;
        return { id: counter };
      });

      const first = container.resolve(id);
      const second = container.resolve(id);

      // Assert
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (is_success(first) && is_success(second)) {
        expect(first.value.id).toBe(1);
        expect(second.value.id).toBe(2);
        expect(first.value).not.toBe(second.value);
      }
    });

    it('should register and resolve an instance', () => {
      // Arrange
      const container = create_container();
      const id = create_service_id<string>('Config');
      const instance = 'production';

      // Act
      container.register_instance(id, instance);
      const resolved = container.resolve(id);

      // Assert
      expect(resolved.success).toBe(true);
      if (is_success(resolved)) {
        expect(resolved.value).toBe('production');
      }
    });

    it('should return failure for unregistered service', () => {
      // Arrange
      const container = create_container();
      const id = create_service_id<string>('Unknown');

      // Act
      const result = container.resolve(id);

      // Assert
      expect(result.success).toBe(false);
      if (!is_success(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('Service');
      }
    });

    it('should check if service is registered', () => {
      // Arrange
      const container = create_container();
      const registeredId = create_service_id<string>('Registered');
      const unregisteredId = create_service_id<string>('Unregistered');

      container.register_instance(registeredId, 'value');

      // Act & Assert
      expect(container.has(registeredId)).toBe(true);
      expect(container.has(unregisteredId)).toBe(false);
    });

    it('should allow services to depend on other services', () => {
      // Arrange
      const container = create_container();
      const configId = create_service_id<{ env: string }>('Config');
      const serviceId = create_service_id<{ config: { env: string } }>('Service');

      container.register_instance(configId, { env: 'test' });
      container.register_singleton(serviceId, (c) => {
        const config_result = c.resolve(configId);
        if (!config_result.success) {
          throw new Error('Config not registered');
        }
        return { config: config_result.value };
      });

      // Act
      const result = container.resolve(serviceId);

      // Assert
      expect(result.success).toBe(true);
      if (is_success(result)) {
        expect(result.value.config.env).toBe('test');
      }
    });
  });
});
