import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { load_and_resolve_project } from '../../../src/cli/utils/project.js';

const FIXTURES_DIR = path.join(import.meta.dir, '../../../e2e/fixtures/valid-project');

describe('load_and_resolve_project', () => {
  it('should load a valid project', async () => {
    const result = await load_and_resolve_project(FIXTURES_DIR);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.project_root).toBe(FIXTURES_DIR);
      expect(result.value.project.templates.length).toBeGreaterThan(0);
      expect(result.value.target_clusters.length).toBeGreaterThan(0);
    }
  });

  it('should return error for nonexistent path', async () => {
    const result = await load_and_resolve_project('/tmp/nonexistent-kustodian-project-xyz');

    expect(result.success).toBe(false);
  });

  it('should filter to a specific cluster', async () => {
    const result = await load_and_resolve_project(FIXTURES_DIR, 'local');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.target_clusters.length).toBe(1);
      expect(result.value.target_clusters[0].cluster.metadata.name).toBe('local');
    }
  });

  it('should return NOT_FOUND for nonexistent cluster', async () => {
    const result = await load_and_resolve_project(FIXTURES_DIR, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});
