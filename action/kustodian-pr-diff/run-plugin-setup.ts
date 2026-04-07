#!/usr/bin/env bun

/**
 * Discovers kustodian plugins and runs their CI setup scripts.
 *
 * Scans both global (bun -g) and local node_modules for packages matching
 * kustodian plugin naming conventions. If a package declares a `kustodian.ci.setup`
 * field in its package.json, the referenced script is executed.
 *
 * Usage: run-plugin-setup.ts [project-path]
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const project_path = process.argv[2] || '.';

const PLUGIN_PREFIXES = ['kustodian-', 'kustodian-plugin-'];
const SCOPED_PREFIXES = ['@kustodian/plugin-'];

function find_global_node_modules(): string | undefined {
  try {
    const kustodian_bin = execSync('which kustodian', { encoding: 'utf-8' }).trim();
    const real_bin = realpathSync(kustodian_bin);
    const segments = real_bin.split('/node_modules/');
    if (segments.length >= 2) {
      return `${segments[0]}/node_modules`;
    }
  } catch {
    // kustodian not installed globally
  }
  return undefined;
}

function is_directory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function find_plugin_packages(node_modules: string): string[] {
  if (!existsSync(node_modules)) return [];

  const packages: string[] = [];

  // Check kustodian core itself
  const kustodian_dir = join(node_modules, 'kustodian');
  if (existsSync(join(kustodian_dir, 'package.json'))) {
    packages.push(kustodian_dir);
  }

  try {
    for (const name of readdirSync(node_modules)) {
      const entry_path = join(node_modules, name);

      if (name.startsWith('@') && is_directory(entry_path)) {
        // Scoped packages
        try {
          for (const sub of readdirSync(entry_path)) {
            const full_name = `${name}/${sub}`;
            if (SCOPED_PREFIXES.some((p) => full_name.startsWith(p))) {
              packages.push(join(entry_path, sub));
            }
          }
        } catch {
          // Can't read scoped dir
        }
      } else if (PLUGIN_PREFIXES.some((p) => name.startsWith(p))) {
        packages.push(entry_path);
      }
    }
  } catch {
    // Can't read node_modules
  }

  return packages;
}

// Collect search paths
const search_paths: string[] = [];

if (!process.env.KUSTODIAN_SKIP_GLOBAL) {
  const global_modules = find_global_node_modules();
  if (global_modules) search_paths.push(global_modules);
}

const local_modules = resolve(project_path, 'node_modules');
if (existsSync(local_modules)) search_paths.push(local_modules);

// Discover and run setup scripts
const seen = new Set<string>();
let ran = 0;

for (const search_path of search_paths) {
  for (const pkg_dir of find_plugin_packages(search_path)) {
    const pkg_json_path = join(pkg_dir, 'package.json');
    if (!existsSync(pkg_json_path)) continue;

    const pkg = JSON.parse(readFileSync(pkg_json_path, 'utf-8'));
    const name: string = pkg.name;

    if (seen.has(name)) continue;
    seen.add(name);

    const setup: string | undefined = pkg.kustodian?.ci?.setup;
    if (!setup) continue;

    const script_path = join(pkg_dir, setup);
    if (!existsSync(script_path)) {
      console.warn(`Warning: CI setup script not found: ${setup} (declared by ${name})`);
      continue;
    }

    console.log(`Running CI setup for ${name}...`);
    try {
      execSync(`bash "${script_path}"`, { stdio: 'inherit' });
      ran++;
    } catch {
      console.error(`CI setup failed for ${name}`);
      process.exit(1);
    }
  }
}

if (ran > 0) {
  console.log(`Completed ${ran} plugin setup script${ran !== 1 ? 's' : ''}`);
} else {
  console.log('No plugin CI setup scripts found');
}
