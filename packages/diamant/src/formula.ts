import { DiamantFormulaError } from './errors.js';

// ---------- Token types ----------

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'COLUMN_REF'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'IDENTIFIER'
  | 'BOOLEAN'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// ---------- AST node types ----------

interface NumberLiteral {
  kind: 'NumberLiteral';
  value: number;
}

interface StringLiteral {
  kind: 'StringLiteral';
  value: string;
}

interface BooleanLiteral {
  kind: 'BooleanLiteral';
  value: boolean;
}

interface ColumnRef {
  kind: 'ColumnRef';
  name: string;
}

interface BinaryOp {
  kind: 'BinaryOp';
  op: string;
  left: ASTNode;
  right: ASTNode;
}

interface UnaryOp {
  kind: 'UnaryOp';
  op: string;
  operand: ASTNode;
}

interface FunctionCall {
  kind: 'FunctionCall';
  name: string;
  args: ASTNode[];
}

type ASTNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | ColumnRef
  | BinaryOp
  | UnaryOp
  | FunctionCall;

// ---------- Tokenizer ----------

const OPERATORS = ['!=', '>=', '<=', '=', '>', '<', '+', '-', '*', '/', '&'];

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Number literal
    if (ch >= '0' && ch <= '9') {
      const start = i;
      while (i < expression.length && ((expression[i] >= '0' && expression[i] <= '9') || expression[i] === '.')) {
        i++;
      }
      const numStr = expression.slice(start, i);
      if (numStr.split('.').length > 2) {
        throw new DiamantFormulaError(`Invalid number literal '${numStr}' at position ${start}`);
      }
      tokens.push({ type: 'NUMBER', value: numStr, position: start });
      continue;
    }

    // String literal (single-quoted)
    if (ch === "'") {
      const start = i;
      i++; // skip opening quote
      let str = '';
      while (i < expression.length && expression[i] !== "'") {
        if (expression[i] === '\\' && i + 1 < expression.length && expression[i + 1] === "'") {
          str += "'";
          i += 2;
        } else {
          str += expression[i];
          i++;
        }
      }
      if (i >= expression.length) {
        throw new DiamantFormulaError(`Unterminated string literal at position ${start}`);
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str, position: start });
      continue;
    }

    // Column reference {ColumnName}
    if (ch === '{') {
      const start = i;
      i++; // skip {
      let name = '';
      while (i < expression.length && expression[i] !== '}') {
        name += expression[i];
        i++;
      }
      if (i >= expression.length) {
        throw new DiamantFormulaError(`Unterminated column reference at position ${start}`);
      }
      i++; // skip }
      if (name.length === 0) {
        throw new DiamantFormulaError(`Empty column reference at position ${start}`);
      }
      tokens.push({ type: 'COLUMN_REF', value: name, position: start });
      continue;
    }

    // Parentheses
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: i });
      i++;
      continue;
    }

    // Comma
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',', position: i });
      i++;
      continue;
    }

    // Operators (try multi-char first)
    let matchedOp: string | null = null;
    for (const op of OPERATORS) {
      if (expression.startsWith(op, i)) {
        matchedOp = op;
        break;
      }
    }
    if (matchedOp !== null) {
      tokens.push({ type: 'OPERATOR', value: matchedOp, position: i });
      i += matchedOp.length;
      continue;
    }

    // Identifier (function names, TRUE, FALSE)
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      const start = i;
      while (
        i < expression.length &&
        ((expression[i] >= 'a' && expression[i] <= 'z') ||
          (expression[i] >= 'A' && expression[i] <= 'Z') ||
          (expression[i] >= '0' && expression[i] <= '9') ||
          expression[i] === '_')
      ) {
        i++;
      }
      const word = expression.slice(start, i);
      const upper = word.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: upper, position: start });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: word, position: start });
      }
      continue;
    }

    throw new DiamantFormulaError(`Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: 'EOF', value: '', position: i });
  return tokens;
}

// ---------- Parser ----------

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  parse(): ASTNode {
    const node = this.parseComparison();
    if (this.current().type !== 'EOF') {
      throw new DiamantFormulaError(
        `Unexpected token '${this.current().value}' at position ${this.current().position}`
      );
    }
    return node;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      const expected = value !== undefined ? `'${value}'` : type;
      throw new DiamantFormulaError(
        `Expected ${expected} but got '${token.value}' at position ${token.position}`
      );
    }
    return this.advance();
  }

  // Precedence 1 (lowest): comparisons = != > < >= <=
  private parseComparison(): ASTNode {
    let left = this.parseAddition();

    while (
      this.current().type === 'OPERATOR' &&
      (this.current().value === '=' ||
        this.current().value === '!=' ||
        this.current().value === '>' ||
        this.current().value === '<' ||
        this.current().value === '>=' ||
        this.current().value === '<=')
    ) {
      const op = this.advance().value;
      const right = this.parseAddition();
      left = { kind: 'BinaryOp', op, left, right };
    }

    return left;
  }

  // Precedence 2: + -
  private parseAddition(): ASTNode {
    let left = this.parseMultiplication();

    while (
      this.current().type === 'OPERATOR' &&
      (this.current().value === '+' || this.current().value === '-')
    ) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = { kind: 'BinaryOp', op, left, right };
    }

    return left;
  }

  // Precedence 3: * /
  private parseMultiplication(): ASTNode {
    let left = this.parseConcat();

    while (
      this.current().type === 'OPERATOR' &&
      (this.current().value === '*' || this.current().value === '/')
    ) {
      const op = this.advance().value;
      const right = this.parseConcat();
      left = { kind: 'BinaryOp', op, left, right };
    }

    return left;
  }

  // Precedence 4: & (string concat)
  private parseConcat(): ASTNode {
    let left = this.parseUnary();

    while (this.current().type === 'OPERATOR' && this.current().value === '&') {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { kind: 'BinaryOp', op, left, right };
    }

    return left;
  }

  // Precedence 5 (highest): unary -
  private parseUnary(): ASTNode {
    if (this.current().type === 'OPERATOR' && this.current().value === '-') {
      this.advance();
      const operand = this.parseUnary();
      return { kind: 'UnaryOp', op: '-', operand };
    }

    return this.parsePrimary();
  }

  // Primary expressions: literals, column refs, function calls, parenthesized exprs
  private parsePrimary(): ASTNode {
    const token = this.current();

    // Number
    if (token.type === 'NUMBER') {
      this.advance();
      return { kind: 'NumberLiteral', value: Number(token.value) };
    }

    // String
    if (token.type === 'STRING') {
      this.advance();
      return { kind: 'StringLiteral', value: token.value };
    }

    // Boolean
    if (token.type === 'BOOLEAN') {
      this.advance();
      return { kind: 'BooleanLiteral', value: token.value === 'TRUE' };
    }

    // Column reference
    if (token.type === 'COLUMN_REF') {
      this.advance();
      return { kind: 'ColumnRef', name: token.value };
    }

    // Identifier (function call)
    if (token.type === 'IDENTIFIER') {
      const name = this.advance().value;
      this.expect('LPAREN');
      const args: ASTNode[] = [];

      if (this.current().type !== 'RPAREN') {
        args.push(this.parseComparison());
        while (this.current().type === 'COMMA') {
          this.advance();
          args.push(this.parseComparison());
        }
      }

      this.expect('RPAREN');
      return { kind: 'FunctionCall', name: name.toUpperCase(), args };
    }

    // Parenthesized expression
    if (token.type === 'LPAREN') {
      this.advance();
      const expr = this.parseComparison();
      this.expect('RPAREN');
      return expr;
    }

    throw new DiamantFormulaError(
      `Unexpected token '${token.value}' at position ${token.position}`
    );
  }
}

// ---------- Evaluator ----------

function toNumber(value: unknown, context: string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    if (isNaN(n)) {
      throw new DiamantFormulaError(`Cannot convert '${value}' to number in ${context}`);
    }
    return n;
  }
  if (value === null || value === undefined) return 0;
  throw new DiamantFormulaError(`Cannot convert value to number in ${context}`);
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

function evaluate(node: ASTNode, getCellValue: (columnName: string) => unknown): unknown {
  switch (node.kind) {
    case 'NumberLiteral':
      return node.value;

    case 'StringLiteral':
      return node.value;

    case 'BooleanLiteral':
      return node.value;

    case 'ColumnRef':
      return getCellValue(node.name);

    case 'UnaryOp': {
      if (node.op === '-') {
        const val = evaluate(node.operand, getCellValue);
        return -toNumber(val, 'unary negation');
      }
      throw new DiamantFormulaError(`Unknown unary operator '${node.op}'`);
    }

    case 'BinaryOp':
      return evaluateBinaryOp(node, getCellValue);

    case 'FunctionCall':
      return evaluateFunction(node, getCellValue);

    default:
      throw new DiamantFormulaError('Unknown AST node type');
  }
}

function evaluateBinaryOp(node: BinaryOp, getCellValue: (columnName: string) => unknown): unknown {
  const { op } = node;

  // String concatenation
  if (op === '&') {
    const left = evaluate(node.left, getCellValue);
    const right = evaluate(node.right, getCellValue);
    return toString(left) + toString(right);
  }

  // Arithmetic
  if (op === '+' || op === '-' || op === '*' || op === '/') {
    const left = toNumber(evaluate(node.left, getCellValue), `'${op}' operation`);
    const right = toNumber(evaluate(node.right, getCellValue), `'${op}' operation`);

    switch (op) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': {
        if (right === 0) {
          throw new DiamantFormulaError('Division by zero');
        }
        return left / right;
      }
    }
  }

  // Comparisons
  if (op === '=' || op === '!=' || op === '>' || op === '<' || op === '>=' || op === '<=') {
    const left = evaluate(node.left, getCellValue);
    const right = evaluate(node.right, getCellValue);

    // If both are numbers (or can be treated as numbers), compare numerically
    if (typeof left === 'number' && typeof right === 'number') {
      return compareValues(left, right, op);
    }

    // If both are strings, compare as strings
    if (typeof left === 'string' && typeof right === 'string') {
      return compareValues(left, right, op);
    }

    // If both are booleans
    if (typeof left === 'boolean' && typeof right === 'boolean') {
      if (op === '=') return left === right;
      if (op === '!=') return left !== right;
    }

    // Handle null comparisons
    if ((left === null || left === undefined) && (right === null || right === undefined)) {
      if (op === '=') return true;
      if (op === '!=') return false;
      return false;
    }

    if (left === null || left === undefined || right === null || right === undefined) {
      if (op === '=') return false;
      if (op === '!=') return true;
      return false;
    }

    // Mixed types: try numeric comparison
    try {
      const numLeft = toNumber(left, 'comparison');
      const numRight = toNumber(right, 'comparison');
      return compareValues(numLeft, numRight, op);
    } catch {
      // Fall back to string comparison
      return compareValues(toString(left), toString(right), op);
    }
  }

  throw new DiamantFormulaError(`Unknown operator '${op}'`);
}

function compareValues<T extends number | string>(left: T, right: T, op: string): boolean {
  switch (op) {
    case '=': return left === right;
    case '!=': return left !== right;
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    default: throw new DiamantFormulaError(`Unknown comparison operator '${op}'`);
  }
}

function evaluateFunction(
  node: FunctionCall,
  getCellValue: (columnName: string) => unknown
): unknown {
  const { name, args } = node;

  switch (name) {
    case 'IF': {
      if (args.length < 2 || args.length > 3) {
        throw new DiamantFormulaError('IF() requires 2 or 3 arguments: IF(condition, then_value, else_value?)');
      }
      const condition = evaluate(args[0], getCellValue);
      if (isTruthy(condition)) {
        return evaluate(args[1], getCellValue);
      }
      return args.length === 3 ? evaluate(args[2], getCellValue) : null;
    }

    case 'SUM': {
      if (args.length === 0) {
        throw new DiamantFormulaError('SUM() requires at least 1 argument');
      }
      let sum = 0;
      for (const arg of args) {
        const val = evaluate(arg, getCellValue);
        sum += toNumber(val, 'SUM()');
      }
      return sum;
    }

    case 'CONCAT': {
      if (args.length === 0) {
        throw new DiamantFormulaError('CONCAT() requires at least 1 argument');
      }
      let result = '';
      for (const arg of args) {
        const val = evaluate(arg, getCellValue);
        result += toString(val);
      }
      return result;
    }

    case 'LEN': {
      if (args.length !== 1) {
        throw new DiamantFormulaError('LEN() requires exactly 1 argument');
      }
      const val = evaluate(args[0], getCellValue);
      return toString(val).length;
    }

    case 'LOWER': {
      if (args.length !== 1) {
        throw new DiamantFormulaError('LOWER() requires exactly 1 argument');
      }
      const val = evaluate(args[0], getCellValue);
      return toString(val).toLowerCase();
    }

    case 'UPPER': {
      if (args.length !== 1) {
        throw new DiamantFormulaError('UPPER() requires exactly 1 argument');
      }
      const val = evaluate(args[0], getCellValue);
      return toString(val).toUpperCase();
    }

    case 'TRIM': {
      if (args.length !== 1) {
        throw new DiamantFormulaError('TRIM() requires exactly 1 argument');
      }
      const val = evaluate(args[0], getCellValue);
      return toString(val).trim();
    }

    case 'ROUND': {
      if (args.length < 1 || args.length > 2) {
        throw new DiamantFormulaError('ROUND() requires 1 or 2 arguments: ROUND(number, decimals?)');
      }
      const num = toNumber(evaluate(args[0], getCellValue), 'ROUND()');
      const decimals = args.length === 2
        ? toNumber(evaluate(args[1], getCellValue), 'ROUND() decimals')
        : 0;
      const factor = Math.pow(10, decimals);
      return Math.round(num * factor) / factor;
    }

    case 'NOW': {
      if (args.length !== 0) {
        throw new DiamantFormulaError('NOW() takes no arguments');
      }
      return new Date().toISOString();
    }

    case 'TODAY': {
      if (args.length !== 0) {
        throw new DiamantFormulaError('TODAY() takes no arguments');
      }
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    case 'BLANK': {
      if (args.length !== 0) {
        throw new DiamantFormulaError('BLANK() takes no arguments');
      }
      return null;
    }

    default:
      throw new DiamantFormulaError(`Unknown function '${name}'`);
  }
}

// ---------- Public API ----------

export function evaluateFormula(
  expression: string,
  getCellValue: (columnName: string) => unknown
): unknown {
  if (!expression || expression.trim().length === 0) {
    throw new DiamantFormulaError('Formula expression cannot be empty');
  }

  try {
    const tokens = tokenize(expression);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    return evaluate(ast, getCellValue);
  } catch (error) {
    if (error instanceof DiamantFormulaError) {
      throw error;
    }
    throw new DiamantFormulaError(
      `Error evaluating formula '${expression}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
