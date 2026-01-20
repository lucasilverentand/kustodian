import * as path from 'node:path';

import { type ResultType, failure, is_success, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';
import { read_yaml_file, write_yaml_file } from '@kustodian/loader';
import { find_project_root, load_project } from '@kustodian/loader';
import {
  type ImageReferenceType,
  type RegistryClientType,
  type TagInfoType,
  check_version_update,
  create_client_for_image,
  create_helm_client,
  filter_semver_tags,
  parse_image_reference,
} from '@kustodian/registry';
import {
  type HelmSubstitutionType,
  type VersionSubstitutionType,
  is_helm_substitution,
  is_helm_version_entry,
  is_image_version_entry,
  is_version_substitution,
} from '@kustodian/schema';

import { define_command } from '../command.js';

/**
 * Update result for a single substitution.
 */
interface UpdateResultType {
  cluster: string;
  template: string;
  substitution: string;
  source: string; // Image name or Helm chart reference
  source_type: 'image' | 'helm';
  current: string;
  latest: string;
  constraint?: string | undefined;
  updated: boolean;
}

/**
 * Update command - checks and updates version substitutions.
 */
export const update_command = define_command({
  name: 'update',
  description: 'Check and update image version substitutions',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Cluster to update values for',
      type: 'string',
      required: true,
    },
    {
      name: 'project',
      short: 'p',
      description: 'Path to project root',
      type: 'string',
    },
    {
      name: 'dry-run',
      short: 'd',
      description: 'Show what would be updated without making changes',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'json',
      description: 'Output results as JSON',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'substitution',
      short: 's',
      description: 'Only update specific substitution(s)',
      type: 'string',
    },
  ],
  handler: async (ctx) => {
    const cluster_name = ctx.options['cluster'] as string;
    const project_path = (ctx.options['project'] as string) || process.cwd();
    const dry_run = ctx.options['dry-run'] as boolean;
    const json_output = ctx.options['json'] as boolean;
    const substitution_filter = ctx.options['substitution'] as string | undefined;

    // Load project
    const root_result = await find_project_root(project_path);
    if (!is_success(root_result)) {
      return root_result;
    }

    const project_result = await load_project(root_result.value);
    if (!is_success(project_result)) {
      return project_result;
    }

    const project = project_result.value;
    const loaded_cluster = project.clusters.find((c) => c.cluster.metadata.name === cluster_name);

    if (!loaded_cluster) {
      console.error(`Cluster '${cluster_name}' not found`);
      return failure({
        code: 'NOT_FOUND',
        message: `Cluster '${cluster_name}' not found`,
      });
    }

    // Collect all version and helm substitutions from templates enabled in this cluster
    const version_subs: Array<{
      template_name: string;
      kustomization_name: string;
      substitution: VersionSubstitutionType | HelmSubstitutionType;
      current_value: string | undefined;
      type: 'version' | 'helm';
    }> = [];

    for (const loaded_template of project.templates) {
      const template = loaded_template.template;
      const template_config = loaded_cluster.cluster.spec.templates?.find(
        (t) => t.name === template.metadata.name,
      );

      // Skip disabled templates
      if (template_config?.enabled === false) {
        continue;
      }

      // Collect template-level versions (shared across all kustomizations)
      for (const version of template.spec.versions ?? []) {
        if (substitution_filter && version.name !== substitution_filter) {
          continue;
        }

        if (is_image_version_entry(version)) {
          version_subs.push({
            template_name: template.metadata.name,
            kustomization_name: '__template__',
            substitution: {
              type: 'version',
              name: version.name,
              default: version.default,
              constraint: version.constraint,
              registry: version.registry,
              tag_pattern: version.tag_pattern,
              exclude_prerelease: version.exclude_prerelease,
            },
            current_value: template_config?.values?.[version.name] ?? version.default,
            type: 'version',
          });
        } else if (is_helm_version_entry(version)) {
          version_subs.push({
            template_name: template.metadata.name,
            kustomization_name: '__template__',
            substitution: {
              type: 'helm',
              name: version.name,
              default: version.default,
              constraint: version.constraint,
              helm: version.helm,
              tag_pattern: version.tag_pattern,
              exclude_prerelease: version.exclude_prerelease,
            },
            current_value: template_config?.values?.[version.name] ?? version.default,
            type: 'helm',
          });
        }
      }

      // Collect kustomization-level substitutions
      for (const kustomization of template.spec.kustomizations) {
        for (const sub of kustomization.substitutions ?? []) {
          if (is_version_substitution(sub)) {
            if (substitution_filter && sub.name !== substitution_filter) {
              continue;
            }

            version_subs.push({
              template_name: template.metadata.name,
              kustomization_name: kustomization.name,
              substitution: sub,
              current_value: template_config?.values?.[sub.name] ?? sub.default,
              type: 'version',
            });
          } else if (is_helm_substitution(sub)) {
            if (substitution_filter && sub.name !== substitution_filter) {
              continue;
            }

            version_subs.push({
              template_name: template.metadata.name,
              kustomization_name: kustomization.name,
              substitution: sub,
              current_value: template_config?.values?.[sub.name] ?? sub.default,
              type: 'helm',
            });
          }
        }
      }
    }

    if (version_subs.length === 0) {
      if (!json_output) {
        console.log('No version substitutions found.');
      } else {
        console.log('[]');
      }
      return success(undefined);
    }

    if (!json_output) {
      console.log(`Found ${version_subs.length} version substitution(s) to check\n`);
    }

    // Check each version and helm substitution
    const results: UpdateResultType[] = [];
    const updates_to_apply: Map<string, Record<string, string>> = new Map();

    for (const { template_name, substitution, current_value, type } of version_subs) {
      let source_name: string;
      let client: RegistryClientType;

      if (type === 'version') {
        const version_sub = substitution as VersionSubstitutionType;
        const image_ref = parse_image_reference(version_sub.registry.image);
        source_name = version_sub.registry.image;
        client = create_client_for_image(image_ref);
      } else {
        // helm type
        const helm_sub = substitution as HelmSubstitutionType;
        source_name = helm_sub.helm.oci || helm_sub.helm.repository || '';
        source_name = `${source_name}/${helm_sub.helm.chart}`;
        // Create helm config object to satisfy exactOptionalPropertyTypes
        const helm_config: { repository?: string; oci?: string; chart: string } = {
          chart: helm_sub.helm.chart,
        };
        if (helm_sub.helm.repository) {
          helm_config.repository = helm_sub.helm.repository;
        }
        if (helm_sub.helm.oci) {
          helm_config.oci = helm_sub.helm.oci;
        }
        client = create_helm_client(helm_config);
      }

      if (!json_output) {
        console.log(`Checking ${substitution.name} (${source_name})...`);
      }

      // For version type, we need to pass the image reference
      // For helm type, the parameter is optional and ignored
      let tags_result: ResultType<TagInfoType[], KustodianErrorType>;
      if (type === 'version') {
        tags_result = await client.list_tags(parse_image_reference(source_name));
      } else {
        // Helm client - the list_tags parameter is optional for helm clients
        type ListTagsFn = (
          ref?: ImageReferenceType,
        ) => Promise<ResultType<TagInfoType[], KustodianErrorType>>;
        tags_result = await (client.list_tags as ListTagsFn)(undefined);
      }
      if (!is_success(tags_result)) {
        if (!json_output) {
          console.error(`  Failed to fetch tags: ${tags_result.error.message}`);
        }
        continue;
      }

      const versions = filter_semver_tags(tags_result.value, {
        exclude_prerelease: substitution.exclude_prerelease ?? true,
      });

      if (versions.length === 0) {
        if (!json_output) {
          console.log('  No valid semver tags found');
        }
        continue;
      }

      const current = current_value ?? substitution.default ?? '0.0.0';
      const check = check_version_update(current, versions, substitution.constraint);

      const result: UpdateResultType = {
        cluster: cluster_name,
        template: template_name,
        substitution: substitution.name,
        source: source_name,
        source_type: type === 'version' ? 'image' : 'helm',
        current: check.current_version,
        latest: check.latest_version,
        constraint: substitution.constraint,
        updated: false,
      };

      if (check.has_update) {
        result.updated = !dry_run;

        if (!dry_run) {
          // Queue update for this template
          const existing = updates_to_apply.get(template_name) ?? {};
          existing[substitution.name] = check.latest_version;
          updates_to_apply.set(template_name, existing);
        }

        if (!json_output) {
          const action = dry_run ? 'available' : 'will update';
          console.log(`  ${current} -> ${check.latest_version} (${action})`);
        }
      } else if (!json_output) {
        console.log(`  ${current} (up to date)`);
      }

      results.push(result);
    }

    // Apply updates to cluster.yaml
    if (!dry_run && updates_to_apply.size > 0) {
      const cluster_path = path.join(loaded_cluster.path, 'cluster.yaml');
      const cluster_yaml_result = await read_yaml_file<Record<string, unknown>>(cluster_path);

      if (!is_success(cluster_yaml_result)) {
        return cluster_yaml_result;
      }

      const cluster_data = cluster_yaml_result.value;
      const spec = cluster_data['spec'] as Record<string, unknown> | undefined;
      const templates = (spec?.['templates'] as Array<Record<string, unknown>> | undefined) ?? [];

      for (const [template_name, values] of updates_to_apply) {
        const template_idx = templates.findIndex((t) => t['name'] === template_name);

        if (template_idx >= 0) {
          const template = templates[template_idx];
          const existing_values = (template?.['values'] as Record<string, string>) ?? {};
          if (template) {
            template['values'] = { ...existing_values, ...values };
          }
        } else {
          // Add new template config with values
          templates.push({
            name: template_name,
            values,
          });
        }
      }

      // Ensure spec.templates exists
      if (spec) {
        spec['templates'] = templates;
      }

      const write_result = await write_yaml_file(cluster_path, cluster_data);
      if (!is_success(write_result)) {
        return write_result;
      }

      if (!json_output) {
        console.log(`\nUpdated ${cluster_path}`);
      }
    }

    // Output results
    if (json_output) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      const update_count = results.filter(
        (r) => r.updated || (dry_run && r.current !== r.latest),
      ).length;
      const action = dry_run ? 'available' : 'applied';
      console.log(`\n${update_count} update(s) ${action}`);
    }

    return success(undefined);
  },
});
