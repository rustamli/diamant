import Database from 'better-sqlite3';

const DB_FILE = 'diamant.db'; // ':memory:' for in-memory DB

class DiamantDB {
  constructor(dbPath = DB_FILE) {
    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    // Create tables schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS columns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        options TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_columns_table_id ON columns(table_id);

      CREATE TABLE IF NOT EXISTS rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_rows_table_id ON rows(table_id);

      CREATE TABLE IF NOT EXISTS cells (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        row_id INTEGER NOT NULL,
        column_id INTEGER NOT NULL,
        value TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (row_id) REFERENCES rows(id) ON DELETE CASCADE,
        FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE,
        UNIQUE(row_id, column_id)
      );

      CREATE INDEX IF NOT EXISTS idx_cells_row_id ON cells(row_id);
      CREATE INDEX IF NOT EXISTS idx_cells_column_id ON cells(column_id);
    `);
  }

  close() {
    this.db.close();
  }
}

// ============================================================================
// DataTable Class
// ============================================================================

class DataTable {
  constructor(db, id = null, name = '') {
    this.db = db;
    this.id = id;
    this.name = name;
    this.createdAt = new Date().toISOString();
  }

  static create(db, name) {
    const createdAt = new Date().toISOString();
    const stmt = db.db.prepare('INSERT INTO tables (name, created_at) VALUES (?, ?)');
    const info = stmt.run(name, createdAt);
    
    const table = new DataTable(db, info.lastInsertRowid, name);
    table.createdAt = createdAt;
    return table;
  }

  static get(db, id) {
    const stmt = db.db.prepare('SELECT * FROM tables WHERE id = ?');
    const data = stmt.get(id);
    if (!data) return null;
    
    const table = new DataTable(db, data.id, data.name);
    table.createdAt = data.created_at;
    return table;
  }

  static getAll(db) {
    const stmt = db.db.prepare('SELECT * FROM tables');
    const tables = stmt.all();
    return tables.map(t => {
      const table = new DataTable(db, t.id, t.name);
      table.createdAt = t.created_at;
      return table;
    });
  }

  addColumn(name, type = 'text', options = {}) {
    return TableColumn.create(this.db, this.id, name, type, options);
  }

  getColumns() {
    return TableColumn.getByTable(this.db, this.id);
  }

  addRow(position = null) {
    return TableRow.create(this.db, this.id, position);
  }

  getRows() {
    return TableRow.getByTable(this.db, this.id);
  }

  getData() {
    const columns = this.getColumns();
    const rows = this.getRows();
    
    const data = [];
    for (const row of rows) {
      const rowData = { _rowId: row.id, _position: row.position };
      for (const col of columns) {
        const cell = CellData.get(this.db, row.id, col.id);
        rowData[col.name] = cell ? cell.value : null;
      }
      data.push(rowData);
    }
    return data;
  }

  delete() {
    const stmt = this.db.db.prepare('DELETE FROM tables WHERE id = ?');
    stmt.run(this.id);
  }

  printTable() {
    const columns = this.getColumns();
    const rows = this.getRows();
    
    if (columns.length === 0) {
      console.log(`Table "${this.name}" has no columns.`);
      return;
    }

    // Prepare data with column names
    const colNames = ['_row', ...columns.map(c => c.name)];
    const data = rows.map(row => {
      const rowData = [row.position];
      for (const col of columns) {
        const cell = CellData.get(this.db, row.id, col.id);
        let value = cell ? cell.value : null;
        // Format value for display
        if (value === null || value === undefined) {
          value = '';
        } else if (typeof value === 'object') {
          value = JSON.stringify(value);
        } else {
          value = String(value);
        }
        rowData.push(value);
      }
      return rowData;
    });

    // Calculate column widths
    const widths = colNames.map((name, i) => {
      const headerWidth = name.length;
      const dataWidth = Math.max(...data.map(row => String(row[i]).length), 0);
      return Math.max(headerWidth, dataWidth, 3); // Minimum width of 3
    });

    // Helper functions
    const pad = (str, width) => {
      str = String(str);
      return str + ' '.repeat(Math.max(0, width - str.length));
    };

    const line = (char = '─', cross = '┼') => {
      const parts = widths.map(w => char.repeat(w + 2));
      return '├' + parts.join(cross) + '┤';
    };

    const topLine = () => {
      const parts = widths.map(w => '─'.repeat(w + 2));
      return '┌' + parts.join('┬') + '┐';
    };

    const bottomLine = () => {
      const parts = widths.map(w => '─'.repeat(w + 2));
      return '└' + parts.join('┴') + '┘';
    };

    const row = (cells) => {
      const formatted = cells.map((cell, i) => ' ' + pad(cell, widths[i]) + ' ');
      return '│' + formatted.join('│') + '│';
    };

    // Print table
    console.log(`\nTable: ${this.name} (ID: ${this.id})`);
    console.log(topLine());
    console.log(row(colNames));
    console.log(line('═', '╪'));
    
    if (data.length === 0) {
      const emptyRow = widths.map(() => '');
      console.log(row(emptyRow));
    } else {
      data.forEach(rowData => {
        console.log(row(rowData));
      });
    }
    
    console.log(bottomLine());
    console.log(`${data.length} row(s)\n`);
  }
}

// ============================================================================
// TableColumn Class
// ============================================================================

class TableColumn {
  constructor(db, id = null, tableId, name, type = 'text', options = {}) {
    this.db = db;
    this.id = id;
    this.tableId = tableId;
    this.name = name;
    this.type = type; // text, number, boolean, date, reference
    this.options = options; // { referenceTableId: x } for reference types
    this.createdAt = new Date().toISOString();
  }

  static create(db, tableId, name, type = 'text', options = {}) {
    const createdAt = new Date().toISOString();
    const optionsJson = JSON.stringify(options);
    
    const stmt = db.db.prepare(
      'INSERT INTO columns (table_id, name, type, options, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(tableId, name, type, optionsJson, createdAt);
    
    const column = new TableColumn(db, info.lastInsertRowid, tableId, name, type, options);
    column.createdAt = createdAt;
    return column;
  }

  static getByTable(db, tableId) {
    const stmt = db.db.prepare('SELECT * FROM columns WHERE table_id = ?');
    const columns = stmt.all(tableId);
    return columns.map(c => {
      const col = new TableColumn(
        db, 
        c.id, 
        c.table_id, 
        c.name, 
        c.type, 
        c.options ? JSON.parse(c.options) : {}
      );
      col.createdAt = c.created_at;
      return col;
    });
  }

  static get(db, id) {
    const stmt = db.db.prepare('SELECT * FROM columns WHERE id = ?');
    const data = stmt.get(id);
    if (!data) return null;
    
    const col = new TableColumn(
      db, 
      data.id, 
      data.table_id, 
      data.name, 
      data.type, 
      data.options ? JSON.parse(data.options) : {}
    );
    col.createdAt = data.created_at;
    return col;
  }
}

// ============================================================================
// TableRow Class
// ============================================================================

class TableRow {
  constructor(db, id = null, tableId, position = 0) {
    this.db = db;
    this.id = id;
    this.tableId = tableId;
    this.position = position;
    this.createdAt = new Date().toISOString();
  }

  static create(db, tableId, position = null) {
    // If no position specified, add at the end
    if (position === null) {
      const stmt = db.db.prepare('SELECT COUNT(*) as count FROM rows WHERE table_id = ?');
      const result = stmt.get(tableId);
      position = result.count;
    }

    const createdAt = new Date().toISOString();
    const stmt = db.db.prepare(
      'INSERT INTO rows (table_id, position, created_at) VALUES (?, ?, ?)'
    );
    const info = stmt.run(tableId, position, createdAt);
    
    const row = new TableRow(db, info.lastInsertRowid, tableId, position);
    row.createdAt = createdAt;
    return row;
  }

  static getByTable(db, tableId) {
    const stmt = db.db.prepare('SELECT * FROM rows WHERE table_id = ? ORDER BY position');
    const rows = stmt.all(tableId);
    return rows.map(r => {
      const row = new TableRow(db, r.id, r.table_id, r.position);
      row.createdAt = r.created_at;
      return row;
    });
  }

  static get(db, id) {
    const stmt = db.db.prepare('SELECT * FROM rows WHERE id = ?');
    const data = stmt.get(id);
    if (!data) return null;
    
    const row = new TableRow(db, data.id, data.table_id, data.position);
    row.createdAt = data.created_at;
    return row;
  }

  setCell(columnId, value) {
    return CellData.set(this.db, this.id, columnId, value);
  }

  getCell(columnId) {
    return CellData.get(this.db, this.id, columnId);
  }

  getAllCells() {
    return CellData.getByRow(this.db, this.id);
  }
}

// ============================================================================
// CellData Class
// ============================================================================

class CellData {
  constructor(db, id = null, rowId, columnId, value = null) {
    this.db = db;
    this.id = id;
    this.rowId = rowId;
    this.columnId = columnId;
    this.value = value;
    this.updatedAt = new Date().toISOString();
  }

  static set(db, rowId, columnId, value) {
    const updatedAt = new Date().toISOString();
    const valueStr = value !== null && value !== undefined ? JSON.stringify(value) : null;
    
    // Use UPSERT (INSERT OR REPLACE)
    const stmt = db.db.prepare(`
      INSERT INTO cells (row_id, column_id, value, updated_at) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(row_id, column_id) 
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    
    stmt.run(rowId, columnId, valueStr, updatedAt);
    
    // Get the cell back
    const getStmt = db.db.prepare('SELECT * FROM cells WHERE row_id = ? AND column_id = ?');
    const data = getStmt.get(rowId, columnId);
    
    const cell = new CellData(
      db, 
      data.id, 
      data.row_id, 
      data.column_id, 
      data.value ? JSON.parse(data.value) : null
    );
    cell.updatedAt = data.updated_at;
    return cell;
  }

