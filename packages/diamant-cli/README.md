# Diamant CLI

Terminal interface for managing Diamant databases.

## Installation

From the monorepo root:

```bash
npm install
npm run build
npm link --workspace=packages/diamant-cli
```

Now `diamant` is available globally.

## Global Options

| Option | Default | Description |
|---|---|---|
| `--db <path>` | `~/.diamant/default.db` | Path to SQLite database file |
| `--format <format>` | `text` | Output format: `text` or `json` |

Use `--format json` to get machine-readable output for scripting.

## Commands

### `base` — Manage Bases

A base is the top-level container for tables (like a spreadsheet workbook).

```bash
# Create a base
diamant base create "Project Tracker"

# List all bases (active base marked with ●)
diamant base list

# Set active base (required before most other commands)
diamant base use <baseId>

# Delete a base
diamant base delete <baseId>
```

### `table` — Manage Tables

Requires an active base.

```bash
# Create a table
diamant table create "Tasks"

# List tables in active base
diamant table list

# Show all rows in a table
diamant table show <tableId>

# Rename a table
diamant table rename <tableId> "New Name"

# Delete a table
diamant table delete <tableId>
```

### `column` — Manage Columns

```bash
# Add a text column
diamant column add <tableId> --name "Title" --type text

# Add a select column with options
diamant column add <tableId> --name "Status" --type singleSelect --options "Todo,In Progress,Done"

# Add a column with JSON config
diamant column add <tableId> --name "Price" --type currency --config '{"currency":"USD"}'

# List columns
diamant column list <tableId>

# Rename a column
diamant column rename <tableId> <columnId> "New Name"

# Delete a column
diamant column delete <tableId> <columnId>
```

#### Column Types

| Type | `--options` / `--config` example |
|---|---|
| `text` | — |
| `number` | — |
| `checkbox` | — |
| `singleSelect` | `--options "A,B,C"` |
| `multiSelect` | `--options "A,B,C"` |
| `date` | `--config '{"includeTime":true}'` |
| `email` | — |
| `url` | — |
| `phone` | — |
| `currency` | `--config '{"currency":"USD"}'` |
| `percent` | — |
| `duration` | — |
| `rating` | `--config '{"max":5}'` |
| `richText` | — |
| `attachment` | — |
| `autoNumber` | — (read-only) |
| `createdTime` | — (read-only) |
| `lastModifiedTime` | — (read-only) |
| `link` | `--config '{"linkedTableId":"<id>","relationship":"many-to-many"}'` |
| `lookup` | `--config '{"linkColumnId":"<id>","lookupColumnId":"<id>"}'` |
| `rollup` | `--config '{"linkColumnId":"<id>","lookupColumnId":"<id>","aggregation":"sum"}'` |
| `formula` | `--config '{"expression":"[Price]*[Quantity]"}'` |
| `count` | — |

Rollup aggregations: `sum`, `avg`, `min`, `max`, `count`, `arrayJoin`, `arrayUnique`, `arrayCompact`.

### `row` — Manage Rows

```bash
# Add a row with JSON data
diamant row add <tableId> --data '{"Title":"Design homepage","Status":"Todo","Points":5}'

# Add a row interactively (prompts for each field)
diamant row add <tableId> --interactive

# Show a single row
diamant row show <tableId> <rowId>

# Update specific fields
diamant row update <tableId> <rowId> --data '{"Status":"Done"}'

# Delete a row
diamant row delete <tableId> <rowId>
```

### `query` — Filter and Sort Rows

```bash
diamant query <tableId> [options]
```

| Option | Description |
|---|---|
| `--filter <expr>` | Filter expression |
| `--sort <expr>` | Sort expression |
| `--limit <n>` | Max rows to return |
| `--offset <n>` | Skip first n rows |

#### Filter syntax

```bash
# Single condition
--filter "Status eq Done"

# AND / OR (case-insensitive)
--filter "Status eq Done AND Points gt 50"
--filter "Status eq Todo OR Status eq InProgress"

# Unary operators (no value needed)
--filter "Name isEmpty"
```

**Operators:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `notContains`, `isEmpty`, `isNotEmpty`, `isAnyOf`

