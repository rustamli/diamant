import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}

export { Diamant } from './diamant.js';
export { Base } from './base.js';
export { Table } from './table.js';
export { validateCellValue, isComputedType, COLUMN_TYPES } from './column.js';
export { evaluateFormula } from './formula.js';
export {
  DiamantError,
  DiamantNotFoundError,
  DiamantValidationError,
  DiamantSchemaError,
  DiamantFormulaError,
} from './errors.js';
export type {
  ColumnType,
  ColumnDefinition,
  ColumnRecord,
  ColumnConfig,
  BaseRecord,
  TableRecord,
  RowRecord,
  CellRecord,
  RowData,
  ExpandedRowData,
  Filter,
  FilterCondition,
  CompoundFilter,
  FilterOperator,
  SortSpec,
  GetRowsOptions,
  GetRowOptions,
  SelectOption,
  SingleSelectConfig,
  MultiSelectConfig,
  DateConfig,
  CurrencyConfig,
  RatingConfig,
  LinkConfig,
  LookupConfig,
  RollupConfig,
  FormulaConfig,
  AttachmentMeta,
  CurrencyValue,
  DiamantEvent,
  DiamantEventType,
  RollupAggregation,
} from './types.js';
