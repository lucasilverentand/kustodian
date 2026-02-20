import { execFile } from 'node:child_process';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { is_success, success } from '../../core/index.js';
import {
  create_generator,
  serialize_resource,
  validate_template_requirements,
} from '../../generator/index.js';
import { create_flux_client } from '../../k8s/flux.js';
import { create_kubectl_client } from '../../k8s/kubectl.js';
import {
  type LoadedClusterType,
  find_cluster,
  find_project_root,
  load_project,
} from '../../loader/index.js';
import type { NodeListType } from '../../nodes/index.js';
import type { ClusterType } from '../../schema/index.js';
import { define_command } from '../command.js';
import { OCI_REGISTRY_PROVIDER } from '../utils/cluster-secrets.js';
import { resolve_defaults } from '../utils/defaults.js';

const exec_file_async = promisify(execFile);

/**
 * Diff command - previews cluster changes without applying:
 * 1. Diff Flux control-plane resources with kubectl diff
 * 2. Diff rendered workloads with flux diff kustomization
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
  handler: async (ctx) => {
    const cluster_filter = ctx.options['cluster'] as string | undefined;
    const provider_name = ctx.options['provider'] as string;
    const project_path = (ctx.options['project'] as string) || process.cwd();

    if (provider_name !== 'k0s') {
      return {
        success: false as const,
        error: {
          code: 'UNSUPPORTED_PROVIDER',
          message: `Provider '${provider_name}' is not supported for diff`,
        },
      };
    }

    console.log('\n━━━ Kustodian Diff ━━━');

    console.log('\nLoading project configuration...');
    const root_result = await find_project_root(project_path);
    if (!is_success(root_result)) {
      console.error(`  ✗ Error: ${root_result.error.message}`);
      return root_result;
    }

    const project_root = root_result.value;
    console.log(`  → Project root: ${project_root}`);

    const project_result = await load_project(project_root);
    if (!is_success(project_result)) {
      console.error(`  ✗ Error: ${project_result.error.message}`);
      return project_result;
    }

    const project = project_result.value;
    console.log(`  ✓ Loaded ${project.templates.length} templates`);

    let target_clusters: LoadedClusterType[];
    if (cluster_filter) {
      const found = find_cluster(project.clusters, cluster_filter);
      if (!found) {
        return {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Cluster '${cluster_filter}' not found` },
        };
      }
      target_clusters = [found];
    } else {
      target_clusters = project.clusters;
    }

    if (target_clusters.length === 0) {
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: 'No clusters found in project' },
      };
    }

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

      const enabled_template_refs = loaded_cluster.cluster.spec.templates || [];
      if (enabled_template_refs.length > 0) {
        const enabled_templates = project.templates
          .filter((t) => enabled_template_refs.some((ref) => ref.name === t.template.metadata.name))
          .map((t) => t.template);

        const requirements_result = validate_template_requirements(
          enabled_templates,
          loaded_cluster.nodes,
        );

        if (!requirements_result.valid) {
          process.exitCode = 2;
          console.error('\n  ✗ Template requirement validation failed:');
          for (const error of requirements_result.errors) {
            console.error(`    - ${error.template}: ${error.message}`);
          }
          return {
            success: false as const,
            error: {
              code: 'REQUIREMENT_VALIDATION_ERROR',
              message: 'Template requirements not met',
            },
          };
        }
      }

      let temp_kubeconfig: string | undefined;
      let temp_flux_kustomization_dir: string | undefined;
      let provider: { cleanup?: () => Promise<unknown> } | undefined;

      try {
        const node_list: NodeListType = {
          cluster: cluster_name,
          nodes: loaded_cluster.nodes,
          ...(loaded_cluster.cluster.spec.node_defaults?.label_prefix && {
            label_prefix: loaded_cluster.cluster.spec.node_defaults.label_prefix,
          }),
        } as NodeListType;

        const k0s_package = 'kustodian-k0s';
        const { create_k0s_provider } = await import(k0s_package);
        const k0s_plugin = loaded_cluster.cluster.spec.plugins?.find(
          (p) => p.name === 'k0s' || p.name === '@kustodian/plugin-k0s',
        );
        const plugin_config = k0s_plugin?.config ?? {};

        const provider_options: Record<string, unknown> = {};
        if (plugin_config['k0s_version']) {
          provider_options['k0s_version'] = plugin_config['k0s_version'];
        }
        if (plugin_config['telemetry_enabled'] !== undefined) {
          provider_options['telemetry_enabled'] = plugin_config['telemetry_enabled'];
        }
        if (plugin_config['dynamic_config'] !== undefined) {
          provider_options['dynamic_config'] = plugin_config['dynamic_config'];
        }
        if (plugin_config['sans']) {
          provider_options['sans'] = plugin_config['sans'];
        }
        if (plugin_config['default_ssh']) {
          provider_options['default_ssh'] = plugin_config['default_ssh'];
        }
        provider_options['cluster_name'] = loaded_cluster.cluster.metadata.code ?? cluster_name;

        const provider_instance = create_k0s_provider(provider_options);
        provider = provider_instance;
        const validate_result = provider_instance.validate(node_list);
        if (!is_success(validate_result)) {
          process.exitCode = 2;
          return validate_result;
        }

        const kubeconfig_result = await provider_instance.get_kubeconfig(node_list);
        if (!is_success(kubeconfig_result)) {
          process.exitCode = 2;
          return kubeconfig_result;
        }

        temp_kubeconfig = path.join(tmpdir(), `kustodian-diff-kubeconfig-${cluster_name}.yaml`);
        await writeFile(temp_kubeconfig, kubeconfig_result.value as string, 'utf-8');

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
        const resources: object[] = [];

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
          resources.push(oci_repo);
        }

        for (const k of gen_data.kustomizations) {
          resources.push(k.flux_kustomization);
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
          path.join(tmpdir(), `kustodian-diff-${cluster_name}-`),
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

function get_provider_token_from_env(env_vars: string[]): string | undefined {
  for (const env_var of env_vars) {
    const env_token = process.env[env_var];
    if (env_token) {
      console.log(`  → Using ${env_var} from environment`);
      return env_token;
    }
  }
  return undefined;
}

function is_not_found_error(message: string): boolean {
  return /not\s*found/i.test(message);
}

function create_namespace_manifest(namespace: string): object {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespace,
    },
  };
}

function create_registry_secret_manifest(
  registry: string,
  token: string,
  secret_name: string,
  namespace: string,
): object {
  const auth_string = token.includes(':')
    ? Buffer.from(token).toString('base64')
    : Buffer.from(`_:${token}`).toString('base64');

  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: secret_name,
      namespace: namespace,
    },
    type: 'kubernetes.io/dockerconfigjson',
    data: {
      '.dockerconfigjson': Buffer.from(
        JSON.stringify({ auths: { [registry]: { auth: auth_string } } }),
      ).toString('base64'),
    },
  };
}

async function get_oci_tag(cluster: ClusterType, project_root: string): Promise<string> {
  if (!cluster.spec.oci) {
    return 'latest';
  }

  const strategy = cluster.spec.oci.tag_strategy || 'git-sha';
  switch (strategy) {
    case 'cluster':
      return cluster.metadata.name;
    case 'manual':
      return cluster.spec.oci.tag || 'latest';
    case 'version': {
      try {
        const { stdout } = await exec_file_async('git', ['describe', '--tags', '--abbrev=0'], {
          cwd: project_root,
        });
        return stdout.trim();
      } catch {
        return 'latest';
      }
    }
    default: {
      try {
        const { stdout } = await exec_file_async('git', ['rev-parse', '--short', 'HEAD'], {
          cwd: project_root,
        });
        return `sha1-${stdout.trim()}`;
      } catch {
        return 'latest';
      }
    }
  }
}
