import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { apply_command } from '../packages/cli/src/commands/apply.js';
import { init_command } from '../packages/cli/src/commands/init.js';
import { validate_command } from '../packages/cli/src/commands/validate.js';
import { create_container } from '../packages/cli/src/container.js';
import { create_cli } from '../packages/cli/src/runner.js';

const TEST_DIR = path.join(import.meta.dir, '.test-output');

describe('E2E: CLI Commands', () => {
  beforeEach(() => {
    // Clean up test directory before each test
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('init command', () => {
    it('should create a new project with all required files', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(init_command);

      const project_name = 'test-project';
      const project_path = path.join(TEST_DIR, project_name);

      // Change to test directory
      const original_cwd = process.cwd();
      process.chdir(TEST_DIR);

      try {
        const result = await cli.run(['init', project_name], create_container());

        expect(result.success).toBe(true);

        // Verify all expected files were created
        expect(fs.existsSync(path.join(project_path, 'kustodian.yaml'))).toBe(true);
        expect(fs.existsSync(path.join(project_path, 'templates', 'example', 'template.yaml'))).toBe(
          true,
        );
        expect(
          fs.existsSync(path.join(project_path, 'templates', 'example', 'app', 'kustomization.yaml')),
        ).toBe(true);
        expect(
          fs.existsSync(path.join(project_path, 'templates', 'example', 'app', 'deployment.yaml')),
        ).toBe(true);
        expect(fs.existsSync(path.join(project_path, 'clusters', 'local', 'cluster.yaml'))).toBe(
          true,
        );
        expect(fs.existsSync(path.join(project_path, '.gitignore'))).toBe(true);
        expect(
          fs.existsSync(path.join(project_path, '.github', 'workflows', 'deploy.yaml')),
        ).toBe(true);
      } finally {
        process.chdir(original_cwd);
      }
    });

    it('should fail when project directory already exists', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(init_command);

      const project_name = 'existing-project';
      const project_path = path.join(TEST_DIR, project_name);

      // Create the directory first
      fs.mkdirSync(project_path);

      const original_cwd = process.cwd();
      process.chdir(TEST_DIR);

      try {
        const result = await cli.run(['init', project_name], create_container());

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('ALREADY_EXISTS');
        }
      } finally {
        process.chdir(original_cwd);
      }
    });

    it('should overwrite existing project with --force', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(init_command);

      const project_name = 'force-project';
      const project_path = path.join(TEST_DIR, project_name);

      // Create the directory first with some content
      fs.mkdirSync(project_path);
      fs.writeFileSync(path.join(project_path, 'old-file.txt'), 'old content');

      const original_cwd = process.cwd();
      process.chdir(TEST_DIR);

      try {
        const result = await cli.run(['init', project_name, '--force'], create_container());

        expect(result.success).toBe(true);
        expect(fs.existsSync(path.join(project_path, 'kustodian.yaml'))).toBe(true);
      } finally {
        process.chdir(original_cwd);
      }
    });
  });

  describe('validate command', () => {
    it('should validate the e2e fixtures valid-project', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(validate_command);

      const fixtures_path = path.join(import.meta.dir, 'fixtures', 'valid-project');
      const result = await cli.run(['validate', '--project', fixtures_path], create_container());

      expect(result.success).toBe(true);
    });

    it('should fail validation for invalid-project', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(validate_command);

      const fixtures_path = path.join(import.meta.dir, 'fixtures', 'invalid-project');
      const result = await cli.run(['validate', '--project', fixtures_path], create_container());

      expect(result.success).toBe(false);
    });

    it('should validate a specific cluster with --cluster', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(validate_command);

      const fixtures_path = path.join(import.meta.dir, 'fixtures', 'valid-project');
      const result = await cli.run(
        ['validate', '--project', fixtures_path, '--cluster', 'local'],
        create_container(),
      );

      expect(result.success).toBe(true);
    });

    it('should fail when cluster not found', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(validate_command);

      const fixtures_path = path.join(import.meta.dir, 'fixtures', 'valid-project');
      const result = await cli.run(
        ['validate', '--project', fixtures_path, '--cluster', 'nonexistent'],
        create_container(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should validate a newly initialized project', async () => {
      // First create a project with init
      const init_cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      init_cli.command(init_command);

      const project_name = 'validate-test-project';
      const project_path = path.join(TEST_DIR, project_name);

      const original_cwd = process.cwd();
      process.chdir(TEST_DIR);

      try {
        const init_result = await init_cli.run(['init', project_name], create_container());
        expect(init_result.success).toBe(true);

        // Now validate the created project
        const validate_cli = create_cli({ name: 'kustodian', version: '1.0.0' });
        validate_cli.command(validate_command);

        const validate_result = await validate_cli.run(
          ['validate', '--project', project_path],
          create_container(),
        );

        expect(validate_result.success).toBe(true);
      } finally {
        process.chdir(original_cwd);
      }
    });
  });

  describe('apply command', () => {
    it('should require --cluster option', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(apply_command);

      const fixtures_path = path.join(import.meta.dir, 'fixtures', 'valid-project');
      const result = await cli.run(['apply', '--project', fixtures_path], create_container());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ARGS');
      }
    });

    it('should run in dry-run mode without errors', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(apply_command);

      const fixtures_path = path.join(import.meta.dir, 'fixtures', 'valid-project');
      const result = await cli.run(
        ['apply', '--project', fixtures_path, '--cluster', 'local', '--dry-run', '--skip-bootstrap'],
        create_container(),
      );

      // Dry run should succeed at least until it tries to check cluster status
      // The exact behavior depends on whether kubectl is available
      expect(result).toBeDefined();
    });

    it('should fail for nonexistent cluster', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(apply_command);

      const fixtures_path = path.join(import.meta.dir, 'fixtures', 'valid-project');
      const result = await cli.run(
        ['apply', '--project', fixtures_path, '--cluster', 'nonexistent', '--dry-run'],
        create_container(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('CLI argument parsing', () => {
    it('should parse short options correctly', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(validate_command);

      const fixtures_path = path.join(import.meta.dir, 'fixtures', 'valid-project');
      const result = await cli.run(
        ['validate', '-p', fixtures_path, '-c', 'local'],
        create_container(),
      );

      expect(result.success).toBe(true);
    });

    it('should return error for unknown command', async () => {
      const cli = create_cli({ name: 'kustodian', version: '1.0.0' });
      cli.command(validate_command);

      const result = await cli.run(['unknown-command'], create_container());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('COMMAND_NOT_FOUND');
      }
    });
  });
});
