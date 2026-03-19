import type Database from 'better-sqlite3';
import type { ColumnRecord, LinkConfig, LookupConfig, RollupConfig, RollupAggregation } from './types.js';

export function syncSymmetricLink(
  db: Database.Database,
  symmetricColumnId: string,
  targetRowId: string,
  sourceRowId: string,
  action: 'add' | 'remove',
): void {
  const now = new Date().toISOString();
  const existingCell = db.prepare(
    'SELECT id, value FROM cells WHERE row_id = ? AND column_id = ?',
  ).get(targetRowId, symmetricColumnId) as { id: string; value: string | null } | undefined;

  let currentLinks: string[] = [];
  if (existingCell?.value) {
    try {
      currentLinks = JSON.parse(existingCell.value);
    } catch {
      currentLinks = [];
    }
  }

  if (action === 'add') {
    if (!currentLinks.includes(sourceRowId)) {
      currentLinks.push(sourceRowId);
    }
  } else {
    currentLinks = currentLinks.filter((id) => id !== sourceRowId);
  }

  const newValue = JSON.stringify(currentLinks);
  if (existingCell) {
    db.prepare('UPDATE cells SET value = ?, updated_at = ? WHERE id = ?').run(
      newValue, now, existingCell.id,
    );
  } else {
    db.prepare(
      'INSERT INTO cells (id, row_id, column_id, value, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(crypto.randomUUID(), targetRowId, symmetricColumnId, newValue, now);
  }
}

export function handleLinkWrite(
  db: Database.Database,
  column: ColumnRecord,
  rowId: string,
  newLinks: string[],
  oldLinks: string[],
): void {
  const config = column.config as LinkConfig;
  if (!config.symmetricColumnId) return;

  const removed = oldLinks.filter((id) => !newLinks.includes(id));
  const added = newLinks.filter((id) => !oldLinks.includes(id));

  for (const targetRowId of removed) {
    syncSymmetricLink(db, config.symmetricColumnId, targetRowId, rowId, 'remove');
  }
  for (const targetRowId of added) {
    syncSymmetricLink(db, config.symmetricColumnId, targetRowId, rowId, 'add');
  }
}

export function resolveLookup(
  db: Database.Database,
  column: ColumnRecord,
  rowId: string,
): unknown[] {
  const config = column.config as LookupConfig;

  // Get linked row IDs from the link column
  const linkCell = db.prepare(
    'SELECT value FROM cells WHERE row_id = ? AND column_id = ?',
  ).get(rowId, config.linkColumnId) as { value: string | null } | undefined;

  if (!linkCell?.value) return [];

  let linkedRowIds: string[];
  try {
    linkedRowIds = JSON.parse(linkCell.value);
  } catch {
    return [];
  }

  if (!Array.isArray(linkedRowIds) || linkedRowIds.length === 0) return [];

  // Get values from the lookup column for each linked row
  const placeholders = linkedRowIds.map(() => '?').join(',');
  const cells = db.prepare(
    `SELECT row_id, value FROM cells WHERE row_id IN (${placeholders}) AND column_id = ?`,
  ).all(...linkedRowIds, config.lookupColumnId) as { row_id: string; value: string | null }[];

  return cells.map((cell) => {
    if (cell.value === null) return null;
    try {
      return JSON.parse(cell.value);
    } catch {
      return cell.value;
    }
  });
}

export function resolveRollup(
  db: Database.Database,
  column: ColumnRecord,
  rowId: string,
): unknown {
  const config = column.config as RollupConfig;
  const lookupColumn: ColumnRecord = {
    ...column,
    config: { linkColumnId: config.linkColumnId, lookupColumnId: config.lookupColumnId } as LookupConfig,
  };
  const values = resolveLookup(db, lookupColumn, rowId);
  return aggregate(values, config.aggregation);
}

export function resolveCount(
  db: Database.Database,
  linkColumnId: string,
  rowId: string,
): number {
  const linkCell = db.prepare(
    'SELECT value FROM cells WHERE row_id = ? AND column_id = ?',
  ).get(rowId, linkColumnId) as { value: string | null } | undefined;

  if (!linkCell?.value) return 0;

  try {
    const ids = JSON.parse(linkCell.value);
    return Array.isArray(ids) ? ids.length : 0;
  } catch {
    return 0;
  }
}

function aggregate(values: unknown[], aggregation: RollupAggregation): unknown {
  switch (aggregation) {
    case 'count':
      return values.length;
    case 'sum': {
      const nums = values.filter((v): v is number => typeof v === 'number');
      return nums.reduce((a, b) => a + b, 0);
    }
    case 'avg': {
      const nums = values.filter((v): v is number => typeof v === 'number');
      return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    }
    case 'min': {
      const nums = values.filter((v): v is number => typeof v === 'number');
      return nums.length > 0 ? Math.min(...nums) : null;
    }
    case 'max': {
      const nums = values.filter((v): v is number => typeof v === 'number');
      return nums.length > 0 ? Math.max(...nums) : null;
    }
    case 'arrayJoin':
      return values.map(String).join(', ');
    case 'arrayUnique':
      return [...new Set(values)];
    case 'arrayCompact':
      return values.filter((v) => v !== null && v !== undefined && v !== '');
    default:
      return values;
  }
}

export function cleanupLinksOnRowDelete(
  db: Database.Database,
  tableId: string,
  rowId: string,
): void {
  // Find all link columns in this table that have symmetric columns
  const linkColumns = db.prepare(
    "SELECT * FROM columns WHERE table_id = ? AND type = 'link'",
  ).all(tableId) as Array<{ id: string; config: string | null }>;

  for (const col of linkColumns) {
    if (!col.config) continue;
    let config: LinkConfig;
    try {
      config = JSON.parse(col.config);
    } catch {
      continue;
    }

    if (!config.symmetricColumnId) continue;

    // Get current links for this row
    const cell = db.prepare(
      'SELECT value FROM cells WHERE row_id = ? AND column_id = ?',
    ).get(rowId, col.id) as { value: string | null } | undefined;

    if (!cell?.value) continue;

    let linkedRowIds: string[];
    try {
      linkedRowIds = JSON.parse(cell.value);
    } catch {
      continue;
    }

    // Remove this row from all symmetric links
    for (const targetRowId of linkedRowIds) {
      syncSymmetricLink(db, config.symmetricColumnId, targetRowId, rowId, 'remove');
    }
  }

  // Also find link columns in OTHER tables that link TO this table
  const allLinkColumns = db.prepare(
    "SELECT c.*, t.id as owner_table_id FROM columns c JOIN tables t ON c.table_id = t.id WHERE c.type = 'link' AND c.table_id != ?",
  ).all(tableId) as Array<{ id: string; config: string | null; owner_table_id: string }>;

  for (const col of allLinkColumns) {
    if (!col.config) continue;
    let config: LinkConfig;
    try {
      config = JSON.parse(col.config);
    } catch {
      continue;
    }

    if (config.linkedTableId !== tableId) continue;

    // Find cells in this column that reference the deleted row
    const cells = db.prepare(
      'SELECT id, row_id, value FROM cells WHERE column_id = ?',
    ).all(col.id) as Array<{ id: string; row_id: string; value: string | null }>;

    for (const cell of cells) {
      if (!cell.value) continue;
      let links: string[];
      try {
        links = JSON.parse(cell.value);
      } catch {
        continue;
      }

      if (links.includes(rowId)) {
        const updated = links.filter((id) => id !== rowId);
        db.prepare('UPDATE cells SET value = ?, updated_at = ? WHERE id = ?').run(
          JSON.stringify(updated), new Date().toISOString(), cell.id,
        );
      }
    }
  }
}

export function cleanupLinksOnColumnDelete(
  db: Database.Database,
  column: ColumnRecord,
): void {
  if (column.type !== 'link') return;
  const config = column.config as LinkConfig | undefined;
  if (!config?.symmetricColumnId) return;

  // Delete the symmetric column in the linked table
  const symCol = db.prepare('SELECT * FROM columns WHERE id = ?').get(config.symmetricColumnId) as { id: string } | undefined;
  if (symCol) {
    // First clear symmetric column's config to avoid infinite recursion
    db.prepare("UPDATE columns SET config = '{}' WHERE id = ?").run(symCol.id);
    db.prepare('DELETE FROM cells WHERE column_id = ?').run(symCol.id);
    db.prepare('DELETE FROM columns WHERE id = ?').run(symCol.id);
  }
}
