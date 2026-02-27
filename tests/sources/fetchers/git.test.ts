import { describe, expect, it } from 'bun:test';
import { create_git_fetcher } from '../../../src/sources/fetchers/git.js';

describe('GitFetcher', () => {
  const fetcher = create_git_fetcher();

  describe('fetch', () => {
    it('rejects URLs starting with a dash to prevent argument injection', async () => {
      await expect(
        fetcher.fetch({
          name: 'malicious',
          git: {
            url: '--upload-pack=malicious',
            ref: { branch: 'main' },
          },
        }),
      ).rejects.toThrow('must not start with "-"');
    });
  });

  describe('list_versions', () => {
    it('rejects URLs starting with a dash to prevent argument injection', async () => {
      await expect(
        fetcher.list_versions({
          name: 'malicious',
          git: {
            url: '--upload-pack=malicious',
            ref: { branch: 'main' },
          },
        }),
      ).rejects.toThrow('must not start with "-"');
    });
  });
});
