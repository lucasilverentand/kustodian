import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { is_success, success } from '../../core/index.js';
import { type FluxOperatorType, create_flux_operator } from '../../k8s/flux-operator.js';
import { create_flux_client } from '../../k8s/flux.js';
import { create_kubectl_client } from '../../k8s/kubectl.js';

import { define_command } from '../command.js';
import { confirm } from '../utils/confirm.js';
import { resolve_defaults } from '../utils/defaults.js';
import { get_oci_tag } from '../utils/oci.js';
import { load_and_resolve_project } from '../utils/project.js';

const execFileAsync = promisify(execFile);

function client_extra_args(options: { kubeconfig?: string; context?: string }): string[] {
  const args: string[] = [];
  if (options.kubeconfig) args.push(`--kubeconfig=${options.kubeconfig}`);
  if (options.context) args.push(`--context=${options.context}`);
  return args;
}

/**
 * Rollback command - reverts a cluster to a previous state.
 *
 * Three modes:
 * 1. --revision <git-sha>: Checks out a previous revision, re-pushes OCI artifact,
 *    and triggers Flux reconciliation to roll back the cluster.
 * 2. --suspend: Suspends all Flux Kustomizations for a cluster.
 * 3. --resume: Resumes all suspended Flux Kustomizations.
 */
