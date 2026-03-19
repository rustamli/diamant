# diamant-cli — Usage Instructions

diamant-cli is a terminal interface for managing structured data in SQLite databases using an Airtable-like data model: **Bases > Tables > Columns > Rows**. All data is stored locally in a SQLite file.

## Installation & Running

```bash
# From monorepo root
npm run build

# Run directly
node packages/diamant-cli/dist/index.js <command>

# Or if linked globally
diamant <command>
```

Requires Node.js >= 18.

---

## Global Options

These options go **before** any subcommand:

| Option | Description | Default |
|---|---|---|
| `--db <path>` | Path to the SQLite database file | `~/.diamant/default.db` |
| `--format <format>` | Output format: `text` or `json` | `text` |
| `--version` | Print version | — |
| `--help` | Print help | — |

Use `--format json` to get machine-readable JSON output from any command. This is essential when parsing output programmatically.

```bash
# Use a specific database file
diamant --db ./my-project.db base list

# Get JSON output
diamant --format json base list
```

---

## Configuration

Config is stored at `~/.diamant/config.json`. It tracks:

- `dbPath` — Default database path (defaults to `~/.diamant/default.db`)
- `activeBaseId` — The currently active base (set via `base use`)

You generally don't edit this file directly; it is managed by CLI commands.

---

## Data Model

```
Diamant DB
  └── Base (like a workspace/project)
       └── Table (like a spreadsheet tab)
            ├── Column (defines a field with a type)
            └── Row (a record with cell values for each column)
```

Most commands (table, column, row, query, import, export) require an **active base** to be set first.

---

## Command Reference

### `base` — Manage bases

A base is the top-level container. You must create and activate a base before doing anything else.

#### `base create <name>`

Creates a new base.

```bash
diamant base create "My Project"
# Output: Created base My Project (abc12345-...)

diamant --format json base create "My Project"
# Output: {"id":"abc12345-...","name":"My Project","createdAt":"2026-03-19T..."}
```

#### `base list`

Lists all bases. The active base is marked with a green dot (`●`).

```bash
diamant base list
```

JSON output returns an array of `{id, name, createdAt}` objects.

#### `base use <baseId>`

Sets the active base. **This is required before using table/column/row/query commands.** The active base is persisted in config, so it survives across invocations.

```bash
diamant base use abc12345-6789-...
# Output: Active base set to My Project (abc12345-...)
```

#### `base delete <baseId>`

Deletes a base and all its tables/data permanently.

```bash
diamant base delete abc12345-6789-...
```

---

### `table` — Manage tables

All table commands require an active base (set via `base use`).

#### `table create <name>`

```bash
diamant table create "Tasks"
# Output: Created table Tasks (tbl_id...)
```

#### `table list`

```bash
diamant table list
# Shows: ID, Name, Created for each table
```

#### `table show <tableId>`

Displays the table contents in a formatted grid (columns + all rows).

```bash
diamant table show tbl_abc123
# Shows table name, a grid of rows, and row count
```

#### `table rename <tableId> <newName>`

```bash
diamant table rename tbl_abc123 "Completed Tasks"
```

#### `table delete <tableId>`

```bash
diamant table delete tbl_abc123
```

---

### `column` — Manage columns

All column commands require an active base.

#### `column add <tableId>`

Adds a column to a table. Requires `--name` and `--type`.

**Required flags:**

| Flag | Description |
|---|---|
| `--name <name>` | Column name |
| `--type <type>` | Column type (see types below) |

**Optional flags:**

| Flag | Description |
|---|---|
| `--options <csv>` | Comma-separated option names for `singleSelect` or `multiSelect` types |
| `--config <json>` | Raw JSON config for advanced column configuration |

**Column types:**

| Type | Value format | Notes |
|---|---|---|
| `text` | `string` | Plain text |
| `number` | `number` | Numeric value |
| `checkbox` | `boolean` | `true` / `false` |
| `singleSelect` | `string` | One of the configured options |
| `multiSelect` | `string[]` | Array of option names |
| `date` | `string` | Date string |
| `email` | `string` | Email address |
| `url` | `string` | URL string |
| `phone` | `string` | Phone number |
| `currency` | `{amount, currency}` | e.g. `{"amount": 9.99, "currency": "USD"}` |
| `percent` | `number` | Percentage as number |
| `duration` | `number` | Duration value |
| `rating` | `number` | Rating value (config `max` sets upper bound) |
| `richText` | `string` | Rich text content |
| `attachment` | `object` | `{name, path, size, mimeType}` |
| `autoNumber` | — | Auto-incremented, read-only |
| `createdTime` | — | Auto-set, read-only |
| `lastModifiedTime` | — | Auto-set, read-only |
| `link` | `string[]` | Array of row IDs from linked table. Config: `{"linkedTableId": "...", "relationship": "many-to-many"}` |
| `lookup` | — | Reads values via a link. Config: `{"linkColumnId": "...", "lookupColumnId": "..."}` |
| `rollup` | — | Aggregates via a link. Config: `{"linkColumnId": "...", "lookupColumnId": "...", "aggregation": "sum"}` |
| `formula` | — | Computed. Config: `{"expression": "..."}` |
| `count` | — | Count of linked records |

