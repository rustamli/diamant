import { Command } from 'commander';
import { Diamant } from 'diamant';
import chalk from 'chalk';
import { getDbPath, getActiveBaseId } from '../config.js';

function requireActiveBase(): string {
  const baseId = getActiveBaseId();
  if (!baseId) {
    console.error(chalk.red('No active base. Run: diamant base use <baseId>'));
    process.exit(1);
  }
  return baseId;
}

export function registerImportExportCommands(program: Command): void {
  const imp = program.command('import').description('Import data');

  imp
    .command('csv <tableId> <filePath>')
    .description('Import CSV data into a table')
    .action((tableId: string, filePath: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);
        table.importCSV(filePath);
        const rows = table.getRows();
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ imported: rows.length }));
        } else {
          console.log(`Imported ${chalk.bold(String(rows.length))} rows from ${filePath}`);
        }
      } finally {
        db.close();
      }
    });

  imp
    .command('json <filePath>')
    .description('Import JSON data into the active base')
    .action((filePath: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        base.importJSON(filePath);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ imported: true }));
        } else {
          console.log(`Imported data from ${filePath}`);
        }
      } finally {
        db.close();
      }
    });

  const exp = program.command('export').description('Export data');

  exp
    .command('csv <tableId> <filePath>')
    .description('Export table to CSV')
    .action((tableId: string, filePath: string) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);
        table.exportCSV(filePath);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ exported: filePath }));
        } else {
          console.log(`Exported table to ${filePath}`);
        }
      } finally {
        db.close();
      }
    });

  exp
    .command('json <baseId> <filePath>')
    .description('Export base to JSON')
    .action((baseId: string, filePath: string) => {
      const dbPath = getDbPath(program.opts().db);
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        base.exportJSON(filePath);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ exported: filePath }));
        } else {
          console.log(`Exported base to ${filePath}`);
        }
      } finally {
        db.close();
      }
    });
}
