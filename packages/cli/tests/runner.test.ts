import { describe, expect, it } from 'vitest';

import { success } from '@kustodian/core';

import { define_command } from '../src/command.js';
import { create_container } from '../src/container.js';
import { create_cli, format_help, format_version } from '../src/runner.js';

describe('CLI Runner', () => {
  describe('create_cli', () => {
    it('should create a CLI instance', () => {
      // Act
      const cli = create_cli({ name: 'test', version: '1.0.0' });

      // Assert
      expect(cli.command).toBeDefined();
      expect(cli.use).toBeDefined();
      expect(cli.run).toBeDefined();
    });

    it('should register commands', () => {
      // Arrange
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const cmd = define_command({
        name: 'greet',
        description: 'Say hello',
        handler: async () => success(undefined),
      });

      // Act
      const result = cli.command(cmd);

      // Assert
      expect(result).toBe(cli);
    });

    it('should run registered command', async () => {
      // Arrange
      let executed = false;
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      cli.command(
        define_command({
          name: 'greet',
          description: 'Say hello',
          handler: async () => {
            executed = true;
            return success(undefined);
          },
        }),
      );

      // Act
      const result = await cli.run(['greet'], container);

      // Assert
      expect(result.success).toBe(true);
      expect(executed).toBe(true);
    });

    it('should return error for unknown command', async () => {
      // Arrange
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      // Act
      const result = await cli.run(['unknown'], container);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('COMMAND_NOT_FOUND');
      }
    });

    it('should parse options with --', async () => {
      // Arrange
      let received_options: Record<string, unknown> = {};
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      cli.command(
        define_command({
          name: 'greet',
          description: 'Say hello',
          options: [
            { name: 'name', description: 'Name to greet', type: 'string' },
            { name: 'loud', description: 'Shout', type: 'boolean' },
          ],
          handler: async (ctx) => {
            received_options = ctx.options;
            return success(undefined);
          },
        }),
      );

      // Act
      await cli.run(['greet', '--name', 'World', '--loud'], container);

      // Assert
      expect(received_options.name).toBe('World');
      expect(received_options.loud).toBe(true);
    });

    it('should parse options with =', async () => {
      // Arrange
      let received_options: Record<string, unknown> = {};
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      cli.command(
        define_command({
          name: 'greet',
          description: 'Say hello',
          options: [{ name: 'name', description: 'Name', type: 'string' }],
          handler: async (ctx) => {
            received_options = ctx.options;
            return success(undefined);
          },
        }),
      );

      // Act
      await cli.run(['greet', '--name=Alice'], container);

      // Assert
      expect(received_options.name).toBe('Alice');
    });

    it('should parse short options', async () => {
      // Arrange
      let received_options: Record<string, unknown> = {};
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      cli.command(
        define_command({
          name: 'greet',
          description: 'Say hello',
          options: [{ name: 'verbose', short: 'v', description: 'Verbose', type: 'boolean' }],
          handler: async (ctx) => {
            received_options = ctx.options;
            return success(undefined);
          },
        }),
      );

      // Act
      await cli.run(['greet', '-v'], container);

      // Assert
      expect(received_options.verbose).toBe(true);
    });

    it('should use default option values', async () => {
      // Arrange
      let received_options: Record<string, unknown> = {};
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      cli.command(
        define_command({
          name: 'greet',
          description: 'Say hello',
          options: [{ name: 'count', description: 'Count', type: 'number', default_value: 5 }],
          handler: async (ctx) => {
            received_options = ctx.options;
            return success(undefined);
          },
        }),
      );

      // Act
      await cli.run(['greet'], container);

      // Assert
      expect(received_options.count).toBe(5);
    });

    it('should parse positional arguments', async () => {
      // Arrange
      let received_args: string[] = [];
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      cli.command(
        define_command({
          name: 'greet',
          description: 'Say hello',
          arguments: [{ name: 'name', description: 'Name to greet' }],
          handler: async (ctx) => {
            received_args = ctx.args;
            return success(undefined);
          },
        }),
      );

      // Act
      await cli.run(['greet', 'Alice', 'Bob'], container);

      // Assert
      expect(received_args).toEqual(['Alice', 'Bob']);
    });

    it('should execute global middleware', async () => {
      // Arrange
      const order: string[] = [];
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      cli.use(async (_ctx, next) => {
        order.push('global');
        return next();
      });

      cli.command(
        define_command({
          name: 'greet',
          description: 'Say hello',
          handler: async () => {
            order.push('handler');
            return success(undefined);
          },
        }),
      );

      // Act
      await cli.run(['greet'], container);

      // Assert
      expect(order).toEqual(['global', 'handler']);
    });

    it('should execute command middleware', async () => {
      // Arrange
      const order: string[] = [];
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      cli.command(
        define_command({
          name: 'greet',
          description: 'Say hello',
          middleware: [
            async (_ctx, next) => {
              order.push('command-middleware');
              return next();
            },
          ],
          handler: async () => {
            order.push('handler');
            return success(undefined);
          },
        }),
      );

      // Act
      await cli.run(['greet'], container);

      // Assert
      expect(order).toEqual(['command-middleware', 'handler']);
    });

    it('should return success for empty args', async () => {
      // Arrange
      const cli = create_cli({ name: 'test', version: '1.0.0' });
      const container = create_container();

      // Act
      const result = await cli.run([], container);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('format_version', () => {
    it('should format version string', () => {
      // Act
      const result = format_version({ name: 'my-cli', version: '1.2.3' });

      // Assert
      expect(result).toBe('my-cli v1.2.3');
    });
  });

  describe('format_help', () => {
    it('should format help text', () => {
      // Arrange
      const config = { name: 'my-cli', version: '1.0.0', description: 'My awesome CLI' };
      const commands = [
        { name: 'init', description: 'Initialize project' },
        { name: 'build', description: 'Build project' },
      ];

      // Act
      const result = format_help(config, commands);

      // Assert
      expect(result).toContain('My awesome CLI');
      expect(result).toContain('init');
      expect(result).toContain('build');
      expect(result).toContain('--help');
      expect(result).toContain('--version');
    });
  });
});