#### Sort syntax

```bash
# Single field (ascending by default)
--sort "Name"

# Explicit direction
--sort "Points desc"

# Multiple fields (comma-separated)
--sort "Status asc,Points desc"
```

#### Combined example

```bash
diamant query <tableId> \
  --filter "Status eq Done AND Points gte 100" \
  --sort "Name asc,Points desc" \
  --limit 20 --offset 0
```

### `import` — Import Data

#### CSV Import

```bash
diamant import csv <tableId> ./data.csv
```

**Expected input:**
- Standard CSV file with a header row
- First row is treated as column names
- Columns matching existing table columns map to them automatically
- New column names are auto-created as `text` columns
- Values are imported as-is (strings) — no automatic type coercion

Example `data.csv`:

```csv
Name,City,Score
Alice,NYC,95
Bob,LA,87
"Eve, Jr.",London,92
```

Special characters (commas, quotes, newlines) must follow standard CSV quoting rules — wrap the value in double quotes and escape inner quotes by doubling them (`""`).

#### JSON Import

```bash
diamant import json ./data.json
```

Imports tables, columns, and rows into the active base. **Expected input:**

```json
{
  "tables": [
    {
      "name": "People",
      "columns": [
        { "name": "Name", "type": "text" },
        { "name": "Age", "type": "number" }
      ],
      "rows": [
        { "cells": { "Name": "Alice", "Age": 30 } },
        { "cells": { "Name": "Bob", "Age": 25 } }
      ]
    }
  ]
}
```

- Each entry in `tables` creates a new table in the active base
- `columns` defines the schema — each column needs a `name` and `type`
- `rows` contains the data — each row has a `cells` object mapping column names to values
- Computed column types (`autoNumber`, `createdTime`, `lastModifiedTime`) are skipped during import
- Column configs (e.g. select options, currency settings) can be included in the column definition
- Multiple tables can be imported at once

### `export` — Export Data

#### CSV Export

```bash
diamant export csv <tableId> ./output.csv
```

- Exports all rows and non-computed columns
- Computed columns (`autoNumber`, `formula`, `createdTime`, `lastModifiedTime`) are excluded
- Null values are exported as empty strings
- Values containing commas, quotes, or newlines are properly escaped

#### JSON Export

```bash
diamant export json <baseId> ./output.json
```

- Exports the entire base: all tables, columns, and rows
- Preserves column types, configs, and cell values
- Output can be re-imported with `diamant import json`

### `shell` — Interactive REPL

```bash
diamant shell
```

Opens an interactive session with the following commands:

| Command | Description |
|---|---|
| `bases` | Interactive base selector |
| `use <baseId>` | Set active base |
| `tables` | Interactive table selector |
| `show [tableId]` | Show table contents (uses active table if omitted) |
| `columns [tableId]` | List columns in a table |
| `row [tableId] <rowId>` | Show a single row in detail |
| `sql <query>` | Execute raw SQL query (read-only) |
| `help` | Show available commands |
| `exit` / `quit` | Exit the shell |

Example session:

```
$ diamant shell
diamant> bases
  ● abc123  Project Tracker
    def456  Inventory

diamant> tables
  → tbl_001  Tasks
    tbl_002  People

diamant> show
┌──────────┬─────────────────┬────────────┬────────┐
│ id       │ Title           │ Status     │ Points │
├──────────┼─────────────────┼────────────┼────────┤
│ row_001  │ Design homepage │ Todo       │ 5      │
│ row_002  │ Write tests     │ In Progress│ 3      │
└──────────┴─────────────────┴────────────┴────────┘

diamant> sql SELECT count(*) as total FROM rows
[{"total": 2}]

diamant> exit
```

## Configuration

Stored at `~/.diamant/config.json`:

```json
{
  "dbPath": "~/.diamant/default.db",
  "activeBaseId": "abc123",
  "activeTableId": "tbl_001"
}
```

- `dbPath` — default database location (overridden by `--db`)
- `activeBaseId` — set by `diamant base use`
- `activeTableId` — set interactively in the shell; cleared when switching bases
