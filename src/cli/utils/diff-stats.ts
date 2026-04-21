/**
 * Parse flux/kubectl diff output and render per-cluster summary tables.
 *
 * `flux diff kustomization` and `kubectl diff` emit unified-diff style output
 * with per-resource status markers. We walk the output line-by-line and
 * accumulate:
 *   - resources created / modified / deleted (by status keyword)
 *   - line-level additions / removals (git-status style)
 */

export interface DiffStatsType {
  resources_created: number;
  resources_modified: number;
  resources_deleted: number;
  lines_added: number;
  lines_removed: number;
}

export interface ClusterDiffStatsType {
  cluster: string;
  stats: DiffStatsType;
  error?: string;
  skipped?: string;
}

export function empty_diff_stats(): DiffStatsType {
  return {
    resources_created: 0,
    resources_modified: 0,
    resources_deleted: 0,
    lines_added: 0,
    lines_removed: 0,
  };
}

export function total_resources(stats: DiffStatsType): number {
  return stats.resources_created + stats.resources_modified + stats.resources_deleted;
}

export function has_changes(stats: DiffStatsType): boolean {
  return total_resources(stats) > 0 || stats.lines_added > 0 || stats.lines_removed > 0;
}

export function merge_diff_stats(a: DiffStatsType, b: DiffStatsType): DiffStatsType {
  return {
    resources_created: a.resources_created + b.resources_created,
    resources_modified: a.resources_modified + b.resources_modified,
    resources_deleted: a.resources_deleted + b.resources_deleted,
    lines_added: a.lines_added + b.lines_added,
    lines_removed: a.lines_removed + b.lines_removed,
  };
}

/**
 * Strip ANSI escape sequences so regex matching is reliable.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes start with ESC
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Detect lines that announce a per-resource status in flux/kubectl diff output.
 *
 * Flux 2.x emits lines such as:
 *   ► Deployment/default/app drifted
 *   ✚ ConfigMap/kube-system/new created
 *   ✗ Service/legacy/old deleted
 *
 * kubectl diff emits unified-diff file headers — those are recognized through
 * the `+++`/`---` prefixes below instead.
 */
const RESOURCE_STATUS_RE =
  /^\s*(?:[►✚✗►»!+\-~*]|[►])?\s*[A-Za-z][A-Za-z0-9.]*\/\S+\s+(?:is\s+)?(created|modified|drifted|deleted|added|removed|configured|pruned)\b/i;

/**
 * Count additions/deletions and per-resource status lines from a diff blob.
 */
export function parse_diff_stats(output: string): DiffStatsType {
  const stats = empty_diff_stats();
  if (!output) return stats;

  const clean = output.replace(ANSI_RE, '');
  for (const raw_line of clean.split('\n')) {
    const line = raw_line.replace(/\r$/, '');

    // Unified-diff file headers — skip so they do not inflate line counts.
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('diff ')) continue;

    if (line.startsWith('+')) stats.lines_added += 1;
    else if (line.startsWith('-')) stats.lines_removed += 1;

    const match = line.match(RESOURCE_STATUS_RE);
    if (match) {
      const status = match[1]?.toLowerCase();
      if (status === 'created' || status === 'added') stats.resources_created += 1;
      else if (status === 'deleted' || status === 'removed' || status === 'pruned')
        stats.resources_deleted += 1;
      else stats.resources_modified += 1;
    }
  }

  return stats;
}

/**
 * Format a git-status-style "+A -R" hint for a cluster row.
 */
export function format_line_counts(stats: DiffStatsType): string {
  const parts: string[] = [];
  if (stats.lines_added) parts.push(`+${stats.lines_added}`);
  if (stats.lines_removed) parts.push(`-${stats.lines_removed}`);
  return parts.length > 0 ? parts.join(' ') : '—';
}

/**
 * Format a resource summary like "3 modified, 1 created".
 */
