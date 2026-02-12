import { exec } from 'node:child_process';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { is_success, success } from '../../core/index.js';
import { validate_template_requirements } from '../../generator/index.js';
import {
  type LoadedClusterType,
  find_cluster,
  find_project_root,
  load_project,
} from '../../loader/index.js';
import type { NodeListType } from '../../nodes/index.js';
import type { ClusterSecretConfigType, ClusterType } from '../../schema/index.js';

import { define_command } from '../command.js';
import {
  type ClusterSecretProvider,
  type ResolvedSecretConfig,
  get_configured_providers,
  resolve_config,
} from '../utils/cluster-secrets.js';
import { confirm } from '../utils/confirm.js';
import { resolve_defaults } from '../utils/defaults.js';

const execAsync = promisify(exec);

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
  handler: async (ctx) => {
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

    // ===== Resolve target clusters =====
    let target_clusters: LoadedClusterType[];
    if (cluster_filter) {
      const found = find_cluster(project.clusters, cluster_filter);
      if (!found) {
        console.error(`  ✗ Error: Cluster '${cluster_filter}' not found`);
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
      console.error('  ✗ Error: No clusters found in project');
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: 'No clusters found in project' },
      };
    }

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
        const node_list: NodeListType = {
          cluster: cluster_name,
          nodes: loaded_cluster.nodes,
          ...(loaded_cluster.cluster.spec.node_defaults?.label_prefix && {
            label_prefix: loaded_cluster.cluster.spec.node_defaults.label_prefix,
          }),
        } as NodeListType;

        // Load k0s provider with plugin config
        const k0s_package = 'kustodian-k0s';
        const { create_k0s_provider } = await import(k0s_package);

        // Find k0s plugin config from cluster spec
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

        const provider = create_k0s_provider(provider_options);

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

          // Merge kubeconfig into ~/.kube/config
          console.log('  → Merging kubeconfig into ~/.kube/config...');
          const temp_kubeconfig = path.join(
            (await import('node:os')).tmpdir(),
            `kustodian-kubeconfig-${cluster_name}.yaml`,
          );
          const { writeFile, unlink } = await import('node:fs/promises');
          await writeFile(temp_kubeconfig, kubeconfig_result.value as string, 'utf-8');

          const { create_kubeconfig_manager } = await import('../../k8s/kubeconfig.js');
          const kubeconfig_manager = create_kubeconfig_manager();
          const merge_result = await kubeconfig_manager.merge(temp_kubeconfig);

          // Clean up temp kubeconfig file
          try {
            await unlink(temp_kubeconfig);
          } catch {
            // Ignore cleanup errors
          }

          if (!is_success(merge_result)) {
            console.error(`  ✗ Failed to merge kubeconfig: ${merge_result.error.message}`);
            return merge_result;
          }
          console.log('    ✓ Kubeconfig merged into ~/.kube/config');

          console.log('  → Waiting for cluster nodes to be ready...');
          try {
            await execAsync('kubectl wait --for=condition=Ready node --all --timeout=300s', {
              timeout: 320000,
            });
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

      // ===== PHASE 3: Install Flux CD =====
      if (!skip_flux) {
        console.log('\n[3/3] Checking Flux CD status...');

        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        let flux_installed = false;
        try {
          const { stdout } = await execAsync('kubectl get namespace flux-system', {
            timeout: 5000,
          });
          if (stdout.includes('flux-system')) {
            console.log('  ✓ Flux CD is already installed');
            flux_installed = true;
          }
        } catch {
          console.log('  → Flux CD not detected');
        }

        if (!flux_installed) {
          console.log('  → Installing Flux CD...');

          // Check if flux CLI is available
          try {
            await execAsync('flux --version', { timeout: 5000 });
          } catch {
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
            try {
              console.log('    Running: flux install');
              const { stderr } = await execAsync('flux install', {
                timeout: 300000, // 5 minutes timeout
              });
              if (stderr && !stderr.includes('successfully')) {
                console.log(`    ${stderr}`);
              }
              console.log('    ✓ Flux CD installed successfully');
            } catch (error) {
              const err = error as { message?: string; stderr?: string };
              console.error(`  ✗ Flux installation failed: ${err.message || err.stderr}`);
              return {
                success: false as const,
                error: { code: 'FLUX_INSTALL_FAILED', message: 'Flux installation failed' },
              };
            }

            // Wait for Flux to be ready
            console.log('    Waiting for Flux components to be ready...');
            try {
              await execAsync('flux check --timeout=2m', { timeout: 150000 });
              console.log('    ✓ Flux components are ready');
            } catch {
              console.log('    ⚠ Flux components may not be fully ready yet');
            }
          }
        }
      } else {
        console.log('\n[3/3] Skipping Flux CD installation');
      }

      // ===== PHASE 4: Configure Secrets =====
      if (!skip_templates) {
        console.log('\n[4/5] Configuring cluster secrets...');

        const secrets_config = loaded_cluster.cluster.spec.secrets;
        if (secrets_config) {
          for (const [provider, config] of get_configured_providers(secrets_config)) {
            if (config.cluster_secret?.enabled === false) {
              console.log(`  → ${provider.display_name} cluster secret disabled, skipping`);
              continue;
            }
            console.log(`  → Checking ${provider.display_name} cluster secret...`);
            await ensure_cluster_secret(provider, dry_run, config.cluster_secret);
          }
        } else {
          console.log('  → No secret providers configured');
        }
      }

      // ===== PHASE 5: Deploy Templates =====
      if (!skip_templates) {
        console.log('\n[5/5] Deploying templates...');

        // Validate template requirements
        console.log('  → Validating template requirements...');
        // All templates listed in cluster.yaml are deployed (opt-in model)
        const enabled_template_refs = loaded_cluster.cluster.spec.templates || [];

        if (enabled_template_refs.length > 0) {
          const enabled_templates = project.templates
            .filter((t) =>
              enabled_template_refs.some((ref) => ref.name === t.template.metadata.name),
            )
            .map((t) => t.template);

          const requirements_result = validate_template_requirements(
            enabled_templates,
            loaded_cluster.nodes,
          );

          if (!requirements_result.valid) {
            console.error('  ✗ Template requirement validation failed:');
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

          console.log('    ✓ All template requirements satisfied');
        }

        if (loaded_cluster.cluster.spec.oci) {
          // OCI Mode - generate in memory and apply directly
          console.log('  → Cluster uses OCI deployment');
          console.log('  → Generating Flux resources...');

          const { create_generator, serialize_resource } = await import('../../generator/index.js');
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

          // Ensure OCI registry authentication
          const oci_config = loaded_cluster.cluster.spec.oci;
          console.log('  → Checking OCI registry authentication...');
          const auth_result = await ensure_oci_registry_secret(
            oci_config.registry,
            dry_run,
            OCI_REGISTRY_SECRET_NAME,
            FLUX_NAMESPACE,
          );

          if (dry_run) {
            console.log('\n  [dry-run] Would push to OCI and apply Flux resources');
            if (auth_result.has_auth) {
              console.log(`  → Secret: ${OCI_REGISTRY_SECRET_NAME} (registry auth)`);
            }
            if (gen_data.oci_repository) {
              console.log(`  → OCIRepository: ${gen_data.oci_repository.metadata.name}`);
            }
            for (const k of gen_data.kustomizations) {
              console.log(`  → Kustomization: ${k.name} (${k.path})`);
            }
          } else {
            // Push to OCI registry
            console.log('  → Pushing to OCI registry...');
            const tag = await get_oci_tag(loaded_cluster.cluster, project_root);
            const oci = loaded_cluster.cluster.spec.oci;
            const oci_url = `oci://${oci.registry}/${oci.repository}:${tag}`;

            try {
              const git_source = await get_git_source(project_root);
              const git_revision = await get_git_revision(project_root);

              const push_cmd = `flux push artifact ${oci_url} --path="${project_root}" --source="${git_source}" --revision="${git_revision}"`;
              await execAsync(push_cmd, { timeout: 120000 });
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
              const resources: object[] = [];

              // Add OCIRepository with correct tag and auth
              if (gen_data.oci_repository) {
                const oci_repo = { ...gen_data.oci_repository };
                oci_repo.spec = { ...oci_repo.spec, ref: { tag } };

                // Add secretRef if auth is configured
                if (auth_result.has_auth) {
                  oci_repo.spec = {
                    ...oci_repo.spec,
                    secretRef: { name: defaults.oci_registry_secret_name },
                  };
                }

                resources.push(oci_repo);
              }

              // Add all Kustomizations
              for (const k of gen_data.kustomizations) {
                resources.push(k.flux_kustomization);
              }

              // Serialize and apply via stdin
              const yaml_content = resources.map((r) => serialize_resource(r)).join('---\n');
              const { spawn } = await import('node:child_process');

              await new Promise<void>((resolve, reject) => {
                const kubectl = spawn('kubectl', ['apply', '-f', '-'], {
                  stdio: ['pipe', 'pipe', 'pipe'],
                });

                let stdout = '';
                let stderr = '';

                kubectl.stdout.on('data', (data) => {
                  stdout += data.toString();
                });
                kubectl.stderr.on('data', (data) => {
                  stderr += data.toString();
                });

                kubectl.on('close', (code) => {
                  if (code === 0) {
                    if (stdout) console.log(`    ${stdout.trim()}`);
                    resolve();
                  } else {
                    reject(new Error(stderr || `kubectl exited with code ${code}`));
                  }
                });

                kubectl.stdin.write(yaml_content);
                kubectl.stdin.end();
              });

              console.log('    ✓ Flux resources applied');
            } catch (error) {
              const err = error as Error;
              console.error(`  ✗ Apply failed: ${err.message}`);
              return {
                success: false as const,
                error: { code: 'APPLY_FAILED', message: err.message },
              };
            }

            console.log('\n  ✓ Deployment complete - Flux will reconcile from OCI');
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
    } // end for each cluster

    console.log('\n━━━ Apply Complete ━━━\n');
    return success(undefined);
  },
});

/**
 * Resolves the OCI tag based on cluster strategy.
 */
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
        const { stdout } = await execAsync('git describe --tags --abbrev=0', { cwd: project_root });
        return stdout.trim();
      } catch {
        return 'latest';
      }
    }
    default: {
      try {
        const { stdout } = await execAsync('git rev-parse --short HEAD', { cwd: project_root });
        return `sha1-${stdout.trim()}`;
      } catch {
        return 'latest';
      }
    }
  }
}