Rollup aggregation options: `sum`, `avg`, `min`, `max`, `count`, `arrayJoin`, `arrayUnique`, `arrayCompact`.

**Examples:**

```bash
# Simple text column
diamant column add tbl_abc123 --name "Title" --type text

# Number column
diamant column add tbl_abc123 --name "Points" --type number

# Single select with options
diamant column add tbl_abc123 --name "Status" --type singleSelect --options "Todo,In Progress,Done"

# Currency with config
diamant column add tbl_abc123 --name "Price" --type currency --config '{"currency":"USD"}'

# Link column referencing another table
diamant column add tbl_abc123 --name "Assignee" --type link --config '{"linkedTableId":"tbl_xyz789","relationship":"many-to-many"}'

# Formula column
diamant column add tbl_abc123 --name "Total" --type formula --config '{"expression":"Price * Quantity"}'

# Lookup column
diamant column add tbl_abc123 --name "Assignee Name" --type lookup --config '{"linkColumnId":"col_link1","lookupColumnId":"col_name1"}'

# Rollup column
diamant column add tbl_abc123 --name "Total Points" --type rollup --config '{"linkColumnId":"col_link1","lookupColumnId":"col_pts","aggregation":"sum"}'
```

#### `column list <tableId>`

Lists all columns with their ID, Name, Type, and Position.

```bash
diamant column list tbl_abc123
```

#### `column rename <tableId> <columnId> <newName>`

```bash
diamant column rename tbl_abc123 col_xyz789 "New Name"
```

#### `column delete <tableId> <columnId>`

```bash
diamant column delete tbl_abc123 col_xyz789
```

---

### `row` — Manage rows

All row commands require an active base.

#### `row add <tableId>`

Adds a row. Pass cell data as JSON with `--data` where keys are **column names** and values match the column type.

```bash
# Add a row with data
diamant row add tbl_abc123 --data '{"Title":"Buy groceries","Status":"Todo","Points":3}'

# Interactive mode — prompts for each field
diamant row add tbl_abc123 --interactive
```

The `--interactive` flag skips read-only columns (autoNumber, createdTime, lastModifiedTime, lookup, rollup, formula, count) and prompts for each remaining column. Input is auto-parsed based on column type.

#### `row update <tableId> <rowId>`

Updates specific fields in a row. Only include the fields you want to change.

```bash
diamant row update tbl_abc123 row_xyz789 --data '{"Status":"Done","Points":5}'
```

`--data` is required.

#### `row show <tableId> <rowId>`

Shows a single row in detailed vertical format. Automatically expands link columns to show linked record details.

```bash
diamant row show tbl_abc123 row_xyz789
```

#### `row delete <tableId> <rowId>`

```bash
diamant row delete tbl_abc123 row_xyz789
```

---

### `query` — Query rows with filtering, sorting, and pagination

```bash
diamant query <tableId> [options]
```

| Option | Description | Example |
|---|---|---|
| `--filter <expr>` | Filter expression | `"Status eq Done"` |
| `--sort <expr>` | Sort expression | `"Points desc"` |
| `--limit <n>` | Max rows to return | `10` |
| `--offset <n>` | Skip first N rows | `20` |

#### Filter syntax

Format: `<field> <operator> [value]`

**Operators:**

| Operator | Meaning |
|---|---|
| `eq` | Equals |
| `neq` | Not equals |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `contains` | String contains |
| `notContains` | String does not contain |
| `isEmpty` | Field is empty (no value needed) |
| `isNotEmpty` | Field is not empty (no value needed) |
| `isAnyOf` | Matches any in set |

**Compound filters:** Use `AND` / `OR` (case-insensitive) to combine conditions.

```bash
# Simple filter
diamant query tbl_abc123 --filter "Status eq Done"

# Numeric comparison
diamant query tbl_abc123 --filter "Points gt 3"

# Compound AND
diamant query tbl_abc123 --filter "Status eq Done AND Points gt 3"

# Compound OR
diamant query tbl_abc123 --filter "Status eq Todo OR Status eq In Progress"

# Empty check
diamant query tbl_abc123 --filter "Notes isEmpty"
```

Note: compound filters support only one conjunction type per query (all AND or all OR, not mixed).

#### Sort syntax

Format: `<field> [asc|desc]` — defaults to `asc`. Multiple sorts separated by commas.

```bash
# Sort descending
diamant query tbl_abc123 --sort "Points desc"

# Multi-sort
diamant query tbl_abc123 --sort "Status asc,Points desc"
```

