import { Command } from 'commander';
import { Diamant } from 'diamant';
import type { ColumnType, SelectOption } from 'diamant';
import chalk from 'chalk';
import { getDbPath, getActiveBaseId } from '../config.js';
import { renderColumnList } from '../display.js';

function requireActiveBase(): string {
  const baseId = getActiveBaseId();
  if (!baseId) {
    console.error(chalk.red('No active base. Run: diamant base use <baseId>'));
    process.exit(1);
  }
  return baseId;
}

export function registerColumnCommands(program: Command): void {
  const column = program.command('column').description('Manage columns');

  column
    .command('add <tableId>')
    .description('Add a column to a table')
    .requiredOption('--name <name>', 'Column name')
    .requiredOption('--type <type>', 'Column type')
    .option('--options <options>', 'Comma-separated options for select types')
    .option('--config <json>', 'JSON config for the column')
    .action((tableId: string, opts: { name: string; type: string; options?: string; config?: string }) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);

        let config: any = undefined;
        if (opts.config) {
          config = JSON.parse(opts.config);
        } else if (opts.options && (opts.type === 'singleSelect' || opts.type === 'multiSelect')) {
          const options: SelectOption[] = opts.options.split(',').map((name) => ({
            id: crypto.randomUUID(),
            name: name.trim(),
          }));
          config = { options };
        }

        const col = table.addColumn({
          name: opts.name,
          type: opts.type as ColumnType,
          config,
        });

        if (program.opts().format === 'json') {
          console.log(JSON.stringify(col));
        } else {
          console.log(`Added column ${chalk.bold(opts.name)} (${chalk.dim(col.id)}) type=${chalk.cyan(opts.type)}`);
          if (config?.options) {
            console.log(`  Options: ${config.options.map((o: SelectOption) => o.name).join(', ')}`);
          }
        }
      } finally {
        db.close();
      }
    });

  column
    .command('list <tableId>')
    .description('List columns in a table')
    .action((tableId: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);
        const columns = table.listColumns();
        if (program.opts().format === 'json') {
          console.log(JSON.stringify(columns));
        } else {
          console.log(renderColumnList(columns));
        }
      } finally {
        db.close();
      }
    });

  column
    .command('rename <tableId> <columnId> <newName>')
    .description('Rename a column')
    .action((tableId: string, columnId: string, newName: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);
        table.updateColumn(columnId, { name: newName });
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ id: columnId, name: newName }));
        } else {
          console.log(`Renamed column to ${chalk.bold(newName)}`);
        }
      } finally {
        db.close();
      }
    });

  column
    .command('delete <tableId> <columnId>')
    .description('Delete a column')
    .action((tableId: string, columnId: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);
        table.deleteColumn(columnId);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ deleted: columnId }));
        } else {
          console.log(`Deleted column ${chalk.dim(columnId)}`);
        }
      } finally {
        db.close();
      }
    });
}
