import { describe, it, expect } from 'vitest';
import { evaluateFormula, isFormulaSafe } from './costCalculator';

describe('evaluateFormula', () => {
  it('should evaluate simple formulas', () => {
    const result = evaluateFormula('5 * 10', {});
    expect(result).toBe(50);
  });

  it('should replace variables', () => {
    const result = evaluateFormula('pituus * leveys', { pituus: 10, leveys: 5 });
    expect(result).toBe(50);
  });

  it('should handle European decimal comma', () => {
    // Formula with comma: 2,4 should be treated as 2.4
    const result = evaluateFormula('10 * 2,4', {});
    expect(result).toBe(24);
  });

  it('should handle formula with variables and comma', () => {
    // leveys_m * paksuus_m * pituus * 2,4
    const result = evaluateFormula('leveys_m * paksuus_m * pituus * 2,4', {
      leveys_m: 5,
      paksuus_m: 0.1,
      pituus: 146.9,
    });
    // 5 * 0.1 * 146.9 * 2.4 = 176.28
    expect(result).toBeCloseTo(176.28, 1);
  });

  it('should handle underscore variations', () => {
    const result = evaluateFormula('pituus_m * leveys_m', {
      pituus_m: 100,
      leveys_m: 2,
    });
    expect(result).toBe(200);
  });

  it('should return 1 for empty formula', () => {
    const result = evaluateFormula('', {});
    expect(result).toBe(1);
  });

  it('should handle complex tonnage calculation', () => {
    // Real world case: road surface material calculation
    // length * width * thickness * density
    const result = evaluateFormula('pituus * leveys * paksuus * 2.4', {
      pituus: 100,
      leveys: 4,
      paksuus: 0.15,
    });
    // 100 * 4 * 0.15 * 2.4 = 144
    expect(result).toBe(144);
  });

  it('should handle child product formulas with parent parameters', () => {
    // This is the case for child products in operations
    // Formula: pituus_m * leveys_m * 0.05 * 2.4
    const result = evaluateFormula('pituus_m * leveys_m * 0.05 * 2.4', {
      pituus_m: 20,
      leveys_m: 6,
    });
    // 20 * 6 * 0.05 * 2.4 = 14.4
    expect(result).toBeCloseTo(14.4, 1);
  });

  it('should not match partial variable names', () => {
    // "pituus" should not match inside "pituus_m"
    const result = evaluateFormula('pituus_m * 2', {
      pituus: 100, // should NOT be used
      pituus_m: 50, // should be used
    });
    expect(result).toBe(100); // 50 * 2 = 100
  });
});

describe('isFormulaSafe', () => {
  it('should accept normal formulas', () => {
    expect(isFormulaSafe('pituus * leveys')).toBe(true);
    expect(isFormulaSafe('10 * 2.4')).toBe(true);
    expect(isFormulaSafe('pituus_m * leveys_m * 0.05 * 2,4')).toBe(true);
  });

  it('should reject prototype pollution attempts', () => {
    expect(isFormulaSafe('__proto__')).toBe(false);
    expect(isFormulaSafe('constructor.constructor')).toBe(false);
    expect(isFormulaSafe('prototype')).toBe(false);
  });

  it('should reject code injection attempts', () => {
    expect(isFormulaSafe('eval("alert(1)")')).toBe(false);
    expect(isFormulaSafe('Function("return this")()')).toBe(false);
    expect(isFormulaSafe('require("fs")')).toBe(false);
    expect(isFormulaSafe('window.location')).toBe(false);
  });

  it('should reject overly long formulas', () => {
    const longFormula = 'a + '.repeat(200);
    expect(isFormulaSafe(longFormula)).toBe(false);
  });
});

describe('evaluateFormula security', () => {
  it('should return 1 for dangerous formulas', () => {
    expect(evaluateFormula('__proto__.polluted', {})).toBe(1);
    expect(evaluateFormula('constructor', {})).toBe(1);
  });
});
