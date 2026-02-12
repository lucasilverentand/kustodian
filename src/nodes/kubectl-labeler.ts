import { Errors, failure, is_success, success } from '../core/index.js';
import type { KubectlClientType } from '../k8s/index.js';

import {
  type LabelChangeType,
  type NodeLabelerType,
  calculate_all_label_changes,
  create_dry_run_result,
  group_changes_by_node,
} from './labeler.js';

/**
 * Creates a node labeler that uses kubectl to manage node labels.
 */
export function create_kubectl_labeler(kubectl: KubectlClientType): NodeLabelerType {
  return {
    async get_labels(node_name) {
      const get_result = await kubectl.get({ kind: 'Node', name: node_name });

      if (!is_success(get_result)) {
        return get_result;
      }

      const nodes = get_result.value;
      if (nodes.length === 0) {
        return failure(Errors.not_found('Node', node_name));
      }

      const node = nodes[0];
      if (!node) {
        return failure(Errors.not_found('Node', node_name));
      }

      const labels = node.metadata.labels ?? {};

      return success(labels as Record<string, string>);
    },

    async apply_change(change) {
      if (change.operation === 'remove') {
        const remove_key = `${change.key}-`;
        const label_result = await kubectl.label(change.node, { [remove_key]: '' });
        if (!is_success(label_result)) {
          return failure({
            code: 'KUBECTL_LABEL_ERROR',
            message: `Failed to remove label ${change.key} from node ${change.node}: ${label_result.error.message}`,
          });
        }
        return success(undefined);
      }

      if (!change.value) {
        return failure(
          Errors.validation_error(
            `Label change for ${change.key} requires a value for ${change.operation} operation`,
          ),
        );
      }

      const label_result = await kubectl.label(change.node, {
        [change.key]: change.value,
      });

      if (!is_success(label_result)) {
        return failure({
          code: 'KUBECTL_LABEL_ERROR',
          message: `Failed to ${change.operation} label ${change.key}=${change.value} on node ${change.node}: ${label_result.error.message}`,
        });
      }

      return success(undefined);
    },

    async sync_labels(node_list, options = {}) {
      const current_labels_by_node = new Map<string, Record<string, string>>();
      const all_changes: LabelChangeType[] = [];
      let applied = 0;
      let skipped = 0;

      for (const node of node_list.nodes) {
        try {
          const labels_result = await this.get_labels(node.name);

          if (!is_success(labels_result)) {
            skipped++;
            continue;
          }

          current_labels_by_node.set(node.name, labels_result.value);
        } catch {
          skipped++;
        }
      }

      // Only calculate changes for nodes we successfully fetched labels for
      const fetched_node_list = {
        ...node_list,
        nodes: node_list.nodes.filter((n) => current_labels_by_node.has(n.name)),
      };
      const changes = calculate_all_label_changes(fetched_node_list, current_labels_by_node);
      all_changes.push(...changes);

      if (options.dry_run) {
        return success(create_dry_run_result(all_changes));
      }

      const grouped_changes = group_changes_by_node(changes);

      for (const [node_name, node_changes] of grouped_changes) {
        try {
          // Batch add/update labels into a single kubectl call
          const add_update_labels: Record<string, string> = {};
          const remove_labels: Record<string, string> = {};

          for (const change of node_changes) {
            if (change.operation === 'remove') {
              remove_labels[`${change.key}-`] = '';
            } else if (change.value) {
              add_update_labels[change.key] = change.value;
            }
          }

          // Apply add/update labels in one call
          if (Object.keys(add_update_labels).length > 0) {
            const label_result = await kubectl.label(node_name, add_update_labels);
            if (!is_success(label_result)) {
              skipped += node_changes.length;
              continue;
            }
          }

          // Apply removals in one call
          if (Object.keys(remove_labels).length > 0) {
            const remove_result = await kubectl.label(node_name, remove_labels);
            if (!is_success(remove_result)) {
              skipped += node_changes.filter((c) => c.operation === 'remove').length;
              applied += node_changes.filter((c) => c.operation !== 'remove').length;
              continue;
            }
          }

          applied += node_changes.length;
        } catch {
          skipped += node_changes.length;
        }
      }

      return success({
        changes: all_changes,
        applied,
        skipped,
      });
    },
  };
}
