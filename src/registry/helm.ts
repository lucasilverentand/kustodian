import { parse } from 'yaml';
import type { KustodianErrorType } from '../core/index.js';
import { type ResultType, failure, success } from '../core/index.js';
import { create_ghcr_client } from './ghcr.js';
import type {
  ImageReferenceType,
  RegistryClientConfigType,
  RegistryClientType,
  TagInfoType,
} from './types.js';

const DEFAULT_TIMEOUT = 30000;

/**
 * Helm index.yaml entry structure.
 */
interface HelmChartEntry {
  name: string;
  version: string;
  created?: string;
  description?: string;
  digest?: string;
}

/**
 * Helm index.yaml structure.
 */
interface HelmIndexType {
  apiVersion: string;
  entries: Record<string, HelmChartEntry[]>;
  generated?: string;
}

interface OciTagsResponse {
  tags?: string[];
}

/**
 * Creates an abort signal with timeout.
 */
function create_abort_signal(timeout_ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout_ms);
  return controller.signal;
}

function create_oci_auth_headers(config?: RegistryClientConfigType): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (config?.auth?.token) {
    headers['Authorization'] = `Bearer ${config.auth.token}`;
  } else if (config?.auth?.username && config.auth.password) {
    const credentials = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString(
      'base64',
    );
    headers['Authorization'] = `Basic ${credentials}`;
  }

  return headers;
}

function create_generic_oci_registry_client(config?: RegistryClientConfigType): RegistryClientType {
  return {
    async list_tags(
      image: ImageReferenceType,
    ): Promise<ResultType<TagInfoType[], KustodianErrorType>> {
      const url = `https://${image.registry}/v2/${image.namespace}/${image.repository}/tags/list`;

      try {
        const response = await fetch(url, {
          headers: create_oci_auth_headers(config),
          signal: create_abort_signal(config?.timeout ?? DEFAULT_TIMEOUT),
        });

        if (response.status === 401 || response.status === 403) {
          return failure({
            code: 'REGISTRY_AUTH_ERROR',
            message: `Registry authentication failed for ${image.registry}. Configure credentials to access OCI chart tags.`,
          });
        }

        if (!response.ok) {
          return failure({
            code: 'REGISTRY_ERROR',
            message: `Failed to fetch OCI chart tags: ${response.status} ${response.statusText}`,
          });
        }

        const data = (await response.json()) as OciTagsResponse;
        return success((data.tags ?? []).map((name) => ({ name })));
      } catch (error) {
        return failure({
          code: 'REGISTRY_ERROR',
          message: `Failed to fetch OCI chart tags: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}

/**
 * Fetches and parses a Helm repository index.yaml file.
 */
async function fetch_helm_index(
  repository_url: string,
  config?: RegistryClientConfigType,
): Promise<ResultType<HelmIndexType, KustodianErrorType>> {
  // Ensure URL doesn't have trailing slash
  const base_url = repository_url.replace(/\/$/, '');
  const index_url = `${base_url}/index.yaml`;

  try {
    const response = await fetch(index_url, {
      signal: create_abort_signal(config?.timeout ?? DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      return failure({
        code: 'HELM_REPO_ERROR',
        message: `Failed to fetch Helm index: ${response.status} ${response.statusText}`,
      });
    }

    const content = await response.text();
    const index = parse(content) as HelmIndexType;

    if (!index.entries) {
      return failure({
        code: 'HELM_REPO_ERROR',
        message: 'Invalid Helm index: missing entries',
      });
    }

    return success(index);
  } catch (error) {
    return failure({
      code: 'HELM_REPO_ERROR',
      message: `Failed to fetch Helm index: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Parses an OCI Helm reference into components.
 * Example: oci://ghcr.io/traefik/helm/traefik -> {registry: ghcr.io, namespace: traefik/helm, repository: traefik}
 */
function parse_oci_helm_reference(oci_url: string, chart_name: string): ImageReferenceType {
  // Remove oci:// prefix
  const url_without_prefix = oci_url.replace(/^oci:\/\//, '');

  // Split into parts
  const parts = url_without_prefix.split('/');

  if (parts.length < 2) {
    // Fallback for invalid format
    return {
      registry: parts[0] || 'ghcr.io',
      namespace: 'library',
      repository: chart_name,
    };
  }

  // First part is registry
  const registry = parts[0] || 'ghcr.io';

  // Everything except first part and last part (if it matches chart name) is namespace
  const last_part = parts[parts.length - 1];
  let namespace: string;

  if (last_part === chart_name && parts.length > 2) {
    // If last part is the chart name, use everything in between as namespace
    const intermediate_namespace = parts.slice(1, -1).join('/');
    namespace = intermediate_namespace || 'library';
  } else {
    // Otherwise, use everything after registry as namespace
    const full_namespace = parts.slice(1).join('/');
    namespace = full_namespace || 'library';
  }

  return {
    registry,
    namespace,
    repository: chart_name,
  };
}

/**
 * Creates a Helm repository client.
 * Supports both traditional Helm repositories and OCI registries.
 */
export function create_helm_client(
  helm_config: { repository?: string; oci?: string; chart: string },
  config?: RegistryClientConfigType,
): RegistryClientType {
  // OCI registry
  if (helm_config.oci) {
    const image_ref = parse_oci_helm_reference(helm_config.oci, helm_config.chart);
    const oci_client =
      image_ref.registry === 'ghcr.io'
        ? create_ghcr_client(config)
        : create_generic_oci_registry_client(config);
    return {
      list_tags: () => oci_client.list_tags(image_ref),
    };
  }

  // Traditional Helm repository
  return {
    async list_tags(
      _image?: ImageReferenceType,
    ): Promise<ResultType<TagInfoType[], KustodianErrorType>> {
      if (!helm_config.repository) {
        return failure({
          code: 'HELM_REPO_ERROR',
          message: 'No repository URL provided for Helm chart',
        });
      }

      const index_result = await fetch_helm_index(helm_config.repository, config);
      if (!index_result.success) {
        return index_result;
      }

      const chart_entries = index_result.value.entries[helm_config.chart];
      if (!chart_entries || chart_entries.length === 0) {
        return failure({
          code: 'HELM_CHART_NOT_FOUND',
          message: `Chart "${helm_config.chart}" not found in Helm repository`,
        });
      }

      const tags: TagInfoType[] = chart_entries.map((entry) =>
        entry.digest ? { name: entry.version, digest: entry.digest } : { name: entry.version },
      );

      return success(tags);
    },
  };
}
