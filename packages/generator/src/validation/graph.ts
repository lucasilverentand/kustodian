import type { TemplateType } from '@kustodian/schema';

import {
  create_node_id,
  is_parse_error,
  parse_dependency_ref,
  resolve_dependency_ref,
} from './reference.js';
import type { BuildGraphResultType, GraphNodeType, GraphValidationErrorType } from './types.js';

/**
 * Builds a dependency graph from templates.
 *
 * Uses a two-pass algorithm:
 * 1. First pass: Create nodes for all kustomizations
 * 2. Second pass: Resolve dependencies and validate references
 *
 * @param templates - Array of templates to build graph from
 * @returns Graph nodes and any errors encountered during building
 */
export function build_dependency_graph(templates: TemplateType[]): BuildGraphResultType {
  const nodes = new Map<string, GraphNodeType>();
  const errors: GraphValidationErrorType[] = [];

  // First pass: Create all nodes
  for (const template of templates) {
    const template_name = template.metadata.name;

    for (const kustomization of template.spec.kustomizations) {
      const node_id = create_node_id(template_name, kustomization.name);

      nodes.set(node_id, {
        id: node_id,
        template: template_name,
        kustomization: kustomization.name,
        dependencies: [],
      });
    }
  }

  // Second pass: Resolve dependencies
  for (const template of templates) {
    const template_name = template.metadata.name;

    for (const kustomization of template.spec.kustomizations) {
      const node_id = create_node_id(template_name, kustomization.name);
      const resolved_dependencies: string[] = [];

      for (const dep of kustomization.depends_on ?? []) {
        // Parse the dependency reference
        const parse_result = parse_dependency_ref(dep);

        if (is_parse_error(parse_result)) {
          // Add source to the error
          errors.push({
            ...parse_result,
            source: node_id,
          });
          continue;
        }

        // Resolve to full node ID
        const target_id = resolve_dependency_ref(parse_result, template_name);

        // Skip raw dependencies - they're external and don't participate in graph validation
        if (target_id === null) {
          continue;
        }

        // Check for self-reference
        if (target_id === node_id) {
          errors.push({
            type: 'self_reference',
            node: node_id,
            message: `Kustomization '${node_id}' cannot depend on itself`,
          });
          continue;
        }

        // Check if target exists
        if (!nodes.has(target_id)) {
          errors.push({
            type: 'missing_reference',
            source: node_id,
            target: target_id,
            message: `Kustomization '${node_id}' depends on '${target_id}' which does not exist`,
          });
          continue;
        }

        resolved_dependencies.push(target_id);
      }

      // Update node with resolved dependencies
      // We need to create a new node since GraphNodeType has readonly properties
      if (resolved_dependencies.length > 0) {
        const existing_node = nodes.get(node_id);
        if (existing_node) {
          nodes.set(node_id, {
            ...existing_node,
            dependencies: resolved_dependencies,
          });
        }
      }
    }
  }

  return { nodes, errors };
}

/**
 * Gets all nodes from the graph as an array.
 *
 * @param nodes - Map of graph nodes
 * @returns Array of all nodes
 */
export function get_all_nodes(nodes: Map<string, GraphNodeType>): GraphNodeType[] {
  return Array.from(nodes.values());
}

/**
 * Gets a node by its ID.
 *
 * @param nodes - Map of graph nodes
 * @param id - Node ID to look up
 * @returns The node or undefined if not found
 */
export function get_node(nodes: Map<string, GraphNodeType>, id: string): GraphNodeType | undefined {
  return nodes.get(id);
}
