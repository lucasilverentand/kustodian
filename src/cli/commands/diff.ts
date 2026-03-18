import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
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
      name: 'project',
      short: 'p',
      description: 'Path to project root',
      type: 'string',
    },
  ],
  handler: async (ctx, container) => {
    const cluster_filter = ctx.options['cluster'] as string | undefined;
    const provider_name = ctx.options['provider'] as string;
    const project_path = (ctx.options['project'] as string) || process.cwd();

    console.log('\n━━━ Kustodian Diff ━━━');

    const project_result = await load_and_resolve_project(project_path, cluster_filter);
    if (!is_success(project_result)) {
      return project_result;
    }

    const { project_root, project, target_clusters } = project_result.value;
    let has_changes = false;

    for (const loaded_cluster of target_clusters) {
      const cluster_name = loaded_cluster.cluster.metadata.name;
      const defaults = resolve_defaults(loaded_cluster.cluster, project.config);
      const flux_namespace = defaults.flux_namespace;
      const oci_registry_secret_name = defaults.oci_registry_secret_name;

      console.log(`\n━━━ Cluster: ${cluster_name} ━━━`);
      console.log(`  Provider: ${provider_name}`);
      console.log(`  ✓ Loaded ${loaded_cluster.nodes.length} nodes`);

      if (!loaded_cluster.cluster.spec.oci) {
        process.exitCode = 2;
        return {
          success: false as const,
          error: { code: 'INVALID_CONFIG', message: 'spec.oci configuration required' },
        };
      }

      const validation_result = validate_cluster_template_requirements(
        loaded_cluster,
        project.templates,
      );
      if (!is_success(validation_result)) {
        process.exitCode = 2;
        return validation_result;
      }

      // Resolve provider from plugin registry (before try block — no cleanup needed)
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
        return provider_result;
      }

      let temp_kubeconfig: string | undefined;
      let temp_flux_kustomization_dir: string | undefined;
      const provider: ClusterProviderType = provider_result.value;

      try {
        const node_list = build_node_list(loaded_cluster);

        const validate_result = provider.validate(node_list);
        if (!is_success(validate_result)) {
          process.exitCode = 2;
          return validate_result;
        }

        const kubeconfig_result = await provider.get_kubeconfig(node_list);
        if (!is_success(kubeconfig_result)) {
          process.exitCode = 2;
          return kubeconfig_result;
        }

        temp_kubeconfig = path.join(
          tmpdir(),
          `kustodian-diff-kubeconfig-${sanitize_filename_part(cluster_name)}.yaml`,
        );
        await writeFile(temp_kubeconfig, kubeconfig_result.value as string, 'utf-8');

        // Rename kubeconfig entries to cluster-scoped names
        const kubeconfig_manager = create_kubeconfig_manager();
        const rename_result = await kubeconfig_manager.rename_entries(
          temp_kubeconfig,
          cluster_name,
        );
        if (!is_success(rename_result)) {
          process.exitCode = 2;
          return rename_result;
        }

        const client_options = { kubeconfig: temp_kubeconfig };
        const kubectl_client = create_kubectl_client(client_options);
        const flux_client = create_flux_client(client_options);

        const flux_cli_result = await flux_client.check_cli();
        if (!is_success(flux_cli_result) || !flux_cli_result.value) {
          process.exitCode = 2;
          return {
            success: false as const,
            error: { code: 'MISSING_DEPENDENCY', message: 'flux CLI not found' },
          };
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
          process.exitCode = 2;
          return gen_result;
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
          process.exitCode = 2;
          return {
            success: false as const,
            error: {
              code: 'KUBECTL_GET_ERROR',
              message: `Failed to check OCI secret: ${secret_check.error.message}`,
            },
          };
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
                process.exitCode = 2;
                return {
                  success: false as const,
                  error: {
                    code: 'KUBECTL_GET_ERROR',
                    message: `Failed to check namespace '${flux_namespace}': ${namespace_check.error.message}`,
                  },
                };
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
            process.exitCode = 2;
            return object_diff_result;
          }

          if (object_diff_result.value.stdout) {
            console.log(object_diff_result.value.stdout);
          }
          if (object_diff_result.value.stderr) {
            console.error(object_diff_result.value.stderr);
          }

          if (object_diff_result.value.has_changes) {
            has_changes = true;
          } else {
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
            process.exitCode = 2;
            return workload_diff_result;
          }

          if (workload_diff_result.value.stdout) {
            console.log(workload_diff_result.value.stdout);
          }
          if (workload_diff_result.value.stderr) {
            console.error(workload_diff_result.value.stderr);
          }

          if (workload_diff_result.value.has_changes) {
            has_changes = true;
          }
        }
      } finally {
        await provider?.cleanup?.();
        if (temp_kubeconfig) {
          await unlink(temp_kubeconfig).catch(() => undefined);
        }
        if (temp_flux_kustomization_dir) {
          await rm(temp_flux_kustomization_dir, { recursive: true, force: true }).catch(
            () => undefined,
          );
        }
      }
    }

    if (has_changes) {
      process.exitCode = 1;
      console.log('\n━━━ Diff Complete: changes detected ━━━\n');
      return success(undefined);
    }

    process.exitCode = 0;
    console.log('\n━━━ Diff Complete: no changes ━━━\n');
    return success(undefined);
  },
});
