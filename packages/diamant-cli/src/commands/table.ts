import { Command } from 'commander';
import { Diamant } from 'diamant';
import chalk from 'chalk';
import { getDbPath, getActiveBaseId } from '../config.js';
import { renderTableList, renderRowsTable } from '../display.js';
import { openViewer } from '../viewer.js';

function requireActiveBase(program: Command): string {
  const baseId = getActiveBaseId();
  if (!baseId) {
    console.error(chalk.red('No active base. Run: diamant base use <baseId>'));
    process.exit(1);
  }
  return baseId;
}

export function registerTableCommands(program: Command): void {
  const table = program.command('table').description('Manage tables');

  table
    .command('create <name>')
    .description('Create a new table in the active base')
    .action((name: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase(program);
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const t = base.createTable(name);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ id: t.id, name: t.name }));
        } else {
          console.log(`Created table ${chalk.bold(name)} (${chalk.dim(t.id)})`);
        }
      } finally {
        db.close();
      }
    });

  table
    .command('list')
    .description('List tables in the active base')
    .action(() => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase(program);
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const tables = base.listTables();
        if (program.opts().format === 'json') {
          console.log(JSON.stringify(tables.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt }))));
        } else {
          console.log(renderTableList(tables.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt }))));
        }
      } finally {
        db.close();
      }
    });

  table
    .command('delete <tableId>')
    .description('Delete a table')
    .action((tableId: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase(program);
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        base.deleteTable(tableId);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ deleted: tableId }));
        } else {
          console.log(`Deleted table ${chalk.dim(tableId)}`);
        }
      } finally {
        db.close();
      }
    });

  table
    .command('rename <tableId> <newName>')
    .description('Rename a table')
    .action((tableId: string, newName: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase(program);
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const t = base.renameTable(tableId, newName);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ id: t.id, name: t.name }));
        } else {
          console.log(`Renamed table to ${chalk.bold(newName)}`);
        }
      } finally {
        db.close();
      }
    });

  table
    .command('show <tableId>')
    .description('Show table contents in full-screen viewer')
    .option('--with-id', 'Show row ID column')
    .option('--plain', 'Print table without full-screen viewer')
    .action(async (tableId: string, opts: { withId?: boolean; plain?: boolean }) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase(program);
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const t = base.getTable(tableId);
        const isJson = program.opts().format === 'json';

        if (isJson || opts.plain) {
          const columns = t.listColumns();
          const rows = t.getRows({ resolveLinks: !isJson });
          if (isJson) {
            console.log(JSON.stringify({ columns, rows }));
          } else {
            console.log(chalk.bold(`Table: ${t.name}`) + chalk.dim(` (${t.id})`));
            console.log(renderRowsTable(rows, columns, { withId: opts.withId }));
            console.log(chalk.dim(`${rows.length} rows`));
          }
        } else {
          await openViewer(t, (id) => base.getTable(id));
        }
      } finally {
        db.close();
      }
    });
}
