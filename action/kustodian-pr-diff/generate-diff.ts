#!/usr/bin/env bun

/**
 * Generates manifest diffs between two kustodian preview output directories.
 *
 * Modes:
 *   ci       - Write HTML report, JSON summary, and PR comment markdown to files (default for CI)
 *   terminal - Print colorized diff to stdout (for local use)
 *   comment  - Print PR comment markdown to stdout
 *
 * Usage:
 *   generate-diff.ts --mode ci       <base-dir> <pr-dir> <output-html> <output-summary> <output-comment>
 *   generate-diff.ts --mode terminal <base-dir> <pr-dir>
 *   generate-diff.ts --mode comment  <base-dir> <pr-dir>
 *   generate-diff.ts <base-dir> <pr-dir> <output-html> <output-summary> <output-comment>  # legacy CI mode
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

// --- Argument parsing ---

type Mode = 'ci' | 'terminal' | 'comment';

function parse_args(): {
  mode: Mode;
  base_dir: string;
  pr_dir: string;
  output_html?: string;
  output_summary?: string;
  output_comment?: string;
} {
  const args = process.argv.slice(2);
  let mode: Mode = 'ci';
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1] as Mode;
      if (!['ci', 'terminal', 'comment'].includes(mode)) {
        console.error(`Unknown mode: ${mode}. Expected: ci, terminal, comment`);
        process.exit(1);
      }
      i++; // skip value
    } else {
      positional.push(args[i] as string);
    }
  }

  const [base_dir, pr_dir, output_html, output_summary, output_comment] = positional;

  if (!base_dir || !pr_dir) {
    console.error(
      'Usage:\n' +
        '  generate-diff.ts --mode ci       <base-dir> <pr-dir> <output-html> <output-summary> <output-comment>\n' +
        '  generate-diff.ts --mode terminal <base-dir> <pr-dir>\n' +
        '  generate-diff.ts --mode comment  <base-dir> <pr-dir>',
    );
    process.exit(1);
  }

  if (mode === 'ci' && (!output_html || !output_summary || !output_comment)) {
    console.error(
      'CI mode requires: <base-dir> <pr-dir> <output-html> <output-summary> <output-comment>',
    );
    process.exit(1);
  }

  return { mode, base_dir, pr_dir, output_html, output_summary, output_comment };
}

const config = parse_args();

// --- File discovery ---

function walk_dir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];

  function recurse(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        recurse(full);
      } else if (entry.isFile() && /\.(ya?ml|json)$/.test(entry.name)) {
        results.push(relative(dir, full));
      }
    }
  }

  recurse(dir);
  return results.sort();
}

// --- Diff helpers ---

function escape_html(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function get_unified_diff(file_a: string, file_b: string, label: string): string {
  const result = spawnSync(
    'diff',
    ['-u', '--label', `a/${label}`, '--label', `b/${label}`, file_a, file_b],
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
  );
  return result.stdout || '';
}

// --- Collect changes ---

type FileChange = {
  path: string;
  status: 'added' | 'removed' | 'modified';
  diff_lines?: string[];
  content?: string;
};

const base_files = new Set(walk_dir(config.base_dir));
const pr_files = new Set(walk_dir(config.pr_dir));
const all_files = [...new Set([...base_files, ...pr_files])].sort();

const changes: FileChange[] = [];

for (const file of all_files) {
  const in_base = base_files.has(file);
  const in_pr = pr_files.has(file);

  if (in_pr && !in_base) {
    changes.push({
      path: file,
      status: 'added',
      content: readFileSync(join(config.pr_dir, file), 'utf-8'),
    });
  } else if (in_base && !in_pr) {
    changes.push({
      path: file,
      status: 'removed',
      content: readFileSync(join(config.base_dir, file), 'utf-8'),
    });
  } else {
    const base_content = readFileSync(join(config.base_dir, file), 'utf-8');
    const pr_content = readFileSync(join(config.pr_dir, file), 'utf-8');

    if (base_content !== pr_content) {
      const diff = get_unified_diff(join(config.base_dir, file), join(config.pr_dir, file), file);
      const lines = diff.split('\n');
      // Skip the --- and +++ header lines (indices 0 and 1)
      changes.push({ path: file, status: 'modified', diff_lines: lines.slice(2) });
    }
  }
}

const added = changes.filter((c) => c.status === 'added');
const modified = changes.filter((c) => c.status === 'modified');
const removed = changes.filter((c) => c.status === 'removed');

// --- Shared helpers ---

/** Try to extract the Kubernetes kind and name from YAML content */
function parse_k8s_identity(content: string): string | undefined {
  const kind_match = content.match(/^kind:\s*(.+)/m);
  const name_match = content.match(/^\s+name:\s*(.+)/m);
  if (!kind_match) return undefined;
  const kind = kind_match[1]?.trim();
  const name = name_match ? name_match[1]?.trim() : undefined;
  return name ? `${kind}/${name}` : kind;
}

