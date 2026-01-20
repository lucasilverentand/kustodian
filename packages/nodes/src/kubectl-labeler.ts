import { Errors, failure, is_success, success } from '@kustodian/core';
import type { KubectlClientType } from '@kustodian/k8s';

import {
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

      for (const node of node_list.nodes) {
        const labels_result = await this.get_labels(node.name);

        if (!is_success(labels_result)) {
          return failure({
            code: 'KUBECTL_LABEL_ERROR',
            message: `Failed to get labels for node ${node.name}: ${labels_result.error.message}`,
          });
        }

        current_labels_by_node.set(node.name, labels_result.value);
      }

      const changes = calculate_all_label_changes(node_list, current_labels_by_node);

      if (options.dry_run) {
        return success(create_dry_run_result(changes));
      }

      const grouped_changes = group_changes_by_node(changes);
      let applied = 0;
      let failed = 0;

      for (const [node_name, node_changes] of grouped_changes) {
        for (const change of node_changes) {
          const apply_result = await this.apply_change(change);

          if (is_success(apply_result)) {
            applied++;
          } else {
            failed++;
            console.warn(
              `  ⚠ Failed to apply change on ${node_name}: ${apply_result.error.message}`,
            );
          }
        }
      }

      return success({
        changes,
        applied,
        skipped: failed,
      });
    },
  };
}
