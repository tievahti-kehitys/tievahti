/**
 * Cost Calculator Engine
 * 
 * This module handles all cost calculations for products and operations.
 * 
 * RULES:
 * 1. Products have a unit_price and can have work requirements
 * 2. Operations have NO base price (unit_price = 0)
 * 3. Operation cost = SUM(child product costs) + SUM(child work costs)
 */

import {
  CatalogItem,
  CatalogItemWithRelations,
  CatalogComposition,
  CatalogItemWork,
  WorkType,
  ProjectItemCalculatedValues,
} from '@/types/catalog';
import { Parser } from 'expr-eval';

export interface CalculationContext {
  // Geometry-derived values
  length?: number; // From line geometry (meters)
  area?: number; // From polygon geometry (m²)
  
  // User-entered parameters
  params: Record<string, number>;
  
  // String/select parameter values
  stringParams?: Record<string, string>;
  
  // Global settings
  vatRate: number;
}

// Create a safe parser instance - no member access, only math operations
const safeParser = new Parser({
  allowMemberAccess: false,
});

// Remove dangerous functions from the parser to prevent prototype pollution
// This mitigates GHSA-8gw3-rxh4-v6jx and GHSA-jc85-fpwf-qm7x
safeParser.functions = {
  ...safeParser.functions,
};
delete (safeParser.functions as Record<string, unknown>)[''];

/** Maximum allowed formula length to prevent resource exhaustion */
const MAX_FORMULA_LENGTH = 500;

