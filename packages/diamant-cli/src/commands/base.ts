import { Command } from 'commander';
import { Diamant } from 'diamant';
import chalk from 'chalk';
import { getDbPath, setActiveBaseId, getActiveBaseId } from '../config.js';
import { renderBaseList } from '../display.js';

export function registerBaseCommands(program: Command): void {
  const base = program.command('base').description('Manage bases');

  base
    .command('create <name>')
    .description('Create a new base')
    .action((name: string) => {
      const dbPath = getDbPath(program.opts().db);
      const db = new Diamant(dbPath);
      try {
        const b = db.createBase(name);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ id: b.id, name: b.name, createdAt: b.createdAt }));
        } else {
          console.log(`Created base ${chalk.bold(name)} (${chalk.dim(b.id)})`);
        }
      } finally {
        db.close();
      }
    });

  base
    .command('list')
    .description('List all bases')
    .action(() => {
      const dbPath = getDbPath(program.opts().db);
      const db = new Diamant(dbPath);
      try {
        const bases = db.listBases();
        const activeId = getActiveBaseId();
        if (program.opts().format === 'json') {
          console.log(JSON.stringify(bases.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt }))));
        } else {
          const data = bases.map((b) => ({
            id: b.id === activeId ? chalk.green('● ') + b.id : '  ' + b.id,
            name: b.name,
            createdAt: b.createdAt,
          }));
          console.log(renderBaseList(data));
        }
      } finally {
        db.close();
      }
    });

  base
    .command('delete <baseId>')
    .description('Delete a base')
    .action((baseId: string) => {
      const dbPath = getDbPath(program.opts().db);
      const db = new Diamant(dbPath);
      try {
        db.deleteBase(baseId);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ deleted: baseId }));
        } else {
          console.log(`Deleted base ${chalk.dim(baseId)}`);
        }
      } finally {
        db.close();
      }
    });

  base
    .command('use <baseId>')
    .description('Set active base for subsequent commands')
    .action((baseId: string) => {
      const dbPath = getDbPath(program.opts().db);
      const db = new Diamant(dbPath);
      try {
        const b = db.getBase(baseId);
        setActiveBaseId(baseId);
        if (program.opts().format === 'json') {
          console.log(JSON.stringify({ activeBase: baseId, name: b.name }));
        } else {
          console.log(`Active base set to ${chalk.bold(b.name)} (${chalk.dim(baseId)})`);
        }
      } finally {
        db.close();
      }
    });
}
