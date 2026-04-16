#!/usr/bin/env bun

/**
 * Generates manifest diffs between two kustodian preview output directories
 * AND/OR between source template directories.
 *
 * Modes:
 *   ci       - Write HTML report, JSON summary, and PR comment markdown to files
 *   terminal - Print colorized diff to stdout
 *   comment  - Print PR comment markdown to stdout
 *
 * Usage:
 *   generate-diff.ts --mode ci <base-dir> <pr-dir> <output-html> <output-summary> <output-comment> [options]
 *   generate-diff.ts --mode terminal <base-dir> <pr-dir> [options]
 *   generate-diff.ts --mode comment <base-dir> <pr-dir> [options]
 *
 * Options:
 *   --cluster <name>       Cluster name for labeling (instead of deriving from paths)
 *   --repo-base <path>     Base branch repo root (enables source template diffing)
 *   --repo-pr <path>       PR branch repo root (enables source template diffing)
 *   --live-diff <file>     Live cluster diff output file
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, extname, basename } from 'node:path';

// --- Types ---

type Mode = 'ci' | 'terminal' | 'comment';

type FileChange = {
  path: string;
  status: 'added' | 'removed' | 'modified';
  diff_lines?: string[];
  content?: string;
};

type ChangeSection = {
  label: string;
  description: string;
  changes: FileChange[];
};

// --- Argument parsing ---

function parse_args(): {
  mode: Mode;
  base_dir: string;
  pr_dir: string;
  output_html?: string;
  output_summary?: string;
  output_comment?: string;
  live_diff_file?: string;
  cluster?: string;
  repo_base?: string;
  repo_pr?: string;
} {
  const args = process.argv.slice(2);
  let mode: Mode = 'ci';
  let live_diff_file: string | undefined;
  let cluster: string | undefined;
  let repo_base: string | undefined;
  let repo_pr: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1] as Mode;
      if (!['ci', 'terminal', 'comment'].includes(mode)) {
        console.error(`Unknown mode: ${mode}. Expected: ci, terminal, comment`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--live-diff' && args[i + 1]) {
      live_diff_file = args[i + 1];
      i++;
    } else if (args[i] === '--cluster' && args[i + 1]) {
      cluster = args[i + 1];
      i++;
    } else if (args[i] === '--repo-base' && args[i + 1]) {
      repo_base = args[i + 1];
      i++;
    } else if (args[i] === '--repo-pr' && args[i + 1]) {
      repo_pr = args[i + 1];
      i++;
    } else {
      positional.push(args[i] as string);
    }
  }

  const [base_dir, pr_dir, output_html, output_summary, output_comment] = positional;

  if (!base_dir || !pr_dir) {
    console.error(
      'Usage:\n' +
        '  generate-diff.ts --mode ci       <base-dir> <pr-dir> <html> <summary> <comment> [options]\n' +
        '  generate-diff.ts --mode terminal <base-dir> <pr-dir> [options]\n' +
        '  generate-diff.ts --mode comment  <base-dir> <pr-dir> [options]\n' +
        '\n' +
        'Options:\n' +
        '  --cluster <name>       Cluster name for labeling\n' +
        '  --repo-base <path>     Base branch repo root (enables source diffing)\n' +
        '  --repo-pr <path>       PR branch repo root (enables source diffing)\n' +
        '  --live-diff <file>     Live cluster diff output\n',
    );
    process.exit(1);
  }

  if (mode === 'ci' && (!output_html || !output_summary || !output_comment)) {
    console.error(
      'CI mode requires: <base-dir> <pr-dir> <output-html> <output-summary> <output-comment>',
    );
    process.exit(1);
  }

  return {
    mode,
    base_dir,
    pr_dir,
    output_html,
    output_summary,
    output_comment,
    live_diff_file,
    cluster,
    repo_base,
    repo_pr,
  };
}

const config = parse_args();

// --- Live diff content ---

let live_diff_content = '';
if (config.live_diff_file && existsSync(config.live_diff_file)) {
  live_diff_content = readFileSync(config.live_diff_file, 'utf-8').trim();
}

// --- File discovery ---

function walk_dir(dir: string, extensions?: string[]): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];

  function recurse(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        recurse(full);
      } else if (entry.isFile()) {
        if (!extensions || extensions.includes(extname(entry.name))) {
          results.push(relative(dir, full));
        }
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

function is_binary_file(path: string): boolean {
  const binary_exts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  return binary_exts.includes(extname(path).toLowerCase());
}

// --- Collect preview changes (Flux Kustomization config) ---

function collect_dir_changes(base_dir: string, pr_dir: string, extensions?: string[]): FileChange[] {
  const base_files = new Set(walk_dir(base_dir, extensions));
  const pr_files = new Set(walk_dir(pr_dir, extensions));
  const all_files = [...new Set([...base_files, ...pr_files])].sort();

  const changes: FileChange[] = [];

  for (const file of all_files) {
    const in_base = base_files.has(file);
    const in_pr = pr_files.has(file);

    if (in_pr && !in_base) {
      if (is_binary_file(file)) {
        changes.push({ path: file, status: 'added' });
      } else {
        changes.push({
          path: file,
          status: 'added',
          content: readFileSync(join(pr_dir, file), 'utf-8'),
        });
      }
    } else if (in_base && !in_pr) {
      if (is_binary_file(file)) {
        changes.push({ path: file, status: 'removed' });
      } else {
        changes.push({
          path: file,
          status: 'removed',
          content: readFileSync(join(base_dir, file), 'utf-8'),
        });
      }
    } else {
      if (is_binary_file(file)) continue;
      const base_content = readFileSync(join(base_dir, file), 'utf-8');
      const pr_content = readFileSync(join(pr_dir, file), 'utf-8');

      if (base_content !== pr_content) {
        const diff = get_unified_diff(join(base_dir, file), join(pr_dir, file), file);
        const lines = diff.split('\n');
        changes.push({ path: file, status: 'modified', diff_lines: lines.slice(2) });
      }
    }
  }

  return changes;
}

// Collect preview output changes (Flux Kustomization wrappers)
const preview_extensions = ['.yaml', '.yml', '.json'];
const preview_changes = collect_dir_changes(config.base_dir, config.pr_dir, preview_extensions);

// --- Collect source changes (actual K8s manifests) ---

let source_changes: FileChange[] = [];
let cluster_config_changes: FileChange[] = [];

if (config.repo_base && config.repo_pr) {
  // Diff template source directories
  const base_templates = join(config.repo_base, 'templates');
  const pr_templates = join(config.repo_pr, 'templates');

  if (existsSync(base_templates) || existsSync(pr_templates)) {
    source_changes = collect_dir_changes(base_templates, pr_templates);
    // Exclude template.yaml files — those are kustodian specs, not K8s manifests
    // But still include them with a note since they affect generation
  }

  // Diff cluster config if cluster name is known
  if (config.cluster) {
    const base_cluster = join(config.repo_base, 'clusters', config.cluster);
    const pr_cluster = join(config.repo_pr, 'clusters', config.cluster);

    if (existsSync(base_cluster) || existsSync(pr_cluster)) {
      cluster_config_changes = collect_dir_changes(base_cluster, pr_cluster);
    }
  }
}

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
function get_change_label(change: FileChange, search_dir?: string): string {
  let content: string | undefined;
  if (change.content) {
    content = change.content;
  } else if (change.status === 'modified' && search_dir) {
    try {
      content = readFileSync(join(search_dir, change.path), 'utf-8');
    } catch {
      // Ignore
    }
  }
  const identity = content ? parse_k8s_identity(content) : undefined;
  return identity ?? basename(change.path, extname(change.path));
}

/**
 * Extract template name from a source file path.
 * Paths look like: "07-media/07.16-jellyfin/jellyfin/deployment.yaml"
 * Template name is the second segment: "07.16-jellyfin"
 */
