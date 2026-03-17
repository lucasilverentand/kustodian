import { is_success, success } from '../../core/index.js';
import { create_flux_client } from '../../k8s/flux.js';
import { create_kubectl_client } from '../../k8s/kubectl.js';

import { define_command } from '../command.js';
import { resolve_defaults } from '../utils/defaults.js';
import { load_and_resolve_project } from '../utils/project.js';

/**
 * Flux Kustomization status condition.
 */
interface FluxConditionType {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

/**
 * Flux Kustomization status from the cluster.
 */
interface FluxKustomizationStatusType {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    suspend?: boolean;
  };
  status?: {
    conditions?: FluxConditionType[];
    lastAppliedRevision?: string;
    lastAttemptedRevision?: string;
  };
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
    const FLUX_NAMESPACE = defaults.flux_namespace;

    // Create clients
    const context = loaded_cluster.cluster.metadata.context;
    const client_options = context ? { context } : {};
    const kubectl_client = create_kubectl_client(client_options);
    const flux_client = create_flux_client(client_options);

    console.log(`\n━━━ Status: ${cluster_name} ━━━\n`);

    // Check Flux installation
    console.log('Flux CD:');
    const flux_check = await flux_client.check();
    if (!is_success(flux_check)) {
      console.log('  ✗ Unable to check Flux status');
      return flux_check;
    }

    const flux_status = flux_check.value;
    if (!flux_status.installed) {
      console.log('  ✗ Flux is not installed');
      return success(undefined);
    }

    console.log(`  ✓ Installed${flux_status.version ? ` (v${flux_status.version})` : ''}`);
    for (const component of flux_status.components) {
      console.log(`  ${component.ready ? '✓' : '✗'} ${component.name}`);
    }

    // Get OCIRepository status
    console.log('\nSources:');
    const oci_repo_name = defaults.oci_repository_name;
    const oci_result = await kubectl_client.get({
      kind: 'OCIRepository',
      name: oci_repo_name,
      namespace: FLUX_NAMESPACE,
    });

    if (is_success(oci_result) && oci_result.value.length > 0) {
      const oci_repo = oci_result.value[0] as unknown as {
        metadata: { name: string };
        spec: { suspend?: boolean };
        status?: { conditions?: FluxConditionType[]; artifact?: { revision?: string } };
      };
      const oci_ready = oci_repo.status?.conditions?.find((c) => c.type === 'Ready');
      const suspended = oci_repo.spec?.suspend;
      const revision = oci_repo.status?.artifact?.revision;

      const status_icon = suspended ? '⏸' : oci_ready?.status === 'True' ? '✓' : '✗';
      const status_text = suspended
        ? 'Suspended'
        : oci_ready?.status === 'True'
          ? 'Ready'
          : oci_ready?.reason || 'Not Ready';
      console.log(`  ${status_icon} OCIRepository/${oci_repo.metadata.name}: ${status_text}`);
      if (revision) {
        console.log(`    Revision: ${revision}`);
      }
      if (oci_ready?.status !== 'True' && !suspended && oci_ready?.message) {
        console.log(`    Message: ${oci_ready.message}`);
      }
    } else {
      console.log(`  - OCIRepository/${oci_repo_name}: not found`);
    }

    // Get all Kustomizations in the flux namespace
    console.log('\nKustomizations:');
    const ks_result = await kubectl_client.get({
      kind: 'Kustomization.kustomize.toolkit.fluxcd.io',
      name: '',
      namespace: FLUX_NAMESPACE,
    });

    if (!is_success(ks_result) || ks_result.value.length === 0) {
      console.log('  - No Kustomizations found');
      return success(undefined);
    }

    let healthy_count = 0;
    let unhealthy_count = 0;
    let suspended_count = 0;

    for (const raw_ks of ks_result.value) {
      const ks = raw_ks as unknown as FluxKustomizationStatusType;
      const ready_condition = ks.status?.conditions?.find((c) => c.type === 'Ready');
      const healthy_condition = ks.status?.conditions?.find((c) => c.type === 'Healthy');
      const suspended = ks.spec?.suspend;

      const is_ready = ready_condition?.status === 'True';
      const is_healthy = healthy_condition?.status === 'True';

      if (suspended) {
        suspended_count++;
      } else if (is_ready) {
        healthy_count++;
      } else {
        unhealthy_count++;
      }

      // Status icon
      let icon: string;
      if (suspended) {
        icon = '⏸';
      } else if (is_ready && is_healthy) {
        icon = '✓';
      } else if (is_ready) {
        icon = '✓';
      } else {
        icon = '✗';
      }

      // Status text
      let status_text: string;
      if (suspended) {
        status_text = 'Suspended';
      } else if (is_ready) {
        status_text = 'Ready';
        if (healthy_condition && !is_healthy) {
          status_text += ' (unhealthy)';
        }
      } else {
        status_text = ready_condition?.reason || 'Not Ready';
      }

      console.log(`  ${icon} ${ks.metadata.name}: ${status_text}`);

      // Show revision info
      if (ks.status?.lastAppliedRevision) {
        const rev = ks.status.lastAppliedRevision;
        const short_rev = rev.length > 60 ? `${rev.slice(0, 60)}...` : rev;
        console.log(`    Applied: ${short_rev}`);
      }

      // Show error details for unhealthy resources
      if (!is_ready && !suspended && ready_condition?.message) {
        const msg = ready_condition.message;
        const short_msg = msg.length > 120 ? `${msg.slice(0, 120)}...` : msg;
        console.log(`    Error: ${short_msg}`);
      }

      // Show health check failures
      if (healthy_condition && !is_healthy && !suspended) {
        const msg = healthy_condition.message;
        if (msg) {
          const short_msg = msg.length > 120 ? `${msg.slice(0, 120)}...` : msg;
          console.log(`    Health: ${short_msg}`);
        }
      }

      // Show if attempted revision differs from applied (failed update)
      if (
        ks.status?.lastAttemptedRevision &&
        ks.status?.lastAppliedRevision &&
        ks.status.lastAttemptedRevision !== ks.status.lastAppliedRevision
      ) {
        const rev = ks.status.lastAttemptedRevision;
        const short_rev = rev.length > 60 ? `${rev.slice(0, 60)}...` : rev;
        console.log(`    Failed revision: ${short_rev}`);
      }
    }

    // Summary
    console.log('\nSummary:');
    const total = healthy_count + unhealthy_count + suspended_count;
    console.log(`  Total: ${total} Kustomizations`);
    if (healthy_count > 0) console.log(`  ✓ Healthy: ${healthy_count}`);
    if (unhealthy_count > 0) console.log(`  ✗ Unhealthy: ${unhealthy_count}`);
    if (suspended_count > 0) console.log(`  ⏸ Suspended: ${suspended_count}`);

    if (unhealthy_count > 0) {
      console.log(
        '\nTip: Use `kustodian rollback --cluster <name> --suspend` to pause reconciliation',
      );
    }

    console.log('');
    return success(undefined);
  },
});
