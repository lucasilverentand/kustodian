import type { KustodianErrorType } from '@kustodian/core';
import { type ResultType, failure, success } from '@kustodian/core';
import type { OnePasswordSubstitutionType } from '@kustodian/schema';

import { op_read } from './executor.js';
import type { OnePasswordPluginOptionsType } from './types.js';

/**
 * Resolves 1Password substitutions to actual secret values.
 * Supports both full references and shorthand with cluster defaults.
 * Returns a map from substitution name to resolved value.
 */
export async function resolve_onepassword_substitutions(
  substitutions: OnePasswordSubstitutionType[],
  options: OnePasswordPluginOptionsType = {},
): Promise<ResultType<Record<string, string>, KustodianErrorType>> {
  if (substitutions.length === 0) {
    return success({});
  }

  const results: Record<string, string> = {};

  for (const sub of substitutions) {
    // Build the reference string
    let ref: string;

    if (sub.ref) {
      // Full reference provided
      ref = sub.ref;
    } else if (sub.item && sub.field) {
      // Shorthand reference - need cluster vault
      const vault = options.cluster_defaults?.vault;
      if (!vault) {
        return failure({
          code: 'MISSING_1PASSWORD_VAULT',
          message: `1Password substitution '${sub.name}' uses shorthand but no cluster vault configured`,
        });
      }

      // Build op:// reference
      if (sub.section) {
        ref = `op://${vault}/${sub.item}/${sub.section}/${sub.field}`;
      } else {
        ref = `op://${vault}/${sub.item}/${sub.field}`;
      }
    } else {
      return failure({
        code: 'INVALID_1PASSWORD_REFERENCE',
        message: `1Password substitution '${sub.name}' must specify either 'ref' or 'item'+'field'`,
      });
    }

    const result = await op_read(ref, options);

    if (!result.success) {
      // If we have a default and fail_on_missing is false, use the default
      if (sub.default !== undefined && options.fail_on_missing === false) {
        results[sub.name] = sub.default;
        continue;
      }

      // If we have a default, use it
      if (sub.default !== undefined) {
        results[sub.name] = sub.default;
        continue;
      }

      // Otherwise, propagate the error
      return failure(result.error);
    }

    results[sub.name] = result.value;
  }

  return success(results);
}
