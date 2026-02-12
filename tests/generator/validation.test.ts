import { describe, expect, it } from 'bun:test';

import type { ClusterType, NodeSchemaType, TemplateType } from '../../src/schema/index.js';

import { detect_cycles, has_cycles } from '../../src/generator/validation/cycle-detection.js';
import { build_dependency_graph } from '../../src/generator/validation/graph.js';
import {
  validate_dependencies,
  validate_dependency_graph,
  validate_template_requirements,
} from '../../src/generator/validation/index.js';
import {
  create_node_id,
  is_parse_error,
  parse_dependency_ref,
  parse_node_id,
  resolve_dependency_ref,
} from '../../src/generator/validation/reference.js';
import type { GraphNodeType } from '../../src/generator/validation/types.js';

/**
 * Helper to create a minimal cluster for testing.
 */
function create_test_cluster(name = 'test-cluster'): ClusterType {
  return {
    apiVersion: 'kustodian.io/v1',
    kind: 'Cluster',
    metadata: { name },
    spec: {
      git: {
        owner: 'test',
        repository: 'test',
        branch: 'main',
      },
    },
  };
}

/**
 * Helper to create a minimal template for testing.
 */
function create_template(
  name: string,
  kustomizations: Array<{ name: string; depends_on?: string[]; enabled?: boolean }>,
): TemplateType {
  return {
    apiVersion: 'kustodian.io/v1',
    kind: 'Template',
    metadata: { name },
    spec: {
      kustomizations: kustomizations.map((k) => ({
        name: k.name,
        path: `./${k.name}`,
        prune: true,
        wait: true,
        enabled: k.enabled ?? true,
        depends_on: k.depends_on,
      })),
    },
  };
}

