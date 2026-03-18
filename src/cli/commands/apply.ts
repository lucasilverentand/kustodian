import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { is_success, success } from '../../core/index.js';
import { create_flux_client } from '../../k8s/flux.js';
import type { K8sObjectType } from '../../k8s/kubectl.js';
import { create_kubectl_client } from '../../k8s/kubectl.js';

import { serialize_resource } from '../../generator/index.js';
import { define_command } from '../command.js';
import { PLUGIN_REGISTRY_ID } from '../services.js';
import { type ClusterSecretProvider, OCI_REGISTRY_PROVIDER } from '../utils/cluster-secrets.js';
import { confirm } from '../utils/confirm.js';
import { resolve_defaults } from '../utils/defaults.js';
import { create_registry_secret_manifest, get_oci_tag } from '../utils/oci.js';
import { load_and_resolve_project, sanitize_filename_part } from '../utils/project.js';
import { build_node_list, resolve_provider } from '../utils/provider.js';
import { validate_cluster_template_requirements } from '../utils/validation.js';

const execFileAsync = promisify(execFile);

function client_extra_args(options: { kubeconfig?: string; context?: string }): string[] {
  const args: string[] = [];
  if (options.kubeconfig) args.push(`--kubeconfig=${options.kubeconfig}`);
  if (options.context) args.push(`--context=${options.context}`);
  return args;
}

/**
 * Apply command - orchestrates full cluster setup:
 * 1. Bootstrap nodes with k0s
 * 2. Install Flux CD
 * 3. Deploy templates
 */
