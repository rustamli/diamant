import Database from 'better-sqlite3';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bases (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tables (
  id          TEXT PRIMARY KEY,
  base_id     TEXT NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS columns (
  id          TEXT PRIMARY KEY,
  table_id    TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  config      TEXT,
  position    INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rows (
  id          TEXT PRIMARY KEY,
  table_id    TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cells (
  id          TEXT PRIMARY KEY,
  row_id      TEXT NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
  column_id   TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  value       TEXT,
  updated_at  TEXT NOT NULL,
  UNIQUE(row_id, column_id)
);

CREATE INDEX IF NOT EXISTS idx_tables_base_id ON tables(base_id);
CREATE INDEX IF NOT EXISTS idx_columns_table_id ON columns(table_id);
CREATE INDEX IF NOT EXISTS idx_rows_table_id ON rows(table_id);
CREATE INDEX IF NOT EXISTS idx_cells_row_id ON cells(row_id);
CREATE INDEX IF NOT EXISTS idx_cells_column_id ON cells(column_id);
CREATE INDEX IF NOT EXISTS idx_cells_row_column ON cells(row_id, column_id);
`;

export function initializeDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}
