import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { preview_command } from '../../../src/cli/commands/preview.js';
import { create_container } from '../../../src/cli/container.js';
import { create_context } from '../../../src/cli/middleware.js';

const VALID_PROJECT = path.resolve('e2e/fixtures/valid-project');
const MULTI_CLUSTER_PROJECT = path.resolve('e2e/fixtures/multi-cluster-project');

function run_preview(options: Record<string, unknown>) {
  const ctx = create_context([], options);
  const container = create_container();
  return preview_command.handler?.(ctx, container);
}

// Track temp dirs for cleanup
const temp_dirs: string[] = [];

afterEach(() => {
  for (const dir of temp_dirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  temp_dirs.length = 0;
});

describe('preview command', () => {
  it('should fall back to all clusters when --cluster is not specified', async () => {
    const output_dir = path.join(fs.mkdtempSync(path.join(import.meta.dir, '.preview-test-')));
    temp_dirs.push(output_dir);

    const result = await run_preview({
      project: VALID_PROJECT,
      'output-dir': output_dir,
    });

    expect(result.success).toBe(true);
  });

  it('should fail for nonexistent cluster', async () => {
    const result = await run_preview({
      cluster: 'nonexistent',
      project: VALID_PROJECT,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('nonexistent');
    }
  });

  it('should generate files with --output-dir', async () => {
    const output_dir = path.join(fs.mkdtempSync(path.join(import.meta.dir, '.preview-test-')));
    temp_dirs.push(output_dir);

    const result = await run_preview({
      cluster: 'local',
      project: VALID_PROJECT,
      'output-dir': output_dir,
    });

    expect(result.success).toBe(true);

    // Verify files were written
    const flux_system = path.join(output_dir, 'flux-system');
    expect(fs.existsSync(flux_system)).toBe(true);

    const templates_dir = path.join(output_dir, 'templates');
    expect(fs.existsSync(templates_dir)).toBe(true);

    // Should have example template output
    const example_dir = path.join(templates_dir, 'example');
    expect(fs.existsSync(example_dir)).toBe(true);

    // Verify YAML content
    const yaml_files = fs.readdirSync(example_dir).filter((f) => f.endsWith('.yaml'));
    expect(yaml_files.length).toBeGreaterThan(0);
  });

  it('should filter templates with --template', async () => {
    const output_dir = path.join(fs.mkdtempSync(path.join(import.meta.dir, '.preview-test-')));
    temp_dirs.push(output_dir);

    const result = await run_preview({
      cluster: 'staging',
      project: MULTI_CLUSTER_PROJECT,
      'output-dir': output_dir,
      template: 'web-app',
    });

    expect(result.success).toBe(true);

    const templates_dir = path.join(output_dir, 'templates');
    expect(fs.existsSync(templates_dir)).toBe(true);

    // Only web-app should be generated, not database
    const web_app_dir = path.join(templates_dir, 'web-app');
    expect(fs.existsSync(web_app_dir)).toBe(true);

    const database_dir = path.join(templates_dir, 'database');
    expect(fs.existsSync(database_dir)).toBe(false);
  });

  it('should fail for nonexistent template filter', async () => {
    const output_dir = path.join(fs.mkdtempSync(path.join(import.meta.dir, '.preview-test-')));
    temp_dirs.push(output_dir);

    const result = await run_preview({
      cluster: 'staging',
      project: MULTI_CLUSTER_PROJECT,
      'output-dir': output_dir,
      template: 'nonexistent',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('nonexistent');
    }
  });

  it('should support json format', async () => {
    const output_dir = path.join(fs.mkdtempSync(path.join(import.meta.dir, '.preview-test-')));
    temp_dirs.push(output_dir);

    const result = await run_preview({
      cluster: 'local',
      project: VALID_PROJECT,
      'output-dir': output_dir,
      format: 'json',
    });

    expect(result.success).toBe(true);

    // Should have .json files
    const templates_dir = path.join(output_dir, 'templates', 'example');
    const json_files = fs.readdirSync(templates_dir).filter((f) => f.endsWith('.json'));
    expect(json_files.length).toBeGreaterThan(0);
  });
});
