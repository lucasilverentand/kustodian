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

export interface ClusterDiffSectionType {
  title: string;
  output: string;
}

export interface ClusterDiffStatsType {
  cluster: string;
  stats: DiffStatsType;
  error?: string;
  skipped?: string;
  sections?: ClusterDiffSectionType[];
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

// ---------------------------------------------------------------------------
// Markdown PR comment rendering
// ---------------------------------------------------------------------------

/**
 * Sentinel used to locate a previously-posted kustodian PR diff comment so
 * the GitHub Action can update it in place instead of stacking duplicates.
 */
export const PR_COMMENT_MARKER = '<!-- kustodian-pr-diff -->';

const STATUS_EMOJI = {
  changed: '🔵',
  no_changes: '✅',
  error: '❌',
  skipped: '⏭️',
};

function markdown_status_emoji(entry: ClusterDiffStatsType): string {
  if (entry.error) return STATUS_EMOJI.error;
  if (entry.skipped) return STATUS_EMOJI.skipped;
  if (!has_changes(entry.stats)) return STATUS_EMOJI.no_changes;
  return STATUS_EMOJI.changed;
}

function markdown_status_label(entry: ClusterDiffStatsType): string {
  if (entry.error) return 'error';
  if (entry.skipped) return 'skipped';
  if (!has_changes(entry.stats)) return 'no changes';
  return 'changed';
}

function markdown_resources_cell(entry: ClusterDiffStatsType): string {
  if (entry.error || entry.skipped || !has_changes(entry.stats)) return '—';
  const parts: string[] = [];
  if (entry.stats.resources_created) parts.push(`+${entry.stats.resources_created}`);
  if (entry.stats.resources_modified) parts.push(`~${entry.stats.resources_modified}`);
  if (entry.stats.resources_deleted) parts.push(`-${entry.stats.resources_deleted}`);
  return parts.length > 0 ? parts.join(' ') : '—';
}

function markdown_lines_cell(entry: ClusterDiffStatsType): string {
  if (entry.error) return `\`${escape_markdown_code(entry.error)}\``;
  if (entry.skipped) return entry.skipped;
  if (!has_changes(entry.stats)) return '—';
  const parts: string[] = [];
  if (entry.stats.lines_added) parts.push(`+${entry.stats.lines_added}`);
  if (entry.stats.lines_removed) parts.push(`-${entry.stats.lines_removed}`);
  return parts.length > 0 ? parts.join(' ') : '—';
}

function escape_markdown_code(value: string): string {
  // Backticks break inline code spans. Trim and escape them.
  return value.replace(/`/g, "'").replace(/\r?\n/g, ' ').trim();
}

function fence_diff(output: string): string {
  // Strip ANSI and normalize trailing whitespace, then wrap in a ```diff fence.
  const clean = output.replace(ANSI_RE, '').trimEnd();
  // A code fence of 4 backticks is needed if the diff itself contains triple
  // backticks — this is rare in k8s diffs, but be defensive.
  const fence = clean.includes('```') ? '````' : '```';
  return `${fence}diff\n${clean}\n${fence}`;
}

export interface MarkdownReportOptions {
  title?: string;
  /** If provided, included in the header (e.g. "production" or "all clusters"). */
  scope?: string;
  /**
   * Truncate the comment to this byte length (approx). GitHub comments max
   * out around 65k chars; default to a conservative 60k.
   */
  max_length?: number;
}

/**
 * Render the full PR-ready markdown document (including the detection marker).
 *
 * Structure:
 *   1. Hidden marker
 *   2. Heading + short status line
 *   3. Summary table
 *   4. Per-cluster <details> blocks with raw diff blobs
 *   5. Footer signature
 */
export function render_markdown_report(
  entries: ClusterDiffStatsType[],
  options: MarkdownReportOptions = {},
): string {
  const title = options.title ?? 'Kustodian Cluster Diff';
  const scope = options.scope ? ` — \`${options.scope}\`` : '';
  const max_length = options.max_length ?? 60000;

  const error_count = entries.filter((e) => e.error).length;
  const changed_count = entries.filter(
    (e) => !e.error && !e.skipped && has_changes(e.stats),
  ).length;
  const clean_count = entries.filter((e) => !e.error && !e.skipped && !has_changes(e.stats)).length;
  const skipped_count = entries.filter((e) => e.skipped).length;

  const total_lines_added = entries.reduce((sum, e) => sum + e.stats.lines_added, 0);
  const total_lines_removed = entries.reduce((sum, e) => sum + e.stats.lines_removed, 0);

  const parts: string[] = [];
  parts.push(PR_COMMENT_MARKER);
  parts.push(`### ${title}${scope}`);
  parts.push('');

  if (entries.length === 0) {
    parts.push('_No clusters were diffed._');
    return parts.join('\n');
  }

  const status_bits: string[] = [];
  if (changed_count) status_bits.push(`**${changed_count}** changed`);
  if (clean_count) status_bits.push(`${clean_count} unchanged`);
  if (error_count) status_bits.push(`${error_count} errored`);
  if (skipped_count) status_bits.push(`${skipped_count} skipped`);
  const line_bits: string[] = [];
  if (total_lines_added) line_bits.push(`+${total_lines_added}`);
  if (total_lines_removed) line_bits.push(`-${total_lines_removed}`);

  const summary_line = [status_bits.join(', '), line_bits.join(' ') || '']
    .filter(Boolean)
    .join(' — ');
  parts.push(summary_line);
  parts.push('');

  // Markdown summary table
  parts.push('| Cluster | Status | Resources | Lines |');
  parts.push('|---------|--------|-----------|-------|');
  for (const entry of entries) {
    parts.push(
      `| **${entry.cluster}** | ${markdown_status_emoji(entry)} ${markdown_status_label(entry)} | ${markdown_resources_cell(entry)} | ${markdown_lines_cell(entry)} |`,
    );
  }
  parts.push('');

  // Per-cluster detail blocks
  for (const entry of entries) {
    if (entry.error) {
      parts.push(
        `<details>\n<summary>${markdown_status_emoji(entry)} <b>${entry.cluster}</b> — error</summary>\n`,
      );
      parts.push('```');
      parts.push(entry.error);
      parts.push('```');
      parts.push('</details>');
      parts.push('');
      continue;
    }

    if (entry.skipped) {
      parts.push(
        `<details>\n<summary>${markdown_status_emoji(entry)} <b>${entry.cluster}</b> — ${entry.skipped}</summary>\n</details>`,
      );
      parts.push('');
      continue;
    }

    if (!has_changes(entry.stats)) {
      // Keep no-change clusters off the detail list to reduce noise; they
      // already appear in the summary table.
      continue;
    }

    const sections = entry.sections ?? [];
    const resources_hint = markdown_resources_cell(entry);
    const lines_hint = markdown_lines_cell(entry);
    parts.push(
      `<details open>\n<summary>${markdown_status_emoji(entry)} <b>${entry.cluster}</b> — ${resources_hint} resources, ${lines_hint} lines</summary>\n`,
    );

    if (sections.length === 0) {
      parts.push('_No detailed diff output captured._');
    } else {
      for (const section of sections) {
        if (!section.output.trim()) continue;
        parts.push(`**${section.title}**`);
        parts.push('');
        parts.push(fence_diff(section.output));
        parts.push('');
      }
    }

    parts.push('</details>');
    parts.push('');
  }

  parts.push('---');
  parts.push(
    '<sub>Generated by <a href="https://github.com/lucasilverentand/kustodian">Kustodian</a></sub>',
  );

  let result = parts.join('\n');

  if (result.length > max_length) {
    result = result.slice(0, max_length);
    // Balance any dangling code fences or <details> tags
    const open_code = (result.match(/```/g) ?? []).length;
    if (open_code % 2 !== 0) result += '\n```';
    const open_details = (result.match(/<details(?:\s[^>]*)?>/g) ?? []).length;
    const close_details = (result.match(/<\/details>/g) ?? []).length;
    for (let i = 0; i < open_details - close_details; i++) result += '\n</details>';
    result += '\n\n_Comment truncated — see the workflow logs for the full diff._';
  }

  return result;
}