export const apply_command = define_command({
  name: 'apply',
  description: 'Apply full cluster configuration (bootstrap + Flux + templates)',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Cluster name to apply (defaults to all clusters)',
      type: 'string',
    },
    {
      name: 'provider',
      short: 'P',
      description: 'Cluster provider for bootstrap',
      type: 'string',
      default_value: 'k0s',
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
      description: 'Preview what would happen without making changes',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'skip-bootstrap',
      description: 'Skip cluster bootstrap (use existing cluster)',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'skip-flux',
      description: 'Skip Flux CD installation',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'skip-templates',
      description: 'Skip template deployment',
      type: 'boolean',
      default_value: false,
    },
  ],
  handler: async (ctx, container) => {
    const cluster_filter = ctx.options['cluster'] as string | undefined;
    const provider_name = ctx.options['provider'] as string;
    const project_path = (ctx.options['project'] as string) || process.cwd();
    const dry_run = ctx.options['dry-run'] as boolean;
    const skip_bootstrap = ctx.options['skip-bootstrap'] as boolean;
    const skip_flux = ctx.options['skip-flux'] as boolean;
    const skip_templates = ctx.options['skip-templates'] as boolean;

    console.log('\n━━━ Kustodian Apply ━━━');
    if (dry_run) {
      console.log('Mode: DRY RUN');
    }

    // ===== Load Project =====
    const project_result = await load_and_resolve_project(project_path, cluster_filter);
    if (!is_success(project_result)) {
      return project_result;
    }

    const { project_root, project, target_clusters } = project_result.value;

    // ===== Confirmation =====
    if (!dry_run) {
      console.log('\nThe following will be applied:\n');
      console.log('  Clusters:');
      for (const c of target_clusters) {
        console.log(`    - ${c.cluster.metadata.name}`);
      }
      console.log('');
      console.log('  Actions:');
      if (!skip_bootstrap) console.log('    - Bootstrap cluster');
      if (!skip_flux) console.log('    - Install Flux CD');
      if (!skip_templates) {
        console.log('    - Configure cluster secrets');
        console.log('    - Deploy templates');
      }
      console.log('');

      const confirmed = await confirm('Proceed?');
      if (!confirmed) {
        console.log('Aborted.');
        return success(undefined);
      }
    }

    // ===== Apply to each cluster =====
    for (const loaded_cluster of target_clusters) {
      const cluster_name = loaded_cluster.cluster.metadata.name;

      if (target_clusters.length > 1) {
        console.log(`\n━━━ Cluster: ${cluster_name} ━━━`);
      } else {
        console.log(`\nCluster: ${cluster_name}`);
        console.log(`Provider: ${provider_name}`);
      }

      console.log(`  ✓ Loaded ${loaded_cluster.nodes.length} nodes`);

      // Resolve cluster defaults (Flux namespace, OCI secret names, etc.)
      const defaults = resolve_defaults(loaded_cluster.cluster, project.config);
      const FLUX_NAMESPACE = defaults.flux_namespace;
      const OCI_REGISTRY_SECRET_NAME = defaults.oci_registry_secret_name;

      // Track temp kubeconfig for cleanup
      let temp_kubeconfig: string | undefined;

      try {
        // ===== PHASE 2: Bootstrap Cluster =====
        if (!skip_bootstrap) {
          console.log('\n[2/3] Applying cluster configuration with k0s...');

          // Check if we have nodes to bootstrap
          if (loaded_cluster.nodes.length === 0) {
            console.error('  ✗ Error: No nodes defined for cluster');
            console.error(
              '  → Add nodes to cluster.yaml spec.nodes or create node files in nodes/ directory',
            );
            return {
              success: false as const,
              error: { code: 'NOT_FOUND', message: 'No nodes defined for cluster' },
            };
          }

          // Build NodeListType for bootstrap workflow
          const node_list = build_node_list(loaded_cluster);

          // Resolve provider from plugin registry
          const registry_result = container.resolve(PLUGIN_REGISTRY_ID);
          if (!is_success(registry_result)) {
            console.error('  ✗ Plugin registry not available');
            return registry_result;
          }
          const provider_result = resolve_provider(
            registry_result.value,
            loaded_cluster,
            provider_name,
          );
          if (!is_success(provider_result)) {
            console.error(
              `  ✗ Provider '${provider_name}' not found: ${provider_result.error.message}`,
            );
            return provider_result;
          }
          const provider = provider_result.value;

          console.log('  → Validating cluster configuration...');
          const validate_result = provider.validate(node_list);
          if (!is_success(validate_result)) {
            console.error(`  ✗ Validation failed: ${validate_result.error.message}`);
            return validate_result;
          }
          console.log('    ✓ Configuration valid');

          console.log('  → Running k0sctl apply...');
          if (dry_run) {
            // Show generated config preview if available
            if (provider.get_config_preview) {
              const preview_result = provider.get_config_preview(node_list);
              if (is_success(preview_result)) {
                const preview_yaml = preview_result.value as string;
                console.log('    [dry-run] Generated k0sctl config:');
                for (const line of preview_yaml.split('\n')) {
                  console.log(`      ${line}`);
                }
              }
            }
            console.log('    [dry-run] Would run: k0sctl apply --config <config-path>');
            console.log('    [dry-run] Would run: k0sctl kubeconfig --config <config-path>');
            console.log('    [dry-run] Would run: merge kubeconfig into ~/.kube/config');
          } else {
            const install_result = await provider.install(node_list, { dry_run: false });
            if (!is_success(install_result)) {
              console.error(`  ✗ Installation failed: ${install_result.error.message}`);
              return install_result;
            }
            console.log('    ✓ k0s cluster applied');

            console.log('  → Retrieving kubeconfig...');
            const kubeconfig_result = await provider.get_kubeconfig(node_list);
            if (!is_success(kubeconfig_result)) {
              console.error(`  ✗ Failed to get kubeconfig: ${kubeconfig_result.error.message}`);
              return kubeconfig_result;
            }
            console.log('    ✓ Retrieved kubeconfig');

            // Write kubeconfig to temp file — kept alive for the entire cluster loop
            temp_kubeconfig = path.join(
              (await import('node:os')).tmpdir(),
              `kustodian-kubeconfig-${sanitize_filename_part(cluster_name)}.yaml`,
            );
            const { writeFile } = await import('node:fs/promises');
            await writeFile(temp_kubeconfig, kubeconfig_result.value as string, 'utf-8');

            // Rename kubeconfig entries to cluster-scoped names
            console.log('  → Renaming kubeconfig entries...');
            const { create_kubeconfig_manager } = await import('../../k8s/kubeconfig.js');
            const kubeconfig_manager = create_kubeconfig_manager();
            const rename_result = await kubeconfig_manager.rename_entries(
              temp_kubeconfig,
              cluster_name,
            );
            if (!is_success(rename_result)) {
              console.error(
                `  ✗ Failed to rename kubeconfig entries: ${rename_result.error.message}`,
              );
              return rename_result;
            }
            console.log(`    ✓ Context: ${cluster_name}, User: ${cluster_name}-admin`);

            // Merge into ~/.kube/config for user convenience
            console.log('  → Merging kubeconfig into ~/.kube/config...');
            const merge_result = await kubeconfig_manager.merge(temp_kubeconfig);

            if (!is_success(merge_result)) {
              console.error(`  ✗ Failed to merge kubeconfig: ${merge_result.error.message}`);
              return merge_result;
            }
            console.log('    ✓ Kubeconfig merged into ~/.kube/config');

            console.log('  → Waiting for cluster nodes to be ready...');
            try {
              await execFileAsync(
                'kubectl',
                [
                  'wait',
                  '--for=condition=Ready',
                  'node',
                  '--all',
                  '--timeout=300s',
                  ...client_extra_args({ kubeconfig: temp_kubeconfig }),
                ],
                { timeout: 320000 },
              );
              console.log('    ✓ All nodes are ready');
            } catch {
              console.log('    ⚠ Some nodes may not be ready yet');
            }
          }

          console.log('  ✓ k0s apply completed');

          // Clean up temp config files
          await provider.cleanup?.();

          if (!dry_run) {
            console.log('  → Allowing control plane to stabilize...');
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        } else {
          console.log('\n[2/3] Skipping bootstrap (using existing cluster)');
        }

        // Create kubectl/flux clients targeting the temp kubeconfig (or cluster context for skip-bootstrap)
        const context = loaded_cluster.cluster.metadata.context;
        const client_options = temp_kubeconfig
          ? { kubeconfig: temp_kubeconfig }
          : context
            ? { context }
            : {};
        const kubectl_client = create_kubectl_client(client_options);
        const flux_client = create_flux_client(client_options);

        // ===== PHASE 3: Install Flux CD =====
        if (!skip_flux) {
          console.log('\n[3/3] Checking Flux CD status...');

          let flux_installed = false;
          const ns_result = await kubectl_client.get({
            kind: 'Namespace',
            name: 'flux-system',
          });
          if (is_success(ns_result)) {
            console.log('  ✓ Flux CD is already installed');
            flux_installed = true;
          } else {
            console.log('  → Flux CD not detected');
          }

          if (!flux_installed) {
            console.log('  → Installing Flux CD...');

            // Check if flux CLI is available
            const cli_result = await flux_client.check_cli();
            if (!is_success(cli_result) || !cli_result.value) {
              console.error('  ✗ Error: flux CLI not found');
              console.error('  → Install with: brew install fluxcd/tap/flux');
              return {
                success: false as const,
                error: { code: 'MISSING_DEPENDENCY', message: 'flux CLI not found' },
              };
            }

            if (dry_run) {
              console.log('    [dry-run] Would run: flux install');
            } else {
              console.log('    Running: flux install');
              const install_result = await flux_client.install();
              if (!is_success(install_result)) {
                console.error(`  ✗ Flux installation failed: ${install_result.error.message}`);
                return {
                  success: false as const,
                  error: { code: 'FLUX_INSTALL_FAILED', message: 'Flux installation failed' },
                };
              }
              console.log('    ✓ Flux CD installed successfully');

              // Wait for Flux to be ready
              console.log('    Waiting for Flux components to be ready...');
              const check_result = await flux_client.check();
              if (is_success(check_result)) {
                console.log('    ✓ Flux components are ready');
              } else {
                console.log('    ⚠ Flux components may not be fully ready yet');
              }
            }
          }
        } else {
          console.log('\n[3/3] Skipping Flux CD installation');
        }

        // ===== PHASE 4: Configure Secrets =====
        let oci_has_auth = false;
        if (!skip_templates) {
          console.log('\n[4/5] Configuring cluster secrets...');

          // Handle cluster secrets
          const secrets = loaded_cluster.cluster.spec.secrets;
          if (secrets?.length) {
            for (const secret of secrets) {
              console.log(`  → Checking ${secret.name} secret...`);
              await ensure_cluster_secret(secret, dry_run, client_options);
            }
          } else {
            console.log('  → No secret providers configured');
          }

          // Handle OCI registry secret alongside other cluster secrets
          if (loaded_cluster.cluster.spec.oci) {
            console.log('  → Checking OCI registry secret...');
            oci_has_auth = await ensure_oci_cluster_secret(
              loaded_cluster.cluster.spec.oci.registry,
              dry_run,
              OCI_REGISTRY_SECRET_NAME,
              FLUX_NAMESPACE,
              client_options,
            );
          }
        }

        // ===== PHASE 5: Deploy Templates =====
        if (!skip_templates) {
          console.log('\n[5/5] Deploying templates...');

          // Validate template requirements
          console.log('  → Validating template requirements...');
          const requirements_check = validate_cluster_template_requirements(
            loaded_cluster,
            project.templates,
          );
          if (!is_success(requirements_check)) {
            return requirements_check;
          }
          if ((loaded_cluster.cluster.spec.templates || []).length > 0) {
            console.log('    ✓ All template requirements satisfied');
          }

          if (loaded_cluster.cluster.spec.oci) {
            // OCI Mode - generate in memory and apply directly
            console.log('  → Cluster uses OCI deployment');
            console.log('  → Generating Flux resources...');

            const { create_generator } = await import('../../generator/index.js');
            const oci_repository_name = defaults.oci_repository_name;

            // Build template paths map - maps template name to relative path from templates/
            const templates_dir = path.join(project_root, 'templates');
            const template_paths = new Map<string, string>();
            for (const t of project.templates) {
              // Get relative path from templates directory
              const relative_path = path.relative(templates_dir, t.path);
              template_paths.set(t.template.metadata.name, relative_path);
            }

            const generator = create_generator({
              flux_namespace: defaults.flux_namespace,
              git_repository_name: oci_repository_name,
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
              console.error(`  ✗ Generation failed: ${gen_result.error.message}`);
              return gen_result;
            }

            const gen_data = gen_result.value;
            console.log(`  ✓ Generated ${gen_data.kustomizations.length} Flux Kustomizations`);

            if (dry_run) {
              console.log('\n  [dry-run] Would push to OCI and apply Flux resources');
              if (oci_has_auth) {
                console.log(`  → Secret: ${OCI_REGISTRY_SECRET_NAME} (registry auth)`);
              }
              if (gen_data.oci_repository) {
                console.log(`  → OCIRepository: ${gen_data.oci_repository.metadata.name}`);
              }
              for (const k of gen_data.kustomizations) {
                console.log(`  → Kustomization: ${k.name} (${k.path})`);
              }
              console.log('  [dry-run] Would trigger Flux reconciliation');
            } else {
              // Push to OCI registry
              console.log('  → Pushing to OCI registry...');
              const tag = await get_oci_tag(loaded_cluster.cluster, project_root);
              const oci = loaded_cluster.cluster.spec.oci;
              const oci_url = `oci://${oci.registry}/${oci.repository}:${tag}`;

              try {
                const git_source = await get_git_source(project_root);
                const git_revision = await get_git_revision(project_root);

                const ignore_paths = [
                  'node_modules/',
                  '.git/',
                  '.gitignore',
                  '.gitmodules',
                  '.gitattributes',
                ].join(',');
                await execFileAsync(
                  'flux',
                  [
                    'push',
                    'artifact',
                    oci_url,
                    '--path',
                    project_root,
                    '--source',
                    git_source,
                    '--revision',
                    git_revision,
                    '--ignore-paths',
                    ignore_paths,
                    ...client_extra_args(client_options),
                  ],
                  { timeout: 120000 },
                );
                console.log(`    ✓ Pushed to ${oci_url}`);
              } catch (error) {
                const err = error as Error;
                console.error(`  ✗ Push failed: ${err.message}`);
                return {
                  success: false as const,
                  error: { code: 'PUSH_FAILED', message: err.message },
                };
              }

              // Apply Flux resources directly (no file writes)
              console.log('  → Applying Flux resources...');
              try {
                // Build combined YAML for all resources
                const resources: K8sObjectType[] = [];

                // Add OCIRepository with correct tag and auth
                if (gen_data.oci_repository) {
                  const oci_repo = { ...gen_data.oci_repository };
                  oci_repo.spec = { ...oci_repo.spec, ref: { tag } };

                  // Add secretRef if auth is configured
                  if (oci_has_auth) {
                    oci_repo.spec = {
                      ...oci_repo.spec,
                      secretRef: { name: defaults.oci_registry_secret_name },
                    };
                  }

                  resources.push(oci_repo as K8sObjectType);
                }

                // Add all Kustomizations
                for (const k of gen_data.kustomizations) {
                  resources.push(k.flux_kustomization as K8sObjectType);
                }

                // Serialize and apply via kubectl client
                const yaml_content = resources.map((r) => serialize_resource(r)).join('---\n');
                const apply_result = await kubectl_client.apply_stdin(yaml_content);
                if (!is_success(apply_result)) {
                  throw new Error(apply_result.error.message);
                }
                if (apply_result.value) console.log(`    ${apply_result.value}`);

                console.log('    ✓ Flux resources applied');
              } catch (error) {
                const err = error as Error;
                console.error(`  ✗ Apply failed: ${err.message}`);
                return {
                  success: false as const,
                  error: { code: 'APPLY_FAILED', message: err.message },
                };
              }

              // Trigger reconciliation without waiting for it to complete
              console.log('  → Triggering Flux reconciliation...');

              if (gen_data.oci_repository) {
                flux_client.reconcile({
                  kind: 'OCIRepository',
                  name: gen_data.oci_repository.metadata.name,
                  namespace: FLUX_NAMESPACE,
                });
                console.log(
                  `    ✓ Triggered OCIRepository/${gen_data.oci_repository.metadata.name}`,
                );
              }

              for (const k of gen_data.kustomizations) {
                flux_client.reconcile({
                  kind: 'Kustomization',
                  name: k.name,
                  namespace: FLUX_NAMESPACE,
                });
                console.log(`    ✓ Triggered Kustomization/${k.name}`);
              }

              console.log('\n  ✓ Deployment complete (reconciliation in progress)');
            }
          } else {
            console.error('  ✗ Error: Cluster must have spec.oci configured');
            console.error('  → Git-based deployment has been removed');
            return {
              success: false as const,
              error: { code: 'INVALID_CONFIG', message: 'spec.oci configuration required' },
            };
          }
        } else {
          console.log('\n[4/5] Skipping secrets configuration');
          console.log('\n[5/5] Skipping template deployment');
        }
      } finally {
        // Clean up temp kubeconfig file at end of cluster loop
        if (temp_kubeconfig) {
          try {
            const { unlink } = await import('node:fs/promises');
            await unlink(temp_kubeconfig);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    } // end for each cluster

    console.log('\n━━━ Apply Complete ━━━\n');
    return success(undefined);
  },
});

/**
 * Gets the git remote URL for source metadata.
 */
async function get_git_source(project_root: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: project_root,
    });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Gets the current git revision for source metadata.
 */
async function get_git_revision(project_root: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: project_root });
    return `sha1:${stdout.trim()}`;
  } catch {
    return 'unknown';
  }
}

