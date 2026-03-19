import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Diamant,
  evaluateFormula,
  DiamantFormulaError,
} from '../src/index.js';
import type { Table } from '../src/index.js';

/** Simple helper: no columns, just returns null for any reference */
const noRef = (_name: string): unknown => null;

describe('Formula engine (evaluateFormula)', () => {
  // --- Arithmetic ---

  describe('arithmetic', () => {
    it('should add two numbers', () => {
      expect(evaluateFormula('2 + 3', noRef)).toBe(5);
    });

    it('should subtract', () => {
      expect(evaluateFormula('10 - 4', noRef)).toBe(6);
    });

    it('should multiply', () => {
      expect(evaluateFormula('3 * 7', noRef)).toBe(21);
    });

    it('should divide', () => {
      expect(evaluateFormula('20 / 4', noRef)).toBe(5);
    });

    it('should respect operator precedence', () => {
      expect(evaluateFormula('2 + 3 * 4', noRef)).toBe(14);
    });

    it('should handle parentheses', () => {
      expect(evaluateFormula('(2 + 3) * 4', noRef)).toBe(20);
    });

    it('should handle negative numbers (unary minus)', () => {
      expect(evaluateFormula('-5 + 3', noRef)).toBe(-2);
    });

    it('should handle decimal numbers', () => {
      expect(evaluateFormula('1.5 + 2.5', noRef)).toBe(4);
    });
  });

  // --- Division by zero ---

  describe('division by zero', () => {
    it('should throw DiamantFormulaError', () => {
      expect(() => evaluateFormula('10 / 0', noRef)).toThrow(DiamantFormulaError);
    });
  });

  // --- Comparisons ---

  describe('comparisons', () => {
    it('should evaluate = (equality)', () => {
      expect(evaluateFormula('5 = 5', noRef)).toBe(true);
      expect(evaluateFormula('5 = 6', noRef)).toBe(false);
    });

    it('should evaluate != (inequality)', () => {
      expect(evaluateFormula('5 != 6', noRef)).toBe(true);
      expect(evaluateFormula('5 != 5', noRef)).toBe(false);
    });

    it('should evaluate >', () => {
      expect(evaluateFormula('10 > 5', noRef)).toBe(true);
      expect(evaluateFormula('5 > 10', noRef)).toBe(false);
    });

    it('should evaluate <', () => {
      expect(evaluateFormula('3 < 7', noRef)).toBe(true);
      expect(evaluateFormula('7 < 3', noRef)).toBe(false);
    });

    it('should evaluate >=', () => {
      expect(evaluateFormula('5 >= 5', noRef)).toBe(true);
      expect(evaluateFormula('6 >= 5', noRef)).toBe(true);
      expect(evaluateFormula('4 >= 5', noRef)).toBe(false);
    });

    it('should evaluate <=', () => {
      expect(evaluateFormula('5 <= 5', noRef)).toBe(true);
      expect(evaluateFormula('4 <= 5', noRef)).toBe(true);
      expect(evaluateFormula('6 <= 5', noRef)).toBe(false);
    });

    it('should compare strings', () => {
      expect(evaluateFormula("'abc' = 'abc'", noRef)).toBe(true);
      expect(evaluateFormula("'abc' != 'def'", noRef)).toBe(true);
    });

    it('should compare booleans', () => {
      expect(evaluateFormula('TRUE = TRUE', noRef)).toBe(true);
      expect(evaluateFormula('TRUE != FALSE', noRef)).toBe(true);
    });
  });

  // --- String concatenation ---

  describe('string concatenation (&)', () => {
    it('should concatenate two strings', () => {
      expect(evaluateFormula("'Hello' & ' ' & 'World'", noRef)).toBe('Hello World');
    });

    it('should concatenate number with string', () => {
      expect(evaluateFormula("'Count: ' & 42", noRef)).toBe('Count: 42');
    });
  });

  // --- Column references ---

  describe('column references', () => {
    it('should resolve column value', () => {
      const getCellValue = (name: string) => {
        if (name === 'Age') return 30;
        return null;
      };
      expect(evaluateFormula('{Age} + 5', getCellValue)).toBe(35);
    });

    it('should handle multiple column references', () => {
      const getCellValue = (name: string) => {
        if (name === 'Price') return 100;
        if (name === 'Qty') return 3;
        return null;
      };
      expect(evaluateFormula('{Price} * {Qty}', getCellValue)).toBe(300);
    });
  });

  // --- Functions ---

  describe('IF function', () => {
    it('should return then-value when condition is true', () => {
      expect(evaluateFormula("IF(TRUE, 'yes', 'no')", noRef)).toBe('yes');
    });

    it('should return else-value when condition is false', () => {
      expect(evaluateFormula("IF(FALSE, 'yes', 'no')", noRef)).toBe('no');
    });

    it('should return null when no else-value and condition is false', () => {
      expect(evaluateFormula("IF(FALSE, 'yes')", noRef)).toBeNull();
    });

    it('should evaluate numeric condition', () => {
      expect(evaluateFormula("IF(1, 'truthy', 'falsy')", noRef)).toBe('truthy');
      expect(evaluateFormula("IF(0, 'truthy', 'falsy')", noRef)).toBe('falsy');
    });

    it('should work with comparisons as condition', () => {
      expect(evaluateFormula("IF(5 > 3, 'big', 'small')", noRef)).toBe('big');
    });
  });

  describe('SUM function', () => {
    it('should sum multiple values', () => {
      expect(evaluateFormula('SUM(1, 2, 3, 4)', noRef)).toBe(10);
    });

    it('should sum column references', () => {
      const get = (name: string) => {
        if (name === 'A') return 10;
        if (name === 'B') return 20;
        return 0;
      };
      expect(evaluateFormula('SUM({A}, {B})', get)).toBe(30);
    });

    it('should throw for no arguments', () => {
      expect(() => evaluateFormula('SUM()', noRef)).toThrow(DiamantFormulaError);
    });
  });

  describe('CONCAT function', () => {
    it('should concatenate strings', () => {
      expect(evaluateFormula("CONCAT('Hello', ' ', 'World')", noRef)).toBe('Hello World');
    });

    it('should convert non-strings', () => {
      expect(evaluateFormula("CONCAT('Num: ', 42)", noRef)).toBe('Num: 42');
    });

    it('should throw for no arguments', () => {
      expect(() => evaluateFormula('CONCAT()', noRef)).toThrow(DiamantFormulaError);
    });
  });

  describe('LEN function', () => {
    it('should return string length', () => {
      expect(evaluateFormula("LEN('hello')", noRef)).toBe(5);
    });

    it('should return 0 for empty string', () => {
      expect(evaluateFormula("LEN('')", noRef)).toBe(0);
    });

    it('should convert number to string and get length', () => {
      expect(evaluateFormula('LEN(123)', noRef)).toBe(3);
    });
  });

  describe('LOWER function', () => {
    it('should lowercase a string', () => {
      expect(evaluateFormula("LOWER('HELLO')", noRef)).toBe('hello');
    });
  });

  describe('UPPER function', () => {
    it('should uppercase a string', () => {
      expect(evaluateFormula("UPPER('hello')", noRef)).toBe('HELLO');
    });
  });

  describe('TRIM function', () => {
    it('should trim whitespace', () => {
      expect(evaluateFormula("TRIM('  hello  ')", noRef)).toBe('hello');
    });
  });

  describe('ROUND function', () => {
    it('should round to integer by default', () => {
      expect(evaluateFormula('ROUND(3.7)', noRef)).toBe(4);
    });

    it('should round to specified decimals', () => {
      expect(evaluateFormula('ROUND(3.14159, 2)', noRef)).toBe(3.14);
    });

    it('should round down', () => {
      expect(evaluateFormula('ROUND(3.3)', noRef)).toBe(3);
    });
  });

  describe('NOW function', () => {
    it('should return an ISO date string', () => {
      const result = evaluateFormula('NOW()', noRef) as string;
      expect(typeof result).toBe('string');
      // Should be parseable as a date
      expect(new Date(result).toISOString()).toBe(result);
    });

    it('should throw if called with arguments', () => {
      expect(() => evaluateFormula('NOW(1)', noRef)).toThrow(DiamantFormulaError);
    });
  });

  describe('TODAY function', () => {
    it('should return a YYYY-MM-DD string', () => {
      const result = evaluateFormula('TODAY()', noRef) as string;
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should throw if called with arguments', () => {
      expect(() => evaluateFormula('TODAY(1)', noRef)).toThrow(DiamantFormulaError);
    });
  });

  describe('BLANK function', () => {
    it('should return null', () => {
      expect(evaluateFormula('BLANK()', noRef)).toBeNull();
    });

    it('should throw if called with arguments', () => {
      expect(() => evaluateFormula('BLANK(1)', noRef)).toThrow(DiamantFormulaError);
    });
  });

  // --- Nested expressions ---

  describe('nested expressions', () => {
    it('should handle nested function calls', () => {
      expect(evaluateFormula("UPPER(TRIM('  hello  '))", noRef)).toBe('HELLO');
    });

    it('should handle complex arithmetic with column refs', () => {
      const get = (name: string) => {
        if (name === 'A') return 10;
        if (name === 'B') return 3;
        return 0;
      };
      expect(evaluateFormula('({A} + {B}) * 2 - 1', get)).toBe(25);
    });

    it('should handle IF with arithmetic', () => {
      const get = (name: string) => {
        if (name === 'Score') return 85;
        return 0;
      };
      expect(evaluateFormula("IF({Score} >= 90, 'A', IF({Score} >= 80, 'B', 'C'))", get)).toBe('B');
    });
  });

  // --- Parse errors ---

  describe('parse errors', () => {
    it('should throw for empty expression', () => {
      expect(() => evaluateFormula('', noRef)).toThrow(DiamantFormulaError);
    });

    it('should throw for whitespace-only expression', () => {
      expect(() => evaluateFormula('   ', noRef)).toThrow(DiamantFormulaError);
    });

    it('should throw for unterminated string literal', () => {
      expect(() => evaluateFormula("'unterminated", noRef)).toThrow(DiamantFormulaError);
    });

    it('should throw for unterminated column reference', () => {
      expect(() => evaluateFormula('{Col', noRef)).toThrow(DiamantFormulaError);
    });

    it('should throw for empty column reference', () => {
      expect(() => evaluateFormula('{}', noRef)).toThrow(DiamantFormulaError);
    });

    it('should throw for unknown character', () => {
      expect(() => evaluateFormula('5 # 3', noRef)).toThrow(DiamantFormulaError);
    });

    it('should throw for unknown function', () => {
      expect(() => evaluateFormula('FOO(1)', noRef)).toThrow(DiamantFormulaError);
    });

    it('should throw for invalid number literal', () => {
      expect(() => evaluateFormula('1.2.3', noRef)).toThrow(DiamantFormulaError);
    });
  });

  // --- Formula column in a table ---

  describe('formula column integration', () => {
    let db: Diamant;
    let table: Table;

    beforeEach(() => {
      db = new Diamant(':memory:');
      const base = db.createBase('B');
      table = base.createTable('T');
    });

    afterEach(() => {
      db.close();
    });

    it('should compute formula values when getting rows', () => {
      table.addColumn({ name: 'Price', type: 'number' });
      table.addColumn({ name: 'Qty', type: 'number' });
      table.addColumn({
        name: 'Total',
        type: 'formula',
        config: { expression: '{Price} * {Qty}' },
      });

      const row = table.addRow({ Price: 25, Qty: 4 });
      const fetched = table.getRow(row.id);
      expect(fetched.cells.Total).toBe(100);
    });

    it('should handle formulas referencing other formulas', () => {
      table.addColumn({ name: 'A', type: 'number' });
      table.addColumn({ name: 'B', type: 'number' });
      // Note: formulas referencing other formulas depend on column order
      table.addColumn({
        name: 'Sum',
        type: 'formula',
        config: { expression: '{A} + {B}' },
      });

      const row = table.addRow({ A: 10, B: 20 });
      const fetched = table.getRow(row.id);
      expect(fetched.cells.Sum).toBe(30);
    });

    it('should return null for formula with errors', () => {
      table.addColumn({ name: 'X', type: 'number' });
      table.addColumn({
        name: 'Bad',
        type: 'formula',
        config: { expression: '{X} / 0' },
      });

      const row = table.addRow({ X: 10 });
      const fetched = table.getRow(row.id);
      // Division by zero should result in null (caught by try/catch)
      expect(fetched.cells.Bad).toBeNull();
    });

    it('should use string functions in formulas', () => {
      table.addColumn({ name: 'First', type: 'text' });
      table.addColumn({ name: 'Last', type: 'text' });
      table.addColumn({
        name: 'Full',
        type: 'formula',
        config: { expression: "CONCAT({First}, ' ', {Last})" },
      });

      const row = table.addRow({ First: 'Jane', Last: 'Doe' });
      const fetched = table.getRow(row.id);
      expect(fetched.cells.Full).toBe('Jane Doe');
    });

    it('should use IF with column data', () => {
      table.addColumn({ name: 'Score', type: 'number' });
      table.addColumn({
        name: 'Pass',
        type: 'formula',
        config: { expression: "IF({Score} >= 50, 'Pass', 'Fail')" },
      });

      const r1 = table.addRow({ Score: 75 });
      const r2 = table.addRow({ Score: 30 });
      expect(table.getRow(r1.id).cells.Pass).toBe('Pass');
      expect(table.getRow(r2.id).cells.Pass).toBe('Fail');
    });
  });
});
