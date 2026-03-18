/**
 * Service IDs for the CLI dependency injection container.
 */

import type { PluginRegistryType } from '../plugins/index.js';

import { create_service_id } from './container.js';

export const PLUGIN_REGISTRY_ID = create_service_id<PluginRegistryType>('plugin_registry');
