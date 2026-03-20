import chalk from 'chalk';
import Table from 'cli-table3';
import type { RowData, ColumnRecord } from 'diamant';

const TYPE_COLORS: Record<string, (s: string) => string> = {
  text: chalk.green,
  number: chalk.cyan,
  checkbox: chalk.yellow,
  singleSelect: chalk.magenta,
  multiSelect: chalk.magenta,
  date: chalk.blue,
  email: chalk.green,
  url: chalk.green,
  phone: chalk.green,
  currency: chalk.cyan,
  percent: chalk.cyan,
  duration: chalk.cyan,
  rating: chalk.yellow,
  richText: chalk.green,
  attachment: chalk.gray,
  autoNumber: chalk.gray,
  createdTime: chalk.gray,
  lastModifiedTime: chalk.gray,
  link: chalk.red,
  lookup: chalk.red,
  rollup: chalk.red,
  formula: chalk.blue,
  count: chalk.cyan,
};

export function colorType(type: string): string {
  const colorFn = TYPE_COLORS[type] || chalk.white;
  return colorFn(type);
}

export function formatCellValue(value: unknown, column?: ColumnRecord | string): string {
  if (value === null || value === undefined) return chalk.dim('—');
  if (typeof value === 'boolean') return value ? chalk.green('✓') : chalk.dim('✗');

  const type = typeof column === 'string' ? column : column?.type;
  const config = typeof column === 'object' ? column?.config : undefined;

  // Resolve singleSelect/multiSelect option IDs to names
  if (type === 'singleSelect' && typeof value === 'string' && config) {
    const options = (config as any).options as Array<{ id: string; name: string }> | undefined;
    const option = options?.find((o) => o.id === value);
    return option ? option.name : String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return chalk.dim('[]');
    if (type === 'multiSelect' && config) {
      const options = (config as any).options as Array<{ id: string; name: string }> | undefined;
      if (options) {
        return value.map((v) => {
          const option = options.find((o) => o.id === v);
          return option ? option.name : String(v);
        }).join(', ');
      }
    }
    // Check if it's an array of objects (expanded link records)
    if (typeof value[0] === 'object' && value[0] !== null && 'id' in value[0]) {
      return value.map((r: any) => {
        const name = r.cells ? Object.values(r.cells)[0] : r.id;
        return `→ ${name} (${r.id.slice(0, 8)})`;
      }).join(', ');
    }
    return value.map(String).join(', ');
  }
  if (typeof value === 'object') {
    if ('amount' in (value as any) && 'currency' in (value as any)) {
      const v = value as { amount: number; currency: string };
      return `${v.currency} ${v.amount.toFixed(2)}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function renderRowsTable(rows: RowData[], columns: ColumnRecord[], options?: { withId?: boolean }): string {
  if (rows.length === 0) return chalk.dim('No rows found.');

  const displayCols = columns.slice(0, 10); // Limit columns for display
  const showId = options?.withId ?? false;
  const head = showId
    ? ['ID', ...displayCols.map((c) => chalk.bold(c.name))]
    : displayCols.map((c) => chalk.bold(c.name));
  const table = new Table({
    head,
    style: { head: [], border: [] },
    wordWrap: true,
  });

  for (const row of rows) {
    const cells = displayCols.map((col) => formatCellValue(row.cells[col.name], col));
    table.push(showId ? [chalk.dim(row.id), ...cells] : cells);
  }

  return table.toString();
}

export function renderColumnList(columns: ColumnRecord[]): string {
  if (columns.length === 0) return chalk.dim('No columns.');

  const table = new Table({
    head: [chalk.bold('ID'), chalk.bold('Name'), chalk.bold('Type'), chalk.bold('Position')],
    style: { head: [], border: [] },
  });

  for (const col of columns) {
    table.push([
      chalk.dim(col.id.slice(0, 8)),
      col.name,
      colorType(col.type),
      String(col.position),
    ]);
  }

  return table.toString();
}

export function renderRowDetail(row: RowData, columns: ColumnRecord[]): string {
  const table = new Table({
    style: { head: [], border: [] },
  });

  table.push([chalk.bold('ID'), row.id]);
  table.push([chalk.bold('Created'), row.createdAt]);
  table.push([chalk.bold('Updated'), row.updatedAt]);

  for (const col of columns) {
    const value = row.cells[col.name];
    table.push([
      chalk.bold(col.name) + ' ' + chalk.dim(`(${col.type})`),
      formatCellValue(value, col),
    ]);
  }

  return table.toString();
}

export function renderBaseList(bases: Array<{ id: string; name: string; createdAt: string }>): string {
  if (bases.length === 0) return chalk.dim('No bases found.');

  const table = new Table({
    head: [chalk.bold('ID'), chalk.bold('Name'), chalk.bold('Created')],
    style: { head: [], border: [] },
  });

  for (const base of bases) {
    table.push([base.id, base.name, base.createdAt]);
  }

  return table.toString();
}

export function renderTableList(tables: Array<{ id: string; name: string; createdAt: string }>): string {
  if (tables.length === 0) return chalk.dim('No tables found.');

  const table = new Table({
    head: [chalk.bold('ID'), chalk.bold('Name'), chalk.bold('Created')],
    style: { head: [], border: [] },
  });

  for (const t of tables) {
    table.push([t.id, t.name, t.createdAt]);
  }

  return table.toString();
}
