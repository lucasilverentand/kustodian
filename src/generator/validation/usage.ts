import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse } from 'yaml';

import type { LoadedClusterType, LoadedTemplateType } from '../../loader/project.js';
import type { KustomizationType, TemplateConfigType, TemplateType } from '../../schema/index.js';
import { SUBSTITUTION_PATTERN } from '../substitution.js';

export type UsageIssueKindType =
  | 'invalid_kustomization_path'
  | 'invalid_kustomization_file'
  | 'invalid_resource_reference'
  | 'missing_kustomization_path'
  | 'missing_kustomization_file'
  | 'missing_resource_reference'
  | 'undeclared_variable'
  | 'unused_cluster_value'
  | 'unused_kustomization_directory'
  | 'unused_resource'
  | 'unused_substitution'
  | 'unused_template'
  | 'unused_template_value'
  | 'unused_template_version';

export interface UsageIssueType {
  readonly type: UsageIssueKindType;
  readonly message: string;
  readonly cluster?: string;
  readonly template?: string;
  readonly kustomization?: string;
  readonly field?: string;
  readonly path?: string;
  readonly reference?: string;
  readonly variable?: string;
}

export interface UsageValidationResultType {
  readonly valid: boolean;
  readonly issues: UsageIssueType[];
}

export interface UsageValidationOptionsType {
  /**
   * Project-wide checks, such as templates not used by any cluster, should be
   * skipped when `validate --cluster` intentionally narrows the validation scope.
   */
  readonly include_project_wide?: boolean;
}

interface KustomizationScanResultType {
  readonly available: boolean;
  readonly variables: Set<string>;
}

interface TemplateScanResultType {
  readonly issues: UsageIssueType[];
  readonly kustomization_variables: Map<string, Set<string>>;
}

interface TraversalContextType {
  readonly template_name: string;
  readonly kustomization_name: string;
  readonly template_root: string;
  readonly issues: UsageIssueType[];
  readonly used_dirs: Set<string>;
  readonly used_files: Set<string>;
  readonly visited_dirs: Set<string>;
  readonly variables: Set<string>;
}

interface KustomizeReferenceType {
  readonly field: string;
  readonly value: string;
}

const KUSTOMIZATION_FILE_NAMES = new Set([
  'kustomization.yaml',
  'kustomization.yml',
  'Kustomization',
]);

const RESOURCE_FILE_EXTENSIONS = new Set([
  '.cfg',
  '.conf',
  '.env',
  '.ini',
  '.json',
  '.properties',
  '.toml',
  '.tpl',
  '.txt',
  '.yaml',
  '.yml',
]);

const SKIPPED_DIRECTORY_NAMES = new Set(['.git', '.turbo', 'coverage', 'dist', 'node_modules']);

/**
 * Validates that project source files and configuration values are actually used.
 */
