#!/usr/bin/env bun

/**
 * Generates an HTML diff report and PR comment markdown from two manifest directories.
 *
 * Usage: generate-diff.ts <base-dir> <pr-dir> <output-html> <output-summary> <output-comment>
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const [base_dir, pr_dir, output_html, output_summary, output_comment] = process.argv.slice(2);

if (!base_dir || !pr_dir || !output_html || !output_summary || !output_comment) {
  console.error(
    'Usage: generate-diff.ts <base-dir> <pr-dir> <output-html> <output-summary> <output-comment>',
  );
  process.exit(1);
}

// Walk a directory recursively and return sorted relative file paths
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

const base_files = new Set(walk_dir(base_dir));
const pr_files = new Set(walk_dir(pr_dir));
const all_files = [...new Set([...base_files, ...pr_files])].sort();

type FileChange = {
  path: string;
  status: 'added' | 'removed' | 'modified';
  diff_lines?: string[];
  content?: string;
};

const changes: FileChange[] = [];

for (const file of all_files) {
  const in_base = base_files.has(file);
  const in_pr = pr_files.has(file);

  if (in_pr && !in_base) {
    changes.push({
      path: file,
      status: 'added',
      content: readFileSync(join(pr_dir, file), 'utf-8'),
    });
  } else if (in_base && !in_pr) {
    changes.push({
      path: file,
      status: 'removed',
      content: readFileSync(join(base_dir, file), 'utf-8'),
    });
  } else {
    const base_content = readFileSync(join(base_dir, file), 'utf-8');
    const pr_content = readFileSync(join(pr_dir, file), 'utf-8');

    if (base_content !== pr_content) {
      const diff = get_unified_diff(join(base_dir, file), join(pr_dir, file), file);
      const lines = diff.split('\n');
      // Skip the --- and +++ header lines (indices 0 and 1)
      changes.push({ path: file, status: 'modified', diff_lines: lines.slice(2) });
    }
  }
}

const added = changes.filter((c) => c.status === 'added');
const modified = changes.filter((c) => c.status === 'modified');
const removed = changes.filter((c) => c.status === 'removed');

// --- HTML generation ---

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
  let body = '';
  if (change.status === 'modified' && change.diff_lines) {
    body = change.diff_lines.map(render_diff_line).join('\n');
  } else if (change.content) {
    const prefix = change.status === 'added' ? '+' : '-';
    const cls = change.status === 'added' ? 'add' : 'del';
    body = render_full_content(change.content, prefix, cls);
  }

  return `
    <details class="file-section" open>
      <summary>
        <span class="status-badge ${change.status}">${change.status}</span>
        <code>${escape_html(change.path)}</code>
      </summary>
      <div class="diff-body"><pre>${body}</pre></div>
    </details>`;
}

const stats_chips = [
  added.length ? `<span class="chip added">+${added.length} added</span>` : '',
  modified.length ? `<span class="chip modified">~${modified.length} modified</span>` : '',
  removed.length ? `<span class="chip removed">-${removed.length} removed</span>` : '',
  !changes.length ? '<span class="chip">No changes</span>' : '',
]
  .filter(Boolean)
  .join('\n      ');

const file_sections = changes.length
  ? changes.map(render_file_section).join('\n')
  : '<div class="empty-state">No manifest changes detected.</div>';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kustodian Manifest Diff</title>
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
    <h1>Kustodian Manifest Diff</h1>
    <p class="subtitle">Kubernetes manifest changes between base and PR branch</p>
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

// --- Write outputs ---

const html_dir = dirname(output_html);
if (!existsSync(html_dir)) mkdirSync(html_dir, { recursive: true });
writeFileSync(output_html, html, 'utf-8');

// Summary JSON
writeFileSync(
  output_summary,
  JSON.stringify({
    total: changes.length,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    files: changes.map((c) => ({ path: c.path, status: c.status })),
  }),
  'utf-8',
);

// Comment markdown
const status_icons: Record<string, string> = {
  added: '+',
  modified: '~',
  removed: '-',
};

const file_rows = changes
  .map((c) => `| \`${c.path}\` | ${status_icons[c.status]} ${c.status} |`)
  .join('\n');

const comment_md = changes.length
  ? `### Kustodian Manifest Diff

**${changes.length}** file${changes.length !== 1 ? 's' : ''} changed: **${added.length}** added, **${modified.length}** modified, **${removed.length}** removed

<details>
<summary>Changed files</summary>

| File | Status |
|------|--------|
${file_rows}

</details>`
  : '### Kustodian Manifest Diff\n\nNo manifest changes detected.';

writeFileSync(output_comment, comment_md, 'utf-8');

console.log(
  `Diff report: ${added.length} added, ${modified.length} modified, ${removed.length} removed`,
);