/** Pattern blocklist to prevent prototype pollution and code injection */
const DANGEROUS_PATTERNS = /(__proto__|constructor|prototype|toString|valueOf|hasOwnProperty|this\[|window|document|global|process|require|import|eval|Function)/i;

/**
 * Validate a formula string for safety before evaluation.
 * Returns true if the formula is safe, false otherwise.
 */
export function isFormulaSafe(formula: string): boolean {
  if (formula.length > MAX_FORMULA_LENGTH) return false;
  if (DANGEROUS_PATTERNS.test(formula)) return false;
  return true;
}

/**
 * Pre-process a formula that may contain:
 * - if(condition, trueVal, falseVal) with string comparisons
 * - param("slug") to access string parameter values
 * 
 * Converts these into numeric results before passing to the math parser.
 */
function preprocessFormulaWithStrings(
  formula: string,
  variables: Record<string, number>,
  stringVars: Record<string, string> = {}
): number | null {
  const trimmed = formula.trim();
  
  // Check if formula contains if() or param() — process recursively
  if (!/\bif\s*\(|\bparam\s*\(/.test(trimmed)) return null;

  // Resolve param("key") → string value or numeric value
  // We need to expand param() calls into values before evaluating
  const expanded = expandFormula(trimmed, variables, stringVars);
  if (expanded !== null) return expanded;
  return null;
}

/**
 * Recursively expand if() and param() in a formula string.
 * Returns numeric result if formula is fully if()/param() based,
 * otherwise returns null (fall through to math parser).
 */
function expandFormula(
  formula: string,
  numVars: Record<string, number>,
  strVars: Record<string, string>
): number | null {
  const s = formula.trim();
  
  // if(condition, trueExpr, falseExpr)
  const ifMatch = matchTopLevelIf(s);
  if (ifMatch) {
    const { condition, trueExpr, falseExpr } = ifMatch;
    const condResult = evaluateCondition(condition, numVars, strVars);
    const branch = condResult ? trueExpr : falseExpr;
    return expandFormula(branch, numVars, strVars) ?? evaluateSimple(branch, numVars, strVars);
  }
  
  // param("key") or param('key')
  const paramMatch = s.match(/^param\s*\(\s*["']([^"']+)["']\s*\)$/i);
  if (paramMatch) {
    const key = paramMatch[1].toLowerCase();
    if (key in strVars) return NaN; // String param cannot be numeric directly
    if (key in numVars) return numVars[key];
    return 0;
  }
  
  return null;
}

/**
 * Evaluate a simple numeric expression (with possible nested if/param).
 */
function evaluateSimple(expr: string, numVars: Record<string, number>, strVars: Record<string, string>): number {
  const nested = expandFormula(expr, numVars, strVars);
  if (nested !== null && !isNaN(nested)) return nested;
  
  try {
    let e = expr.trim().toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
    const lowerVars: Record<string, number> = {};
    for (const [k, v] of Object.entries(numVars)) lowerVars[k.toLowerCase()] = v;
    const result = safeParser.evaluate(e, lowerVars);
    if (typeof result === 'number' && isFinite(result)) return result;
  } catch {}
  return 1;
}

/**
 * Evaluate a condition string (supports ==, !=, AND/OR/&&/||, param())
 * Returns true/false
 */
function evaluateCondition(
  condition: string,
  numVars: Record<string, number>,
  strVars: Record<string, string>
): boolean {
  const s = condition.trim();
  
  // Handle AND/OR with minimal top-level splitting
  const orParts = splitTopLevel(s, ['||', 'OR', ' or ']);
  if (orParts.length > 1) {
    return orParts.some(p => evaluateCondition(p.trim(), numVars, strVars));
  }
  
  const andParts = splitTopLevel(s, ['&&', 'AND', ' and ']);
  if (andParts.length > 1) {
    return andParts.every(p => evaluateCondition(p.trim(), numVars, strVars));
  }
  
  // Unwrap outer parens
  if (s.startsWith('(') && s.endsWith(')')) {
    return evaluateCondition(s.slice(1, -1), numVars, strVars);
  }
  
  // String equality: param("key") == "value" or param("key") != "value"
  const strEqMatch = s.match(/^param\s*\(\s*["']([^"']+)["']\s*\)\s*(==|!=)\s*["']([^"']*)["']$/i);
  if (strEqMatch) {
    const [, key, op, val] = strEqMatch;
    const actual = strVars[key.toLowerCase()] ?? strVars[key] ?? '';
    return op === '==' ? actual === val : actual !== val;
  }
  
  // Numeric equality: param("key") == 5 or similar
  const numParamMatch = s.match(/^param\s*\(\s*["']([^"']+)["']\s*\)\s*(==|!=|<=|>=|<|>)\s*(-?[\d.]+)$/i);
  if (numParamMatch) {
    const [, key, op, val] = numParamMatch;
    const kl = key.toLowerCase();
    const actual = numVars[kl] ?? 0;
    const expected = parseFloat(val);
    switch (op) {
      case '==': return actual === expected;
      case '!=': return actual !== expected;
      case '<': return actual < expected;
      case '>': return actual > expected;
      case '<=': return actual <= expected;
      case '>=': return actual >= expected;
    }
  }
  
  // Variable equality: someVar == "value"
  const varStrEqMatch = s.match(/^([\w_]+)\s*(==|!=)\s*["']([^"']*)["']$/i);
  if (varStrEqMatch) {
    const [, key, op, val] = varStrEqMatch;
    const actual = strVars[key.toLowerCase()] ?? strVars[key] ?? '';
    return op === '==' ? actual === val : actual !== val;
  }
  
  // Try numeric comparison as fallback
  try {
    const lowerVars: Record<string, number> = {};
    for (const [k, v] of Object.entries(numVars)) lowerVars[k.toLowerCase()] = v;
    const result = safeParser.evaluate(s.toLowerCase().replace(/(\d),(\d)/g, '$1.$2'), lowerVars);
    return Boolean(result);
  } catch {}
  
  return false;
}

/**
 * Split a string by top-level delimiters (not inside parens).
 */
function splitTopLevel(s: string, delimiters: string[]): string[] {
  let depth = 0;
  let start = 0;
  const parts: string[] = [];
  
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(' || s[i] === '"' || s[i] === "'") depth++;
    if (s[i] === ')' && depth > 0) depth--;
    
    if (depth === 0) {
      for (const delim of delimiters) {
        if (s.slice(i).toUpperCase().startsWith(delim.toUpperCase())) {
          parts.push(s.slice(start, i));
          i += delim.length - 1;
          start = i + 1;
          break;
        }
      }
    }
  }
  
  parts.push(s.slice(start));
  return parts.length > 1 ? parts : [s];
}

/**
 * Match top-level if(condition, trueExpr, falseExpr) call.
 * Returns the three parts, or null if not an if() call.
 */
function matchTopLevelIf(s: string): { condition: string; trueExpr: string; falseExpr: string } | null {
  const lower = s.toLowerCase().trimStart();
  if (!lower.startsWith('if(') && !lower.startsWith('if (')) return null;
  
  // Find opening paren
  const openIdx = s.indexOf('(');
  if (openIdx === -1) return null;
  
  // Parse past the opening paren, tracking depth and comma positions
  let depth = 0;
  const commas: number[] = [];
  
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        // Found closing paren — we need exactly 2 top-level commas
        if (commas.length < 2) return null;
        const condition = s.slice(openIdx + 1, commas[0]).trim();
        const trueExpr = s.slice(commas[0] + 1, commas[1]).trim();
        const falseExpr = s.slice(commas[1] + 1, i).trim();
        return { condition, trueExpr, falseExpr };
      }
    } else if (c === ',' && depth === 1) {
      commas.push(i);
    }
  }
  
  return null;
}

