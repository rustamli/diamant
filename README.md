# Diamant

A headless Airtable built on SQLite. Diamant gives you a structured, relational data model — bases, tables, typed columns, rows — backed by a single SQLite file with zero migrations.

## Packages

| Package | Description |
|---|---|
| [`diamant`](packages/diamant) | Core library — TypeScript API for managing structured data |
| [`diamant-cli`](packages/diamant-cli) | CLI tool — terminal interface for diamant databases |

## Quick Start

```bash
npm install
npm run build
```

Requires Node.js >= 18.

### Library Usage

```typescript
import { Diamant } from 'diamant';

const d = new Diamant('./my-data.db'); // or ':memory:' for in-memory

// Create a base and table
const base = d.createBase('Project Tracker');
const table = base.createTable('Tasks');

// Add typed columns
table.addColumn({ name: 'Title', type: 'text' });
table.addColumn({ name: 'Status', type: 'singleSelect', config: {
  options: [
    { id: '1', name: 'Todo' },
    { id: '2', name: 'In Progress' },
    { id: '3', name: 'Done' },
  ]
}});
table.addColumn({ name: 'Points', type: 'number' });

// Add rows
table.addRow({ Title: 'Design homepage', Status: 'Todo', Points: 5 });
table.addRow({ Title: 'Write tests', Status: 'In Progress', Points: 3 });

// Query with filters and sorting
const rows = table.getRows({
  filter: { field: 'Status', operator: 'eq', value: 'Todo' },
  sort: [{ field: 'Points', direction: 'desc' }],
});

d.close();
```

### CLI Usage

```bash
# Create and activate a base
diamant base create "Project Tracker"
diamant base use <baseId>

# Create a table with columns
diamant table create "Tasks"
diamant column add <tableId> --name "Title" --type text
diamant column add <tableId> --name "Status" --type singleSelect --options "Todo,In Progress,Done"
diamant column add <tableId> --name "Points" --type number

# Add and query rows
diamant row add <tableId> --data '{"Title":"Design homepage","Status":"Todo","Points":5}'
diamant query <tableId> --filter "Status eq Todo" --sort "Points desc"

# Export data
diamant export csv <tableId> ./tasks.csv
```

## Column Types

| Type | Value | Notes |
|---|---|---|
| `text` | `string` | Plain text |
| `number` | `number` | Numeric value |
| `checkbox` | `boolean` | True/false |
| `singleSelect` | `string` | One of configured options |
| `multiSelect` | `string[]` | Multiple options |
| `date` | `string` | Date string |
| `email` | `string` | Email address |
| `url` | `string` | URL |
| `phone` | `string` | Phone number |
| `currency` | `{amount, currency}` | e.g. `{amount: 9.99, currency: "USD"}` |
| `percent` | `number` | Percentage |
| `duration` | `number` | Duration value |
| `rating` | `number` | Configurable max |
| `richText` | `string` | Rich text content |
| `attachment` | `object` | File metadata |
| `autoNumber` | — | Auto-incremented (read-only) |
| `createdTime` | — | Auto-set (read-only) |
| `lastModifiedTime` | — | Auto-set (read-only) |
| `link` | `string[]` | Row IDs from linked table |
| `lookup` | — | Values via a link column |
| `rollup` | — | Aggregation via a link column |
| `formula` | — | Computed from expression |
| `count` | — | Count of linked records |

## Features

- **Single-file storage** — everything lives in one SQLite database
- **Zero migrations** — schema is managed automatically via a meta-database pattern
- **Rich column types** — 22 types including links, lookups, rollups, and formulas
- **Filtering & sorting** — query rows with operators like `eq`, `gt`, `contains`, `isEmpty`, plus compound `AND`/`OR` filters
- **Import/export** — CSV and JSON support
- **Event system** — subscribe to `row:created`, `column:updated`, `base:deleted`, etc.
- **Interactive shell** — REPL with `sql` command for raw SQLite queries
- **JSON output mode** — `--format json` on any CLI command for scripting

## License

MIT
