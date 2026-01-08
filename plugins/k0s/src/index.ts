// Plugin exports
export { create_k0s_plugin, plugin } from './plugin.js';
export { plugin as default } from './plugin.js';

// Provider exports
export { create_k0s_provider, validate_k0s_config } from './provider.js';

// Config generation
export { generate_k0sctl_config, node_to_k0sctl_host, serialize_k0sctl_config } from './config.js';

// Executor
export {
  check_k0sctl_available,
  exec_command,
  k0sctl_apply,
  k0sctl_kubeconfig,
  k0sctl_reset,
  type CommandResultType,
  type ExecOptionsType,
} from './executor.js';

// Types
export {
  to_k0sctl_role,
  to_k0sctl_ssh_config,
  type K0sApiConfigType,
  type K0sConfigSpecType,
  type K0sctlConfigType,
  type K0sctlHostRoleType,
  type K0sctlHostType,
  type K0sctlK0sConfigType,
  type K0sctlMetadataType,
  type K0sctlSpecType,
  type K0sctlSshConfigType,
  type K0sProviderOptionsType,
  type K0sTelemetryConfigType,
  type K0sVersionType,
} from './types.js';