/**
 * Prompts for user input with hidden option for sensitive data.
 */
async function prompt_for_input(message: string, hidden = false): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      process.stdout.write(message);
      const stdin = process.stdin;
      stdin.setRawMode?.(true);
      stdin.resume();

      let input = '';
      const onData = (char: Buffer): void => {
        const c = char.toString();
        if (c === '\n' || c === '\r') {
          stdin.setRawMode?.(false);
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          stdin.setRawMode?.(false);
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          process.exit(130);
        } else if (c === '\u007F') {
          if (input.length > 0) input = input.slice(0, -1);
        } else {
          input += c;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

/**
 * Ensures OCI registry secret exists, creating if needed.
 * Checks env vars, prompts user for token, creates secret if needed.
 */
async function ensure_oci_cluster_secret(
  registry: string,
  dry_run: boolean,
  secret_name: string,
  namespace: string,
  client_options: { kubeconfig?: string; context?: string },
): Promise<boolean> {
  // Check if secret exists
  try {
    await execFileAsync(
      'kubectl',
      ['get', 'secret', secret_name, '-n', namespace, ...client_extra_args(client_options)],
      {
        timeout: 5000,
      },
    );
    console.log('    ✓ OCI registry secret exists');
    return true;
  } catch {
    // Need to create
  }

  const token = await get_provider_token(OCI_REGISTRY_PROVIDER);
  if (!token) {
    console.log('    → No OCI registry token provided, skipping secret creation');
    console.log(`    ⚠ ${OCI_REGISTRY_PROVIDER.skip_warning}`);
    return false;
  }

  // Ensure namespace exists
  const ns_ok = await ensure_namespace(namespace, dry_run, client_options);
  if (!ns_ok) {
    return false;
  }

  const secret = create_registry_secret_manifest(registry, token, secret_name, namespace);

  if (dry_run) {
    console.log(`    [dry-run] Would create secret: ${secret_name}`);
    return true;
  }

  // Apply secret via kubectl client
  try {
    const client = create_kubectl_client(client_options);
    const result = await client.apply_stdin(serialize_resource(secret));
    if (!is_success(result)) {
      throw new Error(result.error.message);
    }

    console.log(`    ✓ Created secret: ${secret_name} in ${namespace}`);
    return true;
  } catch (error) {
    const err = error as Error;
    console.error(`    ✗ Failed to create OCI registry secret: ${err.message}`);
    return false;
  }
}

/**
 * Ensures a cluster secret exists, creating it if needed.
 * Reads the token from the configured env var, or prompts the user.
 */
async function ensure_cluster_secret(
  entry: import('../../schema/cluster.js').ClusterSecretEntryType,
  dry_run: boolean,
  client_options: { kubeconfig?: string; context?: string },
): Promise<boolean> {
  // Check if secret already exists
  try {
    await execFileAsync(
      'kubectl',
      ['get', 'secret', entry.name, '-n', entry.namespace, ...client_extra_args(client_options)],
      { timeout: 5000 },
    );
    console.log(`    ✓ ${entry.name} secret exists`);
    return true;
  } catch {
    // Need to create
  }

  // Read token from env var or prompt
  const env_token = process.env[entry.env_var];
  let token: string | undefined;
  if (env_token) {
    console.log(`    → Using ${entry.env_var} from environment`);
    token = env_token;
  } else {
    console.log(`    → ${entry.env_var} not set`);
    const input = await prompt_for_input(
      `    Enter token for ${entry.name} (or Enter to skip): `,
      true,
    );
    token = input || undefined;
  }

  if (!token) {
    console.log(`    → Skipping ${entry.name} secret creation`);
    return false;
  }

  // Ensure namespace exists
  const ns_ok = await ensure_namespace(entry.namespace, dry_run, client_options);
  if (!ns_ok) {
    return false;
  }

  if (dry_run) {
    console.log(`    [dry-run] Would create secret: ${entry.name} in ${entry.namespace}`);
    return true;
  }

  // Build and apply Opaque secret
  try {
    const secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: entry.name,
        namespace: entry.namespace,
        ...(entry.annotations && { annotations: entry.annotations }),
      },
      type: 'Opaque',
      stringData: {
        [entry.key]: token,
      },
    };

    const client = create_kubectl_client(client_options);
    const result = await client.apply_stdin(serialize_resource(secret));
    if (!is_success(result)) {
      throw new Error(result.error.message);
    }

    console.log(`    ✓ Created secret: ${entry.name} in ${entry.namespace}`);
    return true;
  } catch (error) {
    const err = error as Error;
    console.error(`    ✗ Failed to create secret ${entry.name}: ${err.message}`);
    return false;
  }
}

