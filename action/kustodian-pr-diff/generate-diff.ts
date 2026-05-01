#!/usr/bin/env bun

/**
 * Renders Kustodian PR-diff outputs:
 *   - PR comment markdown — focused on what `kustodian apply` will change in
 *     the live cluster(s). Source-file diffs are NOT inlined here; they live
 *     in the HTML artifact instead.
 *   - HTML artifact — single-page source-file review of templates / cluster
 *     config that changed in the PR. Useful for reviewing what was authored,
 *     separately from what will end up applied.
 *   - JSON summary — machine-readable counts, used by the workflow.
 *
 * Modes:
 *   ci       - Write HTML report, JSON summary, and PR comment markdown to files.
 *   terminal - Print colorized live-diff summary to stdout.
 *   comment  - Print PR comment markdown to stdout.
 *
 * Usage (CI mode):
 *   generate-diff.ts --mode ci <base-dir> <pr-dir> <output-html> <output-summary> <output-comment> [options]
 *
 * Options:
 *   --cluster <name>             Cluster being analyzed (legacy single-cluster invocation)
 *   --analyzed-clusters <names>  Comma-separated clusters that were diffed against a live cluster
 *   --all-clusters <names>       Comma-separated clusters that exist in the project. Any cluster
 *                                in this list but not in --analyzed-clusters is reported as
 *                                "not analyzed" in the PR comment.
 *   --repo-base <path>           Base branch repo root (enables source template diffing for HTML)
 *   --repo-pr <path>             PR branch repo root (enables source template diffing for HTML)
 *   --live-json <path>           Structured JSON output from `kustodian diff --json` (preferred)
 *   --live-diff <path>           Plain-text live-diff output (fallback when --live-json absent)
 *   --artifact-url <url>         If known at render time, link to the HTML artifact in the comment
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

// --- Types ---

type Mode = 'ci' | 'terminal' | 'comment';

type FileChange = {
  path: string;
  status: 'added' | 'removed' | 'modified';
  diff_lines?: string[];
  content?: string;
};

type KustomizationDiff = {
  name: string;
  namespace: string;
  template: string;
  has_changes: boolean;
  diff: string;
};

type ClusterDiff = {
  name: string;
  has_changes: boolean;
  control_plane: { has_changes: boolean; diff: string };
  kustomizations: KustomizationDiff[];
};

type LiveDiffReport = {
  schema_version: 1;
  has_changes: boolean;
  clusters: ClusterDiff[];
};

// --- Argument parsing ---

type Config = {
  mode: Mode;
  base_dir: string;
  pr_dir: string;
  output_html?: string;
  output_summary?: string;
  output_comment?: string;
  live_diff_file?: string;
  live_json_file?: string;
  cluster?: string;
  analyzed_clusters: string[];
  all_clusters: string[];
  repo_base?: string;
  repo_pr?: string;
  artifact_url?: string;
};

function parse_args(): Config {
  const args = process.argv.slice(2);
  let mode: Mode = 'ci';
  let live_diff_file: string | undefined;
  let live_json_file: string | undefined;
  let cluster: string | undefined;
  let analyzed_clusters: string[] = [];
  let all_clusters: string[] = [];
  let repo_base: string | undefined;
  let repo_pr: string | undefined;
  let artifact_url: string | undefined;
  const positional: string[] = [];

  function split_csv(value: string): string[] {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--mode' && next) {
      mode = next as Mode;
      if (!['ci', 'terminal', 'comment'].includes(mode)) {
        console.error(`Unknown mode: ${mode}. Expected: ci, terminal, comment`);
        process.exit(1);
      }
      i++;
    } else if (arg === '--live-diff' && next) {
      live_diff_file = next;
      i++;
    } else if (arg === '--live-json' && next) {
      live_json_file = next;
      i++;
    } else if (arg === '--cluster' && next) {
      cluster = next;
      i++;
    } else if (arg === '--analyzed-clusters' && next) {
      analyzed_clusters = split_csv(next);
      i++;
    } else if (arg === '--all-clusters' && next) {
      all_clusters = split_csv(next);
      i++;
    } else if (arg === '--repo-base' && next) {
      repo_base = next;
      i++;
    } else if (arg === '--repo-pr' && next) {
      repo_pr = next;
      i++;
    } else if (arg === '--artifact-url' && next) {
      artifact_url = next;
      i++;
    } else {
      positional.push(arg as string);
    }
  }

  const [base_dir, pr_dir, output_html, output_summary, output_comment] = positional;

  if (!base_dir || !pr_dir) {
    console.error(
      'Usage:\n' +
        '  generate-diff.ts --mode ci       <base-dir> <pr-dir> <html> <summary> <comment> [options]\n' +
        '  generate-diff.ts --mode terminal <base-dir> <pr-dir> [options]\n' +
        '  generate-diff.ts --mode comment  <base-dir> <pr-dir> [options]\n',
    );
    process.exit(1);
  }

  if (mode === 'ci' && (!output_html || !output_summary || !output_comment)) {
    console.error(
      'CI mode requires: <base-dir> <pr-dir> <output-html> <output-summary> <output-comment>',
    );
    process.exit(1);
  }

  if (cluster && analyzed_clusters.length === 0) {
    analyzed_clusters = [cluster];
  }

  return {
    mode,
    base_dir,
    pr_dir,
    output_html,
    output_summary,
    output_comment,
    live_diff_file,
    live_json_file,
    cluster,
    analyzed_clusters,
    all_clusters,
    repo_base,
    repo_pr,
    artifact_url,
  };
}

const config = parse_args();

// --- Live diff loading ---

function load_live_report(): LiveDiffReport | undefined {
  if (config.live_json_file && existsSync(config.live_json_file)) {
    try {
      const raw = readFileSync(config.live_json_file, 'utf-8');
      const parsed = JSON.parse(raw) as LiveDiffReport;
      if (parsed && Array.isArray(parsed.clusters)) {
        return parsed;
      }
    } catch (err) {
      console.error(`Warning: could not parse --live-json: ${(err as Error).message}`);
    }
  }
  return undefined;
}

const live_report = load_live_report();

let live_diff_text = '';
if (config.live_diff_file && existsSync(config.live_diff_file)) {
  live_diff_text = readFileSync(config.live_diff_file, 'utf-8').trim();
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

// --- Collect source / preview changes (used by HTML artifact only) ---

function collect_dir_changes(
  base_dir: string,
  pr_dir: string,
  extensions?: string[],
): FileChange[] {
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

const preview_extensions = ['.yaml', '.yml', '.json'];
const preview_changes = collect_dir_changes(config.base_dir, config.pr_dir, preview_extensions);

let source_changes: FileChange[] = [];
let cluster_config_changes: FileChange[] = [];

if (config.repo_base && config.repo_pr) {
  const base_templates = join(config.repo_base, 'templates');
  const pr_templates = join(config.repo_pr, 'templates');
  if (existsSync(base_templates) || existsSync(pr_templates)) {
    source_changes = collect_dir_changes(base_templates, pr_templates);
  }

  if (config.cluster) {
    const base_cluster = join(config.repo_base, 'clusters', config.cluster);
    const pr_cluster = join(config.repo_pr, 'clusters', config.cluster);
    if (existsSync(base_cluster) || existsSync(pr_cluster)) {
      cluster_config_changes = collect_dir_changes(base_cluster, pr_cluster);
    }
  }
}

// --- Identity / grouping helpers ---

function parse_k8s_identity(content: string): string | undefined {
  const kind_match = content.match(/^kind:\s*(.+)/m);
  const name_match = content.match(/^\s+name:\s*(.+)/m);
  if (!kind_match) return undefined;
  const kind = kind_match[1]?.trim();
  const name = name_match ? name_match[1]?.trim() : undefined;
  return name ? `${kind}/${name}` : kind;
}

function get_change_label(change: FileChange, search_dir?: string): string {
  let content: string | undefined;
  if (change.content) {
    content = change.content;
  } else if (change.status === 'modified' && search_dir) {
    try {
      content = readFileSync(join(search_dir, change.path), 'utf-8');
    } catch {
      // ignore
    }
  }
  const identity = content ? parse_k8s_identity(content) : undefined;
  return identity ?? basename(change.path, extname(change.path));
}

function extract_template_name(file_path: string): string {
  const parts = file_path.split('/');
  return parts[1] ?? parts[0] ?? 'unknown';
}

function short_template_name(template_dir: string): string {
  const match = template_dir.match(/^\d+(?:\.\d+)?-(.+)$/);
  return match?.[1] ?? template_dir;
}

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

function group_preview_by_template(items: FileChange[]): Map<string, FileChange[]> {
  const groups = new Map<string, FileChange[]>();
  for (const item of items) {
    const parts = item.path.split('/');
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

const all_source_changes = [...preview_changes, ...source_changes, ...cluster_config_changes];
const total_source_changes = all_source_changes.length;

function count_by_status(items: FileChange[]) {
  return {
    added: items.filter((c) => c.status === 'added').length,
    modified: items.filter((c) => c.status === 'modified').length,
    removed: items.filter((c) => c.status === 'removed').length,
  };
}

type TemplateSummary = {
  name: string;
  short_name: string;
  source_changes: FileChange[];
  config_changes: FileChange[];
};

function build_template_summaries(): TemplateSummary[] {
  const template_map = new Map<string, TemplateSummary>();
  const source_grouped = group_by_template(source_changes);
  for (const [template, changes] of source_grouped) {
    template_map.set(template, {
      name: template,
      short_name: short_template_name(template),
      source_changes: changes,
      config_changes: [],
    });
  }
  const preview_grouped = group_preview_by_template(preview_changes);
  for (const [template, changes] of preview_grouped) {
    if (template === 'flux-system') continue;
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
  return [...template_map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const template_summaries = build_template_summaries();
const flux_system_changes = preview_changes.filter((c) => c.path.startsWith('flux-system/'));

// --- Live diff rendering ---

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes requires matching ESC
const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

function strip_ansi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

function clean_flux_diff(text: string): string {
  // flux diff prints a progress line like "► OCIRepository ..." mixed with
  // the actual unified diff. Strip ANSI but keep the markers — they're useful
  // for seeing which resource a hunk applies to.
  return strip_ansi(text).trim();
}

function render_kustomization_block_md(k: KustomizationDiff): string {
  const cleaned = clean_flux_diff(k.diff);
  const summary = `📦 <b>${k.name}</b> <code>${k.template}</code>`;

  if (!k.has_changes) {
    return `- ✓ ${summary} — no changes`;
  }

  const body = cleaned.length > 0 ? cleaned : '(no diff output captured)';
  return `<details open>
<summary>${summary}</summary>

\`\`\`diff
${body}
\`\`\`

</details>`;
}

function render_control_plane_block_md(cluster: ClusterDiff): string {
  if (!cluster.control_plane.has_changes) return '';
  const cleaned = clean_flux_diff(cluster.control_plane.diff);
  return `<details>
<summary>⚙️ <b>Flux control-plane</b> (OCIRepository, Kustomization wrappers)</summary>

\`\`\`diff
${cleaned.length > 0 ? cleaned : '(no diff output captured)'}
\`\`\`

</details>`;
}

function render_cluster_section_md(cluster: ClusterDiff): string {
  const parts: string[] = [];
  parts.push(`#### \`${cluster.name}\``);

  if (!cluster.has_changes) {
    parts.push('\n✅ No changes — applying this PR will not modify any resources on this cluster.');
    return parts.join('\n');
  }

  const changed_kustomizations = cluster.kustomizations.filter((k) => k.has_changes);
  const unchanged = cluster.kustomizations.length - changed_kustomizations.length;

  const summary_bits: string[] = [];
  if (changed_kustomizations.length > 0) {
    summary_bits.push(
      `**${changed_kustomizations.length}** Kustomization${
        changed_kustomizations.length === 1 ? '' : 's'
      } will change`,
    );
  }
  if (cluster.control_plane.has_changes) {
    summary_bits.push('Flux control-plane will change');
  }
  if (unchanged > 0) {
    summary_bits.push(`${unchanged} unchanged`);
  }
  parts.push(`\n${summary_bits.join(' · ')}\n`);

  const cp = render_control_plane_block_md(cluster);
  if (cp) parts.push(cp);

  for (const k of changed_kustomizations) {
    parts.push(render_kustomization_block_md(k));
  }

  return parts.join('\n');
}

function build_cluster_status_table(): {
  table: string;
  any_changes: boolean;
  unanalyzed: string[];
} {
  const analyzed = new Set(config.analyzed_clusters);
  const all = new Set<string>(config.all_clusters);
  for (const c of analyzed) all.add(c);
  if (live_report) {
    for (const c of live_report.clusters) all.add(c.name);
  }

  const all_sorted = [...all].sort();
  const unanalyzed = all_sorted.filter((c) => !analyzed.has(c));
  const live_by_name = new Map<string, ClusterDiff>();
  for (const c of live_report?.clusters ?? []) {
    live_by_name.set(c.name, c);
  }

  let any_changes = false;
  const rows: string[] = ['| Cluster | Status | Detail |', '|---------|--------|--------|'];
  for (const name of all_sorted) {
    if (!analyzed.has(name)) {
      rows.push(
        `| \`${name}\` | ⚪ not analyzed | No kubeconfig configured for this cluster in CI |`,
      );
      continue;
    }
    const cluster = live_by_name.get(name);
    if (!cluster) {
      rows.push(`| \`${name}\` | ⚠️ analyzed but no data | Diff did not produce a report |`);
      continue;
    }
    if (!cluster.has_changes) {
      rows.push(`| \`${name}\` | ✅ no changes | Live cluster matches PR-merge state |`);
      continue;
    }
    any_changes = true;
    const changed_count = cluster.kustomizations.filter((k) => k.has_changes).length;
    const detail_bits: string[] = [];
    if (changed_count > 0) {
      detail_bits.push(`${changed_count} Kustomization${changed_count === 1 ? '' : 's'}`);
    }
    if (cluster.control_plane.has_changes) {
      detail_bits.push('control-plane');
    }
    rows.push(`| \`${name}\` | 🟡 changes detected | ${detail_bits.join(', ')} |`);
  }

  return { table: rows.join('\n'), any_changes, unanalyzed };
}

// ============================================================
// Comment mode — GitHub PR comment markdown
// ============================================================

const COMMENT_MAX_LENGTH = 60000;

function build_comment(): string {
  const parts: string[] = [];
  parts.push('### Kustodian PR Diff\n');
  parts.push(
    '_What `kustodian apply` will change in the live cluster(s) when this PR is merged._\n',
  );

  const has_live = live_report !== undefined || live_diff_text.length > 0;
  const have_any_clusters =
    config.all_clusters.length > 0 ||
    config.analyzed_clusters.length > 0 ||
    (live_report?.clusters.length ?? 0) > 0;

  if (have_any_clusters) {
    const { table, any_changes, unanalyzed } = build_cluster_status_table();
    parts.push(table);
    parts.push('');

    if (live_report) {
      for (const cluster of live_report.clusters) {
        parts.push('');
        parts.push(render_cluster_section_md(cluster));
      }
    } else if (live_diff_text) {
      // Fallback: legacy plain-text live diff with no per-cluster structure.
      const cleaned = strip_ansi(live_diff_text);
      parts.push('');
      parts.push(
        `<details open>\n<summary>Live cluster diff</summary>\n\n\`\`\`diff\n${cleaned}\n\`\`\`\n\n</details>`,
      );
    }

    if (!any_changes && unanalyzed.length === 0 && has_live) {
      parts.push('');
      parts.push('✅ No live cluster changes detected for any analyzed cluster.');
    }

    if (unanalyzed.length > 0) {
      parts.push('');
      parts.push(
        `> ⚪ \`${unanalyzed.join('`, `')}\` — not analyzed in CI. Wire up a kubeconfig secret to include ${
          unanalyzed.length === 1 ? 'it' : 'them'
        } in this report.`,
      );
    }
  } else if (live_report) {
    for (const cluster of live_report.clusters) {
      parts.push(render_cluster_section_md(cluster));
      parts.push('');
    }
  } else if (live_diff_text) {
    const cleaned = strip_ansi(live_diff_text);
    parts.push(
      `<details open>\n<summary>Live cluster diff</summary>\n\n\`\`\`diff\n${cleaned}\n\`\`\`\n\n</details>`,
    );
  } else {
    parts.push(
      '> ⚠️ No live cluster diff was produced. The action could not reach any cluster, so this PR comment cannot tell you what would actually change on apply.',
    );
  }

  // Footer pointing at the source-file review artifact.
  if (total_source_changes > 0) {
    const counts = count_by_status(all_source_changes);
    const count_bits = [
      counts.added ? `🟢 ${counts.added} added` : '',
      counts.modified ? `🔵 ${counts.modified} modified` : '',
      counts.removed ? `🔴 ${counts.removed} removed` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    parts.push('');
    parts.push('---');
    if (config.artifact_url) {
      parts.push(
        `📄 [Source-file review](${config.artifact_url}) — ${total_source_changes} file${
          total_source_changes === 1 ? '' : 's'
        } changed (${count_bits}). What was authored in this PR.`,
      );
    } else {
      parts.push(
        `📄 **Source-file review** — ${total_source_changes} file${
          total_source_changes === 1 ? '' : 's'
        } changed (${count_bits}). The HTML artifact attached to this workflow run shows the file-by-file diff.`,
      );
    }
  }

  let result = parts.join('\n');

  if (result.length > COMMENT_MAX_LENGTH) {
    result = result.slice(0, COMMENT_MAX_LENGTH);
    const open_details = (result.match(/<details/g) ?? []).length;
    const close_details = (result.match(/<\/details>/g) ?? []).length;
    const open_code = (result.match(/```/g) ?? []).length;
    if (open_code % 2 !== 0) result += '\n```\n';
    for (let i = 0; i < open_details - close_details; i++) result += '\n</details>';
    result +=
      '\n\n> **Note:** This diff was truncated. See the HTML artifact for the full source-file review.';
  }

  return result;
}

// ============================================================
// Terminal mode — quick local view of the live diff
// ============================================================

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

function render_terminal(): void {
  console.log(`\n${BOLD}━━━ Kustodian Diff — PR comment preview ━━━${RESET}\n`);

  if (live_report) {
    for (const cluster of live_report.clusters) {
      const status = cluster.has_changes
        ? `${YELLOW}changes detected${RESET}`
        : `${GREEN}no changes${RESET}`;
      console.log(`${BOLD}${CYAN}${cluster.name}${RESET}  ${status}`);
      if (cluster.control_plane.has_changes) {
        console.log(`  ${DIM}control-plane:${RESET}`);
        console.log(clean_flux_diff(cluster.control_plane.diff));
      }
      for (const k of cluster.kustomizations) {
        if (!k.has_changes) continue;
        console.log(`  ${DIM}${k.name} (${k.template}):${RESET}`);
        console.log(clean_flux_diff(k.diff));
      }
      console.log('');
    }
  } else if (live_diff_text) {
    console.log(strip_ansi(live_diff_text));
  } else {
    console.log(`${DIM}No live diff data provided.${RESET}`);
  }

  if (total_source_changes > 0) {
    const counts = count_by_status(all_source_changes);
    console.log(
      `\n${DIM}Source files changed: ${counts.added} added, ${counts.modified} modified, ${counts.removed} removed (HTML artifact)${RESET}\n`,
    );
  }
}

// ============================================================
// HTML mode — single-page source-file review artifact
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
  const label = get_change_label(
    change,
    config.repo_pr ? join(config.repo_pr, 'templates') : config.pr_dir,
  );
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
  const total_stats = count_by_status(all_source_changes);

  const stats_chips = [
    total_stats.added ? `<span class="chip added">+${total_stats.added} added</span>` : '',
    total_stats.modified
      ? `<span class="chip modified">~${total_stats.modified} modified</span>`
      : '',
    total_stats.removed ? `<span class="chip removed">-${total_stats.removed} removed</span>` : '',
    !total_source_changes ? '<span class="chip">No file changes</span>' : '',
  ]
    .filter(Boolean)
    .join('\n      ');

  let file_sections = '';
  if (total_source_changes === 0) {
    file_sections =
      '<div class="empty-state">No source-file changes detected. This PR may still affect cluster state via substitution variables or external dependencies.</div>';
  } else {
    for (const template of template_summaries) {
      file_sections += `<h2 class="cluster-heading">${escape_html(
        template.short_name,
      )} <span class="template-id">${escape_html(template.name)}</span></h2>`;

      if (template.source_changes.length > 0) {
        file_sections += '<h3 class="section-label">Manifests</h3>';
        file_sections += template.source_changes.map(render_file_section).join('\n');
      }
      if (template.config_changes.length > 0) {
        file_sections += '<h3 class="section-label">Flux Configuration</h3>';
        file_sections += template.config_changes.map(render_file_section).join('\n');
      }
    }

    if (flux_system_changes.length > 0) {
      file_sections += '<h2 class="cluster-heading">flux-system</h2>';
      file_sections += flux_system_changes.map(render_file_section).join('\n');
    }

    if (cluster_config_changes.length > 0) {
      file_sections += `<h2 class="cluster-heading">Cluster Config${
        config.cluster ? ` (${escape_html(config.cluster)})` : ''
      }</h2>`;
      file_sections += cluster_config_changes.map(render_file_section).join('\n');
    }
  }

  const template_list =
    template_summaries.length > 0
      ? `Templates with file changes: <strong>${template_summaries
          .map((t) => escape_html(t.short_name))
          .join(', ')}</strong>`
      : 'No templates with file changes';

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
  .template-id { font-size: 0.8rem; font-weight: 400; color: var(--muted); }
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
  .line { padding: 0 0.75rem; white-space: pre; min-height: 1.35em; }
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
    <p class="subtitle">Source-file review &mdash; what was authored in this PR. For the live cluster delta, see the PR comment.</p>
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
  const out_html = config.output_html as string;
  const out_summary = config.output_summary as string;
  const out_comment = config.output_comment as string;

  const html = build_html();
  const html_dir = dirname(out_html);
  if (!existsSync(html_dir)) mkdirSync(html_dir, { recursive: true });
  writeFileSync(out_html, html, 'utf-8');

  const total_stats = count_by_status(all_source_changes);
  const live_summary = live_report
    ? {
        has_changes: live_report.has_changes,
        clusters: live_report.clusters.map((c) => ({
          name: c.name,
          has_changes: c.has_changes,
          control_plane_changes: c.control_plane.has_changes,
          changed_kustomizations: c.kustomizations.filter((k) => k.has_changes).length,
          total_kustomizations: c.kustomizations.length,
        })),
      }
    : undefined;

  writeFileSync(
    out_summary,
    JSON.stringify({
      total: total_source_changes,
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
      files: all_source_changes.map((c) => ({ path: c.path, status: c.status })),
      live: live_summary,
      analyzed_clusters: config.analyzed_clusters,
      all_clusters: config.all_clusters,
    }),
    'utf-8',
  );

  writeFileSync(out_comment, build_comment(), 'utf-8');

  console.log(
    `Diff report: ${total_stats.added} added, ${total_stats.modified} modified, ${total_stats.removed} removed across ${template_summaries.length} template(s)`,
  );
  if (live_report) {
    const changed = live_report.clusters.filter((c) => c.has_changes).length;
    console.log(`Live diff: ${changed}/${live_report.clusters.length} cluster(s) have changes`);
  }
}

if (total_source_changes > 0 && config.mode !== 'ci') {
  process.exitCode = 1;
}
