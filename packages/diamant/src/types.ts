export type ColumnType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'email'
  | 'url'
  | 'phone'
  | 'currency'
  | 'percent'
  | 'duration'
  | 'rating'
  | 'richText'
  | 'attachment'
  | 'autoNumber'
  | 'createdTime'
  | 'lastModifiedTime'
  | 'link'
  | 'lookup'
  | 'rollup'
  | 'formula'
  | 'count';

export interface SelectOption {
  id: string;
  name: string;
  color?: string;
}

export interface SingleSelectConfig {
  options: SelectOption[];
}

export interface MultiSelectConfig {
  options: SelectOption[];
}

export interface DateConfig {
  dateFormat?: string;
  includeTime?: boolean;
}

export interface CurrencyConfig {
  currency: string;
}

export interface RatingConfig {
  max: number;
}

export interface LinkConfig {
  linkedTableId: string;
  symmetricColumnId?: string | null;
  relationship: 'many-to-many';
  displayColumnId?: string;
}

export interface LookupConfig {
  linkColumnId: string;
  lookupColumnId: string;
}

export type RollupAggregation =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'arrayJoin'
  | 'arrayUnique'
  | 'arrayCompact';

export interface RollupConfig {
  linkColumnId: string;
  lookupColumnId: string;
  aggregation: RollupAggregation;
}

export interface FormulaConfig {
  expression: string;
}

export type ColumnConfig =
  | SingleSelectConfig
  | MultiSelectConfig
  | DateConfig
  | CurrencyConfig
  | RatingConfig
  | LinkConfig
  | LookupConfig
  | RollupConfig
  | FormulaConfig
  | undefined;

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  config?: ColumnConfig;
}

export interface ColumnRecord {
  id: string;
  tableId: string;
  name: string;
  type: ColumnType;
  config: ColumnConfig;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BaseRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface TableRecord {
  id: string;
  baseId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface RowRecord {
  id: string;
  tableId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CellRecord {
  id: string;
  rowId: string;
  columnId: string;
  value: unknown;
  updatedAt: string;
}

export interface AttachmentMeta {
  name: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface CurrencyValue {
  amount: number;
  currency: string;
}

export interface RowData {
  id: string;
  createdAt: string;
  updatedAt: string;
  cells: Record<string, unknown>;
}

export interface ExpandedRowData {
  id: string;
  createdAt: string;
  updatedAt: string;
  cells: Record<string, unknown>;
}

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface CompoundFilter {
  conjunction: 'and' | 'or';
  filters: (FilterCondition | CompoundFilter)[];
}

export type Filter = FilterCondition | CompoundFilter;

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'notContains'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'isAnyOf';

export interface SortSpec {
  field: string;
  direction: 'asc' | 'desc';
}

export interface GetRowsOptions {
  filter?: Filter;
  sort?: SortSpec[];
  limit?: number;
  offset?: number;
  expand?: string[];
  resolveLinks?: boolean;
}

export interface GetRowOptions {
  expand?: string[];
  resolveLinks?: boolean;
}

export type DiamantEventType =
  | 'row:created'
  | 'row:updated'
  | 'row:deleted'
  | 'column:created'
  | 'column:updated'
  | 'column:deleted'
  | 'table:created'
  | 'table:deleted'
  | 'base:created'
  | 'base:deleted';

export interface DiamantEvent {
  type: DiamantEventType;
  entityId: string;
  entityType: string;
  detail?: Record<string, unknown>;
  timestamp: string;
}
