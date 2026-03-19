import type Database from 'better-sqlite3';
import type { ColumnRecord } from './types.js';

export function readCellValue(raw: string | null, column: ColumnRecord): unknown {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function writeCellValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

export function readCellsForRow(
  db: Database.Database,
  rowId: string,
  columns: ColumnRecord[],
): Record<string, unknown> {
  const cells = db.prepare(
    'SELECT column_id, value FROM cells WHERE row_id = ?',
  ).all(rowId) as Array<{ column_id: string; value: string | null }>;

  const cellMap = new Map(cells.map((c) => [c.column_id, c.value]));
  const result: Record<string, unknown> = {};

  for (const col of columns) {
    const raw = cellMap.get(col.id) ?? null;
    result[col.name] = readCellValue(raw, col);
  }

  return result;
}

export function getNextAutoNumber(db: Database.Database, tableId: string, columnId: string): number {
  const result = db.prepare(`
    SELECT MAX(CAST(c.value AS INTEGER)) as max_val
    FROM cells c
    JOIN rows r ON c.row_id = r.id
    WHERE r.table_id = ? AND c.column_id = ?
  `).get(tableId, columnId) as { max_val: number | null } | undefined;

  return (result?.max_val ?? 0) + 1;
}
