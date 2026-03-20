import type Database from 'better-sqlite3';
import * as fs from 'fs';
import type {
  ColumnDefinition,
  ColumnRecord,
  ColumnConfig,
  ColumnType,
  RowData,
  GetRowsOptions,
  GetRowOptions,
  LinkConfig,
  LookupConfig,
  RollupConfig,
  FormulaConfig,
  TableRecord,
} from './types.js';
import { DiamantNotFoundError, DiamantValidationError, DiamantSchemaError } from './errors.js';
import { validateCellValue, isComputedType } from './column.js';
import { readCellValue, writeCellValue, getNextAutoNumber } from './cell.js';
import { handleLinkWrite, resolveLookup, resolveRollup, resolveCount, cleanupLinksOnRowDelete, cleanupLinksOnColumnDelete } from './links.js';
import { evaluateFormula } from './formula.js';
import { queryRows } from './query.js';
import type { EventEmitter } from './events.js';

export class Table {
  constructor(
    private db: Database.Database,
    private record: TableRecord,
    private events: EventEmitter,
  ) {}

  get id(): string { return this.record.id; }
  get baseId(): string { return this.record.baseId; }
  get name(): string { return this.record.name; }
  get createdAt(): string { return this.record.createdAt; }
  get updatedAt(): string { return this.record.updatedAt; }

  // --- Column operations ---

