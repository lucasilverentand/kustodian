/**
 * Dependency injection container for the CLI.
 * Provides a simple service locator pattern.
 */

import {
  Errors,
  type KustodianErrorType,
  type ResultType,
  failure,
  success,
} from '../core/index.js';

/**
 * Service identifier type.
 */
export type ServiceIdType<T> = symbol & { __type?: T };

/**
 * Creates a typed service identifier.
 */
export function create_service_id<T>(name: string): ServiceIdType<T> {
  return Symbol(name) as ServiceIdType<T>;
}

/**
 * Factory function type for creating services.
 */
export type FactoryType<T> = (container: ContainerType) => T;

/**
 * Container interface for dependency injection.
 */
export interface ContainerType {
  /**
   * Registers a singleton service.
   */
  register_singleton<T>(id: ServiceIdType<T>, factory: FactoryType<T>): void;

  /**
   * Registers a transient service (new instance per resolve).
   */
  register_transient<T>(id: ServiceIdType<T>, factory: FactoryType<T>): void;

  /**
   * Registers an instance directly.
   */
  register_instance<T>(id: ServiceIdType<T>, instance: T): void;

  /**
   * Resolves a service from the container.
   */
  resolve<T>(id: ServiceIdType<T>): ResultType<T, KustodianErrorType>;

  /**
   * Checks if a service is registered.
   */
  has<T>(id: ServiceIdType<T>): boolean;
}

interface RegistrationType<T> {
  factory: FactoryType<T>;
  singleton: boolean;
  instance?: T;
}

/**
 * Creates a new dependency injection container.
 */
export function create_container(): ContainerType {
  const registrations = new Map<symbol, RegistrationType<unknown>>();

  const container: ContainerType = {
    register_singleton<T>(id: ServiceIdType<T>, factory: FactoryType<T>): void {
      registrations.set(id, { factory, singleton: true });
    },

    register_transient<T>(id: ServiceIdType<T>, factory: FactoryType<T>): void {
      registrations.set(id, { factory, singleton: false });
    },

    register_instance<T>(id: ServiceIdType<T>, instance: T): void {
      registrations.set(id, {
        factory: () => instance,
        singleton: true,
        instance,
      });
    },

    resolve<T>(id: ServiceIdType<T>): ResultType<T, KustodianErrorType> {
      const registration = registrations.get(id) as RegistrationType<T> | undefined;

      if (!registration) {
        return failure(Errors.not_found('Service', id.toString()));
      }

      if (registration.singleton) {
        if (registration.instance === undefined) {
          registration.instance = registration.factory(container);
        }
        return success(registration.instance);
      }

      return success(registration.factory(container));
    },

    has<T>(id: ServiceIdType<T>): boolean {
      return registrations.has(id);
    },
  };

  return container;
}
