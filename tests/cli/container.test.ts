import { describe, expect, it } from 'bun:test';

import { create_container, create_service_id } from '../../src/cli/container.js';

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
      expect(first.value).toBe(42);
      expect(first).toBe(second);
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
      expect(first.id).toBe(1);
      expect(second.id).toBe(2);
      expect(first).not.toBe(second);
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
      expect(resolved).toBe('production');
    });

    it('should throw for unregistered service', () => {
      // Arrange
      const container = create_container();
      const id = create_service_id<string>('Unknown');

      // Act & Assert
      expect(() => container.resolve(id)).toThrow('Service not registered');
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
      container.register_singleton(serviceId, (c) => ({
        config: c.resolve(configId),
      }));

      // Act
      const service = container.resolve(serviceId);

      // Assert
      expect(service.config.env).toBe('test');
    });
  });
});