/**
 * Gets the git remote URL for source metadata.
 */
async function get_git_source(project_root: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git config --get remote.origin.url', { cwd: project_root });
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
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: project_root });
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
          process.exit(1);
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
 * Gets the OCI registry token from environment or prompts user.
 */
async function get_oci_registry_token(registry: string): Promise<string | undefined> {
  if (registry === 'ghcr.io') {
    // Check environment variables
    const env_token = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'];
    if (env_token) {
      console.log('    → Using GITHUB_TOKEN from environment');
      return env_token;
    }

    // Try gh CLI
    try {
      const { stdout } = await execAsync('gh auth token', { timeout: 5000 });
      const gh_token = stdout.trim();
      if (gh_token) {
        console.log('    → Using token from gh CLI');
        return gh_token;
      }
    } catch {
      // gh CLI not available
    }

    // Prompt user
    console.log('    → No GHCR token found (checked: GITHUB_TOKEN, GH_TOKEN, gh CLI)');
    console.log('    → Create a token at: https://github.com/settings/tokens');
    console.log('    → Required scope: read:packages');
    const input = await prompt_for_input('    Enter GitHub token (or Enter to skip): ', true);
    return input || undefined;
  }

  // Generic registry
  const username = process.env['REGISTRY_USERNAME'];
  const password = process.env['REGISTRY_PASSWORD'];
  if (username && password) {
    return `${username}:${password}`;
  }

  return undefined;
}

