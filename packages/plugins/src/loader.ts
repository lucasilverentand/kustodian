import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Errors, type ResultType, failure, is_success, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';

import type {
  KustodianPluginType,
  LoadedPluginType,
  PluginLocationInfoType,
  PluginManifestType,
  PluginSourceType,
} from './types.js';

/**
 * Plugin discovery configuration.
 */
export interface PluginDiscoveryConfigType {
  /** Directories to search for local plugins (default: ['./plugins']) */
  local_plugin_dirs?: string[];
  /** Whether to search node_modules (default: true) */
  search_node_modules?: boolean;
  /** Plugin name prefixes for npm packages (default: ['@kustodian/plugin-', 'kustodian-plugin-']) */
  npm_prefixes?: string[];
}

/**
 * Plugin loader interface.
 */
export interface PluginLoaderType {
  /**
   * Discovers available plugins from npm and local directories.
   */
  discover(): Promise<ResultType<PluginLocationInfoType[], KustodianErrorType>>;

  /**
   * Loads a plugin by name.
   */
  load(name: string): Promise<ResultType<LoadedPluginType, KustodianErrorType>>;

  /**
   * Loads a plugin from a specific path.
   */
  load_from_path(plugin_path: string): Promise<ResultType<LoadedPluginType, KustodianErrorType>>;

  /**
   * Loads multiple plugins by name.
   */
  load_all(names: string[]): Promise<ResultType<LoadedPluginType[], KustodianErrorType>>;
}

/**
 * Default npm package prefixes for plugin discovery.
 */
const DEFAULT_NPM_PREFIXES = ['@kustodian/plugin-', 'kustodian-plugin-'];

/**
 * Default local plugin directories.
 */
const DEFAULT_LOCAL_DIRS = ['./plugins'];

/**
 * Validates that an object is a valid plugin manifest.
 */
function is_valid_manifest(manifest: unknown): manifest is PluginManifestType {
  if (typeof manifest !== 'object' || manifest === null) {
    return false;
  }

  const m = manifest as Record<string, unknown>;
  return (
    typeof m['name'] === 'string' &&
    typeof m['version'] === 'string' &&
    Array.isArray(m['capabilities'])
  );
}

/**
 * Creates a new plugin loader.
 */