function extract_template_name(file_path: string): string {
  const parts = file_path.split('/');
  return parts[1] ?? parts[0] ?? 'unknown';
}

/**
 * Extract a short display name from a template directory name.
 * "07.16-jellyfin" → "jellyfin"
 * "06.1-home-assistant" → "home-assistant"
 */
function short_template_name(template_dir: string): string {
  const match = template_dir.match(/^\d+(?:\.\d+)?-(.+)$/);
  return match?.[1] ?? template_dir;
}

/** Group source changes by template name */
function group_by_template(items: FileChange[]): Map<string, FileChange[]> {
  const groups = new Map<string, FileChange[]>();
  for (const item of items) {
    const template = extract_template_name(item.path);
    const list = groups.get(template) ?? [];
    list.push(item);
    groups.set(template, list);
  }
  return groups;
}

/** Group preview changes by template name (second path segment: templates/<name>/...) */
function group_preview_by_template(items: FileChange[]): Map<string, FileChange[]> {
  const groups = new Map<string, FileChange[]>();
  for (const item of items) {
    const parts = item.path.split('/');
    // Preview paths: "templates/<template>/<file>" or "flux-system/<file>"
    let group_name: string;
    if (parts[0] === 'templates' && parts[1]) {
      group_name = parts[1];
    } else if (parts[0] === 'flux-system') {
      group_name = 'flux-system';
    } else {
      group_name = parts[0] ?? 'unknown';
    }
    const list = groups.get(group_name) ?? [];
    list.push(item);
    groups.set(group_name, list);
  }
  return groups;
}