export const rollback_command = define_command({
  name: 'rollback',
  description: 'Roll back a cluster to a previous state or suspend/resume reconciliation',
  options: [
    {
      name: 'cluster',
      short: 'c',
      description: 'Cluster name (required)',
      type: 'string',
      required: true,
    },
    {
      name: 'revision',
      short: 'r',
      description: 'Git revision (commit SHA, tag, or ref) to roll back to',
      type: 'string',
    },
    {
      name: 'suspend',
      description: 'Suspend all Flux Kustomizations for the cluster',
      type: 'boolean',
      default_value: false,
    },
    {
      name: 'resume',
      description: 'Resume all suspended Flux Kustomizations for the cluster',
      type: 'boolean',
      default_value: false,
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
  ],
  handler: async (ctx) => {
    const cluster_filter = ctx.options['cluster'] as string | undefined;
    const revision = ctx.options['revision'] as string | undefined;
    const suspend = ctx.options['suspend'] as boolean;
    const resume = ctx.options['resume'] as boolean;
    const project_path = (ctx.options['project'] as string) || process.cwd();
    const dry_run = ctx.options['dry-run'] as boolean;

    if (!cluster_filter) {
      console.error('Error: --cluster is required');
      return {
        success: false as const,
        error: { code: 'INVALID_ARGS', message: '--cluster is required' },
      };
    }

    // Validate mutually exclusive options
    const mode_count = [revision, suspend, resume].filter(Boolean).length;
    if (mode_count === 0) {
      console.error('Error: specify one of --revision, --suspend, or --resume');
      return {
        success: false as const,
        error: {
          code: 'INVALID_ARGS',
          message: 'Specify one of --revision, --suspend, or --resume',
        },
      };
    }
    if (mode_count > 1) {
      console.error('Error: --revision, --suspend, and --resume are mutually exclusive');
      return {
        success: false as const,
        error: {
          code: 'INVALID_ARGS',
          message: '--revision, --suspend, and --resume are mutually exclusive',
        },
      };
    }

    // Load project
    const project_result = await load_and_resolve_project(project_path, cluster_filter);
    if (!is_success(project_result)) {
      return project_result;
    }

    const { project_root, project, target_clusters } = project_result.value;
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

    if (suspend) {
      return handle_suspend(cluster_name, operator, dry_run);
    }

    if (resume) {
      return handle_resume(cluster_name, operator, dry_run);
    }

    if (revision) {
      return handle_revision_rollback(
        cluster_name,
        revision,
        loaded_cluster,
        project_root,
        defaults,
        operator,
        client_options,
        dry_run,
      );
    }

    return success(undefined);
  },
});

/**
 * Suspends all Flux Kustomizations for a cluster.
 */
async function handle_suspend(cluster_name: string, operator: FluxOperatorType, dry_run: boolean) {
  console.log(`\n━━━ Suspend: ${cluster_name} ━━━\n`);

  const names_result = await operator.list_kustomizations();
  if (!is_success(names_result) || names_result.value.length === 0) {
    console.log('No Kustomizations found to suspend.');
    return success(undefined);
  }

  if (dry_run) {
    console.log(`Would suspend ${names_result.value.length} Kustomizations:`);
    for (const name of names_result.value) {
      console.log(`  [dry-run] Would suspend ${name}`);
    }
    return success(undefined);
  }

  console.log(`Suspending ${names_result.value.length} Kustomizations:`);
  const result = await operator.suspend_all();
  if (is_success(result)) {
    for (const name of result.value.succeeded) {
      console.log(`  ⏸ Suspended ${name}`);
    }
    for (const { name, error } of result.value.failed) {
      console.log(`  ✗ Failed to suspend ${name}: ${error}`);
    }
  }

  console.log('\nReconciliation paused. Fix the issue, then run:');
  console.log(`  kustodian rollback --cluster ${cluster_name} --resume\n`);
  return success(undefined);
}

/**
 * Resumes all suspended Flux Kustomizations for a cluster.
 */
async function handle_resume(cluster_name: string, operator: FluxOperatorType, dry_run: boolean) {
  console.log(`\n━━━ Resume: ${cluster_name} ━━━\n`);

  const names_result = await operator.list_kustomizations();
  if (!is_success(names_result) || names_result.value.length === 0) {
    console.log('No Kustomizations found to resume.');
    return success(undefined);
  }

  if (dry_run) {
    console.log(`Would resume ${names_result.value.length} Kustomizations:`);
    for (const name of names_result.value) {
      console.log(`  [dry-run] Would resume ${name}`);
    }
    return success(undefined);
  }

  console.log(`Resuming ${names_result.value.length} Kustomizations:`);
  const result = await operator.resume_all();
  if (is_success(result)) {
    for (const name of result.value.succeeded) {
      console.log(`  ▶ Resumed ${name}`);
    }
    for (const { name, error } of result.value.failed) {
      console.log(`  ✗ Failed to resume ${name}: ${error}`);
    }
  }

  console.log('\nReconciliation resumed. Monitor with:');
  console.log(`  kustodian status --cluster ${cluster_name}\n`);
  return success(undefined);
}

/**
 * Rolls back to a previous git revision by re-pushing OCI artifacts.
 */
async function handle_revision_rollback(
  cluster_name: string,
  revision: string,
  loaded_cluster: import('../../loader/index.js').LoadedClusterType,
  project_root: string,
  defaults: import('../utils/defaults.js').ResolvedDefaultsType,
  operator: FluxOperatorType,
  client_options: { kubeconfig?: string; context?: string },
  dry_run: boolean,
) {
  console.log(`\n━━━ Rollback: ${cluster_name} ━━━\n`);

  const oci_config = loaded_cluster.cluster.spec.oci;
  if (!oci_config) {
    console.error('Error: Cluster must have spec.oci configured for revision rollback');
    return {
      success: false as const,
      error: { code: 'INVALID_CONFIG', message: 'spec.oci configuration required' },
    };
  }

  // Verify the revision exists
  console.log(`Verifying revision: ${revision}`);
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--verify', revision], {
      cwd: project_root,
    });
    const full_sha = stdout.trim();
    console.log(`  ✓ Resolved to ${full_sha.slice(0, 12)}`);
  } catch {
    console.error(`  ✗ Revision '${revision}' not found`);
    return {
      success: false as const,
      error: { code: 'NOT_FOUND', message: `Git revision '${revision}' not found` },
    };
  }

  // Show what will happen
  const tag = await get_oci_tag(loaded_cluster.cluster, project_root);
  const oci_url = `oci://${oci_config.registry}/${oci_config.repository}:${tag}`;
  console.log('\nRollback plan:');
  console.log(`  Cluster:  ${cluster_name}`);
  console.log(`  Revision: ${revision}`);
  console.log(`  OCI:      ${oci_url}`);
  console.log('');

  if (dry_run) {
    console.log('[dry-run] Would:');
    console.log(`  1. Check out ${revision} in a temporary worktree`);
    console.log(`  2. Push OCI artifact to ${oci_url}`);
    console.log('  3. Trigger Flux reconciliation');
    console.log('  4. Clean up worktree');
    return success(undefined);
  }

  const confirmed = await confirm('Proceed with rollback?');
  if (!confirmed) {
    console.log('Aborted.');
    return success(undefined);
  }

  // Create a temporary worktree at the target revision
  const worktree_path = `${project_root}/.kustodian-rollback-${Date.now()}`;
  console.log('Creating temporary worktree...');
  try {
    await execFileAsync('git', ['worktree', 'add', '--detach', worktree_path, revision], {
      cwd: project_root,
    });
    console.log('  ✓ Worktree created');
  } catch (error) {
    const err = error as Error;
    console.error(`  ✗ Failed to create worktree: ${err.message}`);
    return {
      success: false as const,
      error: { code: 'GIT_ERROR', message: `Failed to create worktree: ${err.message}` },
    };
  }

  try {
    // Push OCI artifact from the worktree
    console.log('Pushing OCI artifact from rollback revision...');
    const git_source = await get_git_source(project_root);
    const git_revision = `sha1:${(await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: worktree_path })).stdout.trim()}`;

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
        worktree_path,
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
    console.log(`  ✓ Pushed to ${oci_url}`);

    // Trigger reconciliation via operator
    console.log('Triggering Flux reconciliation...');
    const reconcile_result = await operator.reconcile_all(defaults.oci_repository_name);
    if (is_success(reconcile_result)) {
      console.log('  ✓ Reconciliation triggered');
    } else {
      console.log(`  ⚠ Reconciliation trigger failed: ${reconcile_result.error.message}`);
    }

    console.log(`\n✓ Rollback to ${revision} initiated`);
    console.log(`  Monitor with: kustodian status --cluster ${cluster_name}\n`);
  } catch (error) {
    const err = error as Error;
    console.error(`\n✗ Rollback failed: ${err.message}`);
    return {
      success: false as const,
      error: { code: 'ROLLBACK_FAILED', message: err.message },
    };
  } finally {
    // Clean up worktree
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', worktree_path], {
        cwd: project_root,
      });
    } catch {
      // Ignore cleanup errors
    }
  }

  return success(undefined);
}

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
