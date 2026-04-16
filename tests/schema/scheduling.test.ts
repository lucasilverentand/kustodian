import { describe, expect, it } from 'bun:test';

import { scheduling_schema } from '../../src/schema/scheduling.js';

describe('scheduling_schema', () => {
  it('accepts an empty block', () => {
    expect(scheduling_schema.safeParse({}).success).toBe(true);
  });

  it('accepts a fully-populated block', () => {
    const data = {
      node_selector: { 'kubernetes.io/arch': 'arm64' },
      affinity: {
        node: {
          required: [
            {
              match_expressions: [
                { key: 'topology.kubernetes.io/zone', operator: 'In', values: ['eu-west-1a'] },
              ],
            },
          ],
          preferred: [
            {
              weight: 50,
              preference: {
                match_expressions: [{ key: 'role', operator: 'In', values: ['app'] }],
              },
            },
          ],
        },
        pod_anti: {
          required: [{ topology_key: 'kubernetes.io/hostname' }],
        },
      },
      tolerations: [{ key: 'dedicated', operator: 'Equal', value: 'gitops', effect: 'NoSchedule' }],
      topology_spread: [
        {
          max_skew: 1,
          topology_key: 'topology.kubernetes.io/zone',
          when_unsatisfiable: 'ScheduleAnyway',
        },
      ],
      priority_class: 'high',
      resources: { requests: { cpu: '100m' }, limits: { cpu: '1' } },
      containers: {
        sidecar: { resources: { requests: { memory: '64Mi' } } },
      },
      disabled: false,
      workloads: {
        worker: {
          node_selector: { gpu: 'true' },
          priority_class: 'batch',
        },
      },
    };

    const result = scheduling_schema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('rejects invalid toleration operator', () => {
    const result = scheduling_schema.safeParse({
      tolerations: [{ key: 'gpu', operator: 'Maybe' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid when_unsatisfiable value', () => {
    const result = scheduling_schema.safeParse({
      topology_spread: [
        { max_skew: 1, topology_key: 'kubernetes.io/hostname', when_unsatisfiable: 'Whenever' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive max_skew', () => {
    const result = scheduling_schema.safeParse({
      topology_spread: [
        {
          max_skew: 0,
          topology_key: 'kubernetes.io/hostname',
          when_unsatisfiable: 'DoNotSchedule',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
