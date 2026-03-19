import { Command } from 'commander';
import { Diamant } from 'diamant';
import chalk from 'chalk';
import readline from 'readline';
import { getDbPath, getActiveBaseId } from '../config.js';
import { renderRowDetail, renderRowsTable } from '../display.js';

function requireActiveBase(): string {
  const baseId = getActiveBaseId();
  if (!baseId) {
    console.error(chalk.red('No active base. Run: diamant base use <baseId>'));
    process.exit(1);
  }
  return baseId;
}

export function registerRowCommands(program: Command): void {
  const row = program.command('row').description('Manage rows');

  row
    .command('add <tableId>')
    .description('Add a row to a table')
    .option('--data <json>', 'JSON object with cell data')
    .option('--interactive', 'Interactively prompt for each field')
    .action(async (tableId: string, opts: { data?: string; interactive?: boolean }) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);

        let data: Record<string, unknown> = {};

        if (opts.interactive) {
          const columns = table.listColumns();
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ask = (q: string): Promise<string> =>
            new Promise((resolve) => rl.question(q, resolve));

          for (const col of columns) {
            if (['autoNumber', 'createdTime', 'lastModifiedTime', 'lookup', 'rollup', 'formula', 'count'].includes(col.type)) {
              continue;
            }
            const answer = await ask(`${col.name} (${col.type}): `);
            if (answer.trim()) {
              if (col.type === 'number' || col.type === 'percent' || col.type === 'duration' || col.type === 'rating') {
                data[col.name] = Number(answer);
              } else if (col.type === 'checkbox') {
                data[col.name] = answer.toLowerCase() === 'true' || answer === '1';
              } else if (col.type === 'multiSelect' || col.type === 'link') {
                try { data[col.name] = JSON.parse(answer); } catch { data[col.name] = answer.split(',').map((s) => s.trim()); }
              } else if (col.type === 'currency') {
                try { data[col.name] = JSON.parse(answer); } catch { /* skip */ }
              } else {
                data[col.name] = answer;
              }
            }
          }
          rl.close();
        } else if (opts.data) {
          data = JSON.parse(opts.data);
        }

        const r = table.addRow(data);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify(r));
        } else {
          console.log(`Added row ${chalk.dim(r.id)}`);
        }
      } finally {
        db.close();
      }
    });

  row
    .command('update <tableId> <rowId>')
    .description('Update a row')
    .requiredOption('--data <json>', 'JSON object with fields to update')
    .action((tableId: string, rowId: string, opts: { data: string }) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);
        const data = JSON.parse(opts.data);
        const r = table.updateRow(rowId, data);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify(r));
        } else {
          console.log(`Updated row ${chalk.dim(rowId)}`);
        }
      } finally {
        db.close();
      }
    });

  row
    .command('delete <tableId> <rowId>')
    .description('Delete a row')
    .action((tableId: string, rowId: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);
        table.deleteRow(rowId);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ deleted: rowId }));
        } else {
          console.log(`Deleted row ${chalk.dim(rowId)}`);
        }
      } finally {
        db.close();
      }
    });

  row
    .command('show <tableId> <rowId>')
    .description('Show a single row in detail')
    .action((tableId: string, rowId: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);
        const columns = table.listColumns();
        const isJson = program.opts().format === 'json';
        const r = isJson
          ? table.getRow(rowId, { expand: columns.filter((c) => c.type === 'link').map((c) => c.name) })
          : table.getRow(rowId, { resolveLinks: true });
        if (isJson) {
          console.log(JSON.stringify(r));
        } else {
          console.log(renderRowDetail(r, columns));
        }
      } finally {
        db.close();
      }
    });
}
