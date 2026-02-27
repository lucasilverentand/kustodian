import { exec_command } from '../../k8s/exec.js';
import type { K8sObjectType } from '../../k8s/kubectl.js';
import type { ClusterType } from '../../schema/index.js';

/**
 * Resolves the OCI tag based on cluster strategy.
 */
export async function get_oci_tag(cluster: ClusterType, project_root: string): Promise<string> {
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
      const result = await exec_command('git', ['describe', '--tags', '--abbrev=0'], {
        cwd: project_root,
      });
      if (result.success && result.value.exit_code === 0) {
        return result.value.stdout;
      }
      return 'latest';
    }
    default: {
      const result = await exec_command('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: project_root,
      });
      if (result.success && result.value.exit_code === 0) {
        return `sha1-${result.value.stdout}`;
      }
      return 'latest';
    }
  }
}

/**
 * Creates a dockerconfigjson Secret manifest for OCI registry auth.
 */
export function create_registry_secret_manifest(
  registry: string,
  token: string,
  secret_name: string,
  namespace: string,
): K8sObjectType {
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
  } as K8sObjectType;
}

/**
 * Creates a Namespace manifest.
 */
export function create_namespace_manifest(namespace: string): K8sObjectType {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespace,
    },
  } as K8sObjectType;
}

/**
 * Gets a provider token from environment variables (non-interactive).
 */
export function get_provider_token_from_env(env_vars: string[]): string | undefined {
  for (const env_var of env_vars) {
    const env_token = process.env[env_var];
    if (env_token) {
      console.log(`  → Using ${env_var} from environment`);
      return env_token;
    }
  }
  return undefined;
}
