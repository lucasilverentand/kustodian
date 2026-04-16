import { describe, expect, it } from 'bun:test';
import YAML from 'yaml';

import type { SchedulingType, WorkloadSchedulingType } from '../../src/schema/index.js';

import {
  DEFAULT_WORKLOAD_KINDS,
  generate_scheduling_patches,
  merge_scheduling,
  merge_workload_scheduling,
  resolve_scheduling,
} from '../../src/generator/scheduling.js';

describe('Scheduling', () => {
  describe('merge_workload_scheduling', () => {
    it('returns override when base is undefined', () => {
      const override: WorkloadSchedulingType = { priority_class: 'high' };
      expect(merge_workload_scheduling(undefined, override)).toEqual(override);
    });

    it('returns base when override is undefined', () => {
      const base: WorkloadSchedulingType = { priority_class: 'high' };
      expect(merge_workload_scheduling(base, undefined)).toEqual(base);
    });

    it('replaces scalar fields at lower levels', () => {
      const base: WorkloadSchedulingType = { priority_class: 'low' };
      const override: WorkloadSchedulingType = { priority_class: 'high' };
      expect(merge_workload_scheduling(base, override)?.priority_class).toBe('high');
    });

    it('shallow-merges node_selector', () => {
      const base: WorkloadSchedulingType = { node_selector: { disk: 'ssd', arch: 'arm64' } };
      const override: WorkloadSchedulingType = { node_selector: { disk: 'nvme' } };
      expect(merge_workload_scheduling(base, override)?.node_selector).toEqual({
        disk: 'nvme',
        arch: 'arm64',
      });
    });

    it('replaces tolerations list entirely', () => {
      const base: WorkloadSchedulingType = {
        tolerations: [{ key: 'gpu', operator: 'Exists', effect: 'NoSchedule' }],
      };
      const override: WorkloadSchedulingType = {
        tolerations: [{ key: 'spot', operator: 'Exists', effect: 'NoSchedule' }],
      };
      expect(merge_workload_scheduling(base, override)?.tolerations).toEqual([
        { key: 'spot', operator: 'Exists', effect: 'NoSchedule' },
      ]);
    });

    it('shallow-merges resources requests and limits', () => {
      const base: WorkloadSchedulingType = {
        resources: {
          requests: { cpu: '100m', memory: '128Mi' },
          limits: { cpu: '1', memory: '512Mi' },
        },
      };
      const override: WorkloadSchedulingType = {
        resources: { requests: { cpu: '500m' } },
      };
      expect(merge_workload_scheduling(base, override)?.resources).toEqual({
        requests: { cpu: '500m', memory: '128Mi' },
        limits: { cpu: '1', memory: '512Mi' },
      });
    });

    it('merges per-container resources by name', () => {
      const base: WorkloadSchedulingType = {
        containers: {
          api: { resources: { requests: { cpu: '100m' } } },
        },
      };
      const override: WorkloadSchedulingType = {
        containers: {
          api: { resources: { limits: { cpu: '1' } } },
          sidecar: { resources: { requests: { cpu: '50m' } } },
        },
      };
      const merged = merge_workload_scheduling(base, override);
      expect(merged?.containers?.api.resources).toEqual({
        requests: { cpu: '100m' },
        limits: { cpu: '1' },
      });
      expect(merged?.containers?.sidecar.resources).toEqual({ requests: { cpu: '50m' } });
    });
  });

  describe('merge_scheduling', () => {
    it('propagates disabled flag from override', () => {
      const base: SchedulingType = { priority_class: 'high' };
      const override: SchedulingType = { disabled: true };
      expect(merge_scheduling(base, override)?.disabled).toBe(true);
    });

    it('merges per-workload overrides by workload name', () => {
      const base: SchedulingType = {
        workloads: {
          worker: { node_selector: { pool: 'default' } },
        },
      };
      const override: SchedulingType = {
        workloads: {
          worker: { node_selector: { gpu: 'true' } },
          web: { priority_class: 'high' },
        },
      };
      const merged = merge_scheduling(base, override);
      expect(merged?.workloads?.worker?.node_selector).toEqual({
        pool: 'default',
        gpu: 'true',
      });
      expect(merged?.workloads?.web?.priority_class).toBe('high');
    });
  });

  describe('resolve_scheduling', () => {
    it('layers cluster -> template -> kustomization', () => {
      const cluster: SchedulingType = {
        node_selector: { pool: 'workers' },
        priority_class: 'default',
      };
      const template: SchedulingType = { priority_class: 'high' };
      const kustomization: SchedulingType = { node_selector: { disk: 'ssd' } };

      const resolved = resolve_scheduling(cluster, template, kustomization);
      expect(resolved?.node_selector).toEqual({ pool: 'workers', disk: 'ssd' });
      expect(resolved?.priority_class).toBe('high');
    });

    it('returns undefined when disabled at kustomization level', () => {
      const cluster: SchedulingType = { priority_class: 'default' };
      const kustomization: SchedulingType = { disabled: true };
      expect(resolve_scheduling(cluster, undefined, kustomization)).toBeUndefined();
    });

    it('returns undefined when no level supplies scheduling', () => {
      expect(resolve_scheduling(undefined, undefined, undefined)).toBeUndefined();
    });
  });

  describe('generate_scheduling_patches', () => {
    it('returns no patches when scheduling is undefined', () => {
      expect(generate_scheduling_patches(undefined)).toEqual([]);
    });

    it('returns no patches when disabled', () => {
      expect(generate_scheduling_patches({ disabled: true, priority_class: 'high' })).toEqual([]);
    });

    it('emits one patch per workload kind for kustomization-wide settings', () => {
      const scheduling: SchedulingType = {
        node_selector: { pool: 'workers' },
        tolerations: [{ key: 'gpu', operator: 'Exists', effect: 'NoSchedule' }],
        priority_class: 'high',
      };

      const patches = generate_scheduling_patches(scheduling);
      expect(patches).toHaveLength(DEFAULT_WORKLOAD_KINDS.length);
      const kinds = patches.map((p) => p.target.kind).sort();
      expect(kinds).toEqual([...DEFAULT_WORKLOAD_KINDS].sort());
      for (const patch of patches) {
        expect(patch.target.name).toBeUndefined();
      }
    });

    it('renders nodeSelector, tolerations, and priorityClassName in Deployment patch', () => {
      const scheduling: SchedulingType = {
        node_selector: { 'kubernetes.io/arch': 'arm64' },
        tolerations: [
          { key: 'dedicated', operator: 'Equal', value: 'gitops', effect: 'NoSchedule' },
        ],
        priority_class: 'high-priority',
      };

      const patches = generate_scheduling_patches(scheduling);
      const deployment_patch = patches.find((p) => p.target.kind === 'Deployment');
      if (!deployment_patch) throw new Error('expected Deployment patch');

      const body = YAML.parse(deployment_patch.patch) as {
        apiVersion: string;
        kind: string;
        spec: { template: { spec: Record<string, unknown> } };
      };
      expect(body.apiVersion).toBe('apps/v1');
      expect(body.kind).toBe('Deployment');
      expect(body.spec.template.spec).toMatchObject({
        nodeSelector: { 'kubernetes.io/arch': 'arm64' },
        tolerations: [
          { key: 'dedicated', operator: 'Equal', value: 'gitops', effect: 'NoSchedule' },
        ],
        priorityClassName: 'high-priority',
      });
    });

    it('nests pod template under jobTemplate for CronJob kind', () => {
      const scheduling: SchedulingType = { priority_class: 'low' };
      const patches = generate_scheduling_patches(scheduling);
      const cronjob_patch = patches.find((p) => p.target.kind === 'CronJob');
      if (!cronjob_patch) throw new Error('expected CronJob patch');

      const body = YAML.parse(cronjob_patch.patch) as {
        apiVersion: string;
        spec: { jobTemplate: { spec: { template: { spec: { priorityClassName?: string } } } } };
      };
      expect(body.apiVersion).toBe('batch/v1');
      expect(body.spec.jobTemplate.spec.template.spec.priorityClassName).toBe('low');
    });

    it('emits container resource patch under "main" for top-level resources', () => {
      const scheduling: SchedulingType = {
        resources: { requests: { cpu: '100m', memory: '128Mi' } },
      };

      const patches = generate_scheduling_patches(scheduling);
      const deployment_patch = patches.find((p) => p.target.kind === 'Deployment');
      if (!deployment_patch) throw new Error('expected Deployment patch');
      const body = YAML.parse(deployment_patch.patch) as {
        spec: {
          template: {
            spec: {
              containers: Array<{ name: string; resources: Record<string, unknown> }>;
            };
          };
        };
      };
      expect(body.spec.template.spec.containers).toEqual([
        { name: 'main', resources: { requests: { cpu: '100m', memory: '128Mi' } } },
      ]);
    });

    it('targets a named container for multi-container overrides', () => {
      const scheduling: SchedulingType = {
        containers: {
          app: { resources: { requests: { cpu: '200m' } } },
          sidecar: { resources: { limits: { memory: '64Mi' } } },
        },
      };

      const patches = generate_scheduling_patches(scheduling);
      const deployment_patch = patches.find((p) => p.target.kind === 'Deployment');
      if (!deployment_patch) throw new Error('expected Deployment patch');
      const body = YAML.parse(deployment_patch.patch) as {
        spec: {
          template: {
            spec: {
              containers: Array<{ name: string; resources: Record<string, unknown> }>;
            };
          };
        };
      };
      expect(body.spec.template.spec.containers).toEqual([
        { name: 'app', resources: { requests: { cpu: '200m' } } },
        { name: 'sidecar', resources: { limits: { memory: '64Mi' } } },
      ]);
    });

    it('emits a single patch when a workload entry declares kind', () => {
      const scheduling: SchedulingType = {
        workloads: {
          database: {
            kind: 'StatefulSet',
            node_selector: { disk: 'nvme' },
          },
        },
      };

      const patches = generate_scheduling_patches(scheduling);
      const named_patches = patches.filter((p) => p.target.name === 'database');
      expect(named_patches).toHaveLength(1);
      expect(named_patches[0]?.target.kind).toBe('StatefulSet');
    });

    it('emits per-workload patches targeted by name', () => {
      const scheduling: SchedulingType = {
        priority_class: 'default',
        workloads: {
          worker: { priority_class: 'high' },
        },
      };

      const patches = generate_scheduling_patches(scheduling);
      // default block emits one per kind; worker override also emits one per kind
      const named_patches = patches.filter((p) => p.target.name === 'worker');
      expect(named_patches).toHaveLength(DEFAULT_WORKLOAD_KINDS.length);
      for (const patch of named_patches) {
        const body = YAML.parse(patch.patch) as {
          metadata: { name: string };
          spec: { template?: { spec: { priorityClassName?: string } } };
        };
        expect(body.metadata.name).toBe('worker');
      }
    });
  });
});
