import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Diamant,
  DiamantNotFoundError,
  DiamantValidationError,
} from '../src/index.js';
import type { Table } from '../src/index.js';

describe('Table — Column and Row CRUD', () => {
  let db: Diamant;
  let table: Table;

  beforeEach(() => {
    db = new Diamant(':memory:');
    const base = db.createBase('B');
    table = base.createTable('T');
  });

  afterEach(() => {
    db.close();
  });

  // --- Column operations ---

  describe('addColumn', () => {
    it('should add a text column', () => {
      const col = table.addColumn({ name: 'Name', type: 'text' });
      expect(col.name).toBe('Name');
      expect(col.type).toBe('text');
      expect(col.position).toBe(0);
    });

    it('should assign incrementing positions to columns', () => {
      table.addColumn({ name: 'A', type: 'text' });
      table.addColumn({ name: 'B', type: 'number' });
      const c = table.addColumn({ name: 'C', type: 'checkbox' });
      expect(c.position).toBe(2);
    });
  });

  describe('listColumns', () => {
    it('should return columns in position order', () => {
      table.addColumn({ name: 'Z', type: 'text' });
      table.addColumn({ name: 'A', type: 'number' });
      const cols = table.listColumns();
      expect(cols).toHaveLength(2);
      expect(cols[0].name).toBe('Z');
      expect(cols[1].name).toBe('A');
    });
  });

  describe('updateColumn', () => {
    it('should rename a column', () => {
      const col = table.addColumn({ name: 'Old', type: 'text' });
      const updated = table.updateColumn(col.id, { name: 'New' });
      expect(updated.name).toBe('New');
    });

    it('should update column config', () => {
      const col = table.addColumn({
        name: 'Status',
        type: 'singleSelect',
        config: { options: [{ id: 'a', name: 'Active' }] },
      });
      const updated = table.updateColumn(col.id, {
        config: {
          options: [
            { id: 'a', name: 'Active' },
            { id: 'b', name: 'Inactive' },
          ],
        },
      });
      expect((updated.config as any).options).toHaveLength(2);
    });
  });

  describe('deleteColumn', () => {
    it('should delete a column', () => {
      const col = table.addColumn({ name: 'Name', type: 'text' });
      table.deleteColumn(col.id);
      expect(table.listColumns()).toHaveLength(0);
    });

    it('should throw DiamantNotFoundError for nonexistent column', () => {
      expect(() => table.deleteColumn('nonexistent')).toThrow(DiamantNotFoundError);
    });

    it('should delete cells associated with the column', () => {
      const col = table.addColumn({ name: 'Name', type: 'text' });
      table.addRow({ Name: 'Alice' });
      table.addRow({ Name: 'Bob' });

      table.deleteColumn(col.id);
      const rows = table.getRows();
      // Rows still exist, but the Name column is gone
      expect(rows).toHaveLength(2);
      expect(rows[0].cells).not.toHaveProperty('Name');
    });
  });

  describe('reorderColumn', () => {
    it('should move a column to a new position', () => {
      const a = table.addColumn({ name: 'A', type: 'text' });
      table.addColumn({ name: 'B', type: 'text' });
      table.addColumn({ name: 'C', type: 'text' });

      // Move A to position 2 (end)
      table.reorderColumn(a.id, 2);

      const cols = table.listColumns();
      expect(cols[0].name).toBe('B');
      expect(cols[1].name).toBe('C');
      expect(cols[2].name).toBe('A');
    });

    it('should clamp position to valid range', () => {
      const a = table.addColumn({ name: 'A', type: 'text' });
      table.addColumn({ name: 'B', type: 'text' });

      table.reorderColumn(a.id, 999);
      const cols = table.listColumns();
      expect(cols[1].name).toBe('A');
    });
  });

  // --- Row operations ---

  describe('addRow', () => {
    it('should add a row with cell data', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'Age', type: 'number' });

      const row = table.addRow({ Name: 'Alice', Age: 30 });
      expect(row.id).toBeDefined();
      expect(row.cells.Name).toBe('Alice');
      expect(row.cells.Age).toBe(30);
    });

    it('should add an empty row', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      const row = table.addRow({});
      expect(row.cells.Name).toBeNull();
    });

    it('should add row with partial data', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'Age', type: 'number' });

      const row = table.addRow({ Name: 'Bob' });
      expect(row.cells.Name).toBe('Bob');
      expect(row.cells.Age).toBeNull();
    });
  });

  describe('getRow', () => {
    it('should get a row by id', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      const created = table.addRow({ Name: 'Alice' });
      const fetched = table.getRow(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.cells.Name).toBe('Alice');
    });

    it('should throw DiamantNotFoundError for nonexistent row', () => {
      expect(() => table.getRow('nonexistent')).toThrow(DiamantNotFoundError);
    });
  });

  describe('getRows', () => {
    it('should return all rows in position order', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addRow({ Name: 'Alice' });
      table.addRow({ Name: 'Bob' });
      table.addRow({ Name: 'Charlie' });

      const rows = table.getRows();
      expect(rows).toHaveLength(3);
      expect(rows[0].cells.Name).toBe('Alice');
      expect(rows[1].cells.Name).toBe('Bob');
      expect(rows[2].cells.Name).toBe('Charlie');
    });
  });

  describe('updateRow', () => {
    it('should update a cell value', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      const row = table.addRow({ Name: 'Alice' });
      const updated = table.updateRow(row.id, { Name: 'Alicia' });
      expect(updated.cells.Name).toBe('Alicia');
    });

    it('should throw DiamantValidationError for unknown column', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      const row = table.addRow({ Name: 'Alice' });
      expect(() => table.updateRow(row.id, { Nonexistent: 'value' })).toThrow(
        DiamantValidationError,
      );
    });

    it('should throw DiamantNotFoundError for nonexistent row', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      expect(() => table.updateRow('nonexistent', { Name: 'X' })).toThrow(
        DiamantNotFoundError,
      );
    });
  });

  describe('deleteRow', () => {
    it('should delete a row', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      const row = table.addRow({ Name: 'Alice' });
      table.deleteRow(row.id);
      expect(table.getRows()).toHaveLength(0);
    });

    it('should throw DiamantNotFoundError for nonexistent row', () => {
      expect(() => table.deleteRow('nonexistent')).toThrow(DiamantNotFoundError);
    });
  });

  describe('deleteRows (bulk)', () => {
    it('should delete multiple rows', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      const r1 = table.addRow({ Name: 'A' });
      const r2 = table.addRow({ Name: 'B' });
      table.addRow({ Name: 'C' });

      table.deleteRows([r1.id, r2.id]);
      const remaining = table.getRows();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].cells.Name).toBe('C');
    });
  });

  // --- Cell value validation per column type ---

  describe('cell value validation', () => {
    it('should validate text column', () => {
      table.addColumn({ name: 'T', type: 'text' });
      const row = table.addRow({ T: 'hello' });
      expect(row.cells.T).toBe('hello');
    });

    it('should reject non-string for text column', () => {
      table.addColumn({ name: 'T', type: 'text' });
      expect(() => table.addRow({ T: 123 })).toThrow(DiamantValidationError);
    });

    it('should validate number column', () => {
      table.addColumn({ name: 'N', type: 'number' });
      const row = table.addRow({ N: 42.5 });
      expect(row.cells.N).toBe(42.5);
    });

    it('should reject non-finite number', () => {
      table.addColumn({ name: 'N', type: 'number' });
      expect(() => table.addRow({ N: Infinity })).toThrow(DiamantValidationError);
    });

    it('should validate checkbox column', () => {
      table.addColumn({ name: 'C', type: 'checkbox' });
      const row = table.addRow({ C: true });
      expect(row.cells.C).toBe(true);
    });

    it('should validate date column with ISO format', () => {
      table.addColumn({ name: 'D', type: 'date' });
      const row = table.addRow({ D: '2024-01-15' });
      expect(row.cells.D).toBe('2024-01-15');
    });

    it('should reject invalid date format', () => {
      table.addColumn({ name: 'D', type: 'date' });
      expect(() => table.addRow({ D: 'not-a-date' })).toThrow(DiamantValidationError);
    });

    it('should validate email column', () => {
      table.addColumn({ name: 'E', type: 'email' });
      const row = table.addRow({ E: 'user@example.com' });
      expect(row.cells.E).toBe('user@example.com');
    });

    it('should reject invalid email', () => {
      table.addColumn({ name: 'E', type: 'email' });
      expect(() => table.addRow({ E: 'not-email' })).toThrow(DiamantValidationError);
    });

    it('should validate url column', () => {
      table.addColumn({ name: 'U', type: 'url' });
      const row = table.addRow({ U: 'https://example.com' });
      expect(row.cells.U).toBe('https://example.com');
    });

    it('should reject invalid url', () => {
      table.addColumn({ name: 'U', type: 'url' });
      expect(() => table.addRow({ U: 'not a url' })).toThrow(DiamantValidationError);
    });

    it('should validate phone column', () => {
      table.addColumn({ name: 'P', type: 'phone' });
      const row = table.addRow({ P: '+1-555-0100' });
      expect(row.cells.P).toBe('+1-555-0100');
    });

    it('should validate currency column', () => {
      table.addColumn({ name: 'C', type: 'currency' });
      const row = table.addRow({ C: { amount: 99.99, currency: 'USD' } });
      expect(row.cells.C).toEqual({ amount: 99.99, currency: 'USD' });
    });

    it('should reject invalid currency value', () => {
      table.addColumn({ name: 'C', type: 'currency' });
      expect(() => table.addRow({ C: 99.99 })).toThrow(DiamantValidationError);
    });

    it('should validate percent column', () => {
      table.addColumn({ name: 'P', type: 'percent' });
      const row = table.addRow({ P: 0.75 });
      expect(row.cells.P).toBe(0.75);
    });

    it('should validate duration column', () => {
      table.addColumn({ name: 'D', type: 'duration' });
      const row = table.addRow({ D: 3600 });
      expect(row.cells.D).toBe(3600);
    });

    it('should reject negative duration', () => {
      table.addColumn({ name: 'D', type: 'duration' });
      expect(() => table.addRow({ D: -1 })).toThrow(DiamantValidationError);
    });

    it('should validate rating column', () => {
      table.addColumn({ name: 'R', type: 'rating', config: { max: 5 } });
      const row = table.addRow({ R: 3 });
      expect(row.cells.R).toBe(3);
    });

    it('should reject rating out of range', () => {
      table.addColumn({ name: 'R', type: 'rating', config: { max: 5 } });
      expect(() => table.addRow({ R: 6 })).toThrow(DiamantValidationError);
      expect(() => table.addRow({ R: 0 })).toThrow(DiamantValidationError);
    });

    it('should validate singleSelect column', () => {
      table.addColumn({
        name: 'S',
        type: 'singleSelect',
        config: { options: [{ id: 'opt1', name: 'Option 1' }] },
      });
      const row = table.addRow({ S: 'opt1' });
      expect(row.cells.S).toBe('opt1');
    });

    it('should reject invalid singleSelect option', () => {
      table.addColumn({
        name: 'S',
        type: 'singleSelect',
        config: { options: [{ id: 'opt1', name: 'Option 1' }] },
      });
      expect(() => table.addRow({ S: 'invalid' })).toThrow(DiamantValidationError);
    });

    it('should validate multiSelect column', () => {
      table.addColumn({
        name: 'M',
        type: 'multiSelect',
        config: {
          options: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
          ],
        },
      });
      const row = table.addRow({ M: ['a', 'b'] });
      expect(row.cells.M).toEqual(['a', 'b']);
    });

    it('should reject invalid multiSelect option', () => {
      table.addColumn({
        name: 'M',
        type: 'multiSelect',
        config: { options: [{ id: 'a', name: 'A' }] },
      });
      expect(() => table.addRow({ M: ['a', 'invalid'] })).toThrow(DiamantValidationError);
    });

    it('should validate richText column', () => {
      table.addColumn({ name: 'RT', type: 'richText' });
      const row = table.addRow({ RT: '<p>Hello</p>' });
      expect(row.cells.RT).toBe('<p>Hello</p>');
    });

    it('should validate attachment column', () => {
      table.addColumn({ name: 'A', type: 'attachment' });
      const att = [{ name: 'file.txt', path: '/tmp/file.txt', size: 1024, mimeType: 'text/plain' }];
      const row = table.addRow({ A: att });
      expect(row.cells.A).toEqual(att);
    });

    it('should reject invalid attachment', () => {
      table.addColumn({ name: 'A', type: 'attachment' });
      expect(() => table.addRow({ A: [{ name: 'x' }] })).toThrow(DiamantValidationError);
    });
  });

  // --- Computed columns ---

  describe('computed columns are read-only', () => {
    it('should silently skip formula column data on addRow', () => {
      table.addColumn({ name: 'F', type: 'formula', config: { expression: '1 + 1' } });
      // addRow skips computed types, so no error is thrown
      const row = table.addRow({ F: 'value' });
      // The formula value is computed, not the provided value
      expect(row.cells.F).toBe(2);
    });

    it('should reject writes to formula column on update', () => {
      table.addColumn({ name: 'F', type: 'formula', config: { expression: '1 + 1' } });
      const row = table.addRow({});
      expect(() => table.updateRow(row.id, { F: 'value' })).toThrow(DiamantValidationError);
    });

    it('should silently skip lookup column data on addRow', () => {
      table.addColumn({
        name: 'L',
        type: 'lookup',
        config: { linkColumnId: 'x', lookupColumnId: 'y' },
      });
      // addRow skips computed types
      const row = table.addRow({ L: 'value' });
      // Lookup resolves to empty array since no real links
      expect(row.cells.L).toEqual([]);
    });

    it('should reject writes to lookup column on update', () => {
      table.addColumn({
        name: 'L',
        type: 'lookup',
        config: { linkColumnId: 'x', lookupColumnId: 'y' },
      });
      const row = table.addRow({});
      expect(() => table.updateRow(row.id, { L: 'value' })).toThrow(DiamantValidationError);
    });

    it('should silently skip rollup column data on addRow', () => {
      table.addColumn({
        name: 'R',
        type: 'rollup',
        config: { linkColumnId: 'x', lookupColumnId: 'y', aggregation: 'sum' },
      });
      const row = table.addRow({ R: 100 });
      // Rollup resolves to 0 (sum of empty)
      expect(row.cells.R).toBe(0);
    });

    it('should reject writes to rollup column on update', () => {
      table.addColumn({
        name: 'R',
        type: 'rollup',
        config: { linkColumnId: 'x', lookupColumnId: 'y', aggregation: 'sum' },
      });
      const row = table.addRow({});
      expect(() => table.updateRow(row.id, { R: 100 })).toThrow(DiamantValidationError);
    });

    it('should reject writes to autoNumber column on update', () => {
      table.addColumn({ name: 'AN', type: 'autoNumber' });
      const row = table.addRow({});
      expect(() => table.updateRow(row.id, { AN: 99 })).toThrow(DiamantValidationError);
    });

    it('should reject writes to createdTime column on update', () => {
      table.addColumn({ name: 'CT', type: 'createdTime' });
      const row = table.addRow({});
      expect(() => table.updateRow(row.id, { CT: 'x' })).toThrow(DiamantValidationError);
    });

    it('should reject writes to lastModifiedTime column on update', () => {
      table.addColumn({ name: 'LMT', type: 'lastModifiedTime' });
      const row = table.addRow({});
      expect(() => table.updateRow(row.id, { LMT: 'x' })).toThrow(DiamantValidationError);
    });
  });

  // --- autoNumber ---

  describe('autoNumber', () => {
    it('should auto-increment for new rows', () => {
      table.addColumn({ name: 'Num', type: 'autoNumber' });
      const r1 = table.addRow({});
      const r2 = table.addRow({});
      const r3 = table.addRow({});
      expect(r1.cells.Num).toBe(1);
      expect(r2.cells.Num).toBe(2);
      expect(r3.cells.Num).toBe(3);
    });

    it('should populate existing rows when autoNumber column is added after rows exist', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addRow({ Name: 'Alice' });
      table.addRow({ Name: 'Bob' });

      table.addColumn({ name: 'Num', type: 'autoNumber' });
      const rows = table.getRows();
      expect(rows[0].cells.Num).toBe(1);
      expect(rows[1].cells.Num).toBe(2);
    });
  });

  // --- createdTime and lastModifiedTime ---

  describe('createdTime', () => {
    it('should auto-populate createdTime on row creation', () => {
      table.addColumn({ name: 'CT', type: 'createdTime' });
      const row = table.addRow({});
      expect(row.cells.CT).toBeDefined();
      expect(typeof row.cells.CT).toBe('string');
      // Should be a valid ISO date
      expect(new Date(row.cells.CT as string).toISOString()).toBe(row.cells.CT);
    });
  });

  describe('lastModifiedTime', () => {
    it('should auto-populate lastModifiedTime on row creation', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'LMT', type: 'lastModifiedTime' });
      const row = table.addRow({ Name: 'Alice' });
      expect(row.cells.LMT).toBeDefined();
      expect(typeof row.cells.LMT).toBe('string');
    });

    it('should update lastModifiedTime on row update', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'LMT', type: 'lastModifiedTime' });
      const row = table.addRow({ Name: 'Alice' });
      const lmt1 = row.cells.LMT as string;

      const updated = table.updateRow(row.id, { Name: 'Alicia' });
      const lmt2 = updated.cells.LMT as string;

      // LMT should be at least as recent as the original
      expect(new Date(lmt2).getTime()).toBeGreaterThanOrEqual(new Date(lmt1).getTime());
    });
  });
});
