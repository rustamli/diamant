import type Database from 'better-sqlite3';
import type { BaseRecord, TableRecord } from './types.js';
import { DiamantNotFoundError } from './errors.js';
import { Table } from './table.js';
import type { EventEmitter } from './events.js';

export class Base {
  constructor(
    private db: Database.Database,
    private record: BaseRecord,
    private events: EventEmitter,
  ) {}

  get id(): string { return this.record.id; }
  get name(): string { return this.record.name; }
  get createdAt(): string { return this.record.createdAt; }
  get updatedAt(): string { return this.record.updatedAt; }

  createTable(name: string): Table {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO tables (id, base_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, this.record.id, name, now, now);

    this.events.emit('table:created', { entityId: id, entityType: 'table' });
    return this.getTable(id);
  }

  getTable(tableId: string): Table {
    const row = this.db.prepare(
      'SELECT * FROM tables WHERE id = ? AND base_id = ?',
    ).get(tableId, this.record.id) as {
      id: string; base_id: string; name: string; created_at: string; updated_at: string;
    } | undefined;

    if (!row) {
      throw new DiamantNotFoundError(`Table not found: ${tableId}`, {
        entityType: 'table', entityId: tableId,
      });
    }

    return new Table(this.db, {
      id: row.id,
      baseId: row.base_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }, this.events);
  }

  listTables(): Table[] {
    const rows = this.db.prepare(
      'SELECT * FROM tables WHERE base_id = ? ORDER BY created_at',
    ).all(this.record.id) as Array<{
      id: string; base_id: string; name: string; created_at: string; updated_at: string;
    }>;

    return rows.map((r) => new Table(this.db, {
      id: r.id,
      baseId: r.base_id,
      name: r.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }, this.events));
  }

  deleteTable(tableId: string): void {
    const table = this.getTable(tableId);

    // Clean up link columns in other tables that reference this table
    const linkCols = this.db.prepare(`
      SELECT c.* FROM columns c
      JOIN tables t ON c.table_id = t.id
      WHERE c.type = 'link' AND t.base_id = ? AND c.table_id != ?
    `).all(this.record.id, tableId) as Array<{ id: string; config: string | null }>;

    for (const col of linkCols) {
      if (!col.config) continue;
      try {
        const config = JSON.parse(col.config);
        if (config.linkedTableId === tableId) {
          this.db.prepare('DELETE FROM cells WHERE column_id = ?').run(col.id);
          this.db.prepare('DELETE FROM columns WHERE id = ?').run(col.id);
        }
      } catch { /* skip */ }
    }

    // CASCADE handles the rest (columns, rows, cells)
    this.db.prepare('DELETE FROM tables WHERE id = ? AND base_id = ?').run(tableId, this.record.id);
    this.events.emit('table:deleted', { entityId: tableId, entityType: 'table' });
  }

  renameTable(tableId: string, newName: string): Table {
    this.getTable(tableId); // ensure exists
    const now = new Date().toISOString();
    this.db.prepare('UPDATE tables SET name = ?, updated_at = ? WHERE id = ?').run(
      newName, now, tableId,
    );
    return this.getTable(tableId);
  }

  exportJSON(filePath: string): void {
    const fs = require('fs') as typeof import('fs');
    const tables = this.listTables();
    const data: Record<string, unknown> = {
      base: { id: this.record.id, name: this.record.name },
      tables: tables.map((t) => ({
        id: t.id,
        name: t.name,
        columns: t.listColumns(),
        rows: t.getRows(),
      })),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  importJSON(filePath: string): void {
    const fs = require('fs') as typeof import('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as {
      tables: Array<{
        name: string;
        columns: Array<{ name: string; type: string; config?: unknown }>;
        rows: Array<{ cells: Record<string, unknown> }>;
      }>;
    };

    const txn = this.db.transaction(() => {
      for (const tableData of data.tables) {
        const table = this.createTable(tableData.name);
        for (const colDef of tableData.columns) {
          if (['autoNumber', 'createdTime', 'lastModifiedTime'].includes(colDef.type)) continue;
          table.addColumn({
            name: colDef.name,
            type: colDef.type as any,
            config: colDef.config as any,
          });
        }
        for (const rowData of tableData.rows) {
          table.addRow(rowData.cells);
        }
      }
    });
    txn();
  }
}