/**
 * Creates a dockerconfigjson Secret manifest for OCI registry auth.
 */
function create_registry_secret_manifest(
  registry: string,
  token: string,
  secret_name: string,
  namespace: string,
): object {
  const authString = token.includes(':')
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
        JSON.stringify({ auths: { [registry]: { auth: authString } } }),
      ).toString('base64'),
    },
  };
}

/**
 * Ensures OCI registry secret exists, creating if needed.
 */
async function ensure_oci_registry_secret(
  registry: string,
  dry_run: boolean,
  secret_name: string,
  namespace: string,
): Promise<{ has_auth: boolean; secret?: object }> {
  // Check if secret exists
  try {
    await execAsync(`kubectl get secret ${secret_name} -n ${namespace}`, {
      timeout: 5000,
    });
    console.log('    ✓ OCI registry secret exists');
    return { has_auth: true };
  } catch {
    // Need to create
  }

  const token = await get_oci_registry_token(registry);
  if (!token) {
    console.log('    → No credentials provided, OCI will be unauthenticated');
    return { has_auth: false };
  }

  const secret = create_registry_secret_manifest(registry, token, secret_name, namespace);

  if (dry_run) {
    console.log(`    [dry-run] Would create secret: ${secret_name}`);
    return { has_auth: true, secret };
  }

  // Apply secret
  try {
    const { spawn } = await import('node:child_process');
    const { serialize_resource } = await import('../../generator/index.js');

    await new Promise<void>((resolve, reject) => {
      const kubectl = spawn('kubectl', ['apply', '-f', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      kubectl.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      kubectl.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `kubectl exited with code ${code}`));
      });

      kubectl.stdin.write(serialize_resource(secret));
      kubectl.stdin.end();
    });

    console.log(`    ✓ Created secret: ${secret_name}`);
    return { has_auth: true, secret };
  } catch (error) {
    const err = error as Error;
    console.error(`    ✗ Failed to create secret: ${err.message}`);
    return { has_auth: false };
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
 * Creates an Opaque Secret manifest for a provider token.
 */
function create_opaque_secret_manifest(token: string, config: ResolvedSecretConfig): object {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      ...(config.annotations && { annotations: config.annotations }),
    },
    type: 'Opaque',
    stringData: {
      [config.key]: token,
    },
  };
}