export function create_plugin_loader(config: PluginDiscoveryConfigType = {}): PluginLoaderType {
  const {
    local_plugin_dirs = DEFAULT_LOCAL_DIRS,
    search_node_modules = true,
    npm_prefixes = DEFAULT_NPM_PREFIXES,
  } = config;

  // Cache for loaded plugins
  const plugin_cache = new Map<string, LoadedPluginType>();

  /**
   * Discovers plugins in local directories.
   */
  async function discover_local_plugins(): Promise<PluginLocationInfoType[]> {
    const locations: PluginLocationInfoType[] = [];

    for (const dir of local_plugin_dirs) {
      const abs_dir = path.resolve(dir);
      try {
        const entries = await fs.readdir(abs_dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const plugin_path = path.join(abs_dir, entry.name);
            const package_json_path = path.join(plugin_path, 'package.json');

            try {
              await fs.access(package_json_path);
              locations.push({
                source: 'local',
                module_path: entry.name,
                resolved_path: plugin_path,
              });
            } catch {
              // Not a valid plugin directory (no package.json)
            }
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return locations;
  }

  /**
   * Discovers plugins in node_modules.
   */
  async function discover_npm_plugins(): Promise<PluginLocationInfoType[]> {
    if (!search_node_modules) {
      return [];
    }

    const locations: PluginLocationInfoType[] = [];
    const node_modules = path.resolve('./node_modules');

    try {
      const entries = await fs.readdir(node_modules, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check if it's a scoped package (@kustodian/plugin-*)
          if (entry.name.startsWith('@')) {
            try {
              const scoped_path = path.join(node_modules, entry.name);
              const scoped_entries = await fs.readdir(scoped_path, { withFileTypes: true });

              for (const scoped_entry of scoped_entries) {
                if (scoped_entry.isDirectory()) {
                  const full_name = `${entry.name}/${scoped_entry.name}`;
                  if (npm_prefixes.some((prefix) => full_name.startsWith(prefix))) {
                    locations.push({
                      source: 'npm',
                      module_path: full_name,
                      resolved_path: path.join(scoped_path, scoped_entry.name),
                    });
                  }
                }
              }
            } catch {
              // Failed to read scoped directory
            }
          } else if (npm_prefixes.some((prefix) => entry.name.startsWith(prefix))) {
            // Unscoped package (kustodian-plugin-*)
            locations.push({
              source: 'npm',
              module_path: entry.name,
              resolved_path: path.join(node_modules, entry.name),
            });
          }
        }
      }
    } catch {
      // node_modules doesn't exist
    }

    return locations;
  }

  /**
   * Loads a plugin module from a resolved path.
   */
  async function load_plugin_module(
    resolved_path: string,
    source: PluginSourceType,
  ): Promise<ResultType<LoadedPluginType, KustodianErrorType>> {
    try {
      // Read package.json to get main entry point
      const package_json_path = path.join(resolved_path, 'package.json');
      const package_content = await fs.readFile(package_json_path, 'utf-8');
      const package_json = JSON.parse(package_content) as Record<string, unknown>;

      // Determine entry point (prefer exports, then main)
      let entry_point = (package_json['main'] as string) ?? './dist/index.js';
      const exports_field = package_json['exports'];
      if (exports_field) {
        if (typeof exports_field === 'string') {
          entry_point = exports_field;
        } else if (typeof exports_field === 'object' && exports_field !== null) {
          const exports_obj = exports_field as Record<string, unknown>;
          const root_export = exports_obj['.'];
          if (typeof root_export === 'string') {
            entry_point = root_export;
          } else if (typeof root_export === 'object' && root_export !== null) {
            const root_obj = root_export as Record<string, unknown>;
            entry_point =
              (root_obj['import'] as string) ?? (root_obj['default'] as string) ?? entry_point;
          }
        }
      }

      const module_path = path.join(resolved_path, entry_point);
      const module_url = pathToFileURL(module_path).href;

      // Dynamic import
      const module = (await import(module_url)) as Record<string, unknown>;

      // Look for default export or named 'plugin' export
      const plugin = (module['default'] ?? module['plugin']) as KustodianPluginType | undefined;

      if (!plugin) {
        return failure(
          Errors.plugin_load_error(resolved_path, 'No default or named plugin export found'),
        );
      }

      // Validate manifest
      if (!plugin.manifest || !is_valid_manifest(plugin.manifest)) {
        return failure(
          Errors.plugin_load_error(resolved_path, 'Invalid or missing plugin manifest'),
        );
      }

      const loaded: LoadedPluginType = {
        plugin,
        location: {
          source,
          module_path: resolved_path,
          resolved_path,
        },
      };

      return success(loaded);
    } catch (error) {
      return failure(Errors.plugin_load_error(resolved_path, error));
    }
  }

  return {
    async discover() {
      const local = await discover_local_plugins();
      const npm = await discover_npm_plugins();
      return success([...local, ...npm]);
    },

    async load(name) {
      // Check cache
      const cached = plugin_cache.get(name);
      if (cached) {
        return success(cached);
      }

      // Discover and find
      const discover_result = await this.discover();
      if (!is_success(discover_result)) {
        return discover_result;
      }

      // Try to find by various name patterns
      const location = discover_result.value.find(
        (loc) =>
          loc.module_path === name ||
          loc.module_path.endsWith(`/${name}`) ||
          loc.module_path === `@kustodian/plugin-${name}` ||
          loc.module_path === `kustodian-plugin-${name}`,
      );

      if (!location) {
        return failure(Errors.plugin_not_found(name));
      }

      const load_result = await load_plugin_module(location.resolved_path, location.source);
      if (!is_success(load_result)) {
        return load_result;
      }

      // Cache the loaded plugin
      plugin_cache.set(name, load_result.value);
      plugin_cache.set(load_result.value.plugin.manifest.name, load_result.value);

      return success(load_result.value);
    },

    async load_from_path(plugin_path) {
      const resolved_path = path.resolve(plugin_path);

      // Check cache by resolved path
      for (const [, cached] of plugin_cache) {
        if (cached.location.resolved_path === resolved_path) {
          return success(cached);
        }
      }

      const load_result = await load_plugin_module(resolved_path, 'local');
      if (!is_success(load_result)) {
        return load_result;
      }

      // Cache the loaded plugin
      plugin_cache.set(load_result.value.plugin.manifest.name, load_result.value);

      return success(load_result.value);
    },

    async load_all(names) {
      const results: LoadedPluginType[] = [];

      for (const name of names) {
        const result = await this.load(name);
        if (!is_success(result)) {
          return result;
        }
        results.push(result.value);
      }

      return success(results);
    },
  };
}
