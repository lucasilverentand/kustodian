import { describe, expect, it } from 'bun:test';
import { create_git_fetcher } from '../../../src/sources/fetchers/git.js';

describe('GitFetcher', () => {
  const fetcher = create_git_fetcher();

  describe('fetch', () => {
    it('rejects URLs starting with a dash to prevent argument injection', async () => {
      const result = await fetcher.fetch({
        name: 'malicious',
        git: {
          url: '--upload-pack=malicious',
          ref: { branch: 'main' },
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Invalid git URL');
      }
    });
  });

  describe('list_versions', () => {
    it('rejects URLs starting with a dash to prevent argument injection', async () => {
      const result = await fetcher.list_versions({
        name: 'malicious',
        git: {
          url: '--upload-pack=malicious',
          ref: { branch: 'main' },
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Invalid git URL');
      }
    });
  });
});
