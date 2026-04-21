import { describe, expect, it } from 'bun:test';
import {
  empty_diff_stats,
  format_line_counts,
  format_resource_counts,
  has_changes,
  merge_diff_stats,
  parse_diff_stats,
  render_summary_table,
  total_resources,
} from '../../../src/cli/utils/diff-stats.js';

describe('parse_diff_stats', () => {
  it('returns zeros for empty output', () => {
    const stats = parse_diff_stats('');
    expect(stats).toEqual(empty_diff_stats());
  });

  it('counts added and removed lines from a unified diff', () => {
    const diff = [
      'diff -u a.yaml b.yaml',
      '--- a/old.yaml',
      '+++ b/new.yaml',
      '@@ -1,3 +1,3 @@',
      ' apiVersion: v1',
      '-  replicas: 1',
      '+  replicas: 3',
      '+  newField: yes',
    ].join('\n');

    const stats = parse_diff_stats(diff);
    expect(stats.lines_added).toBe(2);
    expect(stats.lines_removed).toBe(1);
    expect(stats.resources_created).toBe(0);
    expect(stats.resources_modified).toBe(0);
    expect(stats.resources_deleted).toBe(0);
  });

  it('ignores unified diff file headers', () => {
    const diff = ['--- a/file', '+++ b/file', ''].join('\n');
    const stats = parse_diff_stats(diff);
    expect(stats.lines_added).toBe(0);
    expect(stats.lines_removed).toBe(0);
  });

  it('counts flux diff resource statuses', () => {
    const diff = [
      '► Deployment/default/app drifted',
      '✚ ConfigMap/kube-system/new-config created',
      '✗ Service/legacy/old deleted',
      '► HelmRelease/apps/podinfo drifted',
    ].join('\n');

    const stats = parse_diff_stats(diff);
    expect(stats.resources_created).toBe(1);
    expect(stats.resources_modified).toBe(2);
    expect(stats.resources_deleted).toBe(1);
  });

  it('strips ANSI escape sequences before matching', () => {
    const diff = '\x1b[31m► Deployment/default/app drifted\x1b[0m';
    const stats = parse_diff_stats(diff);
    expect(stats.resources_modified).toBe(1);
  });

  it('handles mixed kubectl and flux output in the same blob', () => {
    const diff = [
      '--- a/deploy.yaml',
      '+++ b/deploy.yaml',
      '-  image: foo:1',
      '+  image: foo:2',
      '► Deployment/default/foo drifted',
    ].join('\n');

    const stats = parse_diff_stats(diff);
    expect(stats.lines_added).toBe(1);
    expect(stats.lines_removed).toBe(1);
    expect(stats.resources_modified).toBe(1);
  });
});

describe('merge_diff_stats', () => {
  it('sums each field independently', () => {
    const merged = merge_diff_stats(
      {
        resources_created: 1,
        resources_modified: 2,
        resources_deleted: 3,
        lines_added: 4,
        lines_removed: 5,
      },
      {
        resources_created: 10,
        resources_modified: 20,
        resources_deleted: 30,
        lines_added: 40,
        lines_removed: 50,
      },
    );

    expect(merged.resources_created).toBe(11);
    expect(merged.resources_modified).toBe(22);
    expect(merged.resources_deleted).toBe(33);
    expect(merged.lines_added).toBe(44);
    expect(merged.lines_removed).toBe(55);
  });
});

describe('has_changes and total_resources', () => {
  it('reports no changes for an empty stats object', () => {
    const stats = empty_diff_stats();
    expect(has_changes(stats)).toBe(false);
    expect(total_resources(stats)).toBe(0);
  });

  it('reports changes when any line or resource count is non-zero', () => {
    expect(has_changes({ ...empty_diff_stats(), lines_added: 1 })).toBe(true);
    expect(has_changes({ ...empty_diff_stats(), resources_modified: 1 })).toBe(true);
  });
});

describe('formatters', () => {
  it('formats line counts with +/- prefixes', () => {
    expect(format_line_counts({ ...empty_diff_stats(), lines_added: 3, lines_removed: 2 })).toBe(
      '+3 -2',
    );
  });

  it('returns em dash when there are no line changes', () => {
    expect(format_line_counts(empty_diff_stats())).toBe('—');
  });

  it('formats resource counts with labels', () => {
    expect(
      format_resource_counts({
        ...empty_diff_stats(),
        resources_created: 1,
        resources_modified: 2,
        resources_deleted: 3,
      }),
    ).toBe('1 created, 2 modified, 3 deleted');
  });
});

describe('render_summary_table', () => {
  it('includes a row per cluster with change counts', () => {
    const table = render_summary_table(
      [
        {
          cluster: 'prod',
          stats: {
            resources_created: 1,
            resources_modified: 2,
            resources_deleted: 0,
            lines_added: 10,
            lines_removed: 3,
          },
        },
        {
          cluster: 'staging',
          stats: empty_diff_stats(),
        },
        {
          cluster: 'dev',
          stats: empty_diff_stats(),
          error: 'unreachable',
        },
      ],
      { color: false },
    );

    expect(table).toContain('Cluster');
    expect(table).toContain('Status');
    expect(table).toContain('Lines');
    expect(table).toContain('prod');
    expect(table).toContain('staging');
    expect(table).toContain('dev');
    expect(table).toContain('+10');
    expect(table).toContain('-3');
    expect(table).toContain('changed');
    expect(table).toContain('no changes');
    expect(table).toContain('error');
    expect(table).toContain('unreachable');
  });

  it('pads rows to align columns regardless of color escapes', () => {
    const table = render_summary_table(
      [
        { cluster: 'a', stats: { ...empty_diff_stats(), lines_added: 1 } },
        { cluster: 'bbbbbb', stats: empty_diff_stats() },
      ],
      { color: true },
    );

    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes
    const ansi_re = /\x1b\[[0-9;]*[a-zA-Z]/g;
    const rows = table.split('\n').filter((line) => line.startsWith('│'));
    expect(rows.length).toBe(3);
    const visible_widths = new Set(rows.map((line) => line.replace(ansi_re, '').length));
    expect(visible_widths.size).toBe(1);
  });
});