#### Pagination

```bash
# First 10 rows
diamant query tbl_abc123 --limit 10

# Next 10 rows
diamant query tbl_abc123 --limit 10 --offset 10
```

#### Combined example

```bash
diamant query tbl_abc123 --filter "Status neq Done" --sort "Points desc" --limit 5
```

---

### `import` — Import data

#### `import csv <tableId> <filePath>`

Imports CSV data into an existing table. The CSV headers must match column names in the table.

```bash
diamant import csv tbl_abc123 ./data.csv
```

#### `import json <filePath>`

Imports JSON data into the active base. The JSON structure should match diamant's export format.

```bash
diamant import json ./backup.json
```

---

### `export` — Export data

#### `export csv <tableId> <filePath>`

Exports a table's data to a CSV file.

```bash
diamant export csv tbl_abc123 ./output.csv
```

#### `export json <baseId> <filePath>`

Exports an entire base to JSON. Note: this takes a `baseId` argument directly (does not use the active base).

```bash
diamant export json abc12345-... ./backup.json
```

---

### `shell` — Interactive REPL

Opens an interactive session with a persistent database connection. Useful for exploring data.

```bash
diamant shell
# Or with a specific database
diamant --db ./project.db shell
```

**Shell commands:**

| Command | Description |
|---|---|
| `bases` | List all bases |
| `use <baseId>` | Set active base |
| `tables` | List tables in active base |
| `show <tableId>` | Show table contents |
| `columns <tableId>` | List columns in a table |
| `row <tableId> <rowId>` | Show row detail |
| `sql <query>` | Run raw SQL (read-only) against the underlying SQLite database |
| `help` | Show available commands |
| `exit` / `quit` | Exit the shell |

```
diamant> bases
diamant> use abc12345-...
diamant> tables
diamant> show tbl_abc123
diamant> sql SELECT count(*) FROM rows
diamant> exit
```

---

## Typical Workflow

```bash
# 1. Create a base
diamant base create "Project Tracker"

# 2. Note the base ID from output, activate it
diamant base use <baseId>

# 3. Create a table
diamant table create "Tasks"

# 4. Add columns
diamant column add <tableId> --name "Title" --type text
diamant column add <tableId> --name "Status" --type singleSelect --options "Todo,In Progress,Done"
diamant column add <tableId> --name "Points" --type number

# 5. Add rows
diamant row add <tableId> --data '{"Title":"Design homepage","Status":"Todo","Points":5}'
diamant row add <tableId> --data '{"Title":"Write tests","Status":"In Progress","Points":3}'

# 6. View table
diamant table show <tableId>

# 7. Query with filters
diamant query <tableId> --filter "Status eq Todo" --sort "Points desc"

# 8. Update a row
diamant row update <tableId> <rowId> --data '{"Status":"Done"}'

# 9. Export
diamant export csv <tableId> ./tasks.csv
```

---

## JSON Output Mode

Every command supports `--format json`. This outputs structured JSON to stdout instead of formatted tables. Use this when:

- Parsing output in scripts or other tools
- Piping to `jq` for further processing
- Integrating with other agents or automation

```bash
# Get all table IDs as JSON
diamant --format json table list | jq '.[].id'

# Get a specific row as JSON
diamant --format json row show <tableId> <rowId>

# Get filtered rows as JSON
diamant --format json query <tableId> --filter "Status eq Done"
```

**JSON output shapes by command:**

| Command | JSON shape |
|---|---|
| `base create` | `{id, name, createdAt}` |
| `base list` | `[{id, name, createdAt}, ...]` |
| `base use` | `{activeBase, name}` |
| `base delete` | `{deleted: baseId}` |
| `table create` | `{id, name}` |
| `table list` | `[{id, name, createdAt}, ...]` |
| `table show` | `{columns: [...], rows: [...]}` |
| `table rename` | `{id, name}` |
| `table delete` | `{deleted: tableId}` |
| `column add` | Full column record object |
| `column list` | Array of column record objects |
| `column rename` | `{id, name}` |
| `column delete` | `{deleted: columnId}` |
| `row add` | Full row data object |
| `row update` | Full row data object |
| `row show` | Full row data object with expanded links |
| `row delete` | `{deleted: rowId}` |
| `query` | Array of row data objects |
| `import csv` | `{imported: rowCount}` |
| `import json` | `{imported: true}` |
| `export csv` | `{exported: filePath}` |
| `export json` | `{exported: filePath}` |

---

## Error Handling

- If no active base is set when one is required, the CLI prints `No active base. Run: diamant base use <baseId>` and exits with code 1.
- Invalid filter syntax prints `Invalid filter: ... Format: 'field operator [value]'` and exits with code 1.
- Database errors (invalid IDs, missing tables, etc.) are thrown as exceptions with descriptive messages.
- All errors go to stderr; data output goes to stdout.