// --- Build all change sections ---

const all_changes = [...preview_changes, ...source_changes, ...cluster_config_changes];
const total_changes = all_changes.length;

function count_by_status(items: FileChange[]) {
  return {
    added: items.filter((c) => c.status === 'added').length,
    modified: items.filter((c) => c.status === 'modified').length,
    removed: items.filter((c) => c.status === 'removed').length,
  };
}

// --- Determine which templates are affected ---

type TemplateSummary = {
  name: string;
  short_name: string;
  source_changes: FileChange[];
  config_changes: FileChange[];
};

function build_template_summaries(): TemplateSummary[] {
  const template_map = new Map<string, TemplateSummary>();

  // Source changes grouped by template
  const source_grouped = group_by_template(source_changes);
  for (const [template, changes] of source_grouped) {
    template_map.set(template, {
      name: template,
      short_name: short_template_name(template),
      source_changes: changes,
      config_changes: [],
    });
  }

  // Preview changes grouped by template
  const preview_grouped = group_preview_by_template(preview_changes);
  for (const [template, changes] of preview_grouped) {
    if (template === 'flux-system') continue; // Handle separately
    const existing = template_map.get(template);
    if (existing) {
      existing.config_changes = changes;
    } else {
      template_map.set(template, {
        name: template,
        short_name: short_template_name(template),
        source_changes: [],
        config_changes: changes,
      });
    }
  }

  // Sort by template name
  return [...template_map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const template_summaries = build_template_summaries();
const flux_system_changes = preview_changes.filter((c) => c.path.startsWith('flux-system/'));

// ============================================================
// Terminal mode
// ============================================================

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function render_terminal_diff(change: FileChange): void {
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
  } else if (change.status === 'added' && change.content) {
    for (const line of change.content.trimEnd().split('\n')) {
      console.log(`│   ${GREEN}+${line}${RESET}`);
    }
  } else if (change.status === 'removed' && change.content) {
    for (const line of change.content.trimEnd().split('\n')) {
      console.log(`│   ${RED}-${line}${RESET}`);
    }
  }
}

function render_terminal(): void {
  const cluster_label = config.cluster ?? 'all clusters';

  if (total_changes === 0) {
    console.log(
      `\n${GREEN}${BOLD}✓ No changes detected for ${cluster_label}.${RESET}\n`,
    );
    return;
  }

  // Header
  console.log(`\n${BOLD}━━━ Kustodian Diff — ${cluster_label} ━━━${RESET}`);

  const stats = count_by_status(all_changes);
  const stat_parts = [
    stats.added ? `${GREEN}+${stats.added} added${RESET}` : '',
    stats.modified ? `${YELLOW}~${stats.modified} modified${RESET}` : '',
    stats.removed ? `${RED}-${stats.removed} removed${RESET}` : '',
  ]
    .filter(Boolean)
    .join('  ');
  console.log(
    `  ${template_summaries.length} template${template_summaries.length !== 1 ? 's' : ''} affected, ${total_changes} file${total_changes !== 1 ? 's' : ''} changed: ${stat_parts}\n`,
  );

  // Template sections
  for (const template of template_summaries) {
    const all_template_changes = [...template.source_changes, ...template.config_changes];
    console.log(`${BOLD}${BLUE}┌─ ${template.short_name}${RESET} ${DIM}(${template.name})${RESET}`);

    for (const change of all_template_changes) {
      const label = get_change_label(change, config.repo_pr ? join(config.repo_pr, 'templates') : config.pr_dir);
      const status_color =
        change.status === 'added' ? GREEN : change.status === 'removed' ? RED : YELLOW;
      const status_symbol =
        change.status === 'added' ? '+' : change.status === 'removed' ? '-' : '~';

      console.log(
        `│ ${status_color}${BOLD}${status_symbol}${RESET} ${BOLD}${label}${RESET} ${DIM}${change.path}${RESET}`,
      );
      render_terminal_diff(change);
      if (change.diff_lines || change.content) console.log('');
    }

    console.log(`${BOLD}${BLUE}└──${RESET}\n`);
  }

  // Flux system changes
  if (flux_system_changes.length > 0) {
    console.log(`${BOLD}${MAGENTA}┌─ flux-system${RESET}`);
    for (const change of flux_system_changes) {
      const label = get_change_label(change, config.pr_dir);
      const status_color =
        change.status === 'added' ? GREEN : change.status === 'removed' ? RED : YELLOW;
      const status_symbol =
        change.status === 'added' ? '+' : change.status === 'removed' ? '-' : '~';

      console.log(
        `│ ${status_color}${BOLD}${status_symbol}${RESET} ${BOLD}${label}${RESET} ${DIM}${change.path}${RESET}`,
      );
      render_terminal_diff(change);
      if (change.diff_lines || change.content) console.log('');
    }
    console.log(`${BOLD}${MAGENTA}└──${RESET}\n`);
  }

  // Cluster config changes
  if (cluster_config_changes.length > 0) {
    console.log(`${BOLD}${CYAN}┌─ cluster config${RESET} ${DIM}(${config.cluster})${RESET}`);
    for (const change of cluster_config_changes) {
      const label = basename(change.path);
      const status_color =
        change.status === 'added' ? GREEN : change.status === 'removed' ? RED : YELLOW;
      const status_symbol =
        change.status === 'added' ? '+' : change.status === 'removed' ? '-' : '~';

      console.log(
        `│ ${status_color}${BOLD}${status_symbol}${RESET} ${BOLD}${label}${RESET} ${DIM}${change.path}${RESET}`,
      );
      render_terminal_diff(change);
      if (change.diff_lines || change.content) console.log('');
    }
    console.log(`${BOLD}${CYAN}└──${RESET}\n`);
  }
}

// ============================================================
// Comment mode — GitHub PR comment markdown
// ============================================================

const COMMENT_MAX_LENGTH = 60000;

const status_emoji: Record<string, string> = {
  added: '🟢',
  modified: '🔵',
  removed: '🔴',
};

function render_change_block(change: FileChange, search_dir?: string): string {
  const label = get_change_label(change, search_dir);
  const emoji = status_emoji[change.status];

  if (change.status === 'modified' && change.diff_lines) {
    const diff_content = change.diff_lines.join('\n').trimEnd();
    return `<details>
<summary>${emoji} <b>${label}</b> — <code>${change.path}</code></summary>

\`\`\`diff
${diff_content}
\`\`\`

</details>`;
  }

  if (change.status === 'added' && change.content) {
    return `<details>
<summary>${emoji} <b>${label}</b> — <code>${change.path}</code></summary>

\`\`\`yaml
${change.content.trimEnd()}
\`\`\`

</details>`;
  }

  if (change.status === 'removed' && change.content) {
    return `<details>
<summary>${emoji} <b>${label}</b> — <code>${change.path}</code></summary>

\`\`\`yaml
${change.content.trimEnd()}
\`\`\`

</details>`;
  }

  // Binary or empty file
  return `- ${emoji} **${label}** — \`${change.path}\``;
}

function format_change_counts(items: FileChange[]): string {
  const stats = count_by_status(items);
  return [
    stats.added ? `🟢 ${stats.added} added` : '',
    stats.modified ? `🔵 ${stats.modified} modified` : '',
    stats.removed ? `🔴 ${stats.removed} removed` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function build_comment(): string {
  const cluster_label = config.cluster ? ` — \`${config.cluster}\`` : '';

  if (total_changes === 0) {
    return `### Kustodian PR Diff${cluster_label}\n\n✅ No changes detected — this PR does not affect any deployed manifests or Flux configuration.`;
  }

  const parts: string[] = [];

  // Header
  parts.push(`### Kustodian PR Diff${cluster_label}\n`);

  // Summary table
  if (template_summaries.length > 0) {
    parts.push(
      `**${template_summaries.length} template${template_summaries.length !== 1 ? 's' : ''} affected** — ${format_change_counts(all_changes)}\n`,
    );

    parts.push('| Template | Changes | Details |');
    parts.push('|----------|---------|---------|');

    for (const template of template_summaries) {
      const all = [...template.source_changes, ...template.config_changes];
      const counts = count_by_status(all);
      const details: string[] = [];
      if (counts.added) details.push(`+${counts.added}`);
      if (counts.modified) details.push(`~${counts.modified}`);
      if (counts.removed) details.push(`-${counts.removed}`);

      const types: string[] = [];
      if (template.source_changes.length) types.push('manifests');
      if (template.config_changes.length) types.push('flux config');

      parts.push(
        `| **${template.short_name}** | ${details.join(' ')} file${all.length !== 1 ? 's' : ''} | ${types.join(', ')} |`,
      );
    }

    if (flux_system_changes.length > 0) {
      const counts = count_by_status(flux_system_changes);
      const details: string[] = [];
      if (counts.added) details.push(`+${counts.added}`);
      if (counts.modified) details.push(`~${counts.modified}`);
      if (counts.removed) details.push(`-${counts.removed}`);
      parts.push(
        `| **flux-system** | ${details.join(' ')} file${flux_system_changes.length !== 1 ? 's' : ''} | infrastructure |`,
      );
    }

    if (cluster_config_changes.length > 0) {
      const counts = count_by_status(cluster_config_changes);
      const details: string[] = [];
      if (counts.added) details.push(`+${counts.added}`);
      if (counts.modified) details.push(`~${counts.modified}`);
      if (counts.removed) details.push(`-${counts.removed}`);
      parts.push(
        `| **cluster config** | ${details.join(' ')} file${cluster_config_changes.length !== 1 ? 's' : ''} | ${config.cluster ?? 'cluster'} settings |`,
      );
    }

    parts.push('');
  }

  // Template detail sections
  for (const template of template_summaries) {
    const all = [...template.source_changes, ...template.config_changes];
    parts.push(
      `\n<details>\n<summary>📦 <b>${template.short_name}</b> — ${format_change_counts(all)}</summary>\n`,
    );

    // Source changes (actual manifests)
    if (template.source_changes.length > 0) {
      const search_dir = config.repo_pr ? join(config.repo_pr, 'templates') : undefined;
      for (const change of template.source_changes) {
        parts.push(render_change_block(change, search_dir));
      }
    }

    // Config changes (Flux Kustomization wrappers)
    if (template.config_changes.length > 0) {
      if (template.source_changes.length > 0) {
        parts.push('\n**Flux configuration:**\n');
      }
      for (const change of template.config_changes) {
        parts.push(render_change_block(change, config.pr_dir));
      }
    }

    parts.push('\n</details>');
  }

  // Flux system changes
  if (flux_system_changes.length > 0) {
    parts.push(
      `\n<details>\n<summary>⚙️ <b>flux-system</b> — ${format_change_counts(flux_system_changes)}</summary>\n`,
    );
    for (const change of flux_system_changes) {
      parts.push(render_change_block(change, config.pr_dir));
    }
    parts.push('\n</details>');
  }

  // Cluster config changes
  if (cluster_config_changes.length > 0) {
    parts.push(
      `\n<details>\n<summary>🔧 <b>cluster config</b> (${config.cluster}) — ${format_change_counts(cluster_config_changes)}</summary>\n`,
    );
    for (const change of cluster_config_changes) {
      parts.push(render_change_block(change));
    }
    parts.push('\n</details>');
  }

  // Live cluster diff
  if (live_diff_content) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes requires matching ESC
    const clean_diff = live_diff_content.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

    parts.push('\n---\n');
    parts.push('#### Live Cluster Diff\n');
    parts.push('> Resource changes compared to the running cluster\n');
    parts.push(
      `<details>\n<summary>Show full diff</summary>\n\n\`\`\`diff\n${clean_diff}\n\`\`\`\n\n</details>`,
    );
  }

  let result = parts.join('\n');

  // Truncate if too long
  if (result.length > COMMENT_MAX_LENGTH) {
    result = result.slice(0, COMMENT_MAX_LENGTH);
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
// HTML mode
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
  const label = get_change_label(change, config.repo_pr ? join(config.repo_pr, 'templates') : config.pr_dir);
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
  const cluster_label = config.cluster ? ` — ${escape_html(config.cluster)}` : '';
  const total_stats = count_by_status(all_changes);

  const stats_chips = [
    total_stats.added ? `<span class="chip added">+${total_stats.added} added</span>` : '',
    total_stats.modified
      ? `<span class="chip modified">~${total_stats.modified} modified</span>`
      : '',
    total_stats.removed ? `<span class="chip removed">-${total_stats.removed} removed</span>` : '',
    !total_changes ? '<span class="chip">No changes</span>' : '',
  ]
    .filter(Boolean)
    .join('\n      ');

  let file_sections = '';
  if (total_changes === 0) {
    file_sections =
      '<div class="empty-state">No changes detected &mdash; this PR does not affect any deployed manifests or Flux configuration.</div>';
  } else {
    // Template sections
    for (const template of template_summaries) {
      file_sections += `<h2 class="cluster-heading">${escape_html(template.short_name)} <span class="template-id">${escape_html(template.name)}</span></h2>`;

      if (template.source_changes.length > 0) {
        file_sections += '<h3 class="section-label">Manifests</h3>';
        file_sections += template.source_changes.map(render_file_section).join('\n');
      }
      if (template.config_changes.length > 0) {
        file_sections += '<h3 class="section-label">Flux Configuration</h3>';
        file_sections += template.config_changes.map(render_file_section).join('\n');
      }
    }

    // Flux system
    if (flux_system_changes.length > 0) {
      file_sections += '<h2 class="cluster-heading">flux-system</h2>';
      file_sections += flux_system_changes.map(render_file_section).join('\n');
    }

    // Cluster config
    if (cluster_config_changes.length > 0) {
      file_sections += `<h2 class="cluster-heading">Cluster Config${config.cluster ? ` (${escape_html(config.cluster)})` : ''}</h2>`;
      file_sections += cluster_config_changes.map(render_file_section).join('\n');
    }
  }

  const template_list =
    template_summaries.length > 0
      ? `Templates affected: <strong>${template_summaries.map((t) => escape_html(t.short_name)).join(', ')}</strong>`
      : 'No templates affected';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kustodian PR Diff${cluster_label}</title>
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

  .template-id {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted);
  }

  .section-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--muted);
    margin: 0.75rem 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
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
    <h1>Kustodian PR Diff${cluster_label}</h1>
    <p class="subtitle">${template_list}</p>
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
  // CI mode
  const out_html = config.output_html as string;
  const out_summary = config.output_summary as string;
  const out_comment = config.output_comment as string;

  const html = build_html();
  const html_dir = dirname(out_html);
  if (!existsSync(html_dir)) mkdirSync(html_dir, { recursive: true });
  writeFileSync(out_html, html, 'utf-8');

  const total_stats = count_by_status(all_changes);
  writeFileSync(
    out_summary,
    JSON.stringify({
      total: total_changes,
      added: total_stats.added,
      modified: total_stats.modified,
      removed: total_stats.removed,
      templates: template_summaries.map((t) => ({
        name: t.name,
        short_name: t.short_name,
        source_files: t.source_changes.length,
        config_files: t.config_changes.length,
      })),
      has_flux_system_changes: flux_system_changes.length > 0,
      has_cluster_config_changes: cluster_config_changes.length > 0,
      files: all_changes.map((c) => ({ path: c.path, status: c.status })),
    }),
    'utf-8',
  );

  writeFileSync(out_comment, build_comment(), 'utf-8');

  console.log(
    `Diff report: ${total_stats.added} added, ${total_stats.modified} modified, ${total_stats.removed} removed across ${template_summaries.length} template(s)`,
  );
}

// Exit with code 1 if changes were detected (useful for local scripting).
if (total_changes > 0 && config.mode !== 'ci') {
  process.exitCode = 1;
}