/**
 * Ensures a namespace exists, creating it if needed.
 */
async function ensure_namespace(namespace: string, dry_run: boolean): Promise<boolean> {
  try {
    await execAsync(`kubectl get namespace ${namespace}`, { timeout: 5000 });
    return true;
  } catch {
    // Need to create
  }

  if (dry_run) {
    console.log(`    [dry-run] Would create namespace: ${namespace}`);
    return true;
  }

  try {
    await execAsync(`kubectl create namespace ${namespace}`, { timeout: 10000 });
    console.log(`    ✓ Created namespace: ${namespace}`);
    return true;
  } catch (error) {
    const err = error as Error;
    console.error(`    ✗ Failed to create namespace: ${err.message}`);
    return false;
  }
}

/**
 * Ensures a cluster secret exists for the given provider, creating if needed.
 */
async function ensure_cluster_secret(
  provider: ClusterSecretProvider,
  dry_run: boolean,
  cluster_config?: ClusterSecretConfigType,
): Promise<boolean> {
  const config = resolve_config(provider, cluster_config);

  // Check if secret exists
  try {
    await execAsync(`kubectl get secret ${config.name} -n ${config.namespace}`, {
      timeout: 5000,
    });
    console.log(`    ✓ ${provider.display_name} token secret exists`);
    return true;
  } catch {
    // Need to create
  }

  const token = await get_provider_token(provider);
  if (!token) {
    console.log(`    → No ${provider.display_name} token provided, skipping secret creation`);
    console.log(`    ⚠ ${provider.skip_warning}`);
    return false;
  }

  // Ensure namespace exists
  const ns_ok = await ensure_namespace(config.namespace, dry_run);
  if (!ns_ok) {
    return false;
  }

  const secret = create_opaque_secret_manifest(token, config);

  if (dry_run) {
    console.log(`    [dry-run] Would create secret: ${config.name}`);
    return true;
  }

  // Apply secret
  try {
    const { spawn } = await import('node:child_process');
    const { serialize_resource } = await import('../../generator/index.js');

    await new Promise<void>((resolve, reject) => {
      const kubectl = spawn('kubectl', ['apply', '-f', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      kubectl.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      kubectl.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `kubectl exited with code ${code}`));
      });

      kubectl.stdin.write(serialize_resource(secret));
      kubectl.stdin.end();
    });

    console.log(`    ✓ Created secret: ${config.name} in ${config.namespace}`);
    return true;
  } catch (error) {
    const err = error as Error;
    console.error(`    ✗ Failed to create ${provider.display_name} secret: ${err.message}`);
    return false;
  }
}
