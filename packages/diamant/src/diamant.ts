import type Database from 'better-sqlite3';
import type { BaseRecord, DiamantEventType, DiamantEvent } from './types.js';
import { initializeDatabase } from './schema.js';
import { DiamantNotFoundError } from './errors.js';
import { Base } from './base.js';
import { EventEmitter } from './events.js';

export class Diamant {
  private db: Database.Database;
  private events: EventEmitter;

  constructor(dbPath: string = ':memory:') {
    this.db = initializeDatabase(dbPath);
    this.events = new EventEmitter();
  }

  createBase(name: string): Base {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO bases (id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, name, now, now);

    this.events.emit('base:created', { entityId: id, entityType: 'base' });
    return this.getBase(id);
  }

  getBase(baseId: string): Base {
    const row = this.db.prepare('SELECT * FROM bases WHERE id = ?').get(baseId) as {
      id: string; name: string; created_at: string; updated_at: string;
    } | undefined;

    if (!row) {
      throw new DiamantNotFoundError(`Base not found: ${baseId}`, {
        entityType: 'base', entityId: baseId,
      });
    }

    return new Base(this.db, {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }, this.events);
  }

  listBases(): Base[] {
    const rows = this.db.prepare('SELECT * FROM bases ORDER BY created_at').all() as Array<{
      id: string; name: string; created_at: string; updated_at: string;
    }>;

    return rows.map((r) => new Base(this.db, {
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }, this.events));
  }

  deleteBase(baseId: string): void {
    this.getBase(baseId); // ensure exists
    this.db.prepare('DELETE FROM bases WHERE id = ?').run(baseId);
    this.events.emit('base:deleted', { entityId: baseId, entityType: 'base' });
  }

  on(type: DiamantEventType, listener: (event: DiamantEvent) => void): void {
    this.events.on(type, listener);
  }

  off(type: DiamantEventType, listener: (event: DiamantEvent) => void): void {
    this.events.off(type, listener);
  }

  close(): void {
    this.db.close();
  }

  /** Expose the raw database for advanced usage */
  get database(): Database.Database {
    return this.db;
  }
}
