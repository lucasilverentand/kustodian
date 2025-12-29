/**
 * Type utilities for deep object manipulation.
 */

/**
 * Makes all properties in T optional recursively.
 */
export type DeepPartialType<T> = T extends object ? { [P in keyof T]?: DeepPartialType<T[P]> } : T;

/**
 * Makes all properties in T required recursively.
 */
export type DeepRequiredType<T> = T extends object
  ? { [P in keyof T]-?: DeepRequiredType<T[P]> }
  : T;

/**
 * Makes all properties in T readonly recursively.
 */
export type DeepReadonlyType<T> = T extends object
  ? { readonly [P in keyof T]: DeepReadonlyType<T[P]> }
  : T;

/**
 * Extracts keys of T that have values assignable to V.
 */
export type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];

/**
 * Makes specific keys K of T optional.
 */
export type PartialByType<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes specific keys K of T required.
 */
export type RequiredByType<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Extracts the type of array elements.
 */
export type ArrayElementType<T> = T extends readonly (infer U)[] ? U : never;

/**
 * Makes all properties in T mutable (removes readonly).
 */
export type MutableType<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Extracts non-nullable properties from T.
 */
export type NonNullablePropsType<T> = {
  [K in keyof T]: NonNullable<T[K]>;
};

/**
 * Creates a type with properties common to T and U.
 */
export type IntersectionType<T, U> = Pick<T, Extract<keyof T, keyof U>>;

/**
 * Creates a type with properties in T but not in U.
 */
export type DifferenceType<T, U> = Pick<T, Exclude<keyof T, keyof U>>;

/**
 * Branded type for nominal typing.
 */
export type BrandedType<T, Brand extends string> = T & { readonly __brand: Brand };

/**
 * Type guard function type.
 */
export type TypeGuardType<T> = (value: unknown) => value is T;

/**
 * Async function type.
 */
export type AsyncFunctionType<T extends unknown[], R> = (...args: T) => Promise<R>;

/**
 * Creates a type with all properties as optional except those in K.
 */
export type WithRequiredType<T, K extends keyof T> = T & { [P in K]-?: T[P] };
