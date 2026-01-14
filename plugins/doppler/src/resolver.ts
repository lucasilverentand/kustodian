import { type ResultType, failure, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import type { DopplerSubstitutionType } from '@kustodian/schema';

import { doppler_secrets_download } from './executor.js';
import {
  type DopplerCacheKeyType,
  type DopplerPluginOptionsType,
  create_cache_key,
} from './types.js';

/**
 * Resolves Doppler substitutions to actual secret values.
 * Groups by project/config to minimize API calls.
 * Returns a map from substitution name to resolved value.
 */
export async function resolve_doppler_substitutions(
  substitutions: DopplerSubstitutionType[],
  options: DopplerPluginOptionsType = {},
): Promise<ResultType<Record<string, string>, KustodianErrorType>> {
  if (substitutions.length === 0) {
    return success({});
  }

  // Group substitutions by project/config to minimize API calls
  const groups = new Map<DopplerCacheKeyType, DopplerSubstitutionType[]>();

  for (const sub of substitutions) {
    const key = create_cache_key(sub.project, sub.config);
    const group = groups.get(key) ?? [];
    group.push(sub);
    groups.set(key, group);
  }

  // Cache for downloaded secrets per project/config
  const secrets_cache = new Map<DopplerCacheKeyType, Record<string, string>>();

  const results: Record<string, string> = {};

  // Fetch secrets for each group
  for (const [key, subs] of groups) {
    // Get project and config from the first substitution in the group
    const first = subs[0]!;

    // Check if we already have the secrets cached
    let secrets = secrets_cache.get(key);

    if (!secrets) {
      const download_result = await doppler_secrets_download(first.project, first.config, options);

      if (!download_result.success) {
        // If we can't download secrets, try to use defaults
        let all_have_defaults = true;
        for (const sub of subs) {
          if (sub.default !== undefined) {
            results[sub.name] = sub.default;
          } else if (options.fail_on_missing !== false) {
            all_have_defaults = false;
          }
        }

        if (!all_have_defaults) {
          return failure(download_result.error);
        }

        continue;
      }

      secrets = download_result.value;
      secrets_cache.set(key, secrets);
    }

    // Extract the requested secrets
    for (const sub of subs) {
      const value = secrets[sub.secret];

      if (value !== undefined) {
        results[sub.name] = value;
      } else if (sub.default !== undefined) {
        results[sub.name] = sub.default;
      } else if (options.fail_on_missing !== false) {
        return failure({
          code: 'SECRET_NOT_FOUND',
          message: `Secret not found in Doppler: ${sub.project}/${sub.config}/${sub.secret}`,
        });
      }
    }
  }

  return success(results);
}
