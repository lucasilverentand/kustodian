import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { create_cache_manager } from '../../src/sources/cache/index.js';

describe('Source Cache Manager', () => {
  let temp_dir: string;

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-cache-test-'));
  });

  afterEach(async () => {
    await fs.rm(temp_dir, { recursive: true, force: true });
  });

  it('should replace existing cached templates for the same source version', async () => {
    const cache_dir = path.join(temp_dir, 'cache');
    const content_v1 = path.join(temp_dir, 'content-v1');
    const content_v2 = path.join(temp_dir, 'content-v2');
    const cache = create_cache_manager(cache_dir);

    await fs.mkdir(content_v1, { recursive: true });
    await fs.writeFile(path.join(content_v1, 'old.yaml'), 'apiVersion: v1\n', 'utf-8');

    const put_v1 = await cache.put('my-source', 'git', 'main', content_v1, true);
    expect(put_v1.success).toBe(true);
    if (!put_v1.success) return;

    await fs.mkdir(content_v2, { recursive: true });
    await fs.writeFile(path.join(content_v2, 'new.yaml'), 'apiVersion: v2\n', 'utf-8');

    const put_v2 = await cache.put('my-source', 'git', 'main', content_v2, true);
    expect(put_v2.success).toBe(true);
    if (!put_v2.success) return;

    const old_file_exists = await fs
      .access(path.join(put_v2.value.path, 'old.yaml'))
      .then(() => true)
      .catch(() => false);
    const new_file_exists = await fs
      .access(path.join(put_v2.value.path, 'new.yaml'))
      .then(() => true)
      .catch(() => false);

    expect(old_file_exists).toBe(false);
    expect(new_file_exists).toBe(true);
  });
});