/**
 * Gets a provider token from environment variables or prompts the user.
 */
async function get_provider_token(provider: ClusterSecretProvider): Promise<string | undefined> {
  // Check environment variables
  for (const env_var of provider.env_vars) {
    const env_token = process.env[env_var];
    if (env_token) {
      console.log(`    → Using ${env_var} from environment`);
      return env_token;
    }
  }

  // Prompt user
  const env_list = provider.env_vars.join(', ');
  console.log(`    → No ${provider.display_name} token found (checked: ${env_list})`);
  console.log(`    → Create a token at: ${provider.token_help_url}`);
  const input = await prompt_for_input(`    ${provider.prompt_text}`, true);
  return input || undefined;
}

/**
 * Ensures a namespace exists, creating it if needed.
 */
async function ensure_namespace(
  namespace: string,
  dry_run: boolean,
  client_options: { kubeconfig?: string; context?: string },
): Promise<boolean> {
  try {
    await execFileAsync(
      'kubectl',
      ['get', 'namespace', namespace, ...client_extra_args(client_options)],
      { timeout: 5000 },
    );
    return true;
  } catch {
    // Need to create
  }

  if (dry_run) {
    console.log(`    [dry-run] Would create namespace: ${namespace}`);
    return true;
  }

  try {
    await execFileAsync(
      'kubectl',
      ['create', 'namespace', namespace, ...client_extra_args(client_options)],
      { timeout: 10000 },
    );
    console.log(`    ✓ Created namespace: ${namespace}`);
    return true;
  } catch (error) {
    const err = error as Error;
    console.error(`    ✗ Failed to create namespace: ${err.message}`);
    return false;
  }
}
