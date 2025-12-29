import { type ResultType, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';

import { type NodeListType, type NodeType, format_node_labels } from './types.js';

/**
 * Label operation types.
 */
export type LabelOperationType = 'add' | 'update' | 'remove';

/**
 * A single label change to be applied.
 */
export interface LabelChangeType {
  node: string;
  key: string;
  value?: string;
  operation: LabelOperationType;
}

/**
 * Options for the label sync operation.
 */
export interface LabelSyncOptionsType {
  dry_run?: boolean;
  verify?: boolean;
}

/**
 * Result of a label sync operation.
 */
export interface LabelSyncResultType {
  changes: LabelChangeType[];
  applied: number;
  skipped: number;
}

/**
 * Calculates the label changes needed for a node.
 */
export function calculate_label_changes(
  node: NodeType,
  current_labels: Record<string, string>,
  prefix: string,
): LabelChangeType[] {
  const changes: LabelChangeType[] = [];
  const desired_labels = format_node_labels(node.labels, prefix);

  // Find labels to add or update
  for (const [key, value] of Object.entries(desired_labels)) {
    const current_value = current_labels[key];

    if (current_value === undefined) {
      changes.push({
        node: node.name,
        key,
        value,
        operation: 'add',
      });
    } else if (current_value !== value) {
      changes.push({
        node: node.name,
        key,
        value,
        operation: 'update',
      });
    }
  }

  // Find labels to remove (labels with prefix that aren't in desired)
  for (const key of Object.keys(current_labels)) {
    if (key.startsWith(`${prefix}/`) && !(key in desired_labels)) {
      changes.push({
        node: node.name,
        key,
        operation: 'remove',
      });
    }
  }

  return changes;
}

/**
 * Calculates all label changes for a node list.
 */
export function calculate_all_label_changes(
  node_list: NodeListType,
  current_labels_by_node: Map<string, Record<string, string>>,
): LabelChangeType[] {
  const prefix = node_list.label_prefix ?? 'kustodian.io';
  const all_changes: LabelChangeType[] = [];

  for (const node of node_list.nodes) {
    const current_labels = current_labels_by_node.get(node.name) ?? {};
    const changes = calculate_label_changes(node, current_labels, prefix);
    all_changes.push(...changes);
  }

  return all_changes;
}

/**
 * Formats a label change for display.
 */
export function format_label_change(change: LabelChangeType): string {
  switch (change.operation) {
    case 'add':
      return `[+] ${change.node}: ${change.key}=${change.value}`;
    case 'update':
      return `[~] ${change.node}: ${change.key}=${change.value}`;
    case 'remove':
      return `[-] ${change.node}: ${change.key}`;
  }
}

/**
 * Groups label changes by node.
 */
export function group_changes_by_node(changes: LabelChangeType[]): Map<string, LabelChangeType[]> {
  const grouped = new Map<string, LabelChangeType[]>();

  for (const change of changes) {
    const node_changes = grouped.get(change.node) ?? [];
    node_changes.push(change);
    grouped.set(change.node, node_changes);
  }

  return grouped;
}

/**
 * Creates a dry-run result from label changes.
 */
export function create_dry_run_result(changes: LabelChangeType[]): LabelSyncResultType {
  return {
    changes,
    applied: 0,
    skipped: changes.length,
  };
}

/**
 * Node labeler service interface.
 * This is implemented by the actual Kubernetes client.
 */
export interface NodeLabelerType {
  /**
   * Gets the current labels for a node.
   */
  get_labels(node_name: string): Promise<ResultType<Record<string, string>, KustodianErrorType>>;

  /**
   * Applies a label change to a node.
   */
  apply_change(change: LabelChangeType): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Syncs labels for all nodes in the list.
   */
  sync_labels(
    node_list: NodeListType,
    options?: LabelSyncOptionsType,
  ): Promise<ResultType<LabelSyncResultType, KustodianErrorType>>;
}

/**
 * Creates a mock labeler for testing.
 */
export function create_mock_labeler(
  labels_by_node: Map<string, Record<string, string>>,
): NodeLabelerType {
  return {
    async get_labels(node_name) {
      const labels = labels_by_node.get(node_name);
      if (!labels) {
        return success({});
      }
      return success(labels);
    },

    async apply_change(_change) {
      return success(undefined);
    },

    async sync_labels(node_list, options) {
      const changes = calculate_all_label_changes(node_list, labels_by_node);

      if (options?.dry_run) {
        return success(create_dry_run_result(changes));
      }

      // In mock, all changes are "applied"
      return success({
        changes,
        applied: changes.length,
        skipped: 0,
      });
    },
  };
}
