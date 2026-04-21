import { existsSync } from 'node:fs';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { KustodianErrorType } from '../../core/index.js';
import { is_success, success } from '../../core/index.js';
import { create_generator, serialize_resource } from '../../generator/index.js';
import { create_flux_client } from '../../k8s/flux.js';
import { create_kubeconfig_manager } from '../../k8s/kubeconfig.js';
import type { K8sObjectType } from '../../k8s/kubectl.js';
import { create_kubectl_client } from '../../k8s/kubectl.js';
import type { ClusterProviderType } from '../../plugins/index.js';
import { define_command } from '../command.js';
import { PLUGIN_REGISTRY_ID } from '../services.js';
import { OCI_REGISTRY_PROVIDER } from '../utils/cluster-secrets.js';
import { resolve_defaults } from '../utils/defaults.js';
import {
  type ClusterDiffStatsType,
  type DiffStatsType,
  has_changes as diff_has_changes,
  empty_diff_stats,
  merge_diff_stats,
  parse_diff_stats,
  render_summary_table,
} from '../utils/diff-stats.js';
import { is_not_found_error } from '../utils/k8s-errors.js';
import {
  create_namespace_manifest,
  create_registry_secret_manifest,
  get_oci_tag,
  get_provider_token_from_env,
} from '../utils/oci.js';
import { load_and_resolve_project, sanitize_filename_part } from '../utils/project.js';
import { build_node_list, resolve_provider } from '../utils/provider.js';
import { validate_cluster_template_requirements } from '../utils/validation.js';

/**
 * Diff command - previews cluster changes without applying:
 * 1. Diff Flux control-plane resources with kubectl diff
 * 2. Diff rendered workloads with flux diff kustomization
 *
 * Exit codes follow Unix diff convention:
 *   0 = no changes detected
 *   1 = changes detected (not an error)
 *   2 = error occurred
 */
