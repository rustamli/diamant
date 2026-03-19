import { Command } from 'commander';
import { registerBaseCommands } from './commands/base.js';
import { registerTableCommands } from './commands/table.js';
import { registerColumnCommands } from './commands/column.js';
import { registerRowCommands } from './commands/row.js';
import { registerQueryCommands } from './commands/query.js';
import { registerImportExportCommands } from './commands/import-export.js';
import { registerShellCommand } from './commands/shell.js';

const program = new Command();

program
  .name('diamant')
  .description('Terminal-based Airtable experience powered by diamant')
  .version('0.1.0')
  .option('--db <path>', 'Path to SQLite database file')
  .option('--format <format>', 'Output format: text or json', 'text');

registerBaseCommands(program);
registerTableCommands(program);
registerColumnCommands(program);
registerRowCommands(program);
registerQueryCommands(program);
registerImportExportCommands(program);
registerShellCommand(program);

program.parse();
