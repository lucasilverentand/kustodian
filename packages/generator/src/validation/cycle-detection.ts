import type { CycleDetectionResultType, CycleErrorType, GraphNodeType } from './types.js';

/**
 * Visit state for DFS traversal.
 */
enum VisitState {
  /** Node has not been visited yet */
  Unvisited = 0,
  /** Node is currently being visited (in the DFS stack) */
  Visiting = 1,
  /** Node has been fully processed */
  Visited = 2,
}

/**
 * Formats a cycle into a human-readable message.
 *
 * @param cycle - Array of node IDs forming the cycle
 * @returns Formatted cycle message
 */
function format_cycle_message(cycle: string[]): string {
  const cycle_str = cycle.join(' → ');
  return `Dependency cycle detected: ${cycle_str}`;
}

/**
 * Detects cycles in the dependency graph using depth-first search (DFS).
 *
 * Uses a three-color algorithm:
 * - Unvisited (white): Node hasn't been processed
 * - Visiting (gray): Node is currently in the DFS stack
 * - Visited (black): Node and all its descendants have been processed
 *
 * If we encounter a Visiting node during DFS, we've found a cycle.
 *
 * Also performs topological sorting if no cycles are found.
 *
 * @param nodes - Map of graph nodes
 * @returns Cycles found and topological order (if no cycles)
 */
export function detect_cycles(nodes: Map<string, GraphNodeType>): CycleDetectionResultType {
  const state = new Map<string, VisitState>();
  const cycles: CycleErrorType[] = [];
  const topological_order: string[] = [];

  // Initialize all nodes as unvisited
  for (const id of nodes.keys()) {
    state.set(id, VisitState.Unvisited);
  }

  /**
   * DFS traversal function.
   *
   * @param node_id - Current node being visited
   * @param path - Current path from DFS root to this node
   */
  function dfs(node_id: string, path: string[]): void {
    state.set(node_id, VisitState.Visiting);
    path.push(node_id);

    const node = nodes.get(node_id);
    if (node) {
      for (const dep_id of node.dependencies) {
        const dep_state = state.get(dep_id);

        if (dep_state === VisitState.Visiting) {
          // Found a cycle - extract it from the path
          const cycle_start_index = path.indexOf(dep_id);
          const cycle = [...path.slice(cycle_start_index), dep_id];
          cycles.push({
            type: 'cycle',
            cycle,
            message: format_cycle_message(cycle),
          });
        } else if (dep_state === VisitState.Unvisited) {
          dfs(dep_id, path);
        }
        // If Visited, skip - already fully processed
      }
    }

    state.set(node_id, VisitState.Visited);
    path.pop();

    // Add to end for post-order (dependencies come before dependents)
    topological_order.push(node_id);
  }

  // Visit all nodes (handles disconnected components)
  for (const node_id of nodes.keys()) {
    if (state.get(node_id) === VisitState.Unvisited) {
      dfs(node_id, []);
    }
  }

  return {
    cycles,
    topological_order: cycles.length === 0 ? topological_order : null,
  };
}

/**
 * Checks if a graph has cycles.
 *
 * @param nodes - Map of graph nodes
 * @returns True if the graph has at least one cycle
 */
export function has_cycles(nodes: Map<string, GraphNodeType>): boolean {
  const result = detect_cycles(nodes);
  return result.cycles.length > 0;
}