/** Get a human label for a change: k8s identity or just the filename */
function get_change_label(change: FileChange): string {
  let content: string | undefined;
  if (change.content) {
    content = change.content;
  } else if (change.status === 'modified') {
    try {
      content = readFileSync(join(config.pr_dir, change.path), 'utf-8');
    } catch {
      // Ignore
    }
  }
  const identity = content ? parse_k8s_identity(content) : undefined;
  return identity ?? change.path.split('/').pop() ?? change.path;
}

/** Group changes by cluster (first path segment) */
function group_by_cluster(items: FileChange[]): Map<string, FileChange[]> {
  const groups = new Map<string, FileChange[]>();
  for (const item of items) {
    const cluster = item.path.split('/')[0] ?? 'default';
    const list = groups.get(cluster) ?? [];
    list.push(item);
    groups.set(cluster, list);
  }
  return groups;
}

// ============================================================
// Terminal mode — colorized output for local use
// ============================================================

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';

function render_terminal(): void {
  if (!changes.length) {
    console.log(
      `\n${GREEN}${BOLD}✓ No manifest changes detected — no clusters affected.${RESET}\n`,
    );
    return;
  }

  const grouped = group_by_cluster(changes);
  const cluster_names = [...grouped.keys()];

  // Header
  console.log(`\n${BOLD}━━━ Kustodian Diff ━━━${RESET}`);
  console.log(`  ${BOLD}Clusters affected:${RESET} ${cluster_names.join(', ')}`);
  const stats = [
    added.length ? `${GREEN}+${added.length} added${RESET}` : '',
    modified.length ? `${YELLOW}~${modified.length} modified${RESET}` : '',
    removed.length ? `${RED}-${removed.length} removed${RESET}` : '',
  ]
    .filter(Boolean)
    .join('  ');
  console.log(`  ${changes.length} file${changes.length !== 1 ? 's' : ''} changed: ${stats}\n`);

  for (const [cluster, cluster_changes] of grouped) {
    console.log(`${BOLD}${BLUE}┌─ ${cluster}${RESET}`);

    for (const change of cluster_changes) {
      const label = get_change_label(change);
      const status_color =
        change.status === 'added' ? GREEN : change.status === 'removed' ? RED : YELLOW;
      const status_symbol =
        change.status === 'added' ? '+' : change.status === 'removed' ? '-' : '~';

      console.log(
        `│ ${status_color}${BOLD}${status_symbol}${RESET} ${BOLD}${label}${RESET} ${DIM}${change.path}${RESET}`,
      );

      if (change.status === 'modified' && change.diff_lines) {
        for (const line of change.diff_lines) {
          if (line.startsWith('@@')) {
            console.log(`│   ${CYAN}${line}${RESET}`);
          } else if (line.startsWith('+')) {
            console.log(`│   ${GREEN}${line}${RESET}`);
          } else if (line.startsWith('-')) {
            console.log(`│   ${RED}${line}${RESET}`);
          } else {
            console.log(`│   ${DIM}${line}${RESET}`);
          }
        }
        console.log('');
      } else if (change.status === 'added' && change.content) {
        for (const line of change.content.trimEnd().split('\n')) {
          console.log(`│   ${GREEN}+${line}${RESET}`);
        }
        console.log('');
      } else if (change.status === 'removed' && change.content) {
        for (const line of change.content.trimEnd().split('\n')) {
          console.log(`│   ${RED}-${line}${RESET}`);
        }
        console.log('');
      }
    }

    console.log(`${BOLD}${BLUE}└──${RESET}\n`);
  }
}

// ============================================================
// Comment mode — GitHub PR comment markdown
// ============================================================

const COMMENT_MAX_LENGTH = 60000; // Leave headroom under GitHub's 65536 limit

const status_emoji: Record<string, string> = {
  added: '🟢',
  modified: '🔵',
  removed: '🔴',
};

function render_change_block(change: FileChange): string {
  const label = get_change_label(change);
  const emoji = status_emoji[change.status];
  const path_display = change.path;

  if (change.status === 'modified' && change.diff_lines) {
    const diff_content = change.diff_lines.join('\n').trimEnd();
    return `<details>
<summary>${emoji} <b>${label}</b> &mdash; <code>${path_display}</code></summary>

\`\`\`diff
${diff_content}
\`\`\`

</details>`;
  }

  if (change.status === 'added' && change.content) {
    return `<details>
<summary>${emoji} <b>${label}</b> &mdash; <code>${path_display}</code></summary>

\`\`\`yaml
${change.content.trimEnd()}
\`\`\`

</details>`;
  }

  if (change.status === 'removed' && change.content) {
    return `<details>
<summary>${emoji} <b>${label}</b> &mdash; <code>${path_display}</code></summary>

\`\`\`yaml
${change.content.trimEnd()}
\`\`\`

</details>`;
  }

  return `- ${emoji} \`${path_display}\``;
}

