import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { failure, success } from '@kustodian/core';
import { find_project_root } from '@kustodian/loader';
import type { TemplateSourceType } from '@kustodian/schema';
import {
  DEFAULT_CACHE_DIR,
  create_cache_manager,
  get_fetcher_for_source,
  load_templates_from_sources,
} from '@kustodian/sources';
import { parse } from 'yaml';

import { define_command } from '../command.js';

/**
 * Project configuration with template sources.
 */
interface ProjectConfigType {
  spec?: {
    template_sources?: TemplateSourceType[];
  };
}

/**
 * Reads template sources from project config.
 */
async function get_template_sources(project_root: string): Promise<TemplateSourceType[]> {
  const config_path = path.join(project_root, 'kustodian.yaml');
  try {
    const content = await fs.readFile(config_path, 'utf-8');
    const config = parse(content) as ProjectConfigType;
    return config?.spec?.template_sources ?? [];
  } catch {
    return [];
  }
}

/**
 * Formats bytes to human-readable size.
 */
function format_bytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Sources command - manage template sources.
 */
export const sources_command = define_command({
  name: 'sources',
  description: 'Manage template sources',
  subcommands: [
    // sources fetch
    {
      name: 'fetch',
      description: 'Fetch or update template sources',
      options: [
        {
          name: 'force',
          short: 'f',
          description: 'Force refresh all sources (ignore cache)',
          type: 'boolean',
        },
        {
          name: 'source',
          short: 's',
          description: 'Fetch a specific source only',
          type: 'string',
        },
        {
          name: 'project',
          short: 'p',
          description: 'Path to project root',
          type: 'string',
        },
      ],
      handler: async (ctx) => {
        const project_path = (ctx.options['project'] as string) || process.cwd();
        const force_refresh = ctx.options['force'] as boolean;
        const source_filter = ctx.options['source'] as string | undefined;

        // Find project root
        const root_result = await find_project_root(project_path);
        if (!root_result.success) {
          console.error(`Error: ${root_result.error.message}`);
          return root_result;
        }

        const project_root = root_result.value;

        // Get template sources from project config
        let sources = await get_template_sources(project_root);

        if (sources.length === 0) {
          console.log('No template sources configured in kustodian.yaml');
          return success(undefined);
        }

        // Filter if specific source requested
        if (source_filter) {
          sources = sources.filter((s) => s.name === source_filter);
          if (sources.length === 0) {
            console.error(`Source '${source_filter}' not found in configuration`);
            return failure({ code: 'NOT_FOUND', message: `Source '${source_filter}' not found` });
          }
        }

        console.log(`Fetching ${sources.length} template source(s)...`);
        if (force_refresh) {
          console.log('(force refresh enabled)\n');
        } else {
          console.log('');
        }

        const cache_dir = path.join(project_root, DEFAULT_CACHE_DIR);
        const result = await load_templates_from_sources(sources, {
          cache_dir,
          force_refresh,
        });

        if (!result.success) {
          console.error(`\nError: ${result.error.message}`);
          return result;
        }

        // Report results
        for (const resolved of result.value.resolved) {
          const status = resolved.fetch_result.from_cache ? '(cached)' : '(fetched)';
          console.log(`  ✓ ${resolved.source.name} @ ${resolved.fetch_result.version} ${status}`);
        }

        console.log(`\n✓ Loaded ${result.value.templates.length} template(s) from sources`);
        return success(undefined);
      },
    },

    // sources list
    {
      name: 'list',
      description: 'List configured template sources',
      options: [
        {
          name: 'cached',
          short: 'c',
          description: 'Show cached sources only',
          type: 'boolean',
        },
        {
          name: 'project',
          short: 'p',
          description: 'Path to project root',
          type: 'string',
        },
      ],
      handler: async (ctx) => {
        const project_path = (ctx.options['project'] as string) || process.cwd();
        const show_cached = ctx.options['cached'] as boolean;

        // Find project root
        const root_result = await find_project_root(project_path);
        if (!root_result.success) {
          console.error(`Error: ${root_result.error.message}`);
          return root_result;
        }

        const project_root = root_result.value;
        const cache_dir = path.join(project_root, DEFAULT_CACHE_DIR);

        if (show_cached) {
          // Show cached sources
          const cache = create_cache_manager(cache_dir);
          const entries_result = await cache.list();

          if (!entries_result.success) {
            console.error(`Error: ${entries_result.error.message}`);
            return entries_result;
          }

          const entries = entries_result.value;
          if (entries.length === 0) {
            console.log('No cached sources');
            return success(undefined);
          }

          console.log('Cached sources:\n');
          for (const entry of entries) {
            const expired = entry.expires_at && entry.expires_at < new Date() ? ' (expired)' : '';
            const mutable = entry.expires_at ? '(mutable)' : '(immutable)';
            console.log(`  ${entry.source_name} @ ${entry.version}`);
            console.log(`    Type: ${entry.source_type} ${mutable}${expired}`);
            console.log(`    Fetched: ${entry.fetched_at.toISOString()}`);
            console.log('');
          }
        } else {
          // Show configured sources
          const sources = await get_template_sources(project_root);

          if (sources.length === 0) {
            console.log('No template sources configured');
            return success(undefined);
          }

          console.log('Configured sources:\n');
          for (const source of sources) {
            const type = source.git ? 'git' : source.http ? 'http' : source.oci ? 'oci' : 'unknown';
            console.log(`  ${source.name} (${type})`);

            if (source.git) {
              const ref = source.git.ref.tag ?? source.git.ref.branch ?? source.git.ref.commit;
              console.log(`    URL: ${source.git.url}`);
              console.log(`    Ref: ${ref}`);
              if (source.git.path) console.log(`    Path: ${source.git.path}`);
            }
            if (source.http) {
              console.log(`    URL: ${source.http.url}`);
              if (source.http.checksum) console.log(`    Checksum: ${source.http.checksum}`);
            }
            if (source.oci) {
              const ref = source.oci.digest ?? source.oci.tag;
              console.log(`    Registry: ${source.oci.registry}/${source.oci.repository}`);
              console.log(`    Tag: ${ref}`);
            }
            if (source.ttl) console.log(`    TTL: ${source.ttl}`);
            console.log('');
          }
        }

        return success(undefined);
      },
    },

    // sources cache
    {
      name: 'cache',
      description: 'Manage template cache',
      subcommands: [
        // sources cache info
        {
          name: 'info',
          description: 'Show cache statistics',
          options: [
            {
              name: 'project',
              short: 'p',
              description: 'Path to project root',
              type: 'string',
            },
          ],
          handler: async (ctx) => {
            const project_path = (ctx.options['project'] as string) || process.cwd();

            const root_result = await find_project_root(project_path);
            if (!root_result.success) {
              console.error(`Error: ${root_result.error.message}`);
              return root_result;
            }

            const project_root = root_result.value;
            const cache_dir = path.join(project_root, DEFAULT_CACHE_DIR);
            const cache = create_cache_manager(cache_dir);

            const entries_result = await cache.list();
            const size_result = await cache.size();

            if (!entries_result.success || !size_result.success) {
              console.log('Cache directory not found or empty');
              return success(undefined);
            }

            const entries = entries_result.value;
            const total_size = size_result.value;
            const expired = entries.filter((e) => e.expires_at && e.expires_at < new Date()).length;

            console.log('Cache statistics:\n');
            console.log(`  Location: ${cache_dir}`);
            console.log(`  Total entries: ${entries.length}`);
            console.log(`  Expired entries: ${expired}`);
            console.log(`  Total size: ${format_bytes(total_size)}`);

            return success(undefined);
          },
        },

        // sources cache prune
        {
          name: 'prune',
          description: 'Remove expired cache entries',
          options: [
            {
              name: 'project',
              short: 'p',
              description: 'Path to project root',
              type: 'string',
            },
          ],
          handler: async (ctx) => {
            const project_path = (ctx.options['project'] as string) || process.cwd();

            const root_result = await find_project_root(project_path);
            if (!root_result.success) {
              console.error(`Error: ${root_result.error.message}`);
              return root_result;
            }

            const project_root = root_result.value;
            const cache_dir = path.join(project_root, DEFAULT_CACHE_DIR);
            const cache = create_cache_manager(cache_dir);

            console.log('Pruning expired cache entries...');
            const result = await cache.prune();

            if (!result.success) {
              console.error(`Error: ${result.error.message}`);
              return result;
            }

            console.log(`✓ Removed ${result.value} expired entries`);
            return success(undefined);
          },
        },

        // sources cache clear
        {
          name: 'clear',
          description: 'Clear all cached templates',
          options: [
            {
              name: 'project',
              short: 'p',
              description: 'Path to project root',
              type: 'string',
            },
          ],
          handler: async (ctx) => {
            const project_path = (ctx.options['project'] as string) || process.cwd();

            const root_result = await find_project_root(project_path);
            if (!root_result.success) {
              console.error(`Error: ${root_result.error.message}`);
              return root_result;
            }

            const project_root = root_result.value;
            const cache_dir = path.join(project_root, DEFAULT_CACHE_DIR);
            const cache = create_cache_manager(cache_dir);

            console.log('Clearing template cache...');
            const result = await cache.clear();

            if (!result.success) {
              console.error(`Error: ${result.error.message}`);
              return result;
            }

            console.log('✓ Cache cleared');
            return success(undefined);
          },
        },
      ],
    },

    // sources versions
    {
      name: 'versions',
      description: 'List available versions for a source',
      arguments: [
        {
          name: 'source',
          description: 'Source name',
          required: true,
        },
      ],
      options: [
        {
          name: 'project',
          short: 'p',
          description: 'Path to project root',
          type: 'string',
        },
      ],
      handler: async (ctx) => {
        const project_path = (ctx.options['project'] as string) || process.cwd();
        const source_name = ctx.args[0] as string | undefined;

        if (!source_name) {
          console.error('Error: Source name is required');
          return failure({ code: 'INVALID_ARGUMENT', message: 'Source name is required' });
        }

        const root_result = await find_project_root(project_path);
        if (!root_result.success) {
          console.error(`Error: ${root_result.error.message}`);
          return root_result;
        }

        const project_root = root_result.value;
        const sources = await get_template_sources(project_root);
        const source = sources.find((s) => s.name === source_name);

        if (!source) {
          console.error(`Source '${source_name}' not found in configuration`);
          return failure({ code: 'NOT_FOUND', message: `Source '${source_name}' not found` });
        }

        const fetcher = get_fetcher_for_source(source);

        console.log(`Fetching versions for '${source_name}'...`);
        const versions_result = await fetcher.list_versions(source);

        if (!versions_result.success) {
          console.error(`Error: ${versions_result.error.message}`);
          return versions_result;
        }

        const versions = versions_result.value;
        if (versions.length === 0) {
          console.log('No versions found (this source type may not support version listing)');
          return success(undefined);
        }

        console.log(`\nAvailable versions (${versions.length}):\n`);
        for (const v of versions.slice(0, 50)) {
          // Limit to 50
          const digest = v.digest ? ` (${v.digest.slice(0, 12)})` : '';
          console.log(`  ${v.version}${digest}`);
        }

        if (versions.length > 50) {
          console.log(`  ... and ${versions.length - 50} more`);
        }

        return success(undefined);
      },
    },
  ],
});
