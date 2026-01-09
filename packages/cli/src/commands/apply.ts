import * as path from 'node:path';
import { is_success, success } from '@kustodian/core';
import { find_project_root, load_project } from '@kustodian/loader';
import type { NodeListType } from '@kustodian/nodes';

import { define_command } from '../command.js';


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
      description: 'Cluster name to apply',
      type: 'string',
      required: true,
    },
    {
      name: 'provider',
      short: 'P',
      description: 'Cluster provider for bootstrap (default: k0s)',
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
    const cluster_name = ctx.options['cluster'] as string;
    const provider_name = ctx.options['provider'] as string;
    const project_path = (ctx.options['project'] as string) || process.cwd();
    const dry_run = ctx.options['dry-run'] as boolean;
    const skip_bootstrap = ctx.options['skip-bootstrap'] as boolean;
    const skip_flux = ctx.options['skip-flux'] as boolean;
    const skip_templates = ctx.options['skip-templates'] as boolean;

    if (!cluster_name) {
      console.error('Error: --cluster is required');
      return {
        success: false as const,
        error: { code: 'INVALID_ARGS', message: '--cluster is required' },
      };
    }

    console.log(`\n━━━ Kustodian Apply ━━━`);
    console.log(`Cluster: ${cluster_name}`);
    console.log(`Provider: ${provider_name}`);
    if (dry_run) {
      console.log(`Mode: DRY RUN\n`);
    }

    // ===== PHASE 1: Load Project =====
    console.log('\n[1/3] Loading project configuration...');

    const root_result = await find_project_root(project_path);
    if (!root_result.success) {
      console.error(`  ✗ Error: ${root_result.error.message}`);
      return root_result;
    }

    const project_root = root_result.value;
    console.log(`  → Project root: ${project_root}`);

    const project_result = await load_project(project_root);
    if (!project_result.success) {
      console.error(`  ✗ Error: ${project_result.error.message}`);
      return project_result;
    }

    const project = project_result.value;
    const loaded_cluster = project.clusters.find((c) => c.cluster.metadata.name === cluster_name);

    if (!loaded_cluster) {
      console.error(`  ✗ Error: Cluster '${cluster_name}' not found`);
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Cluster '${cluster_name}' not found` },
      };
    }

    console.log(`  ✓ Loaded cluster configuration`);
    console.log(`  ✓ Loaded ${project.templates.length} templates`);
    console.log(`  ✓ Loaded ${loaded_cluster.nodes.length} nodes`);

    // ===== PHASE 2: Bootstrap Cluster =====
    if (!skip_bootstrap) {
      console.log('\n[2/3] Checking cluster status...');

      // Check if cluster is already accessible
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      let cluster_exists = false;
      try {
        await execAsync('kubectl cluster-info', { timeout: 5000 });
        console.log('  ✓ Cluster is already running and accessible');
        cluster_exists = true;
      } catch {
        console.log('  → No existing cluster detected');
      }

      if (!cluster_exists) {
        console.log('  → Bootstrapping cluster with k0s...');

        // Check if we have nodes to bootstrap
        if (loaded_cluster.nodes.length === 0) {
          console.error('  ✗ Error: No nodes defined for cluster');
          console.error('  → Add nodes to cluster.yaml spec.nodes or create node files in nodes/ directory');
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
          ...(loaded_cluster.cluster.spec.node_defaults?.ssh && {
            ssh: loaded_cluster.cluster.spec.node_defaults.ssh,
          }),
        } as NodeListType;

        // Load k0s provider
        const { create_k0s_provider } = await import('@kustodian/plugin-k0s');
        const provider = create_k0s_provider();

        console.log('  → Validating cluster configuration...');
        const validate_result = provider.validate(node_list);
        if (!is_success(validate_result)) {
          console.error(`  ✗ Validation failed: ${validate_result.error.message}`);
          return validate_result;
        }
        console.log('    ✓ Configuration valid');

        console.log('  → Installing k0s cluster...');
        if (dry_run) {
          console.log('    [dry-run] Would run: k0sctl apply');
        } else {
          const install_result = await provider.install(node_list, { dry_run: false });
          if (!is_success(install_result)) {
            console.error(`  ✗ Installation failed: ${install_result.error.message}`);
            return install_result;
          }
          console.log('    ✓ k0s cluster installed');

          console.log('  → Retrieving kubeconfig...');
          const kubeconfig_result = await provider.get_kubeconfig(node_list);
          if (!is_success(kubeconfig_result)) {
            console.error(`  ✗ Failed to get kubeconfig: ${kubeconfig_result.error.message}`);
            return kubeconfig_result;
          }
          console.log(`    ✓ Kubeconfig: ${kubeconfig_result.value}`);
        }

        console.log('  ✓ Cluster bootstrapped successfully');
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
        const { stdout } = await execAsync('kubectl get namespace flux-system', { timeout: 5000 });
        if (stdout.includes('flux-system')) {
          console.log('  ✓ Flux CD is already installed');
          flux_installed = true;
        }
      } catch {
        console.log('  → Flux CD not detected');
      }

      if (!flux_installed) {
        console.log('  → Installing Flux CD...');
        console.log('  → TODO: Run flux install command');
        console.log('  → For now, install manually: flux install');
      }
    } else {
      console.log('\n[3/3] Skipping Flux CD installation');
    }

    // ===== PHASE 4: Deploy Templates =====
    if (!skip_templates) {
      console.log('\n[4/4] Deploying templates...');

      if (loaded_cluster.cluster.spec.oci) {
        // OCI Mode - generate manifests and provide instructions
        console.log('  → Cluster uses OCI deployment');
        console.log('  → Generating manifests...');

        const { create_generator } = await import('@kustodian/generator');
        const generator = create_generator({
          flux_namespace: 'flux-system',
          git_repository_name: 'flux-system',
        });

        const output_dir = path.join(project_root, 'output', cluster_name);
        const gen_result = await generator.generate(
          loaded_cluster.cluster,
          project.templates.map((t) => t.template),
          { output_dir },
        );

        if (!gen_result.success) {
          console.error(`  ✗ Generation failed: ${gen_result.error.message}`);
          return gen_result;
        }

        const write_result = await generator.write(gen_result.value);
        if (!write_result.success) {
          console.error(`  ✗ Write failed: ${write_result.error.message}`);
          return write_result;
        }

        console.log(`  ✓ Generated ${write_result.value.length} files to ${output_dir}`);
        console.log('\n  Next steps for OCI deployment:');
        console.log(`    1. Review generated files in ${output_dir}`);
        console.log(`    2. Push to OCI registry: kustodian push --cluster ${cluster_name}`);
        console.log(`    3. Apply Flux resources: kubectl apply -f ${output_dir}/`);
        console.log('    4. Flux will automatically pull from OCI and reconcile');
      } else if (loaded_cluster.cluster.spec.git) {
        // Git Mode - legacy deployment
        console.log('  → Cluster uses Git deployment (legacy mode)');
        console.log('  ⚠ Git-based deployment is deprecated');
        console.log('  → Consider migrating to OCI: Update cluster.yaml to use spec.oci');
        console.log('  → See: https://kustodian.io/docs/oci-migration');
      } else {
        console.error('  ✗ Error: Cluster must have either spec.oci or spec.git configured');
        return {
          success: false as const,
          error: { code: 'INVALID_CONFIG', message: 'No deployment configuration found' },
        };
      }
    } else {
      console.log('\n[4/4] Skipping template deployment');
    }

    console.log('\n━━━ Apply Complete ━━━\n');
    return success(undefined);
  },
});