describe('Validation Module', () => {
  describe('Reference Parsing', () => {
    describe('parse_dependency_ref', () => {
      it('should parse within-template reference', () => {
        const result = parse_dependency_ref('storage');

        expect(is_parse_error(result)).toBe(false);
        if (!is_parse_error(result)) {
          expect(result.kustomization).toBe('storage');
          expect(result.template).toBeUndefined();
          expect(result.raw).toBe('storage');
        }
      });

      it('should parse cross-template reference', () => {
        const result = parse_dependency_ref('secrets/provider');

        expect(is_parse_error(result)).toBe(false);
        if (!is_parse_error(result)) {
          expect(result.template).toBe('secrets');
          expect(result.kustomization).toBe('provider');
          expect(result.raw).toBe('secrets/provider');
        }
      });

      it('should return error for empty reference', () => {
        const result = parse_dependency_ref('');

        expect(is_parse_error(result)).toBe(true);
        if (is_parse_error(result)) {
          expect(result.type).toBe('invalid_reference');
          expect(result.message).toContain('Empty');
        }
      });

      it('should return error for reference with empty parts', () => {
        const result = parse_dependency_ref('template/');

        expect(is_parse_error(result)).toBe(true);
        if (is_parse_error(result)) {
          expect(result.type).toBe('invalid_reference');
        }
      });

      it('should return error for reference with too many slashes', () => {
        const result = parse_dependency_ref('a/b/c');

        expect(is_parse_error(result)).toBe(true);
        if (is_parse_error(result)) {
          expect(result.type).toBe('invalid_reference');
          expect(result.message).toContain('expected');
        }
      });

      it('should trim whitespace', () => {
        const result = parse_dependency_ref('  storage  ');

        expect(is_parse_error(result)).toBe(false);
        if (!is_parse_error(result)) {
          expect(result.kustomization).toBe('storage');
        }
      });
    });

    describe('resolve_dependency_ref', () => {
      it('should resolve within-template reference', () => {
        const ref = { kustomization: 'database', raw: 'database' };
        const result = resolve_dependency_ref(ref, 'media');

        expect(result).toBe('media/database');
      });

      it('should resolve cross-template reference', () => {
        const ref = { template: 'secrets', kustomization: 'provider', raw: 'secrets/provider' };
        const result = resolve_dependency_ref(ref, 'media');

        expect(result).toBe('secrets/provider');
      });
    });

    describe('create_node_id', () => {
      it('should create node ID from template and kustomization', () => {
        const result = create_node_id('media', 'storage');

        expect(result).toBe('media/storage');
      });
    });

    describe('parse_node_id', () => {
      it('should parse node ID into components', () => {
        const result = parse_node_id('media/storage');

        expect(result.template).toBe('media');
        expect(result.kustomization).toBe('storage');
      });

      it('should handle node ID without template', () => {
        const result = parse_node_id('storage');

        expect(result.template).toBe('');
        expect(result.kustomization).toBe('storage');
      });
    });
  });

  describe('Graph Building', () => {
    it('should build graph from templates with no dependencies', () => {
      const templates = [create_template('app', [{ name: 'frontend' }, { name: 'backend' }])];

      const result = build_dependency_graph(templates);

      expect(result.errors).toHaveLength(0);
      expect(result.nodes.size).toBe(2);
      expect(result.nodes.has('app/frontend')).toBe(true);
      expect(result.nodes.has('app/backend')).toBe(true);
    });

    it('should build graph with within-template dependencies', () => {
      const templates = [
        create_template('app', [
          { name: 'database' },
          { name: 'backend', depends_on: ['database'] },
          { name: 'frontend', depends_on: ['backend'] },
        ]),
      ];

      const result = build_dependency_graph(templates);

      expect(result.errors).toHaveLength(0);

      const backend = result.nodes.get('app/backend');
      expect(backend?.dependencies).toEqual(['app/database']);

      const frontend = result.nodes.get('app/frontend');
      expect(frontend?.dependencies).toEqual(['app/backend']);
    });

    it('should build graph with cross-template dependencies', () => {
      const templates = [
        create_template('secrets', [{ name: 'provider' }]),
        create_template('app', [{ name: 'backend', depends_on: ['secrets/provider'] }]),
      ];

      const result = build_dependency_graph(templates);

      expect(result.errors).toHaveLength(0);

      const backend = result.nodes.get('app/backend');
      expect(backend?.dependencies).toEqual(['secrets/provider']);
    });

    it('should detect missing references', () => {
      const templates = [
        create_template('app', [{ name: 'backend', depends_on: ['nonexistent'] }]),
      ];

      const result = build_dependency_graph(templates);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('missing_reference');
    });

    it('should detect self-references', () => {
      const templates = [create_template('app', [{ name: 'backend', depends_on: ['backend'] }])];

      const result = build_dependency_graph(templates);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('self_reference');
    });

    it('should detect cross-template missing references', () => {
      const templates = [
        create_template('app', [{ name: 'backend', depends_on: ['missing-template/service'] }]),
      ];

      const result = build_dependency_graph(templates);

      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error?.type).toBe('missing_reference');
      if (error?.type === 'missing_reference') {
        expect(error.target).toBe('missing-template/service');
      }
    });
  });

  describe('Cycle Detection', () => {
    it('should detect no cycles in empty graph', () => {
      const nodes = new Map<string, GraphNodeType>();

      const result = detect_cycles(nodes);

      expect(result.cycles).toHaveLength(0);
      expect(result.topological_order).toEqual([]);
    });

    it('should detect no cycles in linear graph', () => {
      const nodes = new Map<string, GraphNodeType>([
        ['a', { id: 'a', template: 't', kustomization: 'a', dependencies: ['b'] }],
        ['b', { id: 'b', template: 't', kustomization: 'b', dependencies: ['c'] }],
        ['c', { id: 'c', template: 't', kustomization: 'c', dependencies: [] }],
      ]);

      const result = detect_cycles(nodes);

      expect(result.cycles).toHaveLength(0);
      expect(result.topological_order).not.toBeNull();
    });

    it('should detect direct cycle (A → B → A)', () => {
      const nodes = new Map<string, GraphNodeType>([
        ['a', { id: 'a', template: 't', kustomization: 'a', dependencies: ['b'] }],
        ['b', { id: 'b', template: 't', kustomization: 'b', dependencies: ['a'] }],
      ]);

      const result = detect_cycles(nodes);

      expect(result.cycles.length).toBeGreaterThan(0);
      expect(result.topological_order).toBeNull();
    });

    it('should detect complex cycle (A → B → C → A)', () => {
      const nodes = new Map<string, GraphNodeType>([
        ['a', { id: 'a', template: 't', kustomization: 'a', dependencies: ['b'] }],
        ['b', { id: 'b', template: 't', kustomization: 'b', dependencies: ['c'] }],
        ['c', { id: 'c', template: 't', kustomization: 'c', dependencies: ['a'] }],
      ]);

      const result = detect_cycles(nodes);

      expect(result.cycles.length).toBeGreaterThan(0);
      expect(result.topological_order).toBeNull();
    });

    it('should return topological order for valid graph', () => {
      const nodes = new Map<string, GraphNodeType>([
        ['a', { id: 'a', template: 't', kustomization: 'a', dependencies: ['b', 'c'] }],
        ['b', { id: 'b', template: 't', kustomization: 'b', dependencies: ['c'] }],
        ['c', { id: 'c', template: 't', kustomization: 'c', dependencies: [] }],
      ]);

      const result = detect_cycles(nodes);

      expect(result.cycles).toHaveLength(0);
      expect(result.topological_order).not.toBeNull();

      // c should come before b and a (since they depend on c)
      const order = result.topological_order;
      if (order) {
        expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
        expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'));
        expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
      }
    });

    it('has_cycles should return true for cyclic graph', () => {
      const nodes = new Map<string, GraphNodeType>([
        ['a', { id: 'a', template: 't', kustomization: 'a', dependencies: ['b'] }],
        ['b', { id: 'b', template: 't', kustomization: 'b', dependencies: ['a'] }],
      ]);

      expect(has_cycles(nodes)).toBe(true);
    });

    it('has_cycles should return false for acyclic graph', () => {
      const nodes = new Map<string, GraphNodeType>([
        ['a', { id: 'a', template: 't', kustomization: 'a', dependencies: ['b'] }],
        ['b', { id: 'b', template: 't', kustomization: 'b', dependencies: [] }],
      ]);

      expect(has_cycles(nodes)).toBe(false);
    });
  });

  describe('Full Validation', () => {
    describe('validate_dependency_graph', () => {
      it('should validate empty templates', () => {
        const result = validate_dependency_graph([]);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate templates with no dependencies', () => {
        const templates = [create_template('app', [{ name: 'frontend' }, { name: 'backend' }])];

        const result = validate_dependency_graph(templates);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.topological_order).toBeDefined();
      });

      it('should validate valid dependency chain', () => {
        const templates = [
          create_template('app', [
            { name: 'database' },
            { name: 'backend', depends_on: ['database'] },
            { name: 'frontend', depends_on: ['backend'] },
          ]),
        ];

        const result = validate_dependency_graph(templates);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should detect cycle and return error', () => {
        const templates = [
          create_template('app', [
            { name: 'a', depends_on: ['b'] },
            { name: 'b', depends_on: ['a'] },
          ]),
        ];

        const result = validate_dependency_graph(templates);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === 'cycle')).toBe(true);
      });

      it('should detect missing reference and return error', () => {
        const templates = [create_template('app', [{ name: 'backend', depends_on: ['missing'] }])];

        const result = validate_dependency_graph(templates);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.type === 'missing_reference')).toBe(true);
      });

      it('should detect multiple errors', () => {
        const templates = [
          create_template('app', [
            { name: 'a', depends_on: ['b'] },
            { name: 'b', depends_on: ['a', 'missing'] },
          ]),
        ];

        const result = validate_dependency_graph(templates);

        expect(result.valid).toBe(false);
        // Should have both missing reference and cycle errors
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('validate_dependencies', () => {
      it('should return success for valid graph', () => {
        const cluster = create_test_cluster();
        const templates = [
          create_template('app', [
            { name: 'database' },
            { name: 'backend', depends_on: ['database'] },
          ]),
        ];

        const result = validate_dependencies(cluster, templates);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(Array.isArray(result.value)).toBe(true);
        }
      });

      it('should return failure for invalid graph', () => {
        const cluster = create_test_cluster();
        const templates = [
          create_template('app', [
            { name: 'a', depends_on: ['b'] },
            { name: 'b', depends_on: ['a'] },
          ]),
        ];

        const result = validate_dependencies(cluster, templates);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('DEPENDENCY_VALIDATION_ERROR');
        }
      });
    });
  });

  describe('Diamond Dependencies', () => {
    it('should handle diamond dependency pattern', () => {
      // A depends on B and C
      // B depends on D
      // C depends on D
      const templates = [
        create_template('app', [
          { name: 'a', depends_on: ['b', 'c'] },
          { name: 'b', depends_on: ['d'] },
          { name: 'c', depends_on: ['d'] },
          { name: 'd' },
        ]),
      ];

      const result = validate_dependency_graph(templates);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // D should come first in the order
      const order = result.topological_order;
      if (order) {
        expect(order.indexOf('app/d')).toBeLessThan(order.indexOf('app/b'));
        expect(order.indexOf('app/d')).toBeLessThan(order.indexOf('app/c'));
      }
    });
  });

  describe('Cross-Template Dependencies', () => {
    it('should validate cross-template dependencies', () => {
      const templates = [
        create_template('secrets', [{ name: 'provider' }]),
        create_template('networking', [{ name: 'operator', depends_on: ['secrets/provider'] }]),
        create_template('media', [
          { name: 'app', depends_on: ['networking/operator', 'secrets/provider'] },
        ]),
      ];

      const result = validate_dependency_graph(templates);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect cycles across templates', () => {
      const templates = [
        create_template('a', [{ name: 'x', depends_on: ['b/y'] }]),
        create_template('b', [{ name: 'y', depends_on: ['a/x'] }]),
      ];

      const result = validate_dependency_graph(templates);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'cycle')).toBe(true);
    });
  });

  describe('Template Requirements', () => {
    function create_template_with_requirements(
      name: string,
      requirements?: TemplateType['spec']['requirements'],
    ): TemplateType {
      return {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name },
        spec: {
          requirements,
          kustomizations: [
            {
              name: 'main',
              path: './main',
              prune: true,
              wait: true,
            },
          ],
        },
      };
    }

    function create_node(
      name: string,
      labels?: Record<string, string | boolean | number>,
    ): NodeSchemaType {
      return {
        name,
        role: 'worker',
        address: '192.168.1.1',
        labels,
      };
    }

    describe('validate_template_requirements', () => {
      it('should pass when no requirements are defined', () => {
        const templates = [create_template_with_requirements('app')];
        const nodes = [create_node('node1')];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should pass when node has required label with matching value', () => {
        const templates = [
          create_template_with_requirements('media', [
            {
              type: 'nodeLabel',
              key: 'media-vpn',
              value: 'true',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [create_node('node1', { 'media-vpn': 'true' })];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should pass when node has required label without value check', () => {
        const templates = [
          create_template_with_requirements('gpu', [
            {
              type: 'nodeLabel',
              key: 'nvidia.com/gpu',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [create_node('node1', { 'nvidia.com/gpu': 'tesla-v100' })];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should fail when no nodes have the required label', () => {
        const templates = [
          create_template_with_requirements('media', [
            {
              type: 'nodeLabel',
              key: 'media-vpn',
              value: 'true',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [create_node('node1', { 'other-label': 'value' })];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.template).toBe('media');
        expect(result.errors[0]?.message).toContain('media-vpn=true');
        expect(result.errors[0]?.message).toContain('found 0');
      });

      it('should fail when label value does not match', () => {
        const templates = [
          create_template_with_requirements('media', [
            {
              type: 'nodeLabel',
              key: 'media-vpn',
              value: 'true',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [create_node('node1', { 'media-vpn': 'false' })];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
      });

      it('should fail when not enough nodes match', () => {
        const templates = [
          create_template_with_requirements('media', [
            {
              type: 'nodeLabel',
              key: 'media-vpn',
              value: 'true',
              atLeast: 2,
            },
          ]),
        ];
        const nodes = [
          create_node('node1', { 'media-vpn': 'true' }),
          create_node('node2', { 'other-label': 'value' }),
        ];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.message).toContain('at least 2');
        expect(result.errors[0]?.message).toContain('found 1');
      });

      it('should pass when multiple nodes match', () => {
        const templates = [
          create_template_with_requirements('media', [
            {
              type: 'nodeLabel',
              key: 'media-vpn',
              value: 'true',
              atLeast: 2,
            },
          ]),
        ];
        const nodes = [
          create_node('node1', { 'media-vpn': 'true' }),
          create_node('node2', { 'media-vpn': 'true' }),
          create_node('node3', { 'other-label': 'value' }),
        ];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate multiple requirements', () => {
        const templates = [
          create_template_with_requirements('media', [
            {
              type: 'nodeLabel',
              key: 'media-vpn',
              value: 'true',
              atLeast: 1,
            },
            {
              type: 'nodeLabel',
              key: 'media-downloaders',
              value: 'true',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [
          create_node('node1', { 'media-vpn': 'true' }),
          create_node('node2', { 'media-downloaders': 'true' }),
        ];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should fail when one of multiple requirements is not met', () => {
        const templates = [
          create_template_with_requirements('media', [
            {
              type: 'nodeLabel',
              key: 'media-vpn',
              value: 'true',
              atLeast: 1,
            },
            {
              type: 'nodeLabel',
              key: 'media-downloaders',
              value: 'true',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [create_node('node1', { 'media-vpn': 'true' })];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.requirement.key).toBe('media-downloaders');
      });

      it('should validate multiple templates', () => {
        const templates = [
          create_template_with_requirements('media', [
            {
              type: 'nodeLabel',
              key: 'media-vpn',
              value: 'true',
              atLeast: 1,
            },
          ]),
          create_template_with_requirements('gpu', [
            {
              type: 'nodeLabel',
              key: 'nvidia.com/gpu',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [
          create_node('node1', { 'media-vpn': 'true' }),
          create_node('node2', { 'nvidia.com/gpu': 'tesla-v100' }),
        ];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle boolean label values', () => {
        const templates = [
          create_template_with_requirements('app', [
            {
              type: 'nodeLabel',
              key: 'enabled',
              value: 'true',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [create_node('node1', { enabled: true })];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle numeric label values', () => {
        const templates = [
          create_template_with_requirements('app', [
            {
              type: 'nodeLabel',
              key: 'priority',
              value: '10',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [create_node('node1', { priority: 10 })];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle nodes without labels', () => {
        const templates = [
          create_template_with_requirements('app', [
            {
              type: 'nodeLabel',
              key: 'special',
              atLeast: 1,
            },
          ]),
        ];
        const nodes = [create_node('node1')];

        const result = validate_template_requirements(templates, nodes);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
      });
    });
  });
});
