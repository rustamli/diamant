import { Command } from 'commander';
import { Diamant } from 'diamant';
import chalk from 'chalk';
import readline from 'readline';
import { select } from '@inquirer/prompts';
import { getDbPath, getActiveBaseId, setActiveBaseId } from '../config.js';
import { renderBaseList, renderTableList, renderRowsTable, renderColumnList, renderRowDetail } from '../display.js';

export function registerShellCommand(program: Command): void {
  program
    .command('shell')
    .description('Open an interactive REPL session')
    .action(() => {
      const dbPath = getDbPath(program.opts().db);
      const db = new Diamant(dbPath);

      let rl: readline.Interface;
      let inSelect = false;

      function createReadline(): readline.Interface {
        const iface = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt: chalk.cyan('diamant> '),
        });
        iface.on('line', (line) => handleCommand(line));
        iface.on('close', () => {
          if (!inSelect) {
            db.close();
            console.log(chalk.dim('\nGoodbye!'));
          }
        });
        return iface;
      }

      async function runSelect<T>(opts: { message: string; choices: Array<{ name: string; value: T }> }): Promise<T | null> {
        inSelect = true;
        rl.close();
        try {
          const result = await select(opts);
          return result;
        } catch {
          // user cancelled with Ctrl+C
          return null;
        } finally {
          inSelect = false;
          rl = createReadline();
        }
      }

      const handleCommand = async (line: string) => {
        const input = line.trim();
        if (!input) {
          rl.prompt();
          return;
        }

        const parts = input.split(/\s+/);
        const cmd = parts[0];

        try {
          switch (cmd) {
            case 'help':
              console.log(`
${chalk.bold('Commands:')}
  bases                       Select a base interactively
  use <baseId>                Set active base
  tables                      Select a table interactively
  show <tableId>              Show table contents
  columns <tableId>           List columns
  row <tableId> <rowId>       Show row detail
  sql <query>                 Run raw SQL (read-only)
  exit                        Exit shell
`);
              break;

            case 'exit':
            case 'quit':
              rl.close();
              process.exit(0);
              break;

            case 'bases': {
              const bases = db.listBases();
              if (bases.length === 0) {
                console.log(chalk.dim('No bases found.'));
                break;
              }
              const selectedId = await runSelect({
                message: 'Select a base',
                choices: bases.map((b) => ({
                  name: `${b.name} ${chalk.dim(`(${b.id})`)}`,
                  value: b.id,
                })),
              });
              if (selectedId) {
                const base = db.getBase(selectedId);
                setActiveBaseId(selectedId);
                console.log(`Active base: ${chalk.bold(base.name)}`);
              }
              break;
            }

            case 'use': {
              if (!parts[1]) {
                console.log(chalk.red('Usage: use <baseId>'));
                break;
              }
              const base = db.getBase(parts[1]);
              setActiveBaseId(parts[1]);
              console.log(`Active base: ${chalk.bold(base.name)}`);
              break;
            }

            case 'tables': {
              const baseId = getActiveBaseId();
              if (!baseId) {
                console.log(chalk.red('No active base. Run: use <baseId>'));
                break;
              }
              const base = db.getBase(baseId);
              const tables = base.listTables();
              if (tables.length === 0) {
                console.log(chalk.dim('No tables found.'));
                break;
              }
              const selectedId = await runSelect({
                message: 'Select a table',
                choices: tables.map((t) => ({
                  name: `${t.name} ${chalk.dim(`(${t.id})`)}`,
                  value: t.id,
                })),
              });
              if (selectedId) {
                const table = base.getTable(selectedId);
                const columns = table.listColumns();
                const rows = table.getRows({ resolveLinks: true });
                console.log(chalk.bold(table.name));
                console.log(renderRowsTable(rows, columns));
                console.log(chalk.dim(`${rows.length} rows`));
              }
              break;
            }

            case 'show': {
              if (!parts[1]) {
                console.log(chalk.red('Usage: show <tableId>'));
                break;
              }
              const baseId = getActiveBaseId();
              if (!baseId) {
                console.log(chalk.red('No active base.'));
                break;
              }
              const base = db.getBase(baseId);
              const table = base.getTable(parts[1]);
              const columns = table.listColumns();
              const rows = table.getRows({ resolveLinks: true });
              console.log(chalk.bold(table.name));
              console.log(renderRowsTable(rows, columns));
              console.log(chalk.dim(`${rows.length} rows`));
              break;
            }

            case 'columns': {
              if (!parts[1]) {
                console.log(chalk.red('Usage: columns <tableId>'));
                break;
              }
              const baseId = getActiveBaseId();
              if (!baseId) {
                console.log(chalk.red('No active base.'));
                break;
              }
              const base = db.getBase(baseId);
              const table = base.getTable(parts[1]);
              console.log(renderColumnList(table.listColumns()));
              break;
            }

            case 'row': {
              if (!parts[1] || !parts[2]) {
                console.log(chalk.red('Usage: row <tableId> <rowId>'));
                break;
              }
              const baseId = getActiveBaseId();
              if (!baseId) {
                console.log(chalk.red('No active base.'));
                break;
              }
              const base = db.getBase(baseId);
              const table = base.getTable(parts[1]);
              const columns = table.listColumns();
              const r = table.getRow(parts[2], { resolveLinks: true });
              console.log(renderRowDetail(r, columns));
              break;
            }

            case 'sql': {
              const query = parts.slice(1).join(' ');
              if (!query) {
                console.log(chalk.red('Usage: sql <query>'));
                break;
              }
              try {
                const result = (db as any).database.prepare(query).all();
                console.log(JSON.stringify(result, null, 2));
              } catch (e: any) {
                console.log(chalk.red(e.message));
              }
              break;
            }

            default:
              console.log(chalk.red(`Unknown command: ${cmd}. Type "help" for available commands.`));
          }
        } catch (e: any) {
          console.log(chalk.red(e.message));
        }

        rl.prompt();
      };

      console.log(chalk.bold('Diamant Interactive Shell'));
      console.log(chalk.dim('Type "help" for commands, "exit" to quit.\n'));

      rl = createReadline();
      rl.prompt();
    });
}
