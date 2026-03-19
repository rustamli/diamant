import type {
  Filter,
  FilterCondition,
  CompoundFilter,
  SortSpec,
  RowData,
} from './types.js';

function isCompoundFilter(filter: Filter): filter is CompoundFilter {
  return 'conjunction' in filter;
}

function evaluateCondition(condition: FilterCondition, cells: Record<string, unknown>): boolean {
  const cellValue = cells[condition.field];
  const filterValue = condition.value;

  switch (condition.operator) {
    case 'eq':
      return cellValue === filterValue;
    case 'neq':
      return cellValue !== filterValue;
    case 'gt':
      return typeof cellValue === 'number' && typeof filterValue === 'number' && cellValue > filterValue;
    case 'gte':
      return typeof cellValue === 'number' && typeof filterValue === 'number' && cellValue >= filterValue;
    case 'lt':
      return typeof cellValue === 'number' && typeof filterValue === 'number' && cellValue < filterValue;
    case 'lte':
      return typeof cellValue === 'number' && typeof filterValue === 'number' && cellValue <= filterValue;
    case 'contains':
      if (typeof cellValue === 'string' && typeof filterValue === 'string') {
        return cellValue.toLowerCase().includes(filterValue.toLowerCase());
      }
      if (Array.isArray(cellValue)) {
        return cellValue.includes(filterValue);
      }
      return false;
    case 'notContains':
      if (typeof cellValue === 'string' && typeof filterValue === 'string') {
        return !cellValue.toLowerCase().includes(filterValue.toLowerCase());
      }
      if (Array.isArray(cellValue)) {
        return !cellValue.includes(filterValue);
      }
      return true;
    case 'isEmpty':
      return cellValue === null || cellValue === undefined || cellValue === '' ||
        (Array.isArray(cellValue) && cellValue.length === 0);
    case 'isNotEmpty':
      return cellValue !== null && cellValue !== undefined && cellValue !== '' &&
        !(Array.isArray(cellValue) && cellValue.length === 0);
    case 'isAnyOf':
      if (Array.isArray(filterValue)) {
        return filterValue.includes(cellValue);
      }
      return false;
    default:
      return false;
  }
}

function evaluateFilter(filter: Filter, cells: Record<string, unknown>): boolean {
  if (isCompoundFilter(filter)) {
    const results = filter.filters.map((f) => evaluateFilter(f, cells));
    if (filter.conjunction === 'and') {
      return results.every(Boolean);
    }
    return results.some(Boolean);
  }
  return evaluateCondition(filter, cells);
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b));
}

export function applyFilter(rows: RowData[], filter?: Filter): RowData[] {
  if (!filter) return rows;
  return rows.filter((row) => evaluateFilter(filter, row.cells));
}

export function applySort(rows: RowData[], sort?: SortSpec[]): RowData[] {
  if (!sort || sort.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const spec of sort) {
      const aVal = a.cells[spec.field];
      const bVal = b.cells[spec.field];
      const cmp = compareValues(aVal, bVal);
      if (cmp !== 0) return spec.direction === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

export function applyPagination(rows: RowData[], limit?: number, offset?: number): RowData[] {
  const start = offset ?? 0;
  if (limit !== undefined) {
    return rows.slice(start, start + limit);
  }
  return start > 0 ? rows.slice(start) : rows;
}

export function queryRows(
  rows: RowData[],
  options: { filter?: Filter; sort?: SortSpec[]; limit?: number; offset?: number },
): RowData[] {
  let result = applyFilter(rows, options.filter);
  result = applySort(result, options.sort);
  result = applyPagination(result, options.limit, options.offset);
  return result;
}