export const diff_command = define_command({
  name: 'diff',
  description: 'Preview cluster changes without applying them',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Cluster name to diff (defaults to all clusters)',
      type: 'string',
    },
    {
      name: 'provider',
      short: 'P',
      description: 'Cluster provider for kubeconfig retrieval',
      type: 'string',
      default_value: 'k0s',
    },
    {
      name: 'kubeconfig',
      short: 'k',
      description: 'Path to kubeconfig file (skips provider/SSH)',
      type: 'string',
    },
    {
      name: 'project',
      short: 'p',
      description: 'Path to project root',
      type: 'string',
    },
  ],
  handler: async (ctx, container) => {
    const cluster_filter = ctx.options['cluster'] as string | undefined;
    const provider_name = ctx.options['provider'] as string;
    const kubeconfig_path = ctx.options['kubeconfig'] as string | undefined;
    const project_path = (ctx.options['project'] as string) || process.cwd();

    console.log('\n━━━ Kustodian Diff ━━━');

    const project_result = await load_and_resolve_project(project_path, cluster_filter);
    if (!is_success(project_result)) {
      return project_result;
    }

    const { project_root, project, target_clusters } = project_result.value;
    const cluster_summaries: ClusterDiffStatsType[] = [];
    let first_error: KustodianErrorType | undefined;
    const record_error = (err: KustodianErrorType) => {
      if (!first_error) first_error = err;
    };

    for (const loaded_cluster of target_clusters) {
      const cluster_name = loaded_cluster.cluster.metadata.name;
      const defaults = resolve_defaults(loaded_cluster.cluster, project.config);
      const flux_namespace = defaults.flux_namespace;
      const oci_registry_secret_name = defaults.oci_registry_secret_name;

      console.log(`\n━━━ Cluster: ${cluster_name} ━━━`);

      if (!loaded_cluster.cluster.spec.oci) {
        const err: KustodianErrorType = {
          code: 'INVALID_CONFIG',
          message: 'spec.oci configuration required',
        };
        console.error(`  ✗ ${err.message}`);
        cluster_summaries.push({
          cluster: cluster_name,
          stats: empty_diff_stats(),
          error: 'spec.oci required',
        });
        record_error(err);
        continue;
      }

      const validation_result = validate_cluster_template_requirements(
        loaded_cluster,
        project.templates,
      );
      if (!is_success(validation_result)) {
        console.error(`  ✗ ${validation_result.error.message}`);
        cluster_summaries.push({
          cluster: cluster_name,
          stats: empty_diff_stats(),
          error: validation_result.error.message,
        });
        record_error(validation_result.error);
        continue;
      }

      // Resolve kubeconfig: either from --kubeconfig flag or via provider SSH
      let resolved_kubeconfig: string;
      let temp_kubeconfig: string | undefined;
      let provider: ClusterProviderType | undefined;

      if (kubeconfig_path) {
        if (!existsSync(kubeconfig_path)) {
          const err: KustodianErrorType = {
            code: 'INVALID_CONFIG',
            message: `Kubeconfig file not found: ${kubeconfig_path}`,
          };
          console.error(`  ✗ ${err.message}`);
          cluster_summaries.push({
            cluster: cluster_name,
            stats: empty_diff_stats(),
            error: 'kubeconfig not found',
          });
          record_error(err);
          continue;
        }
        console.log(`  Kubeconfig: ${kubeconfig_path}`);
        resolved_kubeconfig = kubeconfig_path;
      } else {
        console.log(`  Provider: ${provider_name}`);
        console.log(`  ✓ Loaded ${loaded_cluster.nodes.length} nodes`);

        const registry_result = container.resolve(PLUGIN_REGISTRY_ID);
        if (!is_success(registry_result)) {
          return registry_result;
        }
        const provider_result = resolve_provider(
          registry_result.value,
          loaded_cluster,
          provider_name,
        );
        if (!is_success(provider_result)) {
          console.error(`  ✗ ${provider_result.error.message}`);
          cluster_summaries.push({
            cluster: cluster_name,
            stats: empty_diff_stats(),
            error: provider_result.error.message,
          });
          record_error(provider_result.error);
          continue;
        }
        provider = provider_result.value;

        const node_list = build_node_list(loaded_cluster);

        const validate_result = provider.validate(node_list);
        if (!is_success(validate_result)) {
          console.error(`  ✗ ${validate_result.error.message}`);
          cluster_summaries.push({
            cluster: cluster_name,
            stats: empty_diff_stats(),
            error: validate_result.error.message,
          });
          record_error(validate_result.error);
          await provider.cleanup?.();
          continue;
        }

        const kubeconfig_result = await provider.get_kubeconfig(node_list);
        if (!is_success(kubeconfig_result)) {
          console.error(`  ✗ ${kubeconfig_result.error.message}`);
          cluster_summaries.push({
            cluster: cluster_name,
            stats: empty_diff_stats(),
            error: kubeconfig_result.error.message,
          });
          record_error(kubeconfig_result.error);
          await provider.cleanup?.();
          continue;
        }

        temp_kubeconfig = path.join(
          tmpdir(),
          `kustodian-diff-kubeconfig-${sanitize_filename_part(cluster_name)}.yaml`,
        );
        await writeFile(temp_kubeconfig, kubeconfig_result.value as string, 'utf-8');

        const kubeconfig_manager = create_kubeconfig_manager();
        const rename_result = await kubeconfig_manager.rename_entries(
          temp_kubeconfig,
          cluster_name,
        );
        if (!is_success(rename_result)) {
          console.error(`  ✗ ${rename_result.error.message}`);
          cluster_summaries.push({
            cluster: cluster_name,
            stats: empty_diff_stats(),
            error: rename_result.error.message,
          });
          record_error(rename_result.error);
          await provider.cleanup?.();
          await unlink(temp_kubeconfig).catch(() => undefined);
          continue;
        }

        resolved_kubeconfig = temp_kubeconfig;
      }

      let temp_flux_kustomization_dir: string | undefined;
      let cluster_stats: DiffStatsType = empty_diff_stats();
      let cluster_error: string | undefined;

      try {
        const client_options = { kubeconfig: resolved_kubeconfig };
        const kubectl_client = create_kubectl_client(client_options);
        const flux_client = create_flux_client(client_options);

        const flux_cli_result = await flux_client.check_cli();
        if (!is_success(flux_cli_result) || !flux_cli_result.value) {
          cluster_error = 'flux CLI not found';
          console.error(`  ✗ ${cluster_error}`);
          record_error({ code: 'MISSING_DEPENDENCY', message: cluster_error });
          continue;
        }

        const templates_dir = path.join(project_root, 'templates');
        const template_paths = new Map<string, string>();
        for (const t of project.templates) {
          template_paths.set(t.template.metadata.name, path.relative(templates_dir, t.path));
        }

        const generator = create_generator({
          flux_namespace: defaults.flux_namespace,
          git_repository_name: defaults.oci_repository_name,
          template_paths,
          flux_reconciliation_interval: defaults.flux_reconciliation_interval,
          flux_reconciliation_timeout: defaults.flux_reconciliation_timeout,
          flux_reconciliation_retry_interval: defaults.flux_reconciliation_retry_interval,
        });

        const gen_result = await generator.generate(
          loaded_cluster.cluster,
          project.templates.map((t) => t.template),
          {},
        );
        if (!is_success(gen_result)) {
          cluster_error = gen_result.error.message;
          console.error(`  ✗ ${cluster_error}`);
          record_error(gen_result.error);
          continue;
        }

        const gen_data = gen_result.value;
        const tag = await get_oci_tag(loaded_cluster.cluster, project_root);

        let oci_has_auth = false;
        const resources: K8sObjectType[] = [];

        const secret_check = await kubectl_client.get({
          kind: 'Secret',
          name: oci_registry_secret_name,
          namespace: flux_namespace,
        });

        if (is_success(secret_check)) {
          oci_has_auth = true;
        } else if (!is_not_found_error(secret_check.error.message)) {
          cluster_error = `Failed to check OCI secret: ${secret_check.error.message}`;
          console.error(`  ✗ ${cluster_error}`);
          record_error({ code: 'KUBECTL_GET_ERROR', message: cluster_error });
          continue;
        } else {
          const token = get_provider_token_from_env(OCI_REGISTRY_PROVIDER.env_vars);
          if (token) {
            oci_has_auth = true;
            const namespace_check = await kubectl_client.get({
              kind: 'Namespace',
              name: flux_namespace,
            });
            if (!is_success(namespace_check)) {
              if (is_not_found_error(namespace_check.error.message)) {
                resources.push(create_namespace_manifest(flux_namespace));
              } else {
                cluster_error = `Failed to check namespace '${flux_namespace}': ${namespace_check.error.message}`;
                console.error(`  ✗ ${cluster_error}`);
                record_error({ code: 'KUBECTL_GET_ERROR', message: cluster_error });
                continue;
              }
            }

            resources.push(
              create_registry_secret_manifest(
                loaded_cluster.cluster.spec.oci.registry,
                token,
                oci_registry_secret_name,
                flux_namespace,
              ),
            );
          } else {
            console.warn(`  ⚠ ${OCI_REGISTRY_PROVIDER.skip_warning}`);
          }
        }

        if (gen_data.oci_repository) {
          const oci_repo = {
            ...gen_data.oci_repository,
            spec: {
              ...gen_data.oci_repository.spec,
              ref: { tag },
            },
          };
          if (oci_has_auth) {
            oci_repo.spec = {
              ...oci_repo.spec,
              secretRef: { name: oci_registry_secret_name },
            };
          }
          resources.push(oci_repo as K8sObjectType);
        }

        for (const k of gen_data.kustomizations) {
          resources.push(k.flux_kustomization as K8sObjectType);
        }

        if (resources.length > 0) {
          console.log('\n  → Diffing Flux control-plane resources...');
          const object_diff_result = await kubectl_client.diff_stdin(
            resources.map((resource) => serialize_resource(resource)).join('---\n'),
          );
          if (!is_success(object_diff_result)) {
            cluster_error = object_diff_result.error.message;
            console.error(`  ✗ ${cluster_error}`);
            record_error(object_diff_result.error);
            continue;
          }

          if (object_diff_result.value.stdout) {
            console.log(object_diff_result.value.stdout);
            cluster_stats = merge_diff_stats(
              cluster_stats,
              parse_diff_stats(object_diff_result.value.stdout),
            );
          }
          if (object_diff_result.value.stderr) {
            console.error(object_diff_result.value.stderr);
          }

          if (!object_diff_result.value.has_changes) {
            console.log('    ✓ No Flux object changes');
          }
        }

        console.log('\n  → Diffing rendered workloads...');
        temp_flux_kustomization_dir = await mkdtemp(
          path.join(tmpdir(), `kustodian-diff-${sanitize_filename_part(cluster_name)}-`),
        );

        for (const generated of gen_data.kustomizations) {
          const flux_kustomization_file = path.join(
            temp_flux_kustomization_dir,
            `${generated.name}.yaml`,
          );
          await writeFile(
            flux_kustomization_file,
            serialize_resource(generated.flux_kustomization),
            'utf-8',
          );

          const local_path = path.join(project_root, generated.path.replace(/^\.\//, ''));
          const workload_diff_result = await flux_client.diff_kustomization(generated.name, {
            path: local_path,
            kustomization_file: flux_kustomization_file,
            namespace: flux_namespace,
            progress_bar: false,
          });

          if (!is_success(workload_diff_result)) {
            cluster_error = workload_diff_result.error.message;
            console.error(`  ✗ ${cluster_error}`);
            record_error(workload_diff_result.error);
            break;
          }

          if (workload_diff_result.value.stdout) {
            console.log(workload_diff_result.value.stdout);
            cluster_stats = merge_diff_stats(
              cluster_stats,
              parse_diff_stats(workload_diff_result.value.stdout),
            );
          }
          if (workload_diff_result.value.stderr) {
            console.error(workload_diff_result.value.stderr);
          }
        }
      } finally {
        if (provider) await provider.cleanup?.();
        if (temp_kubeconfig) {
          await unlink(temp_kubeconfig).catch(() => undefined);
        }
        if (temp_flux_kustomization_dir) {
          await rm(temp_flux_kustomization_dir, { recursive: true, force: true }).catch(
            () => undefined,
          );
        }

        const entry: ClusterDiffStatsType = {
          cluster: cluster_name,
          stats: cluster_stats,
        };
        if (cluster_error) entry.error = cluster_error;
        cluster_summaries.push(entry);
      }
    }

    const any_changes = cluster_summaries.some((c) => !c.error && diff_has_changes(c.stats));

    if (cluster_summaries.length > 0) {
      console.log('\n━━━ Summary ━━━\n');
      console.log(render_summary_table(cluster_summaries));
      console.log('');
    }

    if (first_error) {
      process.exitCode = 2;
      console.log('━━━ Diff Complete: errors occurred ━━━\n');
      return {
        success: false as const,
        error: first_error,
      };
    }

    if (any_changes) {
      process.exitCode = 1;
      console.log('━━━ Diff Complete: changes detected ━━━\n');
      return success(undefined);
    }

    process.exitCode = 0;
    console.log('━━━ Diff Complete: no changes ━━━\n');
    return success(undefined);
  },
});
