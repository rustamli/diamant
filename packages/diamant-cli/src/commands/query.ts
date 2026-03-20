import { Command } from 'commander';
import { Diamant } from 'diamant';
import type { Filter, FilterCondition, CompoundFilter, SortSpec } from 'diamant';
import chalk from 'chalk';
import { getDbPath, getActiveBaseId } from '../config.js';
import { renderRowsTable } from '../display.js';

function requireActiveBase(): string {
  const baseId = getActiveBaseId();
  if (!baseId) {
    console.error(chalk.red('No active base. Run: diamant base use <baseId>'));
    process.exit(1);
  }
  return baseId;
}

function parseFilter(filterStr: string): Filter {
  // Support compound filters: "Status eq Done AND Points gt 3"
  const andParts = filterStr.split(/\s+AND\s+/i);
  if (andParts.length > 1) {
    return {
      conjunction: 'and' as const,
      filters: andParts.map(parseSingleFilter),
    };
  }

  const orParts = filterStr.split(/\s+OR\s+/i);
  if (orParts.length > 1) {
    return {
      conjunction: 'or' as const,
      filters: orParts.map(parseSingleFilter),
    };
  }

  return parseSingleFilter(filterStr);
}

function parseSingleFilter(filterStr: string): FilterCondition {
  const parts = filterStr.trim().split(/\s+/);
  if (parts.length < 2) {
    console.error(chalk.red(`Invalid filter: ${filterStr}. Format: 'field operator [value]'`));
    process.exit(1);
  }

  const field = parts[0];
  const operator = parts[1] as FilterCondition['operator'];
  let value: unknown = parts.slice(2).join(' ');

  // Try to parse as number
  if (value && !isNaN(Number(value))) {
    value = Number(value);
  }

  return { field, operator, value: value || undefined };
}

function parseSort(sortStr: string): SortSpec[] {
  return sortStr.split(',').map((s) => {
    const parts = s.trim().split(/\s+/);
    return {
      field: parts[0],
      direction: (parts[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
    };
  });
}

export function registerQueryCommands(program: Command): void {
  program
    .command('query <tableId>')
    .description('Query rows with filter, sort, and pagination')
    .option('--filter <filter>', 'Filter expression (e.g. "Status eq Done")')
    .option('--sort <sort>', 'Sort expression (e.g. "Points desc")')
    .option('--limit <n>', 'Limit results', parseInt)
    .option('--offset <n>', 'Offset results', parseInt)
    .option('--with-id', 'Show row ID column')
    .action((tableId: string, opts: { filter?: string; sort?: string; limit?: number; offset?: number; withId?: boolean }) => {
      const dbPath = getDbPath(program.opts().db);
      const baseId = requireActiveBase();
      const db = new Diamant(dbPath);
      try {
        const base = db.getBase(baseId);
        const table = base.getTable(tableId);
        const columns = table.listColumns();

        const isJson = program.opts().format === 'json';
        const rows = table.getRows({
          filter: opts.filter ? parseFilter(opts.filter) : undefined,
          sort: opts.sort ? parseSort(opts.sort) : undefined,
          limit: opts.limit,
          offset: opts.offset,
          resolveLinks: !isJson,
        });

        if (isJson) {
          console.log(JSON.stringify(rows));
        } else {
          console.log(renderRowsTable(rows, columns, { withId: opts.withId }));
          console.log(chalk.dim(`${rows.length} rows`));
        }
      } finally {
        db.close();
      }
    });
}
