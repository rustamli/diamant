import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Diamant } from '../src/index.js';
import type { Table, Base } from '../src/index.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('Import/Export — CSV and JSON', () => {
  let db: Diamant;
  let base: Base;
  let table: Table;
  let tmpDir: string;

  beforeEach(() => {
    db = new Diamant(':memory:');
    base = db.createBase('TestBase');
    table = base.createTable('TestTable');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamant-test-'));
  });

  afterEach(() => {
    db.close();
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // --- CSV Export ---

  describe('exportCSV', () => {
    it('should export columns and rows as CSV', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'Age', type: 'number' });

      table.addRow({ Name: 'Alice', Age: 30 });
      table.addRow({ Name: 'Bob', Age: 25 });

      const csvPath = path.join(tmpDir, 'export.csv');
      table.exportCSV(csvPath);

      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.split('\n');

      expect(lines[0]).toBe('Name,Age');
      expect(lines[1]).toBe('Alice,30');
      expect(lines[2]).toBe('Bob,25');
    });

    it('should exclude computed columns from CSV export', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'Num', type: 'autoNumber' });
      table.addColumn({
        name: 'Greeting',
        type: 'formula',
        config: { expression: "CONCAT('Hi ', {Name})" },
      });

      table.addRow({ Name: 'Alice' });

      const csvPath = path.join(tmpDir, 'computed.csv');
      table.exportCSV(csvPath);

      const content = fs.readFileSync(csvPath, 'utf-8');
      const header = content.split('\n')[0];
      // Only non-computed columns
      expect(header).toBe('Name');
    });

    it('should handle empty table', () => {
      table.addColumn({ name: 'Name', type: 'text' });

      const csvPath = path.join(tmpDir, 'empty.csv');
      table.exportCSV(csvPath);

      const content = fs.readFileSync(csvPath, 'utf-8');
      expect(content.trim()).toBe('Name');
    });

    it('should escape commas in values', () => {
      table.addColumn({ name: 'Note', type: 'text' });
      table.addRow({ Note: 'Hello, World' });

      const csvPath = path.join(tmpDir, 'comma.csv');
      table.exportCSV(csvPath);

      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.split('\n');
      expect(lines[1]).toBe('"Hello, World"');
    });

    it('should escape double quotes in values', () => {
      table.addColumn({ name: 'Note', type: 'text' });
      table.addRow({ Note: 'She said "hi"' });

      const csvPath = path.join(tmpDir, 'quotes.csv');
      table.exportCSV(csvPath);

      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.split('\n');
      expect(lines[1]).toBe('"She said ""hi"""');
    });

    it('should handle null values as empty strings', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'City', type: 'text' });
      table.addRow({ Name: 'Alice' });

      const csvPath = path.join(tmpDir, 'nulls.csv');
      table.exportCSV(csvPath);

      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.split('\n');
      expect(lines[1]).toBe('Alice,');
    });
  });

  // --- CSV Import ---

  describe('importCSV', () => {
    it('should import CSV data into the table', () => {
      const csvPath = path.join(tmpDir, 'import.csv');
      fs.writeFileSync(csvPath, 'Name,City\nAlice,NYC\nBob,LA', 'utf-8');

      table.importCSV(csvPath);

      const cols = table.listColumns();
      expect(cols.some((c) => c.name === 'Name')).toBe(true);
      expect(cols.some((c) => c.name === 'City')).toBe(true);

      const rows = table.getRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].cells.Name).toBe('Alice');
      expect(rows[0].cells.City).toBe('NYC');
      expect(rows[1].cells.Name).toBe('Bob');
      expect(rows[1].cells.City).toBe('LA');
    });

    it('should auto-create text columns for new headers', () => {
      const csvPath = path.join(tmpDir, 'auto.csv');
      fs.writeFileSync(csvPath, 'A,B,C\n1,2,3', 'utf-8');

      table.importCSV(csvPath);

      const cols = table.listColumns();
      expect(cols).toHaveLength(3);
      expect(cols.every((c) => c.type === 'text')).toBe(true);
    });

    it('should handle CSV with special characters', () => {
      const csvPath = path.join(tmpDir, 'special.csv');
      fs.writeFileSync(
        csvPath,
        'Name,Note\nAlice,"Hello, World"\nBob,"She said ""hi"""',
        'utf-8',
      );

      table.importCSV(csvPath);

      const rows = table.getRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].cells.Note).toBe('Hello, World');
      expect(rows[1].cells.Note).toBe('She said "hi"');
    });

    it('should handle empty CSV file', () => {
      const csvPath = path.join(tmpDir, 'empty.csv');
      fs.writeFileSync(csvPath, '', 'utf-8');

      table.importCSV(csvPath);

      expect(table.getRows()).toHaveLength(0);
    });

    it('should not create duplicate columns for existing headers', () => {
      table.addColumn({ name: 'Name', type: 'text' });

      const csvPath = path.join(tmpDir, 'existing.csv');
      fs.writeFileSync(csvPath, 'Name,City\nAlice,NYC', 'utf-8');

      table.importCSV(csvPath);

      const cols = table.listColumns();
      const nameCount = cols.filter((c) => c.name === 'Name').length;
      expect(nameCount).toBe(1);
    });
  });

  // --- CSV roundtrip ---

  describe('CSV roundtrip', () => {
    it('should export and re-import identical data', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'Score', type: 'number' });

      table.addRow({ Name: 'Alice', Score: 95 });
      table.addRow({ Name: 'Bob', Score: 87 });

      const csvPath = path.join(tmpDir, 'roundtrip.csv');
      table.exportCSV(csvPath);

      // Import into a new table
      const importTable = base.createTable('Imported');
      importTable.importCSV(csvPath);

      const rows = importTable.getRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].cells.Name).toBe('Alice');
      // Note: CSV imports as text, so Score will be string "95"
      expect(rows[0].cells.Score).toBe('95');
    });
  });

  // --- JSON Export ---

  describe('exportJSON', () => {
    it('should export base data as JSON', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addRow({ Name: 'Alice' });

      const jsonPath = path.join(tmpDir, 'export.json');
      base.exportJSON(jsonPath);

      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(content.base.name).toBe('TestBase');
      expect(content.tables).toHaveLength(1);
      expect(content.tables[0].name).toBe('TestTable');
      expect(content.tables[0].rows).toHaveLength(1);
      expect(content.tables[0].rows[0].cells.Name).toBe('Alice');
    });

    it('should include column definitions in JSON', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'Age', type: 'number' });

      const jsonPath = path.join(tmpDir, 'cols.json');
      base.exportJSON(jsonPath);

      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      const cols = content.tables[0].columns;
      expect(cols.some((c: any) => c.name === 'Name' && c.type === 'text')).toBe(true);
      expect(cols.some((c: any) => c.name === 'Age' && c.type === 'number')).toBe(true);
    });
  });

  // --- JSON Import ---

  describe('importJSON', () => {
    it('should import JSON data into the base', () => {
      const jsonPath = path.join(tmpDir, 'import.json');
      const data = {
        base: { id: 'test-id', name: 'Imported' },
        tables: [
          {
            name: 'People',
            columns: [
              { name: 'Name', type: 'text' },
              { name: 'Age', type: 'number' },
            ],
            rows: [
              { cells: { Name: 'Alice', Age: 30 } },
              { cells: { Name: 'Bob', Age: 25 } },
            ],
          },
        ],
      };
      fs.writeFileSync(jsonPath, JSON.stringify(data), 'utf-8');

      base.importJSON(jsonPath);

      const tables = base.listTables();
      const peopleTable = tables.find((t) => t.name === 'People');
      expect(peopleTable).toBeDefined();

      const rows = peopleTable!.getRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].cells.Name).toBe('Alice');
      expect(rows[0].cells.Age).toBe(30);
    });

    it('should skip computed column types on import', () => {
      const jsonPath = path.join(tmpDir, 'computed.json');
      const data = {
        tables: [
          {
            name: 'Data',
            columns: [
              { name: 'Name', type: 'text' },
              { name: 'Num', type: 'autoNumber' },
              { name: 'CT', type: 'createdTime' },
              { name: 'LMT', type: 'lastModifiedTime' },
            ],
            rows: [{ cells: { Name: 'Alice' } }],
          },
        ],
      };
      fs.writeFileSync(jsonPath, JSON.stringify(data), 'utf-8');

      base.importJSON(jsonPath);

      const tables = base.listTables();
      const dataTable = tables.find((t) => t.name === 'Data');
      expect(dataTable).toBeDefined();

      const cols = dataTable!.listColumns();
      // autoNumber, createdTime, lastModifiedTime should be skipped
      expect(cols.some((c) => c.type === 'autoNumber')).toBe(false);
      expect(cols.some((c) => c.type === 'createdTime')).toBe(false);
      expect(cols.some((c) => c.type === 'lastModifiedTime')).toBe(false);
      expect(cols.some((c) => c.name === 'Name' && c.type === 'text')).toBe(true);
    });
  });

  // --- JSON roundtrip ---

  describe('JSON roundtrip', () => {
    it('should export and import preserving data', () => {
      table.addColumn({ name: 'Name', type: 'text' });
      table.addColumn({ name: 'Active', type: 'checkbox' });

      table.addRow({ Name: 'Alice', Active: true });
      table.addRow({ Name: 'Bob', Active: false });

      const jsonPath = path.join(tmpDir, 'roundtrip.json');
      base.exportJSON(jsonPath);

      // Import into a new base
      const newBase = db.createBase('ImportedBase');
      newBase.importJSON(jsonPath);

      const tables = newBase.listTables();
      const importedTable = tables.find((t) => t.name === 'TestTable');
      expect(importedTable).toBeDefined();

      const rows = importedTable!.getRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].cells.Name).toBe('Alice');
      expect(rows[0].cells.Active).toBe(true);
      expect(rows[1].cells.Name).toBe('Bob');
      expect(rows[1].cells.Active).toBe(false);
    });

    it('should handle multiple tables in JSON roundtrip', () => {
      const table2 = base.createTable('SecondTable');
      table.addColumn({ name: 'X', type: 'text' });
      table2.addColumn({ name: 'Y', type: 'number' });

      table.addRow({ X: 'hello' });
      table2.addRow({ Y: 42 });

      const jsonPath = path.join(tmpDir, 'multi.json');
      base.exportJSON(jsonPath);

      const newBase = db.createBase('Multi');
      newBase.importJSON(jsonPath);

      const tables = newBase.listTables();
      expect(tables).toHaveLength(2);

      const imported1 = tables.find((t) => t.name === 'TestTable');
      const imported2 = tables.find((t) => t.name === 'SecondTable');
      expect(imported1).toBeDefined();
      expect(imported2).toBeDefined();

      expect(imported1!.getRows()[0].cells.X).toBe('hello');
      expect(imported2!.getRows()[0].cells.Y).toBe(42);
    });
  });
});
