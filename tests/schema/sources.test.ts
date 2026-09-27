import { describe, expect, it } from 'bun:test';

import {
  is_github_source,
  is_mutable_source,
  normalize_template_source,
  validate_template_source,
} from '../../src/schema/sources.js';

describe('Template Source Schema', () => {
  describe('git source', () => {
    it('accepts a git source with a tag ref', () => {
      const result = validate_template_source({
        name: 'apps',
        git: {
          url: 'https://example.com/repo.git',
          ref: { tag: 'v1.0.0' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects when no source variant is specified', () => {
      const result = validate_template_source({ name: 'apps' });
      expect(result.success).toBe(false);
    });

    it('rejects when more than one variant is specified', () => {
      const result = validate_template_source({
        name: 'apps',
        git: { url: 'https://example.com/repo.git', ref: { tag: 'v1' } },
        http: { url: 'https://example.com/archive.tar.gz' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('github source - object form', () => {
    it('accepts a github source with a tag', () => {
      const result = validate_template_source({
        name: 'apps',
        github: {
          repo: 'octocat/hello-world',
          ref: { tag: 'v2.3.4' },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(is_github_source(result.data)).toBe(true);
      }
    });

    it('accepts a github source with a sub-path', () => {
      const result = validate_template_source({
        name: 'apps',
        github: {
          repo: 'octocat/hello-world',
          ref: { branch: 'main' },
          path: 'examples/template',
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid repo identifier', () => {
      const result = validate_template_source({
        name: 'apps',
        github: { repo: 'no-slash', ref: { tag: 'v1' } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects when no ref kind is specified', () => {
      const result = validate_template_source({
        name: 'apps',
        github: { repo: 'octocat/hello-world', ref: {} },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('github source - shorthand string form', () => {
    it('parses a tag-shaped ref', () => {
      const result = validate_template_source({
        name: 'apps',
        github: 'octocat/hello-world@v1.2.3',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.github).toEqual({
          repo: 'octocat/hello-world',
          ref: { tag: 'v1.2.3' },
        });
      }
    });

    it('parses a branch-shaped ref', () => {
      const result = validate_template_source({
        name: 'apps',
        github: 'octocat/hello-world@main',
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.github && typeof result.data.github !== 'string') {
        expect(result.data.github.ref).toEqual({ branch: 'main' });
      }
    });

    it('parses a 40-char commit SHA as a commit ref', () => {
      const sha = 'a'.repeat(40);
      const result = validate_template_source({
        name: 'apps',
        github: `octocat/hello-world@${sha}`,
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.github && typeof result.data.github !== 'string') {
        expect(result.data.github.ref).toEqual({ commit: sha });
      }
    });

    it('parses a sub-path after a colon', () => {
      const result = validate_template_source({
        name: 'apps',
        github: 'octocat/hello-world@v1.0.0:apps/web',
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.github && typeof result.data.github !== 'string') {
        expect(result.data.github).toEqual({
          repo: 'octocat/hello-world',
          ref: { tag: 'v1.0.0' },
          path: 'apps/web',
        });
      }
    });

    it('rejects shorthand without an @ ref', () => {
      const result = validate_template_source({
        name: 'apps',
        github: 'octocat/hello-world',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('normalize_template_source', () => {
    it('rewrites a github source to the equivalent git source', () => {
      const parsed = validate_template_source({
        name: 'apps',
        github: 'octocat/hello-world@v1.0.0:apps/web',
        ttl: '1h',
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const normalized = normalize_template_source(parsed.data);
      expect(normalized.git).toEqual({
        url: 'https://github.com/octocat/hello-world.git',
        ref: { tag: 'v1.0.0' },
        path: 'apps/web',
      });
      expect(normalized.github).toBeUndefined();
      expect(normalized.ttl).toBe('1h');
    });

    it('passes through non-github sources unchanged', () => {
      const parsed = validate_template_source({
        name: 'apps',
        git: { url: 'https://example.com/repo.git', ref: { tag: 'v1.0.0' } },
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(normalize_template_source(parsed.data)).toBe(parsed.data);
    });
  });

  describe('is_mutable_source', () => {
    it('treats github branches as mutable', () => {
      const parsed = validate_template_source({
        name: 'apps',
        github: 'octocat/hello-world@main',
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(is_mutable_source(parsed.data)).toBe(true);
    });

    it('treats github tags as immutable', () => {
      const parsed = validate_template_source({
        name: 'apps',
        github: 'octocat/hello-world@v1.0.0',
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(is_mutable_source(parsed.data)).toBe(false);
    });
  });
});