export function format_resource_counts(stats: DiffStatsType): string {
  const parts: string[] = [];
  if (stats.resources_created) parts.push(`${stats.resources_created} created`);
  if (stats.resources_modified) parts.push(`${stats.resources_modified} modified`);
  if (stats.resources_deleted) parts.push(`${stats.resources_deleted} deleted`);
  return parts.length > 0 ? parts.join(', ') : '—';
}

interface TableColumn {
  header: string;
  align?: 'left' | 'right';
}

function pad(value: string, width: number, align: 'left' | 'right'): string {
  const visible = visible_length(value);
  if (visible >= width) return value;
  const padding = ' '.repeat(width - visible);
  return align === 'right' ? padding + value : value + padding;
}

// ANSI-aware length so colored strings still align.
function visible_length(value: string): number {
  return value.replace(ANSI_RE, '').length;
}

function render_table(columns: TableColumn[], rows: string[][]): string {
  const widths = columns.map((col, idx) => {
    const header_width = visible_length(col.header);
    const data_width = rows.reduce((max, row) => Math.max(max, visible_length(row[idx] ?? '')), 0);
    return Math.max(header_width, data_width);
  });

  const render_row = (row: string[]) =>
    `│ ${row
      .map((cell, idx) => {
        const width = widths[idx] ?? 0;
        const align = columns[idx]?.align ?? 'left';
        return pad(cell ?? '', width, align);
      })
      .join(' │ ')} │`;

  const border = (left: string, mid: string, right: string) =>
    left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right;

  const lines: string[] = [];
  lines.push(border('┌', '┬', '┐'));
  lines.push(render_row(columns.map((c) => c.header)));
  lines.push(border('├', '┼', '┤'));
  for (const row of rows) lines.push(render_row(row));
  lines.push(border('└', '┴', '┘'));
  return lines.join('\n');
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function color(value: string, code: string, use_color: boolean): string {
  return use_color ? `${code}${value}${RESET}` : value;
}

function status_cell(entry: ClusterDiffStatsType, use_color: boolean): string {
  if (entry.error) return color('error', RED, use_color);
  if (entry.skipped) return color('skipped', YELLOW, use_color);
  if (!has_changes(entry.stats)) return color('no changes', DIM, use_color);
  return color('changed', YELLOW, use_color);
}

function changes_cell(entry: ClusterDiffStatsType, use_color: boolean): string {
  if (entry.error) return entry.error;
  if (entry.skipped) return entry.skipped;
  if (!has_changes(entry.stats)) return color('—', DIM, use_color);

  const added = entry.stats.lines_added
    ? color(`+${entry.stats.lines_added}`, GREEN, use_color)
    : '';
  const removed = entry.stats.lines_removed
    ? color(`-${entry.stats.lines_removed}`, RED, use_color)
    : '';
  return [added, removed].filter(Boolean).join(' ') || color('—', DIM, use_color);
}

function resources_cell(entry: ClusterDiffStatsType, use_color: boolean): string {
  if (entry.error || entry.skipped) return color('—', DIM, use_color);
  if (!has_changes(entry.stats)) return color('—', DIM, use_color);

  const parts: string[] = [];
  if (entry.stats.resources_created)
    parts.push(color(`+${entry.stats.resources_created}`, GREEN, use_color));
  if (entry.stats.resources_modified)
    parts.push(color(`~${entry.stats.resources_modified}`, YELLOW, use_color));
  if (entry.stats.resources_deleted)
    parts.push(color(`-${entry.stats.resources_deleted}`, RED, use_color));
  return parts.length > 0 ? parts.join(' ') : color('—', DIM, use_color);
}

/**
 * Render a per-cluster summary table.
 */
export function render_summary_table(
  entries: ClusterDiffStatsType[],
  options: { color?: boolean } = {},
): string {
  const use_color = options.color ?? true;
  const rows = entries.map((entry) => [
    color(entry.cluster, BOLD, use_color),
    status_cell(entry, use_color),
    resources_cell(entry, use_color),
    changes_cell(entry, use_color),
  ]);

  return render_table(
    [
      { header: 'Cluster' },
      { header: 'Status' },
      { header: 'Resources', align: 'left' },
      { header: 'Lines', align: 'left' },
    ],
    rows,
  );
}