  static get(db, rowId, columnId) {
    const stmt = db.db.prepare('SELECT * FROM cells WHERE row_id = ? AND column_id = ?');
    const data = stmt.get(rowId, columnId);
    
    if (!data) return null;
    
    const cell = new CellData(
      db, 
      data.id, 
      data.row_id, 
      data.column_id, 
      data.value ? JSON.parse(data.value) : null
    );
    cell.updatedAt = data.updated_at;
    return cell;
  }

  static getByRow(db, rowId) {
    const stmt = db.db.prepare('SELECT * FROM cells WHERE row_id = ?');
    const cells = stmt.all(rowId);
    return cells.map(c => {
      const cell = new CellData(
        db, 
        c.id, 
        c.row_id, 
        c.column_id, 
        c.value ? JSON.parse(c.value) : null
      );
      cell.updatedAt = c.updated_at;
      return cell;
    });
  }
}

// ============================================================================
// Basic Tests
// ============================================================================

function runTests() {
  console.log('🚀 Starting Headless Diamant Tests (SQLite)...\n');

  // Initialize database (in-memory)
  const db = new DiamantDB();
  console.log('✅ Database initialized\n');

  // Test 1: Create a table
  console.log('TEST 1: Create a table');
  const usersTable = DataTable.create(db, 'Users');
  console.log(`✅ Created table: "${usersTable.name}" (ID: ${usersTable.id})\n`);

  // Test 2: Add columns
  console.log('TEST 2: Add columns');
  const nameCol = usersTable.addColumn('Name', 'text');
  const ageCol = usersTable.addColumn('Age', 'number');
  const emailCol = usersTable.addColumn('Email', 'text');
  console.log(`✅ Added columns: Name, Age, Email\n`);

  // Test 3: Add rows with data
  console.log('TEST 3: Add rows and set cell data');
  const row1 = usersTable.addRow();
  row1.setCell(nameCol.id, 'JJ Johnson');
  row1.setCell(ageCol.id, 28);
  row1.setCell(emailCol.id, 'alice@example.com');

  const row2 = usersTable.addRow();
  row2.setCell(nameCol.id, 'Bob Smith');
  row2.setCell(ageCol.id, 35);
  row2.setCell(emailCol.id, 'bob@example.com');

  const row3 = usersTable.addRow();
  row3.setCell(nameCol.id, 'Carol White');
  row3.setCell(ageCol.id, 42);
  row3.setCell(emailCol.id, 'carol@example.com');
  console.log('✅ Added 3 rows with data\n');

  // Test 4: Retrieve data
  console.log('TEST 4: Retrieve table data');
  const data = usersTable.getData();
  console.log('Table data:', JSON.stringify(data, null, 2));
  console.log('');

  // Test 5: Create related table
  console.log('TEST 5: Create a related table (Projects)');
  const projectsTable = DataTable.create(db, 'Projects');
  const projectNameCol = projectsTable.addColumn('Project Name', 'text');
  const ownerCol = projectsTable.addColumn('Owner', 'reference', { 
    referenceTableId: usersTable.id 
  });
  
  const project1 = projectsTable.addRow();
  project1.setCell(projectNameCol.id, 'Website Redesign');
  project1.setCell(ownerCol.id, row1.id); // Reference to Alice

  const project2 = projectsTable.addRow();
  project2.setCell(projectNameCol.id, 'Mobile App');
  project2.setCell(ownerCol.id, row2.id); // Reference to Bob

  const projectsData = projectsTable.getData();
  console.log('Projects data:', JSON.stringify(projectsData, null, 2));
  projectsTable.printTable();
  console.log('');

  // Test 6: Update cell data
  console.log('TEST 6: Update cell data');
  row1.setCell(ageCol.id, 29); // Update Alice's age
  const updatedData = usersTable.getData();
  console.log('Updated Alice\'s age:', updatedData[0].Age);
  console.log('');

  // Test 7: List all tables
  console.log('TEST 7: List all tables');
  const allTables = DataTable.getAll(db);
  console.log('All tables:', allTables.map(t => ({ id: t.id, name: t.name })));
  console.log('');

  // Test 8: Get specific cell
  console.log('TEST 8: Get specific cell value');
  const aliceEmail = row1.getCell(emailCol.id);
  console.log(`Alice's email: ${aliceEmail.value}`);
  console.log('');

  // Test 9: Performance test with more data
  console.log('TEST 9: Performance test - adding 100 rows');
  const startTime = Date.now();
  for (let i = 0; i < 100; i++) {
    const row = usersTable.addRow();
    row.setCell(nameCol.id, `User ${i}`);
    row.setCell(ageCol.id, 20 + i);
    row.setCell(emailCol.id, `user${i}@example.com`);
  }
  const endTime = Date.now();
  console.log(`✅ Added 100 rows in ${endTime - startTime}ms`);
  console.log(`Total rows in Users table: ${usersTable.getRows().length}`);
  console.log('');

  console.log('Printing first 10 rows of Users table:');
  // Temporarily modify to show only first 10
  const allRows = usersTable.getRows();
  const tempTable = DataTable.create(db, 'Users_Preview');
  usersTable.getColumns().forEach(col => {
    tempTable.addColumn(col.name, col.type, col.options);
  });
  allRows.slice(0, 10).forEach((row, idx) => {
    const newRow = tempTable.addRow(idx);
    usersTable.getColumns().forEach(col => {
      const cell = CellData.get(db, row.id, col.id);
      if (cell) {
        newRow.setCell(
          tempTable.getColumns().find(c => c.name === col.name).id,
          cell.value
        );
      }
    });
  });
  tempTable.printTable();

  console.log('🎉 All tests completed successfully!');
  
  // Close database
  db.close();
  console.log('Database connection closed.');
}


runTests();