/**
 * Evaluate a formula string with given variables using a safe expression parser.
 * Supports: math, if(cond, t, f), param("slug") for string comparisons.
 */
export function evaluateFormula(
  formula: string,
  variables: Record<string, number>,
  stringVariables?: Record<string, string>
): number {
  if (!formula || formula.trim() === '') return 1;
  
  // Security: validate formula before evaluation
  if (!isFormulaSafe(formula)) {
    console.warn(`Formula rejected by safety check: ${formula.substring(0, 50)}...`);
    return 1;
  }
  
  // Try if()/param() preprocessing first
  const strVars: Record<string, string> = {};
  if (stringVariables) {
    for (const [k, v] of Object.entries(stringVariables)) strVars[k.toLowerCase()] = v;
  }
  
  const preprocessed = preprocessFormulaWithStrings(formula, 
    buildLowerVars(variables), strVars);
  if (preprocessed !== null && !isNaN(preprocessed)) return preprocessed;
  
  try {
    let expression = formula.toLowerCase();
    
    // Replace European decimal comma with period (e.g., 2,4 -> 2.4)
    expression = expression.replace(/(\d),(\d)/g, '$1.$2');
    
    // Replace parent.xxx references with just the param name
    expression = expression.replace(/parent\.([\w]+)/gi, (_match, paramName) => paramName.toLowerCase());
    
    const lowerVars = buildLowerVars(variables);
    
    const result = safeParser.evaluate(expression, lowerVars);
    
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result;
    }
    
    console.warn(`Formula evaluation returned invalid result: ${formula} = ${result}`);
    return 1;
  } catch (err) {
    console.warn(`Formula evaluation error: ${formula}`, err);
    return 1;
  }
}

function buildLowerVars(variables: Record<string, number>): Record<string, number> {
  const lowerVars: Record<string, number> = {};
  for (const [key, value] of Object.entries(variables)) {
    lowerVars[key.toLowerCase()] = value;
  }
  return lowerVars;
}

/**
 * Evaluate a name formula to get the resolved (dynamic) name.
 * Uses safe string interpolation — splits by '+', resolves string literals
 * and variable references, then concatenates.
 * Example: "'Rumpu Ø' + leveys + 'mm'" -> "Rumpu Ø300mm"
 */
