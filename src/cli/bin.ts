#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply_command } from './commands/apply.js';
import { init_command } from './commands/init.js';
import { kubeconfig_command } from './commands/kubeconfig.js';
import { preview_command } from './commands/preview.js';
import { sources_command } from './commands/sources.js';
import { update_command } from './commands/update.js';
import { validate_command } from './commands/validate.js';
import { create_container } from './container.js';
import { create_cli, format_command_help, format_help } from './runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
const VERSION = pkg.version;

const all_commands = [
  init_command,
  validate_command,
  preview_command,
  apply_command,
  update_command,
  kubeconfig_command,
  sources_command,
];

async function main() {
  const args = process.argv.slice(2);

  // Handle --version
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`kustodian v${VERSION}`);
    process.exit(0);
  }

  // Handle --help or no args (top-level)
  if (args.length === 0 || (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))) {
    const config = {
      name: 'kustodian',
      version: VERSION,
      description: 'A GitOps templating framework for Kubernetes with Flux CD',
    };
    console.log(format_help(config, all_commands));
    process.exit(0);
  }

  // Handle per-command --help (e.g., kustodian apply --help, kustodian sources cache --help)
  if (args.includes('--help') || args.includes('-h')) {
    const non_help_args = args.filter((a) => a !== '--help' && a !== '-h');
    const command = all_commands.find((c) => c.name === non_help_args[0]);

    if (command) {
      // Check for subcommand help (e.g., kustodian sources fetch --help)
      const sub_name = non_help_args[1];
      if (sub_name && command.subcommands) {
        const sub = command.subcommands.find((s) => s.name === sub_name);
        if (sub) {
          // Check for nested subcommand (e.g., kustodian sources cache info --help)
          const nested_name = non_help_args[2];
          if (nested_name && sub.subcommands) {
            const nested = sub.subcommands.find((n) => n.name === nested_name);
            if (nested) {
              console.log(format_command_help('kustodian', nested, `${command.name} ${sub.name}`));
              process.exit(0);
            }
          }
          console.log(format_command_help('kustodian', sub, command.name));
          process.exit(0);
        }
      }
      console.log(format_command_help('kustodian', command));
      process.exit(0);
    }
  }

  // Create CLI
  const cli = create_cli({
    name: 'kustodian',
    version: VERSION,
    description: 'A GitOps templating framework for Kubernetes with Flux CD',
  });

  // Register commands
  for (const cmd of all_commands) {
    cli.command(cmd);
  }

  // Create container
  const container = create_container();

  // Run CLI
  const result = await cli.run(args, container);

  if (!result.success) {
    console.error(`\nError: ${result.error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
