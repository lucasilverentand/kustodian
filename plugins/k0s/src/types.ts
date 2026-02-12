import type { SshConfigType } from 'kustodian/nodes';

/**
 * k0s version configuration.
 */
export interface K0sVersionType {
  version?: string;
  dynamic_config?: boolean;
}

/**
 * k0s cluster API configuration.
 */
export interface K0sApiConfigType {
  externalAddress?: string | undefined;
  sans?: string[] | undefined;
}

/**
 * k0s telemetry configuration.
 */
export interface K0sTelemetryConfigType {
  enabled: boolean;
}

/**
 * k0s configuration spec.
 */
export interface K0sConfigSpecType {
  api?: K0sApiConfigType | undefined;
  telemetry?: K0sTelemetryConfigType | undefined;
}

/**
 * k0s host role in k0sctl configuration.
 */
export type K0sctlHostRoleType = 'controller' | 'worker' | 'controller+worker' | 'single';

/**
 * SSH configuration for k0sctl.
 */
export interface K0sctlSshConfigType {
  address: string;
  user: string;
  keyPath?: string | undefined;
  port?: number | undefined;
  disableMultiplexing?: boolean | undefined;
  options?: Record<string, string> | undefined;
}

/**
 * Host configuration for k0sctl.
 */
export interface K0sctlHostType {
  role: K0sctlHostRoleType;
  hostname?: string | undefined;
  noTaints?: boolean | undefined;
  openSSH: K0sctlSshConfigType;
}

/**
 * k0s configuration block in k0sctl.
 */
export interface K0sctlK0sConfigType {
  version?: string | undefined;
  dynamicConfig?: boolean | undefined;
  config?:
    | {
        spec?: K0sConfigSpecType | undefined;
      }
    | undefined;
}

/**
 * k0sctl cluster spec.
 */
export interface K0sctlSpecType {
  k0s?: K0sctlK0sConfigType | undefined;
  hosts: K0sctlHostType[];
}

/**
 * k0sctl cluster metadata.
 */
export interface K0sctlMetadataType {
  name: string;
}

/**
 * Complete k0sctl configuration.
 */
export interface K0sctlConfigType {
  apiVersion: 'k0sctl.k0sproject.io/v1beta1';
  kind: 'Cluster';
  metadata: K0sctlMetadataType;
  spec: K0sctlSpecType;
}

/**
 * k0s provider options.
 */
export interface K0sProviderOptionsType {
  cluster_name?: string | undefined;
  k0s_version?: string | undefined;
  telemetry_enabled?: boolean | undefined;
  dynamic_config?: boolean | undefined;
  sans?: string[] | undefined;
  default_ssh?: SshConfigType | undefined;
}

/**
 * Converts internal SSH config to k0sctl SSH config format.
 */
export function to_k0sctl_ssh_config(address: string, ssh?: SshConfigType): K0sctlSshConfigType {
  const options: Record<string, string> = {};
  if (ssh?.known_hosts_path) {
    options['UserKnownHostsFile'] = ssh.known_hosts_path;
  }

  return {
    address,
    user: ssh?.user ?? 'root',
    keyPath: ssh?.key_path,
    port: ssh?.port,
    ...(ssh?.disable_multiplexing !== undefined && {
      disableMultiplexing: ssh.disable_multiplexing,
    }),
    ...(Object.keys(options).length > 0 && { options }),
  };
}

/**
 * Converts internal role to k0sctl role.
 */
export function to_k0sctl_role(role: string): K0sctlHostRoleType {
  switch (role) {
    case 'controller':
      return 'controller';
    case 'worker':
      return 'worker';
    case 'controller+worker':
      return 'controller+worker';
    default:
      return 'worker';
  }
}
