#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply_command } from './commands/apply.js';
import { init_command } from './commands/init.js';
import { sources_command } from './commands/sources.js';
import { update_command } from './commands/update.js';
import { validate_command } from './commands/validate.js';
import { create_container } from './container.js';
import { create_cli } from './runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
const VERSION = pkg.version;

async function main() {
  const args = process.argv.slice(2);

  // Handle --version
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`kustodian v${VERSION}`);
    process.exit(0);
  }

  // Handle --help or no args
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`kustodian v${VERSION}`);
    console.log('A GitOps templating framework for Kubernetes with Flux CD\n');
    console.log('Usage: kustodian <command> [options]\n');
    console.log('Commands:');
    console.log('  init <name>        Initialize a new Kustodian project');
    console.log('  validate           Validate cluster and template configurations');
    console.log(
      '  apply              Apply full cluster configuration (generates, pushes OCI, deploys)',
    );
    console.log('  update             Check and update image version substitutions');
    console.log('  sources            Manage template sources (fetch, list, cache)\n');
    console.log('Options:');
    console.log('  --help, -h         Show help');
    console.log('  --version, -v      Show version\n');
    console.log('Examples:');
    console.log('  kustodian init my-project');
    console.log('  kustodian validate');
    console.log('  kustodian apply --cluster production');
    process.exit(0);
  }

  // Create CLI
  const cli = create_cli({
    name: 'kustodian',
    version: VERSION,
    description: 'A GitOps templating framework for Kubernetes with Flux CD',
  });

  // Register commands
  cli.command(init_command);
  cli.command(validate_command);
  cli.command(apply_command);
  cli.command(update_command);
  cli.command(sources_command);

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
