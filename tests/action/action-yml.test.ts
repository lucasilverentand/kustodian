import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const ACTION_DIR = join(import.meta.dir, '../../action');

function load_action(name: string) {
  const content = readFileSync(join(ACTION_DIR, name, 'action.yml'), 'utf-8');
  return parse(content);
}

describe('kustodian action.yml', () => {
  const action = load_action('kustodian');

  it('should have required metadata', () => {
    expect(action.name).toBe('Kustodian');
    expect(action.description).toBeString();
    expect(action.runs.using).toBe('composite');
  });

  it('should require command input', () => {
    expect(action.inputs.command).toBeDefined();
    expect(action.inputs.command.required).toBe(true);
  });

  it('should include bun setup step', () => {
    const steps = action.runs.steps;
    const bun_step = steps.find((s: { uses?: string }) => s.uses?.startsWith('oven-sh/setup-bun'));
    expect(bun_step).toBeDefined();
  });

  it('should setup bun before installing kustodian', () => {
    const steps = action.runs.steps;
    const bun_index = steps.findIndex((s: { uses?: string }) =>
      s.uses?.startsWith('oven-sh/setup-bun'),
    );
    const install_index = steps.findIndex((s: { name?: string }) =>
      s.name?.toLowerCase().includes('install kustodian'),
    );
    expect(bun_index).toBeGreaterThanOrEqual(0);
    expect(install_index).toBeGreaterThanOrEqual(0);
    expect(bun_index).toBeLessThan(install_index);
  });

  it('should accept all documented commands', () => {
    const validate_step = action.runs.steps.find((s: { name?: string }) =>
      s.name?.toLowerCase().includes('validate inputs'),
    );
    expect(validate_step).toBeDefined();
    expect(validate_step.run).toContain('validate');
    expect(validate_step.run).toContain('apply');
    expect(validate_step.run).toContain('diff');
    expect(validate_step.run).toContain('status');
    expect(validate_step.run).toContain('update');
  });

  it('should expose standard outputs', () => {
    expect(action.outputs.success).toBeDefined();
    expect(action.outputs.output).toBeDefined();
    expect(action.outputs['exit-code']).toBeDefined();
  });

  it('should cleanup kubeconfig on failure', () => {
    const cleanup = action.runs.steps.find((s: { name?: string }) =>
      s.name?.toLowerCase().includes('cleanup kubeconfig'),
    );
    expect(cleanup).toBeDefined();
    expect(cleanup.if).toContain('always()');
  });
});

describe('kustodian-pr-diff action.yml', () => {
  const action = load_action('kustodian-pr-diff');

  it('should have required metadata', () => {
    expect(action.name).toBe('Kustodian PR Diff');
    expect(action.description).toBeString();
    expect(action.runs.using).toBe('composite');
  });

  it('should require github-token input', () => {
    expect(action.inputs['github-token']).toBeDefined();
    expect(action.inputs['github-token'].required).toBe(true);
  });

  it('should include bun setup step', () => {
    const steps = action.runs.steps;
    const bun_step = steps.find((s: { uses?: string }) => s.uses?.startsWith('oven-sh/setup-bun'));
    expect(bun_step).toBeDefined();
  });

  it('should setup bun before installing kustodian', () => {
    const steps = action.runs.steps;
    const bun_index = steps.findIndex((s: { uses?: string }) =>
      s.uses?.startsWith('oven-sh/setup-bun'),
    );
    const install_index = steps.findIndex((s: { name?: string }) =>
      s.name?.toLowerCase().includes('install kustodian'),
    );
    expect(bun_index).toBeGreaterThanOrEqual(0);
    expect(install_index).toBeGreaterThanOrEqual(0);
    expect(bun_index).toBeLessThan(install_index);
  });

  it('should expose has-changes output', () => {
    expect(action.outputs['has-changes']).toBeDefined();
  });

  it('should expose artifact-url output', () => {
    expect(action.outputs['artifact-url']).toBeDefined();
  });

  it('should cleanup on failure', () => {
    const cleanup = action.runs.steps.find((s: { name?: string }) =>
      s.name?.toLowerCase().includes('cleanup'),
    );
    expect(cleanup).toBeDefined();
    expect(cleanup.if).toContain('always()');
  });

  it('should use generate-diff.ts in the diff step', () => {
    const diff_step = action.runs.steps.find((s: { name?: string }) =>
      s.name?.toLowerCase().includes('generate diff'),
    );
    expect(diff_step).toBeDefined();
    expect(diff_step.run).toContain('generate-diff.ts');
  });

  it('should use run-plugin-setup.ts for plugin dependencies', () => {
    const plugin_step = action.runs.steps.find((s: { name?: string }) =>
      s.name?.toLowerCase().includes('plugin'),
    );
    expect(plugin_step).toBeDefined();
    expect(plugin_step.run).toContain('run-plugin-setup.ts');
  });
});