export function evaluateNameFormula(
  formula: string | undefined,
  staticName: string,
  variables: Record<string, number>
): string {
  if (!formula || formula.trim() === '') return staticName;
  
  try {
    // Build lowercase variable map
    const lowerVars: Record<string, number> = {};
    for (const [key, value] of Object.entries(variables)) {
      lowerVars[key.toLowerCase()] = value;
    }

    // Split by '+' and process each token
    const parts = formula.split('+').map(part => {
      const trimmed = part.trim();
      
      // String literal in single or double quotes
      const stringMatch = trimmed.match(/^['"](.*)['"]$/);
      if (stringMatch) return stringMatch[1];
      
      // Try as a variable reference
      const varName = trimmed.toLowerCase();
      if (varName in lowerVars) return String(lowerVars[varName]);
      
      // Try evaluating as a math expression
      try {
        const val = safeParser.evaluate(trimmed.toLowerCase().replace(/(\d),(\d)/g, '$1.$2'), lowerVars);
        if (typeof val === 'number' && isFinite(val)) return String(val);
      } catch {
        // not a valid expression
      }
      
      // Return raw token as fallback
      return trimmed;
    });

    const result = parts.join('');
    return result.trim() !== '' ? result : staticName;
  } catch (err) {
    console.warn(`Name formula evaluation error: ${formula}`, err);
    return staticName;
  }
}

/**
 * Evaluate a price formula to get the dynamic unit price
 * Example: "quantity * (width * 0.2)" or just "45.5"
 */
export function evaluatePriceFormula(
  formula: string | undefined,
  staticPrice: number,
  variables: Record<string, number>,
  stringVariables?: Record<string, string>
): number {
  if (!formula || formula.trim() === '') return staticPrice;

  const result = evaluateFormula(formula, variables, stringVariables);
  return Number.isFinite(result) ? result : staticPrice;
}

/**
 * Evaluate a work hours formula to get dynamic hours per unit
 * Example: "(0.2 / length) + (width / 8000)"
 */
export function evaluateWorkHoursFormula(
  formula: string | undefined,
  staticHours: number,
  variables: Record<string, number>,
  stringVariables?: Record<string, string>
): number {
  if (!formula || formula.trim() === '') return staticHours;

  const result = evaluateFormula(formula, variables, stringVariables);
  return Number.isFinite(result) ? result : staticHours;
}

/**
 * Calculate work hours for a requirement.
 *
 * Supports two real-world styles:
 * 1) "hours per unit" formulas (default): formula does NOT reference quantity -> hours = quantity * formulaResult
 * 2) "total hours" formulas: formula references quantity tokens (e.g. maara_kpl) -> hours = formulaResult
 */
export function calculateWorkHours(
  quantity: number,
  requirement: Pick<CatalogItemWork, 'hoursPerUnit' | 'hoursFormula'>,
  variables: Record<string, number>,
  stringVariables?: Record<string, string>
): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const rawFormula = requirement.hoursFormula?.trim();

  if (rawFormula) {
    const evaluated = evaluateWorkHoursFormula(rawFormula, requirement.hoursPerUnit, {
      ...variables,
      quantity: q,
    }, stringVariables);

    const f = rawFormula.toLowerCase();
    const looksLikeTotalHours =
      f.includes('quantity') ||
      f.includes('maara_kpl') ||
      f.includes('määrä') ||
      f.includes('maara') ||
      f.includes('kpl') ||
      f.includes('count') ||
      f.includes('lukumaara') ||
      f.includes('lukumäärä');

    return looksLikeTotalHours ? evaluated : q * evaluated;
  }

  return q * (requirement.hoursPerUnit ?? 0);
}

/**
 * Calculate quantity from geometry and parameters
 */
export function calculateQuantity(
  item: CatalogItem,
  context: CalculationContext
): number {
  const { params } = context;
  
  // Build variables for formula evaluation
  const variables: Record<string, number> = {
    ...params,
    length: context.length ?? params.pituus ?? params.pituus_m ?? 1,
    pituus: context.length ?? params.pituus ?? params.pituus_m ?? 1,
    area: context.area ?? params.ala ?? params.pinta_ala ?? 1,
    ala: context.area ?? params.ala ?? params.pinta_ala ?? 1,
  };

  // If there's a quantity formula, use it (with string params for if() support)
  if (item.quantityFormula) {
    return evaluateFormula(item.quantityFormula, variables, context.stringParams);
  }

  // Default: return 1 for point, length for line, area for polygon
  if (context.length) return context.length;
  if (context.area) return context.area;
  return 1;
}


/**
 * Calculate cost for a simple Product (not an Operation)
 */
export function calculateProductCost(
  item: CatalogItem,
  quantity: number,
  workRequirements: CatalogItemWork[],
  workTypes: WorkType[],
  vatRate: number,
  variables?: Record<string, number>,
  stringVariables?: Record<string, string>
): ProjectItemCalculatedValues {
  // Material cost — use priceFormula if available
  const unitPrice = item.priceFormula && variables
    ? evaluatePriceFormula(item.priceFormula, item.unitPrice, variables, stringVariables)
    : item.unitPrice;
  const materialCost = quantity * unitPrice;
  
  // Work cost
  let workHours = 0;
  let workCost = 0;
  
  for (const req of workRequirements) {
    const workType = workTypes.find(wt => wt.id === req.workTypeId) ?? req.workType;
    if (workType) {
      const hours = variables
        ? calculateWorkHours(quantity, req, variables, stringVariables)
        : quantity * req.hoursPerUnit;
      workHours += hours;
      workCost += hours * workType.hourlyRate;
    }
  }
  
  const totalExclVat = materialCost + workCost;
  const totalInclVat = totalExclVat * (1 + vatRate / 100);
  
  return {
    quantity,
    materialCost,
    workHours,
    workCost,
    totalExclVat,
    totalInclVat,
  };
}

/**
 * Calculate cost for an Operation (container with child components)
 * 
 * IMPORTANT: Operations have NO base price.
 * Their cost is strictly the SUM of child components.
 */
export function calculateOperationCost(
  operation: CatalogItemWithRelations,
  context: CalculationContext,
  allItems: CatalogItem[],
  workTypes: WorkType[]
): ProjectItemCalculatedValues {
  const children: ProjectItemCalculatedValues['children'] = [];
  
  let totalMaterialCost = 0;
  let totalWorkCost = 0;
  let totalWorkHours = 0;
  
  // Build parent variables for child formula evaluation
  const parentVariables: Record<string, number> = {
    ...context.params,
    length: context.length ?? context.params.pituus ?? context.params.pituus_m ?? 1,
    pituus: context.length ?? context.params.pituus ?? context.params.pituus_m ?? 1,
    area: context.area ?? context.params.ala ?? context.params.pinta_ala ?? 1,
    ala: context.area ?? context.params.ala ?? context.params.pinta_ala ?? 1,
  };
  
  // Build parent string variables for if(param()) support
  const parentStringVars: Record<string, string> = context.stringParams ?? {};
  
  // Calculate each child component
  for (const composition of operation.compositions) {
    const childItem = composition.childItem ?? allItems.find(i => i.id === composition.childItemId);
    if (!childItem) continue;
    
    // Calculate child quantity from factor formula — supports if(param()) conditions
    const childQuantity = evaluateFormula(composition.quantityFactorFormula, parentVariables, parentStringVars);
    
    // Get work requirements for child (we'd need to fetch these, but for now use empty)
    // In production, you'd fetch these from the database
    const childWork: CatalogItemWork[] = [];
    
    // Calculate child cost
    const childCost = calculateProductCost(childItem, childQuantity, childWork, workTypes, context.vatRate, parentVariables, parentStringVars);
    
    totalMaterialCost += childCost.materialCost;
    totalWorkCost += childCost.workCost;
    totalWorkHours += childCost.workHours;
    
    children.push({
      itemId: childItem.id,
      name: composition.label || childItem.name,
      quantity: childQuantity,
      materialCost: childCost.materialCost,
      workCost: childCost.workCost,
      total: childCost.totalExclVat,
    });
  }
  
  // Add operation's own work requirements (if any)
  for (const req of operation.workRequirements) {
    const workType = workTypes.find(wt => wt.id === req.workTypeId) ?? req.workType;
    if (workType) {
      const operationQuantity = calculateQuantity(operation, context);
      const hours = calculateWorkHours(operationQuantity, req, parentVariables, parentStringVars);
      totalWorkHours += hours;
      totalWorkCost += hours * workType.hourlyRate;
    }
  }
  
  const totalExclVat = totalMaterialCost + totalWorkCost;
  const totalInclVat = totalExclVat * (1 + context.vatRate / 100);
  
  return {
    quantity: calculateQuantity(operation, context),
    materialCost: totalMaterialCost,
    workHours: totalWorkHours,
    workCost: totalWorkCost,
    totalExclVat,
    totalInclVat,
    children,
  };
}

/**
 * Calculate length from a line geometry (in meters)
 */
export function calculateLineLength(coordinates: [number, number][]): number {
  if (coordinates.length < 2) return 0;
  
  let totalLength = 0;
  for (let i = 1; i < coordinates.length; i++) {
    totalLength += haversineDistance(coordinates[i - 1], coordinates[i]);
  }
  
  return totalLength;
}

/**
 * Calculate area from a polygon geometry (in m²)
 */
export function calculatePolygonArea(coordinates: [number, number][]): number {
  if (coordinates.length < 3) return 0;
  
  // Use the Shoelace formula for simple polygons
  // Note: This is approximate and works better for small areas
  let area = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i][1] * coordinates[j][0];
    area -= coordinates[j][1] * coordinates[i][0];
  }
  
  area = Math.abs(area) / 2;
  
  // Convert from degrees² to m² (approximate at mid-latitudes)
  // This is a simplification; for accuracy, use proper projection
  const midLat = coordinates.reduce((sum, c) => sum + c[0], 0) / n;
  const latFactor = 111320 * Math.cos(midLat * Math.PI / 180);
  const lonFactor = 111320;
  
  return area * latFactor * lonFactor;
}

/**
 * Calculate Haversine distance between two points (in meters)
 */
function haversineDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371000; // Earth's radius in meters
  const lat1 = coord1[0] * Math.PI / 180;
  const lat2 = coord2[0] * Math.PI / 180;
  const deltaLat = (coord2[0] - coord1[0]) * Math.PI / 180;
  const deltaLon = (coord2[1] - coord1[1]) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
