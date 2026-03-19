import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Diamant,
  DiamantValidationError,
  validateCellValue,
} from '../src/index.js';
import type { ColumnRecord, Table } from '../src/index.js';

/**
 * Helper to create a mock ColumnRecord for direct validateCellValue testing.
 */
function mockColumn(
  type: string,
  name: string = 'test',
  config?: unknown,
): ColumnRecord {
  return {
    id: 'col-1',
    tableId: 'tbl-1',
    name,
    type: type as any,
    config: config as any,
    position: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Column type validation (validateCellValue)', () => {
  // --- text ---

  describe('text', () => {
    const col = mockColumn('text', 'Name');

    it('should accept a string', () => {
      expect(validateCellValue('hello', col)).toBe('hello');
    });

    it('should accept an empty string', () => {
      expect(validateCellValue('', col)).toBe('');
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(validateCellValue(undefined, col)).toBeNull();
    });

    it('should reject a number', () => {
      expect(() => validateCellValue(42, col)).toThrow(DiamantValidationError);
    });

    it('should reject a boolean', () => {
      expect(() => validateCellValue(true, col)).toThrow(DiamantValidationError);
    });
  });

  // --- number ---

  describe('number', () => {
    const col = mockColumn('number', 'Age');

    it('should accept an integer', () => {
      expect(validateCellValue(42, col)).toBe(42);
    });

    it('should accept a float', () => {
      expect(validateCellValue(3.14, col)).toBe(3.14);
    });

    it('should accept zero', () => {
      expect(validateCellValue(0, col)).toBe(0);
    });

    it('should accept negative numbers', () => {
      expect(validateCellValue(-10, col)).toBe(-10);
    });

    it('should coerce numeric string to number', () => {
      expect(validateCellValue('42', col)).toBe(42);
      expect(validateCellValue('3.14', col)).toBe(3.14);
      expect(validateCellValue('-5', col)).toBe(-5);
    });

    it('should reject non-numeric string', () => {
      expect(() => validateCellValue('abc', col)).toThrow(DiamantValidationError);
    });

    it('should reject Infinity', () => {
      expect(() => validateCellValue(Infinity, col)).toThrow(DiamantValidationError);
    });

    it('should reject NaN', () => {
      expect(() => validateCellValue(NaN, col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(validateCellValue(undefined, col)).toBeNull();
    });
  });

  // --- checkbox ---

  describe('checkbox', () => {
    const col = mockColumn('checkbox', 'Done');

    it('should accept true', () => {
      expect(validateCellValue(true, col)).toBe(true);
    });

    it('should accept false', () => {
      expect(validateCellValue(false, col)).toBe(false);
    });

    it('should coerce truthy values to true', () => {
      expect(validateCellValue(1, col)).toBe(true);
      expect(validateCellValue('yes', col)).toBe(true);
    });

    it('should coerce falsy values to false', () => {
      expect(validateCellValue(0, col)).toBe(false);
      expect(validateCellValue('', col)).toBe(false);
    });

    it('should return false for null (not null)', () => {
      expect(validateCellValue(null, col)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(validateCellValue(undefined, col)).toBe(false);
    });
  });

  // --- date ---

  describe('date', () => {
    const col = mockColumn('date', 'Birthday');

    it('should accept YYYY-MM-DD', () => {
      expect(validateCellValue('2024-01-15', col)).toBe('2024-01-15');
    });

    it('should accept full ISO 8601', () => {
      const iso = '2024-01-15T10:30:00.000Z';
      expect(validateCellValue(iso, col)).toBe(iso);
    });

    it('should accept ISO with timezone offset', () => {
      expect(validateCellValue('2024-01-15T10:30:00+05:30', col)).toBe('2024-01-15T10:30:00+05:30');
    });

    it('should reject invalid date format', () => {
      expect(() => validateCellValue('15/01/2024', col)).toThrow(DiamantValidationError);
      expect(() => validateCellValue('Jan 15, 2024', col)).toThrow(DiamantValidationError);
    });

    it('should reject non-string', () => {
      expect(() => validateCellValue(12345, col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- email ---

  describe('email', () => {
    const col = mockColumn('email', 'Email');

    it('should accept valid email', () => {
      expect(validateCellValue('user@example.com', col)).toBe('user@example.com');
    });

    it('should reject email without @', () => {
      expect(() => validateCellValue('userexample.com', col)).toThrow(DiamantValidationError);
    });

    it('should reject email without domain', () => {
      expect(() => validateCellValue('user@', col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- url ---

  describe('url', () => {
    const col = mockColumn('url', 'Website');

    it('should accept valid URL', () => {
      expect(validateCellValue('https://example.com', col)).toBe('https://example.com');
    });

    it('should accept URL with path', () => {
      expect(validateCellValue('https://example.com/path?q=1', col)).toBe('https://example.com/path?q=1');
    });

    it('should reject invalid URL', () => {
      expect(() => validateCellValue('not a url', col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- phone ---

  describe('phone', () => {
    const col = mockColumn('phone', 'Phone');

    it('should accept any string', () => {
      expect(validateCellValue('+1-555-0100', col)).toBe('+1-555-0100');
    });

    it('should reject non-string', () => {
      expect(() => validateCellValue(5550100, col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- currency ---

  describe('currency', () => {
    const col = mockColumn('currency', 'Price');

    it('should accept valid currency object', () => {
      const val = { amount: 19.99, currency: 'USD' };
      expect(validateCellValue(val, col)).toEqual(val);
    });

    it('should reject plain number', () => {
      expect(() => validateCellValue(19.99, col)).toThrow(DiamantValidationError);
    });

    it('should reject missing amount', () => {
      expect(() => validateCellValue({ currency: 'USD' }, col)).toThrow(DiamantValidationError);
    });

    it('should reject missing currency string', () => {
      expect(() => validateCellValue({ amount: 19.99 }, col)).toThrow(DiamantValidationError);
    });

    it('should reject Infinity amount', () => {
      expect(() => validateCellValue({ amount: Infinity, currency: 'USD' }, col)).toThrow(
        DiamantValidationError,
      );
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- percent ---

  describe('percent', () => {
    const col = mockColumn('percent', 'Rate');

    it('should accept a number', () => {
      expect(validateCellValue(0.5, col)).toBe(0.5);
    });

    it('should reject a string', () => {
      expect(() => validateCellValue('50%', col)).toThrow(DiamantValidationError);
    });

    it('should reject Infinity', () => {
      expect(() => validateCellValue(Infinity, col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- duration ---

  describe('duration', () => {
    const col = mockColumn('duration', 'Time');

    it('should accept a positive number', () => {
      expect(validateCellValue(3600, col)).toBe(3600);
    });

    it('should accept zero', () => {
      expect(validateCellValue(0, col)).toBe(0);
    });

    it('should reject negative number', () => {
      expect(() => validateCellValue(-1, col)).toThrow(DiamantValidationError);
    });

    it('should reject non-number', () => {
      expect(() => validateCellValue('1h', col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- rating ---

  describe('rating', () => {
    const col = mockColumn('rating', 'Stars', { max: 5 });

    it('should accept integer in range', () => {
      expect(validateCellValue(1, col)).toBe(1);
      expect(validateCellValue(5, col)).toBe(5);
    });

    it('should reject zero', () => {
      expect(() => validateCellValue(0, col)).toThrow(DiamantValidationError);
    });

    it('should reject value above max', () => {
      expect(() => validateCellValue(6, col)).toThrow(DiamantValidationError);
    });

    it('should reject float', () => {
      expect(() => validateCellValue(3.5, col)).toThrow(DiamantValidationError);
    });

    it('should reject non-number', () => {
      expect(() => validateCellValue('3', col)).toThrow(DiamantValidationError);
    });

    it('should use default max of 5 when no config', () => {
      const noConfigCol = mockColumn('rating', 'Stars');
      expect(validateCellValue(5, noConfigCol)).toBe(5);
      expect(() => validateCellValue(6, noConfigCol)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- richText ---

  describe('richText', () => {
    const col = mockColumn('richText', 'Content');

    it('should accept a string', () => {
      expect(validateCellValue('<p>Hello</p>', col)).toBe('<p>Hello</p>');
    });

    it('should reject a non-string', () => {
      expect(() => validateCellValue(42, col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- attachment ---

  describe('attachment', () => {
    const col = mockColumn('attachment', 'Files');

    it('should accept valid attachment array', () => {
      const att = [{ name: 'f.txt', path: '/tmp/f.txt', size: 100, mimeType: 'text/plain' }];
      expect(validateCellValue(att, col)).toEqual(att);
    });

    it('should accept empty array', () => {
      expect(validateCellValue([], col)).toEqual([]);
    });

    it('should reject non-array', () => {
      expect(() => validateCellValue('file.txt', col)).toThrow(DiamantValidationError);
    });

    it('should reject attachment missing required fields', () => {
      expect(() => validateCellValue([{ name: 'f' }], col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- singleSelect ---

  describe('singleSelect', () => {
    const options = [
      { id: 'opt1', name: 'Option 1' },
      { id: 'opt2', name: 'Option 2' },
    ];
    const col = mockColumn('singleSelect', 'Status', { options });

    it('should accept a valid option id', () => {
      expect(validateCellValue('opt1', col)).toBe('opt1');
    });

    it('should reject an invalid option id', () => {
      expect(() => validateCellValue('invalid', col)).toThrow(DiamantValidationError);
    });

    it('should reject non-string', () => {
      expect(() => validateCellValue(1, col)).toThrow(DiamantValidationError);
    });

    it('should accept any string when no options configured', () => {
      const noOptCol = mockColumn('singleSelect', 'Status');
      expect(validateCellValue('anything', noOptCol)).toBe('anything');
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- multiSelect ---

  describe('multiSelect', () => {
    const options = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ];
    const col = mockColumn('multiSelect', 'Tags', { options });

    it('should accept valid option ids', () => {
      expect(validateCellValue(['a', 'b'], col)).toEqual(['a', 'b']);
    });

    it('should accept empty array', () => {
      expect(validateCellValue([], col)).toEqual([]);
    });

    it('should reject invalid option id', () => {
      expect(() => validateCellValue(['a', 'invalid'], col)).toThrow(DiamantValidationError);
    });

    it('should reject non-array', () => {
      expect(() => validateCellValue('a', col)).toThrow(DiamantValidationError);
    });

    it('should reject array with non-string items', () => {
      expect(() => validateCellValue([1, 2], col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- link ---

  describe('link', () => {
    const col = mockColumn('link', 'Related', {
      linkedTableId: 'tbl-2',
      relationship: 'many-to-many',
    });

    it('should accept array of valid UUIDs', () => {
      const ids = ['550e8400-e29b-41d4-a716-446655440000'];
      expect(validateCellValue(ids, col)).toEqual(ids);
    });

    it('should accept empty array', () => {
      expect(validateCellValue([], col)).toEqual([]);
    });

    it('should reject non-array', () => {
      expect(() => validateCellValue('some-id', col)).toThrow(DiamantValidationError);
    });

    it('should reject non-UUID strings', () => {
      expect(() => validateCellValue(['not-a-uuid'], col)).toThrow(DiamantValidationError);
    });

    it('should return null for null', () => {
      expect(validateCellValue(null, col)).toBeNull();
    });
  });

  // --- Computed types are read-only ---

  describe('computed types', () => {
    it('should reject writes to autoNumber', () => {
      const col = mockColumn('autoNumber', 'Num');
      expect(() => validateCellValue(1, col)).toThrow(DiamantValidationError);
    });

    it('should reject writes to createdTime', () => {
      const col = mockColumn('createdTime', 'CT');
      expect(() => validateCellValue('2024-01-01', col)).toThrow(DiamantValidationError);
    });

    it('should reject writes to lastModifiedTime', () => {
      const col = mockColumn('lastModifiedTime', 'LMT');
      expect(() => validateCellValue('2024-01-01', col)).toThrow(DiamantValidationError);
    });

    it('should reject writes to formula', () => {
      const col = mockColumn('formula', 'F');
      expect(() => validateCellValue(42, col)).toThrow(DiamantValidationError);
    });

    it('should reject writes to lookup', () => {
      const col = mockColumn('lookup', 'L');
      expect(() => validateCellValue(['x'], col)).toThrow(DiamantValidationError);
    });

    it('should reject writes to rollup', () => {
      const col = mockColumn('rollup', 'R');
      expect(() => validateCellValue(100, col)).toThrow(DiamantValidationError);
    });

    it('should reject writes to count', () => {
      const col = mockColumn('count', 'C');
      expect(() => validateCellValue(5, col)).toThrow(DiamantValidationError);
    });
  });

  // --- Integration: column types work end-to-end in a table ---

  describe('end-to-end column type integration', () => {
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

    it('should store and retrieve all basic column types correctly', () => {
      table.addColumn({ name: 'text', type: 'text' });
      table.addColumn({ name: 'number', type: 'number' });
      table.addColumn({ name: 'checkbox', type: 'checkbox' });
      table.addColumn({ name: 'date', type: 'date' });
      table.addColumn({ name: 'email', type: 'email' });
      table.addColumn({ name: 'url', type: 'url' });
      table.addColumn({ name: 'phone', type: 'phone' });
      table.addColumn({ name: 'percent', type: 'percent' });
      table.addColumn({ name: 'duration', type: 'duration' });
      table.addColumn({ name: 'rating', type: 'rating', config: { max: 10 } });
      table.addColumn({ name: 'richText', type: 'richText' });

      const row = table.addRow({
        text: 'hello',
        number: 42,
        checkbox: true,
        date: '2024-06-15',
        email: 'a@b.com',
        url: 'https://example.com',
        phone: '+1-555-0100',
        percent: 0.95,
        duration: 7200,
        rating: 8,
        richText: '**bold**',
      });

      expect(row.cells.text).toBe('hello');
      expect(row.cells.number).toBe(42);
      expect(row.cells.checkbox).toBe(true);
      expect(row.cells.date).toBe('2024-06-15');
      expect(row.cells.email).toBe('a@b.com');
      expect(row.cells.url).toBe('https://example.com');
      expect(row.cells.phone).toBe('+1-555-0100');
      expect(row.cells.percent).toBe(0.95);
      expect(row.cells.duration).toBe(7200);
      expect(row.cells.rating).toBe(8);
      expect(row.cells.richText).toBe('**bold**');
    });

    it('should store and retrieve currency correctly', () => {
      table.addColumn({ name: 'price', type: 'currency' });
      const row = table.addRow({ price: { amount: 49.99, currency: 'EUR' } });
      expect(row.cells.price).toEqual({ amount: 49.99, currency: 'EUR' });
    });

    it('should store and retrieve attachment correctly', () => {
      table.addColumn({ name: 'files', type: 'attachment' });
      const att = [
        { name: 'doc.pdf', path: '/files/doc.pdf', size: 2048, mimeType: 'application/pdf' },
      ];
      const row = table.addRow({ files: att });
      expect(row.cells.files).toEqual(att);
    });

    it('should coerce string to number in a table', () => {
      table.addColumn({ name: 'val', type: 'number' });
      const row = table.addRow({ val: '123.45' });
      expect(row.cells.val).toBe(123.45);
    });

    it('should coerce checkbox values in a table', () => {
      table.addColumn({ name: 'done', type: 'checkbox' });
      const r1 = table.addRow({ done: 1 });
      const r2 = table.addRow({ done: 0 });
      const r3 = table.addRow({ done: null });
      expect(r1.cells.done).toBe(true);
      expect(r2.cells.done).toBe(false);
      expect(r3.cells.done).toBe(false);
    });
  });
});
