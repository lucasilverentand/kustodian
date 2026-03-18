import { is_success, success } from '../../core/index.js';
import type { ClusterFluxStatusType } from '../../k8s/flux-operator.js';
import { create_flux_operator } from '../../k8s/flux-operator.js';
import { create_flux_client } from '../../k8s/flux.js';
import { create_kubectl_client } from '../../k8s/kubectl.js';

import { define_command } from '../command.js';
import { resolve_defaults } from '../utils/defaults.js';
import { load_and_resolve_project } from '../utils/project.js';

/**
 * Formats and prints a ClusterFluxStatusType to the console.
 */
export function print_cluster_status(
  cluster_name: string,
  status: ClusterFluxStatusType,
  oci_repo_name?: string,
): void {
  console.log(`\n━━━ Status: ${cluster_name} ━━━\n`);

  // Flux installation
  console.log('Flux CD:');
  if (!status.flux_installed) {
    console.log('  ✗ Flux is not installed');
    return;
  }

  console.log(`  ✓ Installed${status.flux_version ? ` (v${status.flux_version})` : ''}`);
  for (const component of status.components) {
    console.log(`  ${component.ready ? '✓' : '✗'} ${component.name}`);
  }

  // OCIRepository
  console.log('\nSources:');
  if (status.oci_repository) {
    const oci = status.oci_repository;
    const icon = oci.suspended ? '⏸' : oci.ready ? '✓' : '✗';
    const text = oci.suspended
      ? 'Suspended'
      : oci.ready
        ? 'Ready'
        : oci.ready_reason || 'Not Ready';
    console.log(`  ${icon} OCIRepository/${oci.name}: ${text}`);
    if (oci.revision) {
      console.log(`    Revision: ${oci.revision}`);
    }
    if (!oci.ready && !oci.suspended && oci.ready_message) {
      console.log(`    Message: ${oci.ready_message}`);
    }
  } else {
    console.log(`  - OCIRepository/${oci_repo_name || 'unknown'}: not found`);
  }

  // Kustomizations
  console.log('\nKustomizations:');
  if (status.kustomizations.length === 0) {
    console.log('  - No Kustomizations found');
    return;
  }

  for (const ks of status.kustomizations) {
    const icon = ks.suspended ? '⏸' : ks.ready ? '✓' : '✗';
    let text: string;
    if (ks.suspended) {
      text = 'Suspended';
    } else if (ks.ready) {
      text = ks.healthy === false ? 'Ready (unhealthy)' : 'Ready';
    } else {
      text = ks.ready_reason || 'Not Ready';
    }

    console.log(`  ${icon} ${ks.name}: ${text}`);

    if (ks.last_applied_revision) {
      const rev = ks.last_applied_revision;
      console.log(`    Applied: ${rev.length > 60 ? `${rev.slice(0, 60)}...` : rev}`);
    }
    if (!ks.ready && !ks.suspended && ks.ready_message) {
      const msg = ks.ready_message;
      console.log(`    Error: ${msg.length > 120 ? `${msg.slice(0, 120)}...` : msg}`);
    }
    if (ks.healthy === false && !ks.suspended && ks.healthy_message) {
      const msg = ks.healthy_message;
      console.log(`    Health: ${msg.length > 120 ? `${msg.slice(0, 120)}...` : msg}`);
    }
    if (ks.has_failed_revision && ks.last_attempted_revision) {
      const rev = ks.last_attempted_revision;
      console.log(`    Failed revision: ${rev.length > 60 ? `${rev.slice(0, 60)}...` : rev}`);
    }
  }

  // Summary
  console.log('\nSummary:');
  console.log(`  Total: ${status.summary.total} Kustomizations`);
  if (status.summary.healthy > 0) console.log(`  ✓ Healthy: ${status.summary.healthy}`);
  if (status.summary.unhealthy > 0) console.log(`  ✗ Unhealthy: ${status.summary.unhealthy}`);
  if (status.summary.suspended > 0) console.log(`  ⏸ Suspended: ${status.summary.suspended}`);

  if (status.summary.unhealthy > 0) {
    console.log(
      '\nTip: Use `kustodian rollback --cluster <name> --suspend` to pause reconciliation',
    );
  }

  console.log('');
}

/**
 * Status command - shows Flux resource health for a cluster.
 */
export const status_command = define_command({
  name: 'status',
  description: 'Show Flux resource health and reconciliation status',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Cluster name (required)',
      type: 'string',
      required: true,
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
    const project_path = (ctx.options['project'] as string) || process.cwd();

    if (!cluster_filter) {
      console.error('Error: --cluster is required');
      return {
        success: false as const,
        error: { code: 'INVALID_ARGS', message: '--cluster is required' },
      };
    }

    // Load project
    const project_result = await load_and_resolve_project(project_path, cluster_filter);
    if (!is_success(project_result)) {
      return project_result;
    }

    const { project, target_clusters } = project_result.value;
    const loaded_cluster = target_clusters[0];
    if (!loaded_cluster) {
      return {
        success: false as const,
        error: { code: 'NOT_FOUND', message: 'No cluster found' },
      };
    }

    const cluster_name = loaded_cluster.cluster.metadata.name;
    const defaults = resolve_defaults(loaded_cluster.cluster, project.config);

    // Create operator
    const context = loaded_cluster.cluster.metadata.context;
    const client_options = context ? { context } : {};
    const operator = create_flux_operator({
      flux_client: create_flux_client(client_options),
      kubectl_client: create_kubectl_client(client_options),
      flux_namespace: defaults.flux_namespace,
    });

    const status_result = await operator.get_status(defaults.oci_repository_name);
    if (!is_success(status_result)) {
      console.error(`  ✗ Unable to check Flux status: ${status_result.error.message}`);
      return status_result;
    }

    print_cluster_status(cluster_name, status_result.value, defaults.oci_repository_name);
    return success(undefined);
  },
});