  addColumn(def: ColumnDefinition): ColumnRecord {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    // Get max position
    const maxPos = this.db.prepare(
      'SELECT MAX(position) as max_pos FROM columns WHERE table_id = ?',
    ).get(this.record.id) as { max_pos: number | null };
    const position = (maxPos?.max_pos ?? -1) + 1;

    const configJson = def.config ? JSON.stringify(def.config) : null;

    this.db.prepare(`
      INSERT INTO columns (id, table_id, name, type, config, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, this.record.id, def.name, def.type, configJson, position, now, now);

    // If this is a link column, optionally create symmetric column
    if (def.type === 'link' && def.config) {
      const linkConfig = def.config as LinkConfig;
      if (linkConfig.linkedTableId && linkConfig.symmetricColumnId === undefined) {
        this.createSymmetricColumn(id, linkConfig, now);
      }
    }

    // If this is an autoNumber column, populate existing rows
    if (def.type === 'autoNumber') {
      this.populateAutoNumbers(id, now);
    }

    // If this is a createdTime column, populate existing rows
    if (def.type === 'createdTime') {
      this.populateCreatedTime(id, now);
    }

    // If this is a lastModifiedTime column, populate existing rows
    if (def.type === 'lastModifiedTime') {
      this.populateLastModifiedTime(id, now);
    }

    const col = this.getColumnRecord(id);
    this.events.emit('column:created', { entityId: id, entityType: 'column' });
    return col;
  }

  private createSymmetricColumn(sourceColumnId: string, linkConfig: LinkConfig, now: string): void {
    const symId = crypto.randomUUID();
    const targetTableId = linkConfig.linkedTableId;

    // Get source table name for the symmetric column name
    const sourceTable = this.db.prepare('SELECT name FROM tables WHERE id = ?').get(this.record.id) as { name: string };

    const symMaxPos = this.db.prepare(
      'SELECT MAX(position) as max_pos FROM columns WHERE table_id = ?',
    ).get(targetTableId) as { max_pos: number | null };
    const symPosition = (symMaxPos?.max_pos ?? -1) + 1;

    const symConfig: LinkConfig = {
      linkedTableId: this.record.id,
      symmetricColumnId: sourceColumnId,
      relationship: 'many-to-many',
    };

    this.db.prepare(`
      INSERT INTO columns (id, table_id, name, type, config, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(symId, targetTableId, sourceTable.name, 'link', JSON.stringify(symConfig), symPosition, now, now);

    // Update the source column to reference the symmetric column
    const updatedConfig: LinkConfig = { ...linkConfig, symmetricColumnId: symId };
    this.db.prepare('UPDATE columns SET config = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(updatedConfig), now, sourceColumnId,
    );
  }

  private populateAutoNumbers(columnId: string, now: string): void {
    const rows = this.db.prepare(
      'SELECT id FROM rows WHERE table_id = ? ORDER BY position',
    ).all(this.record.id) as Array<{ id: string }>;

    const insert = this.db.prepare(
      'INSERT INTO cells (id, row_id, column_id, value, updated_at) VALUES (?, ?, ?, ?, ?)',
    );

    for (let i = 0; i < rows.length; i++) {
      insert.run(crypto.randomUUID(), rows[i].id, columnId, JSON.stringify(i + 1), now);
    }
  }

  private populateCreatedTime(columnId: string, now: string): void {
    const rows = this.db.prepare(
      'SELECT id, created_at FROM rows WHERE table_id = ?',
    ).all(this.record.id) as Array<{ id: string; created_at: string }>;

    const insert = this.db.prepare(
      'INSERT INTO cells (id, row_id, column_id, value, updated_at) VALUES (?, ?, ?, ?, ?)',
    );

    for (const row of rows) {
      insert.run(crypto.randomUUID(), row.id, columnId, JSON.stringify(row.created_at), now);
    }
  }

  private populateLastModifiedTime(columnId: string, now: string): void {
    const rows = this.db.prepare(
      'SELECT id, updated_at FROM rows WHERE table_id = ?',
    ).all(this.record.id) as Array<{ id: string; updated_at: string }>;

    const insert = this.db.prepare(
      'INSERT INTO cells (id, row_id, column_id, value, updated_at) VALUES (?, ?, ?, ?, ?)',
    );

    for (const row of rows) {
      insert.run(crypto.randomUUID(), row.id, columnId, JSON.stringify(row.updated_at), now);
    }
  }

  updateColumn(columnId: string, updates: { name?: string; config?: ColumnConfig }): ColumnRecord {
    const col = this.getColumnRecord(columnId);
    const now = new Date().toISOString();

    if (updates.name !== undefined) {
      this.db.prepare('UPDATE columns SET name = ?, updated_at = ? WHERE id = ?').run(
        updates.name, now, columnId,
      );
    }
    if (updates.config !== undefined) {
      this.db.prepare('UPDATE columns SET config = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(updates.config), now, columnId,
      );
    }

    this.events.emit('column:updated', { entityId: columnId, entityType: 'column' });
    return this.getColumnRecord(columnId);
  }

  deleteColumn(columnId: string): void {
    const col = this.getColumnRecord(columnId);

    // Check if any lookup/rollup/count columns depend on this column
    const dependents = this.db.prepare(
      "SELECT * FROM columns WHERE table_id = ? AND type IN ('lookup', 'rollup', 'count') AND id != ?",
    ).all(this.record.id, columnId) as Array<{ id: string; name: string; type: string; config: string | null }>;

    for (const dep of dependents) {
      if (!dep.config) continue;
      try {
        const config = JSON.parse(dep.config);
        if (config.linkColumnId === columnId || config.lookupColumnId === columnId) {
          throw new DiamantSchemaError(
            `Cannot delete column: column "${dep.name}" depends on it`,
            { entityType: 'column', entityId: columnId },
          );
        }
      } catch (e) {
        if (e instanceof DiamantSchemaError) throw e;
      }
    }

    // Clean up symmetric link if applicable
    cleanupLinksOnColumnDelete(this.db, col);

    // Delete cells and column
    this.db.prepare('DELETE FROM cells WHERE column_id = ?').run(columnId);
    this.db.prepare('DELETE FROM columns WHERE id = ?').run(columnId);

    this.events.emit('column:deleted', { entityId: columnId, entityType: 'column' });
  }

  reorderColumn(columnId: string, newPosition: number): void {
    this.getColumnRecord(columnId); // Ensure exists
    const columns = this.db.prepare(
      'SELECT id FROM columns WHERE table_id = ? ORDER BY position',
    ).all(this.record.id) as Array<{ id: string }>;

    const currentIndex = columns.findIndex((c) => c.id === columnId);
    if (currentIndex === -1) return;

    // Remove and reinsert at new position
    const reordered = columns.filter((c) => c.id !== columnId);
    const clampedPos = Math.max(0, Math.min(newPosition, reordered.length));
    reordered.splice(clampedPos, 0, { id: columnId });

    const update = this.db.prepare('UPDATE columns SET position = ? WHERE id = ?');
    const txn = this.db.transaction(() => {
      for (let i = 0; i < reordered.length; i++) {
        update.run(i, reordered[i].id);
      }
    });
    txn();
  }

  listColumns(): ColumnRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM columns WHERE table_id = ? ORDER BY position',
    ).all(this.record.id) as Array<{
      id: string; table_id: string; name: string; type: string;
      config: string | null; position: number; created_at: string; updated_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      tableId: r.table_id,
      name: r.name,
      type: r.type as ColumnType,
      config: r.config ? JSON.parse(r.config) : undefined,
      position: r.position,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  private getColumnRecord(columnId: string): ColumnRecord {
    const row = this.db.prepare(
      'SELECT * FROM columns WHERE id = ? AND table_id = ?',
    ).get(columnId, this.record.id) as {
      id: string; table_id: string; name: string; type: string;
      config: string | null; position: number; created_at: string; updated_at: string;
    } | undefined;

    if (!row) {
      throw new DiamantNotFoundError(`Column not found: ${columnId}`, {
        entityType: 'column', entityId: columnId,
      });
    }

    return {
      id: row.id,
      tableId: row.table_id,
      name: row.name,
      type: row.type as ColumnType,
      config: row.config ? JSON.parse(row.config) : undefined,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getColumn(columnId: string): ColumnRecord {
    return this.getColumnRecord(columnId);
  }

  // --- Row operations ---

  addRow(data: Record<string, unknown> = {}): RowData {
    const now = new Date().toISOString();
    const rowId = crypto.randomUUID();
    const columns = this.listColumns();
    const columnsByName = new Map(columns.map((c) => [c.name, c]));

    // Get next position
    const maxPos = this.db.prepare(
      'SELECT MAX(position) as max_pos FROM rows WHERE table_id = ?',
    ).get(this.record.id) as { max_pos: number | null };
    const position = (maxPos?.max_pos ?? -1) + 1;

    const txn = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO rows (id, table_id, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(rowId, this.record.id, position, now, now);

      const insertCell = this.db.prepare(
        'INSERT INTO cells (id, row_id, column_id, value, updated_at) VALUES (?, ?, ?, ?, ?)',
      );

      for (const col of columns) {
        let value: unknown = null;

        if (col.type === 'autoNumber') {
          value = getNextAutoNumber(this.db, this.record.id, col.id);
        } else if (col.type === 'createdTime') {
          value = now;
        } else if (col.type === 'lastModifiedTime') {
          value = now;
        } else if (isComputedType(col.type)) {
          continue; // Skip other computed types
        } else if (data[col.name] !== undefined) {
          value = validateCellValue(data[col.name], col);
        } else {
          continue; // No value provided, skip
        }

        insertCell.run(crypto.randomUUID(), rowId, col.id, writeCellValue(value), now);
      }

      // Handle link symmetric sync
      for (const col of columns) {
        if (col.type === 'link' && data[col.name] !== undefined) {
          const links = data[col.name] as string[];
          if (Array.isArray(links) && links.length > 0) {
            handleLinkWrite(this.db, col, rowId, links, []);
          }
        }
      }
    });
    txn();

    this.events.emit('row:created', { entityId: rowId, entityType: 'row' });
    return this.getRow(rowId);
  }

  getRow(rowId: string, options?: GetRowOptions): RowData {
    const row = this.db.prepare(
      'SELECT * FROM rows WHERE id = ? AND table_id = ?',
    ).get(rowId, this.record.id) as {
      id: string; table_id: string; position: number;
      created_at: string; updated_at: string;
    } | undefined;

    if (!row) {
      throw new DiamantNotFoundError(`Row not found: ${rowId}`, {
        entityType: 'row', entityId: rowId,
      });
    }

    return this.buildRowData(row, options);
  }

  updateRow(rowId: string, data: Record<string, unknown>): RowData {
    const row = this.db.prepare(
      'SELECT * FROM rows WHERE id = ? AND table_id = ?',
    ).get(rowId, this.record.id) as { id: string } | undefined;

    if (!row) {
      throw new DiamantNotFoundError(`Row not found: ${rowId}`, {
        entityType: 'row', entityId: rowId,
      });
    }

    const columns = this.listColumns();
    const columnsByName = new Map(columns.map((c) => [c.name, c]));
    const now = new Date().toISOString();

    const txn = this.db.transaction(() => {
      for (const [fieldName, value] of Object.entries(data)) {
        const col = columnsByName.get(fieldName);
        if (!col) {
          throw new DiamantValidationError(`Unknown column: ${fieldName}`, {
            entityType: 'column', detail: fieldName,
          });
        }

        if (isComputedType(col.type)) {
          throw new DiamantValidationError(`Cannot write to computed column: ${fieldName}`, {
            entityType: 'column', entityId: col.id,
          });
        }

        const validated = validateCellValue(value, col);
        const jsonValue = writeCellValue(validated);

        // Get old value for link sync
        let oldLinks: string[] = [];
        if (col.type === 'link') {
          const oldCell = this.db.prepare(
            'SELECT value FROM cells WHERE row_id = ? AND column_id = ?',
          ).get(rowId, col.id) as { value: string | null } | undefined;
          if (oldCell?.value) {
            try { oldLinks = JSON.parse(oldCell.value); } catch { /* empty */ }
          }
        }

        // Upsert cell
        const existing = this.db.prepare(
          'SELECT id FROM cells WHERE row_id = ? AND column_id = ?',
        ).get(rowId, col.id) as { id: string } | undefined;

        if (existing) {
          this.db.prepare('UPDATE cells SET value = ?, updated_at = ? WHERE id = ?').run(
            jsonValue, now, existing.id,
          );
        } else {
          this.db.prepare(
            'INSERT INTO cells (id, row_id, column_id, value, updated_at) VALUES (?, ?, ?, ?, ?)',
          ).run(crypto.randomUUID(), rowId, col.id, jsonValue, now);
        }

        // Sync links
        if (col.type === 'link' && validated !== null) {
          handleLinkWrite(this.db, col, rowId, validated as string[], oldLinks);
        }
      }

      // Update lastModifiedTime columns
      const lmtCols = columns.filter((c) => c.type === 'lastModifiedTime');
      for (const col of lmtCols) {
        const existing = this.db.prepare(
          'SELECT id FROM cells WHERE row_id = ? AND column_id = ?',
        ).get(rowId, col.id) as { id: string } | undefined;

        if (existing) {
          this.db.prepare('UPDATE cells SET value = ?, updated_at = ? WHERE id = ?').run(
            JSON.stringify(now), now, existing.id,
          );
        } else {
          this.db.prepare(
            'INSERT INTO cells (id, row_id, column_id, value, updated_at) VALUES (?, ?, ?, ?, ?)',
          ).run(crypto.randomUUID(), rowId, col.id, JSON.stringify(now), now);
        }
      }

      // Update the row's updated_at
      this.db.prepare('UPDATE rows SET updated_at = ? WHERE id = ?').run(now, rowId);
    });
    txn();

    this.events.emit('row:updated', { entityId: rowId, entityType: 'row' });
    return this.getRow(rowId);
  }

  deleteRow(rowId: string): void {
    const row = this.db.prepare(
      'SELECT id FROM rows WHERE id = ? AND table_id = ?',
    ).get(rowId, this.record.id) as { id: string } | undefined;

    if (!row) {
      throw new DiamantNotFoundError(`Row not found: ${rowId}`, {
        entityType: 'row', entityId: rowId,
      });
    }

    const txn = this.db.transaction(() => {
      cleanupLinksOnRowDelete(this.db, this.record.id, rowId);
      this.db.prepare('DELETE FROM cells WHERE row_id = ?').run(rowId);
      this.db.prepare('DELETE FROM rows WHERE id = ?').run(rowId);
    });
    txn();

    this.events.emit('row:deleted', { entityId: rowId, entityType: 'row' });
  }

  deleteRows(rowIds: string[]): void {
    const txn = this.db.transaction(() => {
      for (const rowId of rowIds) {
        this.deleteRow(rowId);
      }
    });
    txn();
  }

  getRows(options?: GetRowsOptions): RowData[] {
    const rows = this.db.prepare(
      'SELECT * FROM rows WHERE table_id = ? ORDER BY position',
    ).all(this.record.id) as Array<{
      id: string; table_id: string; position: number;
      created_at: string; updated_at: string;
    }>;

    const expandCols = options?.expand;
    const resolveLinks = options?.resolveLinks;
    const rowDataList = rows.map((r) => this.buildRowData(r, { expand: expandCols, resolveLinks }));
    return queryRows(rowDataList, {
      filter: options?.filter,
      sort: options?.sort,
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  private buildRowData(
    row: { id: string; table_id: string; position: number; created_at: string; updated_at: string },
    options?: GetRowOptions,
  ): RowData {
    const columns = this.listColumns();
    const cells = this.db.prepare(
      'SELECT column_id, value FROM cells WHERE row_id = ?',
    ).all(row.id) as Array<{ column_id: string; value: string | null }>;

    const cellMap = new Map(cells.map((c) => [c.column_id, c.value]));
    const result: Record<string, unknown> = {};

    for (const col of columns) {
      if (col.type === 'lookup') {
        result[col.name] = resolveLookup(this.db, col, row.id);
      } else if (col.type === 'rollup') {
        result[col.name] = resolveRollup(this.db, col, row.id);
      } else if (col.type === 'count') {
        const config = col.config as { linkColumnId: string } | undefined;
        result[col.name] = config ? resolveCount(this.db, config.linkColumnId, row.id) : 0;
      } else if (col.type === 'formula') {
        const config = col.config as FormulaConfig | undefined;
        if (config?.expression) {
          try {
            // Build a getCellValue that reads from already-resolved cells and raw cells
            const getCellValue = (columnName: string): unknown => {
              if (result[columnName] !== undefined) return result[columnName];
              // Look up the column by name
              const targetCol = columns.find((c) => c.name === columnName);
              if (!targetCol) return null;
              const raw = cellMap.get(targetCol.id) ?? null;
              return readCellValue(raw, targetCol);
            };
            result[col.name] = evaluateFormula(config.expression, getCellValue);
          } catch {
            result[col.name] = null;
          }
        } else {
          result[col.name] = null;
        }
      } else {
        const raw = cellMap.get(col.id) ?? null;
        result[col.name] = readCellValue(raw, col);
      }
    }

    // Handle expand
    if (options?.expand) {
      for (const expandField of options.expand) {
        const col = columns.find((c) => c.name === expandField);
        if (col?.type === 'link') {
          const linkedRowIds = result[expandField];
          if (Array.isArray(linkedRowIds) && linkedRowIds.length > 0) {
            const config = col.config as LinkConfig;
            const linkedTable = this.getLinkedTable(config.linkedTableId);
            if (linkedTable) {
              result[expandField] = linkedRowIds
                .map((id) => {
                  try { return linkedTable.getRow(id); } catch { return null; }
                })
                .filter(Boolean);
            }
          }
        }
      }
    }

    // Handle resolveLinks: replace link IDs with display values
    if (options?.resolveLinks) {
      for (const col of columns) {
        if (col.type !== 'link') continue;
        const linkedRowIds = result[col.name];
        if (!Array.isArray(linkedRowIds) || linkedRowIds.length === 0) continue;
        const config = col.config as LinkConfig;
        const linkedTable = this.getLinkedTable(config.linkedTableId);
        if (!linkedTable) continue;
        const linkedColumns = linkedTable.listColumns();
        const displayCol = config.displayColumnId
          ? linkedColumns.find((c) => c.id === config.displayColumnId)
          : linkedColumns[0]; // first column (which is the first user-defined column)
        if (!displayCol) continue;
        result[col.name] = linkedRowIds.map((id) => {
          try {
            const linkedRow = linkedTable.getRow(id);
            const displayValue = linkedRow.cells[displayCol.name];
            return displayValue != null ? String(displayValue) : id.slice(0, 8);
          } catch {
            return id.slice(0, 8);
          }
        });
      }
    }

    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cells: result,
    };
  }

  private getLinkedTable(tableId: string): Table | null {
    const tableRow = this.db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId) as {
      id: string; base_id: string; name: string; created_at: string; updated_at: string;
    } | undefined;

    if (!tableRow) return null;

    return new Table(this.db, {
      id: tableRow.id,
      baseId: tableRow.base_id,
      name: tableRow.name,
      createdAt: tableRow.created_at,
      updatedAt: tableRow.updated_at,
    }, this.events);
  }

  // --- Import/Export ---

  importCSV(filePath: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    if (lines.length === 0) return;

    const headers = parseCSVLine(lines[0]);
    const columns = this.listColumns();
    const columnNames = new Set(columns.map((c) => c.name));

    // Auto-create text columns for headers that don't exist
    for (const header of headers) {
      if (!columnNames.has(header)) {
        this.addColumn({ name: header, type: 'text' });
      }
    }

    const txn = this.db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const data: Record<string, unknown> = {};
        for (let j = 0; j < headers.length; j++) {
          if (j < values.length && values[j] !== '') {
            data[headers[j]] = values[j];
          }
        }
        this.addRow(data);
      }
    });
    txn();
  }

  exportCSV(filePath: string): void {
    const columns = this.listColumns().filter((c) => !isComputedType(c.type));
    const rows = this.getRows();

    const header = columns.map((c) => escapeCSV(c.name)).join(',');
    const dataLines = rows.map((row) =>
      columns.map((col) => {
        const val = row.cells[col.name];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return escapeCSV(JSON.stringify(val));
        return escapeCSV(String(val));
      }).join(','),
    );

    fs.writeFileSync(filePath, [header, ...dataLines].join('\n'), 'utf-8');
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
