import type {
  ColumnType,
  ColumnRecord,
  SingleSelectConfig,
  MultiSelectConfig,
  RatingConfig,
  AttachmentMeta,
  CurrencyValue,
} from './types.js';
import { DiamantValidationError } from './errors.js';

export const COLUMN_TYPES: ColumnType[] = [
  'text',
  'number',
  'checkbox',
  'singleSelect',
  'multiSelect',
  'date',
  'email',
  'url',
  'phone',
  'currency',
  'percent',
  'duration',
  'rating',
  'richText',
  'attachment',
  'autoNumber',
  'createdTime',
  'lastModifiedTime',
  'link',
  'lookup',
  'rollup',
  'formula',
  'count',
];

const COMPUTED_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  'lookup',
  'rollup',
  'formula',
  'count',
  'autoNumber',
  'createdTime',
  'lastModifiedTime',
]);

export function isComputedType(type: ColumnType): boolean {
  return COMPUTED_TYPES.has(type);
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string, column: ColumnRecord): never {
  throw new DiamantValidationError(message, {
    entityType: 'column',
    entityId: column.id,
    detail: `Column "${column.name}" (type: ${column.type})`,
  });
}

export function validateCellValue(value: unknown, column: ColumnRecord): unknown {
  const { type } = column;

  // Computed types are read-only
  if (isComputedType(type)) {
    fail(`Column "${column.name}" is a computed ${type} column and its value is read-only`, column);
  }

  // Null/undefined → null for nullable types (everything except checkbox)
  if (value === null || value === undefined) {
    if (type === 'checkbox') {
      return false;
    }
    return null;
  }

  switch (type) {
    case 'text': {
      if (typeof value !== 'string') {
        fail(`Expected a string for text column "${column.name}"`, column);
      }
      return value;
    }

    case 'number': {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          fail(`Expected a finite number for column "${column.name}"`, column);
        }
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      fail(`Expected a number or numeric string for column "${column.name}"`, column);
    }

    case 'checkbox': {
      return Boolean(value);
    }

    case 'singleSelect': {
      if (typeof value !== 'string') {
        fail(`Expected a string (option id) for singleSelect column "${column.name}"`, column);
      }
      const config = column.config as SingleSelectConfig | undefined;
      if (config?.options) {
        const valid = config.options.some((opt) => opt.id === value);
        if (!valid) {
          fail(
            `Value "${value}" is not a valid option for singleSelect column "${column.name}"`,
            column,
          );
        }
      }
      return value;
    }

    case 'multiSelect': {
      if (!Array.isArray(value)) {
        fail(`Expected an array of option ids for multiSelect column "${column.name}"`, column);
      }
      const config = column.config as MultiSelectConfig | undefined;
      const optionIds = config?.options ? new Set(config.options.map((opt) => opt.id)) : null;
      for (const item of value) {
        if (typeof item !== 'string') {
          fail(
            `Each item in multiSelect column "${column.name}" must be a string`,
            column,
          );
        }
        if (optionIds && !optionIds.has(item)) {
          fail(
            `Value "${item}" is not a valid option for multiSelect column "${column.name}"`,
            column,
          );
        }
      }
      return value;
    }

    case 'date': {
      if (typeof value !== 'string') {
        fail(`Expected an ISO date string for date column "${column.name}"`, column);
      }
      if (!ISO_DATE_PATTERN.test(value)) {
        fail(
          `Invalid date format for column "${column.name}". Expected YYYY-MM-DD or full ISO 8601`,
          column,
        );
      }
      return value;
    }

    case 'email': {
      if (typeof value !== 'string') {
        fail(`Expected a string for email column "${column.name}"`, column);
      }
      if (!EMAIL_PATTERN.test(value)) {
        fail(`Invalid email address for column "${column.name}": "${value}"`, column);
      }
      return value;
    }

    case 'url': {
      if (typeof value !== 'string') {
        fail(`Expected a string for url column "${column.name}"`, column);
      }
      try {
        new URL(value);
      } catch {
        fail(`Invalid URL for column "${column.name}": "${value}"`, column);
      }
      return value;
    }

    case 'phone': {
      if (typeof value !== 'string') {
        fail(`Expected a string for phone column "${column.name}"`, column);
      }
      return value;
    }

    case 'currency': {
      if (
        typeof value !== 'object' ||
        value === null ||
        typeof (value as CurrencyValue).amount !== 'number' ||
        typeof (value as CurrencyValue).currency !== 'string'
      ) {
        fail(
          `Expected an object with { amount: number, currency: string } for currency column "${column.name}"`,
          column,
        );
      }
      if (!Number.isFinite((value as CurrencyValue).amount)) {
        fail(`Currency amount must be a finite number for column "${column.name}"`, column);
      }
      return value;
    }

    case 'percent': {
      if (typeof value !== 'number') {
        fail(`Expected a number for percent column "${column.name}"`, column);
      }
      if (!Number.isFinite(value)) {
        fail(`Expected a finite number for percent column "${column.name}"`, column);
      }
      return value;
    }

    case 'duration': {
      if (typeof value !== 'number') {
        fail(`Expected a number (seconds) for duration column "${column.name}"`, column);
      }
      if (!Number.isFinite(value) || value < 0) {
        fail(
          `Duration must be a non-negative finite number for column "${column.name}"`,
          column,
        );
      }
      return value;
    }

    case 'rating': {
      const config = column.config as RatingConfig | undefined;
      const max = config?.max ?? 5;
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        fail(`Expected an integer for rating column "${column.name}"`, column);
      }
      if (value < 1 || value > max) {
        fail(
          `Rating must be between 1 and ${max} for column "${column.name}"`,
          column,
        );
      }
      return value;
    }

    case 'richText': {
      if (typeof value !== 'string') {
        fail(`Expected a string for richText column "${column.name}"`, column);
      }
      return value;
    }

    case 'attachment': {
      if (!Array.isArray(value)) {
        fail(`Expected an array of attachments for column "${column.name}"`, column);
      }
      for (const item of value) {
        if (
          typeof item !== 'object' ||
          item === null ||
          typeof (item as AttachmentMeta).name !== 'string' ||
          typeof (item as AttachmentMeta).path !== 'string' ||
          typeof (item as AttachmentMeta).size !== 'number' ||
          typeof (item as AttachmentMeta).mimeType !== 'string'
        ) {
          fail(
            `Each attachment must have { name: string, path: string, size: number, mimeType: string } for column "${column.name}"`,
            column,
          );
        }
      }
      return value;
    }

    case 'link': {
      if (!Array.isArray(value)) {
        fail(`Expected an array of row IDs for link column "${column.name}"`, column);
      }
      for (const item of value) {
        if (typeof item !== 'string') {
          fail(
            `Each item in link column "${column.name}" must be a string (row UUID)`,
            column,
          );
        }
        if (!UUID_PATTERN.test(item)) {
          fail(
            `Invalid row UUID "${item}" for link column "${column.name}"`,
            column,
          );
        }
      }
      return value;
    }

    default:
      fail(`Unknown column type: ${type}`, column);
  }
}
