import { describe, expect, it } from 'vitest';

import type {
  ArrayElementType,
  BrandedType,
  DeepPartialType,
  DeepReadonlyType,
  DeepRequiredType,
  KeysOfType,
  MutableType,
  PartialByType,
  RequiredByType,
} from '../src/types.js';

// These are compile-time type tests - if they compile, the types work correctly

describe('Type Utilities', () => {
  describe('DeepPartialType', () => {
    it('should make nested properties optional', () => {
      // Arrange
      type OriginalType = {
        a: string;
        b: {
          c: number;
          d: {
            e: boolean;
          };
        };
      };

      // Act
      type PartialResult = DeepPartialType<OriginalType>;

      // Assert - compile time test
      const partial: PartialResult = {};
      const partial2: PartialResult = { a: 'test' };
      const partial3: PartialResult = { b: { c: 1 } };

      expect(partial).toEqual({});
      expect(partial2.a).toBe('test');
      expect(partial3.b?.c).toBe(1);
    });
  });

  describe('DeepRequiredType', () => {
    it('should make nested properties required', () => {
      // Arrange
      type OriginalType = {
        a?: string;
        b?: {
          c?: number;
        };
      };

      // Act
      type RequiredResult = DeepRequiredType<OriginalType>;

      // Assert - this must compile
      const required: RequiredResult = {
        a: 'test',
        b: { c: 1 },
      };

      expect(required.a).toBe('test');
      expect(required.b.c).toBe(1);
    });
  });

  describe('DeepReadonlyType', () => {
    it('should make nested properties readonly', () => {
      // Arrange
      type OriginalType = {
        a: string;
        b: {
          c: number;
        };
      };

      // Act
      type ReadonlyResult = DeepReadonlyType<OriginalType>;

      // Assert
      const obj: ReadonlyResult = { a: 'test', b: { c: 1 } };
      expect(obj.a).toBe('test');
      // obj.a = 'new'; // This would cause a compile error
    });
  });

  describe('KeysOfType', () => {
    it('should extract keys with matching value type', () => {
      // Arrange
      type TestType = {
        name: string;
        age: number;
        active: boolean;
        count: number;
      };

      // Act
      type NumberKeys = KeysOfType<TestType, number>;

      // Assert
      const key: NumberKeys = 'age';
      expect(key).toBe('age');
    });
  });

  describe('PartialByType', () => {
    it('should make only specified keys optional', () => {
      // Arrange
      type OriginalType = {
        a: string;
        b: number;
        c: boolean;
      };

      // Act
      type PartialAType = PartialByType<OriginalType, 'a'>;

      // Assert
      const obj: PartialAType = { b: 1, c: true };
      expect(obj.b).toBe(1);
      expect(obj.c).toBe(true);
    });
  });

  describe('RequiredByType', () => {
    it('should make only specified keys required', () => {
      // Arrange
      type OriginalType = {
        a?: string;
        b?: number;
        c?: boolean;
      };

      // Act
      type RequiredAType = RequiredByType<OriginalType, 'a'>;

      // Assert
      const obj: RequiredAType = { a: 'required' };
      expect(obj.a).toBe('required');
    });
  });

  describe('ArrayElementType', () => {
    it('should extract element type from array', () => {
      // Arrange
      type StringArrayType = string[];

      // Act
      type ElementType = ArrayElementType<StringArrayType>;

      // Assert
      const element: ElementType = 'test';
      expect(element).toBe('test');
    });

    it('should work with readonly arrays', () => {
      // Arrange
      type ReadonlyArrayType = readonly number[];

      // Act
      type ElementType = ArrayElementType<ReadonlyArrayType>;

      // Assert
      const element: ElementType = 42;
      expect(element).toBe(42);
    });
  });

  describe('MutableType', () => {
    it('should remove readonly from properties', () => {
      // Arrange
      type ReadonlyType = {
        readonly a: string;
        readonly b: number;
      };

      // Act
      type MutableResult = MutableType<ReadonlyType>;

      // Assert
      const obj: MutableResult = { a: 'test', b: 1 };
      obj.a = 'modified';
      expect(obj.a).toBe('modified');
    });
  });

  describe('BrandedType', () => {
    it('should create nominal types', () => {
      // Arrange
      type UserIdType = BrandedType<string, 'UserId'>;
      type OrderIdType = BrandedType<string, 'OrderId'>;

      // Act
      const userId = 'user-123' as UserIdType;
      const orderId = 'order-456' as OrderIdType;

      // Assert
      expect(userId).toBe('user-123');
      expect(orderId).toBe('order-456');
      // userId = orderId; // This would cause a compile error
    });
  });
});
