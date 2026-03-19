import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Diamant, DiamantNotFoundError } from '../src/index.js';

describe('Base and Table CRUD', () => {
  let db: Diamant;

  beforeEach(() => {
    db = new Diamant(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // --- Base CRUD ---

  describe('createBase', () => {
    it('should create a base with a name', () => {
      const base = db.createBase('My Base');
      expect(base.name).toBe('My Base');
      expect(base.id).toBeDefined();
      expect(base.createdAt).toBeDefined();
      expect(base.updatedAt).toBeDefined();
    });

    it('should create multiple bases with unique ids', () => {
      const a = db.createBase('Base A');
      const b = db.createBase('Base B');
      expect(a.id).not.toBe(b.id);
      expect(a.name).toBe('Base A');
      expect(b.name).toBe('Base B');
    });
  });

  describe('getBase', () => {
    it('should retrieve a base by id', () => {
      const created = db.createBase('Test');
      const fetched = db.getBase(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Test');
    });

    it('should throw DiamantNotFoundError for nonexistent base', () => {
      expect(() => db.getBase('nonexistent-id')).toThrow(DiamantNotFoundError);
    });
  });

  describe('listBases', () => {
    it('should return empty array when no bases exist', () => {
      expect(db.listBases()).toEqual([]);
    });

    it('should list all created bases in order', () => {
      db.createBase('First');
      db.createBase('Second');
      db.createBase('Third');
      const bases = db.listBases();
      expect(bases).toHaveLength(3);
      expect(bases[0].name).toBe('First');
      expect(bases[1].name).toBe('Second');
      expect(bases[2].name).toBe('Third');
    });
  });

  describe('deleteBase', () => {
    it('should delete a base', () => {
      const base = db.createBase('To Delete');
      db.deleteBase(base.id);
      expect(db.listBases()).toHaveLength(0);
    });

    it('should throw DiamantNotFoundError when deleting nonexistent base', () => {
      expect(() => db.deleteBase('nonexistent-id')).toThrow(DiamantNotFoundError);
    });

    it('should cascade delete tables when base is deleted', () => {
      const base = db.createBase('Parent');
      base.createTable('Child 1');
      base.createTable('Child 2');
      expect(base.listTables()).toHaveLength(2);

      db.deleteBase(base.id);
      expect(db.listBases()).toHaveLength(0);

      // Re-creating the base should have no leftover tables
      const newBase = db.createBase('Fresh');
      expect(newBase.listTables()).toHaveLength(0);
    });
  });

  // --- Table CRUD within a Base ---

  describe('createTable', () => {
    it('should create a table within a base', () => {
      const base = db.createBase('B');
      const table = base.createTable('Users');
      expect(table.name).toBe('Users');
      expect(table.id).toBeDefined();
      expect(table.baseId).toBe(base.id);
    });

    it('should allow multiple tables in the same base', () => {
      const base = db.createBase('B');
      const t1 = base.createTable('Users');
      const t2 = base.createTable('Orders');
      expect(t1.id).not.toBe(t2.id);
      expect(base.listTables()).toHaveLength(2);
    });
  });

  describe('getTable', () => {
    it('should retrieve a table by id', () => {
      const base = db.createBase('B');
      const created = base.createTable('T');
      const fetched = base.getTable(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('T');
    });

    it('should throw DiamantNotFoundError for nonexistent table', () => {
      const base = db.createBase('B');
      expect(() => base.getTable('nonexistent-id')).toThrow(DiamantNotFoundError);
    });

    it('should not return a table from a different base', () => {
      const base1 = db.createBase('B1');
      const base2 = db.createBase('B2');
      const table = base1.createTable('T');
      expect(() => base2.getTable(table.id)).toThrow(DiamantNotFoundError);
    });
  });

  describe('listTables', () => {
    it('should return empty array when no tables exist', () => {
      const base = db.createBase('B');
      expect(base.listTables()).toEqual([]);
    });

    it('should list tables in creation order', () => {
      const base = db.createBase('B');
      base.createTable('Alpha');
      base.createTable('Beta');
      const tables = base.listTables();
      expect(tables).toHaveLength(2);
      expect(tables[0].name).toBe('Alpha');
      expect(tables[1].name).toBe('Beta');
    });
  });

  describe('deleteTable', () => {
    it('should delete a table from a base', () => {
      const base = db.createBase('B');
      const table = base.createTable('T');
      base.deleteTable(table.id);
      expect(base.listTables()).toHaveLength(0);
    });

    it('should throw DiamantNotFoundError when deleting nonexistent table', () => {
      const base = db.createBase('B');
      expect(() => base.deleteTable('nonexistent-id')).toThrow(DiamantNotFoundError);
    });

    it('should delete a table and its columns and rows', () => {
      const base = db.createBase('B');
      const table = base.createTable('T');
      table.addColumn({ name: 'Name', type: 'text' });
      table.addRow({ Name: 'Alice' });
      expect(table.getRows()).toHaveLength(1);

      base.deleteTable(table.id);
      expect(base.listTables()).toHaveLength(0);
    });
  });

  describe('renameTable', () => {
    it('should rename a table', () => {
      const base = db.createBase('B');
      const table = base.createTable('Old Name');
      const renamed = base.renameTable(table.id, 'New Name');
      expect(renamed.name).toBe('New Name');
    });

    it('should throw DiamantNotFoundError for nonexistent table', () => {
      const base = db.createBase('B');
      expect(() => base.renameTable('nonexistent-id', 'X')).toThrow(DiamantNotFoundError);
    });
  });

  // --- Deletion cascade verification ---

  describe('cascade deletion', () => {
    it('should remove all tables when base is deleted', () => {
      const base = db.createBase('B');
      const t1 = base.createTable('T1');
      const t2 = base.createTable('T2');
      t1.addColumn({ name: 'Col', type: 'text' });
      t1.addRow({ Col: 'data' });
      t2.addColumn({ name: 'Num', type: 'number' });
      t2.addRow({ Num: 42 });

      db.deleteBase(base.id);

      // Both tables should be gone; accessing them from a new base should fail
      expect(() => db.getBase(base.id)).toThrow(DiamantNotFoundError);
    });

    it('should remove link columns in other tables when linked table is deleted', () => {
      const base = db.createBase('B');
      const projects = base.createTable('Projects');
      const tasks = base.createTable('Tasks');

      projects.addColumn({ name: 'Name', type: 'text' });
      tasks.addColumn({ name: 'Title', type: 'text' });
      tasks.addColumn({
        name: 'Project',
        type: 'link',
        config: { linkedTableId: projects.id, relationship: 'many-to-many' },
      });

      // Tasks table should have the link column, projects should have symmetric
      const projectCols = projects.listColumns();
      const symCol = projectCols.find((c) => c.type === 'link');
      expect(symCol).toBeDefined();

      // Delete the projects table
      base.deleteTable(projects.id);

      // The symmetric link column in tasks should have been cleaned up
      const taskCols = tasks.listColumns();
      const linkCol = taskCols.find((c) => c.type === 'link');
      expect(linkCol).toBeUndefined();
    });
  });
});
