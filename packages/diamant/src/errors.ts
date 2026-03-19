export interface DiamantErrorContext {
  entityType?: string;
  entityId?: string;
  detail?: string;
}

export class DiamantError extends Error {
  public readonly entityType?: string;
  public readonly entityId?: string;
  public readonly detail?: string;

  constructor(message: string, context?: DiamantErrorContext) {
    super(message);
    this.name = 'DiamantError';
    this.entityType = context?.entityType;
    this.entityId = context?.entityId;
    this.detail = context?.detail;
  }
}

export class DiamantNotFoundError extends DiamantError {
  constructor(message: string, context?: DiamantErrorContext) {
    super(message, context);
    this.name = 'DiamantNotFoundError';
  }
}

export class DiamantValidationError extends DiamantError {
  constructor(message: string, context?: DiamantErrorContext) {
    super(message, context);
    this.name = 'DiamantValidationError';
  }
}

export class DiamantSchemaError extends DiamantError {
  constructor(message: string, context?: DiamantErrorContext) {
    super(message, context);
    this.name = 'DiamantSchemaError';
  }
}

export class DiamantFormulaError extends DiamantError {
  constructor(message: string, context?: DiamantErrorContext) {
    super(message, context);
    this.name = 'DiamantFormulaError';
  }
}
