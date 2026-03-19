import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Diamant } from '../src/index.js';
import type { Table, Filter, SortSpec } from '../src/index.js';

describe('Query — filter, sort, pagination', () => {
  let db: Diamant;
  let table: Table;

  beforeEach(() => {
    db = new Diamant(':memory:');
    const base = db.createBase('B');
    table = base.createTable('People');

    table.addColumn({ name: 'Name', type: 'text' });
    table.addColumn({ name: 'Age', type: 'number' });
    table.addColumn({ name: 'Active', type: 'checkbox' });
    table.addColumn({ name: 'City', type: 'text' });

    table.addRow({ Name: 'Alice', Age: 30, Active: true, City: 'NYC' });
    table.addRow({ Name: 'Bob', Age: 25, Active: false, City: 'LA' });
    table.addRow({ Name: 'Charlie', Age: 35, Active: true, City: 'NYC' });
    table.addRow({ Name: 'Diana', Age: 28, Active: true, City: 'Chicago' });
    table.addRow({ Name: 'Eve', Age: 22, Active: false, City: 'LA' });
  });

  afterEach(() => {
    db.close();
  });

  // --- Filter operators ---

  describe('filter: eq', () => {
    it('should filter by equality', () => {
      const rows = table.getRows({
        filter: { field: 'Name', operator: 'eq', value: 'Alice' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].cells.Name).toBe('Alice');
    });

    it('should filter by numeric equality', () => {
      const rows = table.getRows({
        filter: { field: 'Age', operator: 'eq', value: 25 },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].cells.Name).toBe('Bob');
    });
  });

  describe('filter: neq', () => {
    it('should filter by inequality', () => {
      const rows = table.getRows({
        filter: { field: 'City', operator: 'neq', value: 'NYC' },
      });
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.cells.City !== 'NYC')).toBe(true);
    });
  });

  describe('filter: gt / gte', () => {
    it('should filter gt', () => {
      const rows = table.getRows({
        filter: { field: 'Age', operator: 'gt', value: 30 },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].cells.Name).toBe('Charlie');
    });

    it('should filter gte', () => {
      const rows = table.getRows({
        filter: { field: 'Age', operator: 'gte', value: 30 },
      });
      expect(rows).toHaveLength(2);
    });
  });

  describe('filter: lt / lte', () => {
    it('should filter lt', () => {
      const rows = table.getRows({
        filter: { field: 'Age', operator: 'lt', value: 25 },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].cells.Name).toBe('Eve');
    });

    it('should filter lte', () => {
      const rows = table.getRows({
        filter: { field: 'Age', operator: 'lte', value: 25 },
      });
      expect(rows).toHaveLength(2);
    });
  });

  describe('filter: contains', () => {
    it('should match substring (case-insensitive)', () => {
      const rows = table.getRows({
        filter: { field: 'Name', operator: 'contains', value: 'ali' },
      });
      // "ali" is in "Alice" (case-insensitive), but not in "Charlie" (which has "arli")
      expect(rows).toHaveLength(1);
      expect(rows[0].cells.Name).toBe('Alice');
    });

    it('should match multiple rows with common substring', () => {
      const rows = table.getRows({
        filter: { field: 'City', operator: 'contains', value: 'c' },
      });
      // "c" is in "NYC" and "Chicago" (case-insensitive)
      expect(rows).toHaveLength(3); // Alice(NYC), Charlie(NYC), Diana(Chicago)
    });
  });

  describe('filter: notContains', () => {
    it('should exclude substring', () => {
      const rows = table.getRows({
        filter: { field: 'Name', operator: 'notContains', value: 'ali' },
      });
      // Everyone except Alice
      expect(rows).toHaveLength(4);
    });
  });

  describe('filter: isEmpty / isNotEmpty', () => {
    it('should find empty values', () => {
      // Add a row with no city
      table.addRow({ Name: 'Frank', Age: 40 });

      const rows = table.getRows({
        filter: { field: 'City', operator: 'isEmpty' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].cells.Name).toBe('Frank');
    });

    it('should find non-empty values', () => {
      table.addRow({ Name: 'Frank', Age: 40 });

      const rows = table.getRows({
        filter: { field: 'City', operator: 'isNotEmpty' },
      });
      expect(rows).toHaveLength(5); // original 5 rows
    });
  });

  describe('filter: isAnyOf', () => {
    it('should match any of the given values', () => {
      const rows = table.getRows({
        filter: { field: 'City', operator: 'isAnyOf', value: ['NYC', 'Chicago'] },
      });
      expect(rows).toHaveLength(3); // Alice, Charlie, Diana
    });
  });

  // --- Compound filters ---

  describe('compound filters', () => {
    it('should combine with AND', () => {
      const filter: Filter = {
        conjunction: 'and',
        filters: [
          { field: 'City', operator: 'eq', value: 'NYC' },
          { field: 'Age', operator: 'gt', value: 30 },
        ],
      };
      const rows = table.getRows({ filter });
      expect(rows).toHaveLength(1);
      expect(rows[0].cells.Name).toBe('Charlie');
    });

    it('should combine with OR', () => {
      const filter: Filter = {
        conjunction: 'or',
        filters: [
          { field: 'City', operator: 'eq', value: 'Chicago' },
          { field: 'Age', operator: 'lt', value: 23 },
        ],
      };
      const rows = table.getRows({ filter });
      expect(rows).toHaveLength(2); // Diana, Eve
    });

    it('should handle nested compound filters', () => {
      const filter: Filter = {
        conjunction: 'and',
        filters: [
          { field: 'Active', operator: 'eq', value: true },
          {
            conjunction: 'or',
            filters: [
              { field: 'City', operator: 'eq', value: 'NYC' },
              { field: 'City', operator: 'eq', value: 'Chicago' },
            ],
          },
        ],
      };
      const rows = table.getRows({ filter });
      expect(rows).toHaveLength(3); // Alice, Charlie, Diana
    });
  });

  // --- Sorting ---

  describe('sorting', () => {
    it('should sort ascending by number', () => {
      const rows = table.getRows({
        sort: [{ field: 'Age', direction: 'asc' }],
      });
      expect(rows[0].cells.Name).toBe('Eve');       // 22
      expect(rows[1].cells.Name).toBe('Bob');        // 25
      expect(rows[4].cells.Name).toBe('Charlie');    // 35
    });

    it('should sort descending by number', () => {
      const rows = table.getRows({
        sort: [{ field: 'Age', direction: 'desc' }],
      });
      expect(rows[0].cells.Name).toBe('Charlie');   // 35
      expect(rows[4].cells.Name).toBe('Eve');        // 22
    });

    it('should sort ascending by string', () => {
      const rows = table.getRows({
        sort: [{ field: 'Name', direction: 'asc' }],
      });
      expect(rows[0].cells.Name).toBe('Alice');
      expect(rows[4].cells.Name).toBe('Eve');
    });

    it('should sort descending by string', () => {
      const rows = table.getRows({
        sort: [{ field: 'Name', direction: 'desc' }],
      });
      expect(rows[0].cells.Name).toBe('Eve');
      expect(rows[4].cells.Name).toBe('Alice');
    });

    it('should sort by boolean', () => {
      const rows = table.getRows({
        sort: [{ field: 'Active', direction: 'asc' }],
      });
      // false (0) comes before true (1)
      expect(rows[0].cells.Active).toBe(false);
      expect(rows[1].cells.Active).toBe(false);
      expect(rows[2].cells.Active).toBe(true);
    });

    it('should handle multi-field sort', () => {
      const rows = table.getRows({
        sort: [
          { field: 'City', direction: 'asc' },
          { field: 'Age', direction: 'desc' },
        ],
      });
      // Chicago first (Diana), then LA (Bob, Eve), then NYC (Charlie, Alice)
      expect(rows[0].cells.City).toBe('Chicago');
      // Within LA: Bob(25) before Eve(22) because desc by age
      const laRows = rows.filter((r) => r.cells.City === 'LA');
      expect((laRows[0].cells.Age as number)).toBeGreaterThan(laRows[1].cells.Age as number);
    });
  });

  // --- Pagination ---

  describe('pagination', () => {
    it('should limit results', () => {
      const rows = table.getRows({ limit: 2 });
      expect(rows).toHaveLength(2);
    });

    it('should offset results', () => {
      const allRows = table.getRows();
      const offsetRows = table.getRows({ offset: 3 });
      expect(offsetRows).toHaveLength(2);
      expect(offsetRows[0].id).toBe(allRows[3].id);
    });

    it('should combine limit and offset', () => {
      const allRows = table.getRows();
      const page = table.getRows({ limit: 2, offset: 1 });
      expect(page).toHaveLength(2);
      expect(page[0].id).toBe(allRows[1].id);
      expect(page[1].id).toBe(allRows[2].id);
    });

    it('should return empty when offset exceeds count', () => {
      const rows = table.getRows({ offset: 100 });
      expect(rows).toHaveLength(0);
    });
  });

  // --- Combined filter + sort + pagination ---

  describe('combined filter + sort + pagination', () => {
    it('should filter, then sort, then paginate', () => {
      const rows = table.getRows({
        filter: { field: 'Active', operator: 'eq', value: true },
        sort: [{ field: 'Age', direction: 'asc' }],
        limit: 2,
        offset: 0,
      });

      // Active: Alice(30), Charlie(35), Diana(28) -> sorted by age: Diana(28), Alice(30), Charlie(35)
      expect(rows).toHaveLength(2);
      expect(rows[0].cells.Name).toBe('Diana');
      expect(rows[1].cells.Name).toBe('Alice');
    });

    it('should handle filter + sort + offset + limit', () => {
      const rows = table.getRows({
        filter: { field: 'City', operator: 'isAnyOf', value: ['NYC', 'LA'] },
        sort: [{ field: 'Age', direction: 'asc' }],
        limit: 2,
        offset: 1,
      });

      // Matching: Eve(22,LA), Bob(25,LA), Alice(30,NYC), Charlie(35,NYC)
      // Sorted by age: Eve, Bob, Alice, Charlie
      // offset=1, limit=2: Bob, Alice
      expect(rows).toHaveLength(2);
      expect(rows[0].cells.Name).toBe('Bob');
      expect(rows[1].cells.Name).toBe('Alice');
    });
  });
});