export async function validate_usage(
  project_root: string,
  clusters: LoadedClusterType[],
  templates: LoadedTemplateType[],
  options: UsageValidationOptionsType = {},
): Promise<UsageValidationResultType> {
  const issues: UsageIssueType[] = [];
  const include_project_wide = options.include_project_wide ?? true;

  if (include_project_wide) {
    issues.push(...validate_unused_templates(clusters, templates));
  }

  issues.push(...validate_unused_values(clusters, templates));

  for (const loaded_template of templates) {
    const scan = await scan_template_sources(project_root, loaded_template);
    issues.push(...scan.issues);
    issues.push(...validate_template_variables(loaded_template.template, scan));
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validate_unused_templates(
  clusters: LoadedClusterType[],
  templates: LoadedTemplateType[],
): UsageIssueType[] {
  const referenced_templates = new Set<string>();

  for (const cluster of clusters) {
    for (const ref of cluster.cluster.spec.templates ?? []) {
      referenced_templates.add(get_template_ref_name(ref));
    }
  }

  return templates
    .filter((loaded) => !referenced_templates.has(loaded.template.metadata.name))
    .map((loaded) => ({
      type: 'unused_template',
      template: loaded.template.metadata.name,
      path: loaded.path,
      message: `Template '${loaded.template.metadata.name}' is not referenced by any validated cluster`,
    }));
}

function validate_unused_values(
  clusters: LoadedClusterType[],
  templates: LoadedTemplateType[],
): UsageIssueType[] {
  const issues: UsageIssueType[] = [];
  const template_map = new Map(templates.map((loaded) => [loaded.template.metadata.name, loaded]));

  for (const cluster of clusters) {
    const cluster_name = cluster.cluster.metadata.name;
    const cluster_values = cluster.cluster.spec.values ?? {};
    const cluster_value_consumers = new Set<string>();
    const cluster_value_declared_anywhere = new Set<string>();

    for (const ref of cluster.cluster.spec.templates ?? []) {
      const template_name = get_template_ref_name(ref);
      const loaded = template_map.get(template_name);
      if (!loaded) {
        continue;
      }

      const declared_values = get_declared_value_names(loaded.template);
      const template_values = ref.values ?? {};

      for (const key of declared_values) {
        cluster_value_declared_anywhere.add(key);
        if (template_values[key] === undefined) {
          cluster_value_consumers.add(key);
        }
      }

      for (const key of Object.keys(template_values)) {
        if (!declared_values.has(key)) {
          issues.push({
            type: 'unused_template_value',
            cluster: cluster_name,
            template: ref.name,
            field: `spec.templates.${ref.name}.values.${key}`,
            variable: key,
            message: `Cluster '${cluster_name}', template '${ref.name}' sets value '${key}' but template '${template_name}' does not declare that version or substitution`,
          });
        }
      }
    }

    for (const key of Object.keys(cluster_values)) {
      if (cluster_value_consumers.has(key)) {
        continue;
      }

      const reason = cluster_value_declared_anywhere.has(key)
        ? 'every matching template instance overrides it'
        : 'no validated template declares that version or substitution';

      issues.push({
        type: 'unused_cluster_value',
        cluster: cluster_name,
        field: `spec.values.${key}`,
        variable: key,
        message: `Cluster '${cluster_name}' sets value '${key}' but ${reason}`,
      });
    }
  }

  return issues;
}

function get_template_ref_name(ref: TemplateConfigType): string {
  return ref.template ?? ref.name;
}

function get_declared_value_names(template: TemplateType): Set<string> {
  const names = new Set<string>();

  for (const version of template.spec.versions ?? []) {
    names.add(version.name);
  }

  for (const kustomization of template.spec.kustomizations) {
    for (const substitution of kustomization.substitutions ?? []) {
      names.add(substitution.name);
    }
  }

  return names;
}

async function scan_template_sources(
  project_root: string,
  loaded_template: LoadedTemplateType,
): Promise<TemplateScanResultType> {
  const template = loaded_template.template;
  const template_name = template.metadata.name;
  const template_root = path.resolve(loaded_template.path);
  const issues: UsageIssueType[] = [];
  const used_dirs = new Set<string>();
  const used_files = new Set<string>();
  const kustomization_variables = new Map<string, Set<string>>();

  for (const kustomization of template.spec.kustomizations) {
    const scan = await scan_declared_kustomization(
      template_name,
      kustomization,
      template_root,
      issues,
      used_dirs,
      used_files,
    );
    if (scan.available) {
      kustomization_variables.set(kustomization.name, scan.variables);
    }
  }

  const kustomization_dirs = await find_kustomization_directories(template_root);
  for (const dir of kustomization_dirs) {
    if (!used_dirs.has(dir)) {
      issues.push({
        type: 'unused_kustomization_directory',
        template: template_name,
        path: format_project_path(project_root, dir),
        message: `Template '${template_name}' contains kustomization directory '${format_project_path(
          project_root,
          dir,
        )}' that is not reachable from spec.kustomizations`,
      });
    }
  }

  const source_files = await list_files_recursively(template_root);
  for (const file of source_files) {
    if (!is_resource_candidate_file(template_root, file)) {
      continue;
    }

    if (!used_files.has(file)) {
      issues.push({
        type: 'unused_resource',
        template: template_name,
        path: format_project_path(project_root, file),
        message: `Template '${template_name}' contains unused resource/config file '${format_project_path(
          project_root,
          file,
        )}'`,
      });
    }
  }

  return { issues, kustomization_variables };
}

async function scan_declared_kustomization(
  template_name: string,
  kustomization: KustomizationType,
  template_root: string,
  issues: UsageIssueType[],
  used_dirs: Set<string>,
  used_files: Set<string>,
): Promise<KustomizationScanResultType> {
  const root_dir = path.resolve(template_root, kustomization.path);

  if (!is_path_inside(root_dir, template_root)) {
    issues.push({
      type: 'invalid_kustomization_path',
      template: template_name,
      kustomization: kustomization.name,
      path: kustomization.path,
      message: `Template '${template_name}', kustomization '${kustomization.name}' path '${kustomization.path}' escapes the template directory`,
    });
    return { available: false, variables: new Set() };
  }

  const stat = await stat_optional(root_dir);
  if (!stat) {
    issues.push({
      type: 'missing_kustomization_path',
      template: template_name,
      kustomization: kustomization.name,
      path: kustomization.path,
      message: `Template '${template_name}', kustomization '${kustomization.name}' points to missing path '${kustomization.path}'`,
    });
    return { available: false, variables: new Set() };
  }

  if (!stat.isDirectory()) {
    issues.push({
      type: 'invalid_kustomization_path',
      template: template_name,
      kustomization: kustomization.name,
      path: kustomization.path,
      message: `Template '${template_name}', kustomization '${kustomization.name}' path '${kustomization.path}' is not a directory`,
    });
    return { available: false, variables: new Set() };
  }

  const context: TraversalContextType = {
    template_name,
    kustomization_name: kustomization.name,
    template_root,
    issues,
    used_dirs,
    used_files,
    visited_dirs: new Set(),
    variables: new Set(),
  };

  const available = await traverse_kustomization_directory(root_dir, context, kustomization.path);
  return { available, variables: context.variables };
}

async function traverse_kustomization_directory(
  dir: string,
  context: TraversalContextType,
  display_ref: string,
): Promise<boolean> {
  const normalized_dir = path.resolve(dir);
  if (context.visited_dirs.has(normalized_dir)) {
    return true;
  }

  context.visited_dirs.add(normalized_dir);
  context.used_dirs.add(normalized_dir);

  const kustomization_file = await find_kustomization_file(normalized_dir);
  if (!kustomization_file) {
    context.issues.push({
      type: 'missing_kustomization_file',
      template: context.template_name,
      kustomization: context.kustomization_name,
      path: display_ref,
      message: `Template '${context.template_name}', kustomization '${context.kustomization_name}' directory '${display_ref}' has no kustomization.yaml`,
    });
    return false;
  }

  context.used_files.add(kustomization_file);

  const content = await read_text_optional(kustomization_file);
  if (content === undefined) {
    return false;
  }

  add_variables_from_text(content, context.variables);

  const parsed = parse_kustomization_file(content, kustomization_file, context);
  if (!parsed) {
    return false;
  }

  let valid = true;
  const references = collect_kustomize_references(parsed);
  for (const reference of references) {
    const reference_valid = await visit_kustomize_reference(reference, normalized_dir, context);
    valid = valid && reference_valid;
  }

  return valid;
}

async function visit_kustomize_reference(
  reference: KustomizeReferenceType,
  base_dir: string,
  context: TraversalContextType,
): Promise<boolean> {
  const value = reference.value.trim();
  if (value.length === 0 || is_remote_reference(value)) {
    return true;
  }

  const local_value = strip_kustomize_ref_suffix(extract_file_path(value));
  const resolved = path.resolve(base_dir, local_value);
  if (!is_path_inside(resolved, context.template_root)) {
    context.issues.push({
      type: 'invalid_resource_reference',
      template: context.template_name,
      kustomization: context.kustomization_name,
      reference: value,
      message: `Template '${context.template_name}', kustomization '${context.kustomization_name}' reference '${value}' escapes the template directory`,
    });
    return false;
  }

  const stat = await stat_optional(resolved);
  if (!stat) {
    context.issues.push({
      type: 'missing_resource_reference',
      template: context.template_name,
      kustomization: context.kustomization_name,
      reference: value,
      message: `Template '${context.template_name}', kustomization '${context.kustomization_name}' references missing ${reference.field} '${value}'`,
    });
    return false;
  }

  if (stat.isDirectory()) {
    return traverse_kustomization_directory(resolved, context, value);
  }

  if (stat.isFile()) {
    context.used_files.add(resolved);
    const content = await read_text_optional(resolved);
    if (content !== undefined) {
      add_variables_from_text(content, context.variables);
    }
    return true;
  }

  return true;
}

function validate_template_variables(
  template: TemplateType,
  scan: TemplateScanResultType,
): UsageIssueType[] {
  const issues: UsageIssueType[] = [];
  const template_name = template.metadata.name;
  const template_version_names = new Set(
    (template.spec.versions ?? []).map((version) => version.name),
  );
  const used_template_versions = new Set<string>();

  for (const kustomization of template.spec.kustomizations) {
    const variables = scan.kustomization_variables.get(kustomization.name);
    if (!variables) {
      continue;
    }

    const declared = new Set<string>(['namespace', ...template_version_names]);
    const declared_substitutions = new Set<string>();

    for (const substitution of kustomization.substitutions ?? []) {
      declared.add(substitution.name);
      declared_substitutions.add(substitution.name);
    }

    for (const variable of variables) {
      if (template_version_names.has(variable)) {
        used_template_versions.add(variable);
      }

      if (!declared.has(variable)) {
        issues.push({
          type: 'undeclared_variable',
          template: template_name,
          kustomization: kustomization.name,
          variable,
          message: `Template '${template_name}', kustomization '${kustomization.name}' uses '\${${variable}}' but does not declare a matching version or substitution`,
        });
      }
    }

    for (const substitution of declared_substitutions) {
      if (!variables.has(substitution)) {
        issues.push({
          type: 'unused_substitution',
          template: template_name,
          kustomization: kustomization.name,
          variable: substitution,
          message: `Template '${template_name}', kustomization '${kustomization.name}' declares substitution '${substitution}' but no reachable resource uses '\${${substitution}}'`,
        });
      }
    }
  }

  for (const version of template_version_names) {
    if (!used_template_versions.has(version)) {
      issues.push({
        type: 'unused_template_version',
        template: template_name,
        variable: version,
        message: `Template '${template_name}' declares version '${version}' but no reachable resource uses '\${${version}}'`,
      });
    }
  }

  return issues;
}

function parse_kustomization_file(
  content: string,
  file_path: string,
  context: TraversalContextType,
): Record<string, unknown> | undefined {
  try {
    const parsed = parse(content) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    context.issues.push({
      type: 'invalid_kustomization_file',
      template: context.template_name,
      kustomization: context.kustomization_name,
      path: file_path,
      message: `Template '${context.template_name}', kustomization '${context.kustomization_name}' has invalid kustomization file '${file_path}'`,
    });
    return undefined;
  } catch (error) {
    context.issues.push({
      type: 'invalid_kustomization_file',
      template: context.template_name,
      kustomization: context.kustomization_name,
      path: file_path,
      message: `Template '${context.template_name}', kustomization '${context.kustomization_name}' cannot parse kustomization file '${file_path}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return undefined;
  }
}

function collect_kustomize_references(
  kustomization: Record<string, unknown>,
): KustomizeReferenceType[] {
  const references: KustomizeReferenceType[] = [];

  push_string_array_refs(references, 'resources', kustomization['resources']);
  push_string_array_refs(references, 'bases', kustomization['bases']);
  push_string_array_refs(references, 'components', kustomization['components']);
  push_string_array_refs(references, 'crds', kustomization['crds']);
  push_string_array_refs(references, 'configurations', kustomization['configurations']);
  push_string_array_refs(references, 'generators', kustomization['generators']);
  push_string_array_refs(references, 'transformers', kustomization['transformers']);
  push_string_array_refs(references, 'validators', kustomization['validators']);
  push_string_array_refs(references, 'patches', kustomization['patches']);
  push_string_array_refs(
    references,
    'patchesStrategicMerge',
    kustomization['patchesStrategicMerge'],
  );

  for (const patch of as_object_array(kustomization['patches'])) {
    push_string_ref(references, 'patches.path', patch['path']);
  }

  for (const patch of as_object_array(kustomization['patchesJson6902'])) {
    push_string_ref(references, 'patchesJson6902.path', patch['path']);
  }

  for (const generator of [
    ...as_object_array(kustomization['configMapGenerator']),
    ...as_object_array(kustomization['secretGenerator']),
  ]) {
    push_string_array_refs(references, 'generator.files', generator['files'], extract_file_path);
    push_string_array_refs(references, 'generator.envs', generator['envs']);
    push_string_ref(references, 'generator.env', generator['env']);
  }

  for (const chart of as_object_array(kustomization['helmCharts'])) {
    push_string_ref(references, 'helmCharts.valuesFile', chart['valuesFile']);
    push_string_array_refs(
      references,
      'helmCharts.additionalValuesFiles',
      chart['additionalValuesFiles'],
    );
  }

  const openapi = as_object(kustomization['openapi']);
  if (openapi) {
    push_string_ref(references, 'openapi.path', openapi['path']);
  }

  push_string_array_refs(references, 'replacements', kustomization['replacements']);
  for (const replacement of as_object_array(kustomization['replacements'])) {
    push_string_ref(references, 'replacements.path', replacement['path']);
  }

  return references;
}

function push_string_array_refs(
  references: KustomizeReferenceType[],
  field: string,
  value: unknown,
  transform: (value: string) => string = (item) => item,
): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const item of value) {
    if (typeof item === 'string') {
      references.push({ field, value: transform(item) });
    }
  }
}

function push_string_ref(
  references: KustomizeReferenceType[],
  field: string,
  value: unknown,
): void {
  if (typeof value === 'string') {
    references.push({ field, value });
  }
}

function as_object(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function as_object_array(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const object = as_object(item);
    return object ? [object] : [];
  });
}

function extract_file_path(value: string): string {
  const equals_index = value.indexOf('=');
  if (equals_index <= 0) {
    return value;
  }
  return value.slice(equals_index + 1);
}

function strip_kustomize_ref_suffix(value: string): string {
  return value.split('#')[0]?.split('?')[0] ?? value;
}

function add_variables_from_text(content: string, variables: Set<string>): void {
  for (const match of content.matchAll(SUBSTITUTION_PATTERN)) {
    const name = match[1];
    if (name) {
      variables.add(name);
    }
  }
}

async function find_kustomization_directories(dir: string): Promise<string[]> {
  const dirs: string[] = [];
  const kustomization_file = await find_kustomization_file(dir);
  if (kustomization_file) {
    dirs.push(path.resolve(dir));
  }

  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return dirs;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || should_skip_directory(entry.name)) {
      continue;
    }
    dirs.push(...(await find_kustomization_directories(path.join(dir, entry.name))));
  }

  return dirs;
}

async function find_kustomization_file(dir: string): Promise<string | undefined> {
  for (const file_name of KUSTOMIZATION_FILE_NAMES) {
    const file_path = path.join(dir, file_name);
    const stat = await stat_optional(file_path);
    if (stat?.isFile()) {
      return path.resolve(file_path);
    }
  }
  return undefined;
}

async function list_files_recursively(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries: Array<import('node:fs').Dirent>;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!should_skip_directory(entry.name)) {
        files.push(...(await list_files_recursively(path.join(dir, entry.name))));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(path.resolve(dir, entry.name));
    }
  }

  return files;
}

async function stat_optional(file_path: string): Promise<import('node:fs').Stats | undefined> {
  try {
    return await fs.stat(file_path);
  } catch {
    return undefined;
  }
}

async function read_text_optional(file_path: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file_path, 'utf-8');
  } catch {
    return undefined;
  }
}

function is_resource_candidate_file(template_root: string, file_path: string): boolean {
  const basename = path.basename(file_path);
  if (basename.startsWith('.') || KUSTOMIZATION_FILE_NAMES.has(basename)) {
    return false;
  }

  if (path.resolve(file_path) === path.join(path.resolve(template_root), 'template.yaml')) {
    return false;
  }

  return RESOURCE_FILE_EXTENSIONS.has(path.extname(file_path));
}

function should_skip_directory(name: string): boolean {
  return name.startsWith('.') || SKIPPED_DIRECTORY_NAMES.has(name);
}

function is_remote_reference(value: string): boolean {
  return (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) ||
    value.startsWith('git::') ||
    value.startsWith('github.com/') ||
    value.startsWith('bitbucket.org/') ||
    value.startsWith('gitlab.com/')
  );
}

function is_path_inside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function format_project_path(project_root: string, file_path: string): string {
  const relative = path.relative(project_root, file_path);
  return relative.startsWith('..') ? file_path : relative;
}