function build_comment(): string {
  if (!changes.length) {
    return '### Kustodian PR Diff\n\n✅ No manifest changes detected — no clusters affected.';
  }

  const parts: string[] = [];
  const grouped = group_by_cluster(changes);
  const cluster_names = [...grouped.keys()];

  parts.push('### Kustodian PR Diff\n');
  parts.push(`**Clusters affected:** ${cluster_names.map((c) => `\`${c}\``).join(', ')}\n`);
  parts.push(
    `**${changes.length}** file${changes.length !== 1 ? 's' : ''} changed — ${[
      added.length ? `🟢 ${added.length} added` : '',
      modified.length ? `🔵 ${modified.length} modified` : '',
      removed.length ? `🔴 ${removed.length} removed` : '',
    ]
      .filter(Boolean)
      .join(', ')}\n`,
  );

  for (const [cluster, cluster_changes] of grouped) {
    parts.push(`\n#### 📦 ${cluster}\n`);

    for (const change of cluster_changes) {
      const block = render_change_block(change);
      parts.push(block);
    }
  }

  let result = parts.join('\n');

  // Truncate if too long
  if (result.length > COMMENT_MAX_LENGTH) {
    result = result.slice(0, COMMENT_MAX_LENGTH);
    // Close any open code blocks / details tags
    const open_details = (result.match(/<details>/g) ?? []).length;
    const close_details = (result.match(/<\/details>/g) ?? []).length;
    const open_code = (result.match(/```/g) ?? []).length;

    if (open_code % 2 !== 0) result += '\n```\n';
    for (let i = 0; i < open_details - close_details; i++) result += '\n</details>';

    result += '\n\n> **Note:** This diff was truncated. See the full HTML report for all changes.';
  }

  return result;
}

// ============================================================
// HTML mode — full visual report
// ============================================================

function render_diff_line(line: string): string {
  let cls = '';
  if (line.startsWith('@@')) cls = 'hunk';
  else if (line.startsWith('+')) cls = 'add';
  else if (line.startsWith('-')) cls = 'del';
  return `<div class="line ${cls}">${escape_html(line)}</div>`;
}

function render_full_content(content: string, prefix: string, cls: string): string {
  return content
    .split('\n')
    .map((line) => `<div class="line ${cls}">${escape_html(`${prefix}${line}`)}</div>`)
    .join('\n');
}

function render_file_section(change: FileChange): string {
  const label = get_change_label(change);
  let body = '';
  if (change.status === 'modified' && change.diff_lines) {
    body = change.diff_lines.map(render_diff_line).join('\n');
  } else if (change.content) {
    const prefix = change.status === 'added' ? '+' : '-';
    const cls = change.status === 'added' ? 'add' : 'del';
    body = render_full_content(change.content, prefix, cls);
  }

  const status_color =
    change.status === 'added' ? 'added' : change.status === 'removed' ? 'removed' : 'modified';

  return `
    <details class="file-section" open>
      <summary>
        <span class="status-badge ${status_color}">${change.status}</span>
        <strong>${escape_html(label)}</strong>
        <code>${escape_html(change.path)}</code>
      </summary>
      <div class="diff-body"><pre>${body}</pre></div>
    </details>`;
}

function build_html(): string {
  const stats_chips = [
    added.length ? `<span class="chip added">+${added.length} added</span>` : '',
    modified.length ? `<span class="chip modified">~${modified.length} modified</span>` : '',
    removed.length ? `<span class="chip removed">-${removed.length} removed</span>` : '',
    !changes.length ? '<span class="chip">No changes</span>' : '',
  ]
    .filter(Boolean)
    .join('\n      ');

  const grouped = group_by_cluster(changes);
  const cluster_names = [...grouped.keys()];

  let file_sections = '';
  if (!changes.length) {
    file_sections =
      '<div class="empty-state">No manifest changes detected &mdash; no clusters affected.</div>';
  } else {
    for (const [cluster, cluster_changes] of grouped) {
      file_sections += `<h2 class="cluster-heading">${escape_html(cluster)}</h2>`;
      file_sections += cluster_changes.map(render_file_section).join('\n');
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kustodian PR Diff</title>
<style>
  :root {
    --bg: #0d1117;
    --fg: #e6edf3;
    --surface: #161b22;
    --border: #30363d;
    --add-bg: rgba(46, 160, 67, 0.15);
    --add-fg: #3fb950;
    --add-line: rgba(46, 160, 67, 0.08);
    --del-bg: rgba(248, 81, 73, 0.15);
    --del-fg: #f85149;
    --del-line: rgba(248, 81, 73, 0.08);
    --mod-fg: #d29922;
    --hunk-bg: rgba(56, 139, 253, 0.08);
    --hunk-fg: #79c0ff;
    --muted: #7d8590;
  }

  @media (prefers-color-scheme: light) {
    :root {
      --bg: #ffffff;
      --fg: #1f2328;
      --surface: #f6f8fa;
      --border: #d0d7de;
      --add-bg: rgba(46, 160, 67, 0.1);
      --add-fg: #1a7f37;
      --add-line: rgba(46, 160, 67, 0.06);
      --del-bg: rgba(248, 81, 73, 0.1);
      --del-fg: #cf222e;
      --del-line: rgba(248, 81, 73, 0.06);
      --mod-fg: #9a6700;
      --hunk-bg: rgba(56, 139, 253, 0.06);
      --hunk-fg: #0969da;
      --muted: #656d76;
    }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--fg);
    line-height: 1.5;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  header {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
  .subtitle { color: var(--muted); font-size: 0.875rem; }
  .stats { display: flex; gap: 0.75rem; margin-top: 0.75rem; flex-wrap: wrap; }

  .chip {
    font-size: 0.8125rem;
    font-weight: 500;
    padding: 0.2rem 0.6rem;
    border-radius: 2rem;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .chip.added { color: var(--add-fg); }
  .chip.modified { color: var(--mod-fg); }
  .chip.removed { color: var(--del-fg); }

  .cluster-heading {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 1.5rem 0 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .file-section {
    margin-bottom: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .file-section > summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--surface);
    cursor: pointer;
    font-size: 0.8125rem;
    list-style: none;
    user-select: none;
  }

  .file-section > summary::-webkit-details-marker { display: none; }

  .file-section > summary::before {
    content: "\\25B6";
    font-size: 0.6rem;
    transition: transform 0.15s;
    color: var(--muted);
    flex-shrink: 0;
  }

  .file-section[open] > summary::before { transform: rotate(90deg); }

  .status-badge {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.1rem 0.45rem;
    border-radius: 2rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .status-badge.added { background: var(--add-bg); color: var(--add-fg); }
  .status-badge.modified { background: var(--hunk-bg); color: var(--mod-fg); }
  .status-badge.removed { background: var(--del-bg); color: var(--del-fg); }

  .diff-body { overflow-x: auto; }

  .diff-body pre {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.8125rem;
  }

  .line {
    padding: 0 0.75rem;
    white-space: pre;
    min-height: 1.35em;
  }

  .line.add { background: var(--add-line); color: var(--add-fg); }
  .line.del { background: var(--del-line); color: var(--del-fg); }

  .line.hunk {
    background: var(--hunk-bg);
    color: var(--hunk-fg);
    padding-top: 0.15rem;
    padding-bottom: 0.15rem;
    font-style: italic;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: var(--muted);
  }

  footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>
</head>
<body>
  <header>
    <h1>Kustodian PR Diff</h1>
    <p class="subtitle">${changes.length ? `Clusters affected: <strong>${cluster_names.map(escape_html).join(', ')}</strong>` : 'No clusters affected'}</p>
    <div class="stats">
      ${stats_chips}
    </div>
  </header>

  <main>
    ${file_sections}
  </main>

  <footer>Generated by Kustodian</footer>
</body>
</html>`;
}

// ============================================================
// Output
// ============================================================

if (config.mode === 'terminal') {
  render_terminal();
} else if (config.mode === 'comment') {
  console.log(build_comment());
} else {
  // CI mode — write all output files (validated above that these exist)
  const out_html = config.output_html as string;
  const out_summary = config.output_summary as string;
  const out_comment = config.output_comment as string;

  const html = build_html();
  const html_dir = dirname(out_html);
  if (!existsSync(html_dir)) mkdirSync(html_dir, { recursive: true });
  writeFileSync(out_html, html, 'utf-8');

  const summary_grouped = group_by_cluster(changes);
  writeFileSync(
    out_summary,
    JSON.stringify({
      total: changes.length,
      added: added.length,
      modified: modified.length,
      removed: removed.length,
      clusters: [...summary_grouped.keys()],
      files: changes.map((c) => ({ path: c.path, status: c.status })),
    }),
    'utf-8',
  );

  writeFileSync(out_comment, build_comment(), 'utf-8');

  console.log(
    `Diff report: ${added.length} added, ${modified.length} modified, ${removed.length} removed`,
  );
}

// Exit with code 1 if changes were detected (useful for local scripting).
// In CI mode the action reads the JSON summary instead, so don't fail the step.
if (changes.length > 0 && config.mode !== 'ci') {
  process.exitCode = 1;
}
