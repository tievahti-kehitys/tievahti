import { CatalogParameter } from '@/context/CatalogContext';

/**
 * Sensible fallback ranges for common parameter types when min/max/step are not set.
 */
const FALLBACK_RANGES: Record<string, { min: number; max: number; step: number }> = {
  'pituus':    { min: 0.5, max: 30,  step: 0.5 },
  'leveys':    { min: 0.5, max: 20,  step: 0.5 },
  'syvyys':    { min: 0.1, max: 5,   step: 0.1 },
  'paksuus':   { min: 0.05, max: 2,  step: 0.05 },
  'korkeus':   { min: 0.5, max: 20,  step: 0.5 },
  'halkaisija':{ min: 50,  max: 1200, step: 50 },
  'koko':      { min: 1,   max: 50,  step: 1 },
  'maara':     { min: 1,   max: 100, step: 1 },
  'lkm':       { min: 1,   max: 50,  step: 1 },
  'kulma':     { min: 0,   max: 90,  step: 5 },
  'tilavuus':  { min: 0.5, max: 50,  step: 0.5 },
  'paino':     { min: 1,   max: 100, step: 1 },
};

function getFallbackRange(param: CatalogParameter): { min: number; max: number; step: number } | null {
  const slug = param.slug.toLowerCase();
  const label = (param.label || '').toLowerCase();
  for (const [key, range] of Object.entries(FALLBACK_RANGES)) {
    if (slug.includes(key) || label.includes(key)) return range;
  }
  return null;
}

/**
 * Generate select options from min/max/step or sensible fallback defaults.
 * Returns null only if no range can be determined at all.
 */
export function generateParameterOptions(param: CatalogParameter): number[] | null {
  if (param.options && param.options.length > 0) return param.options;

  let min = param.min;
  let max = param.max;
  let step = param.step;

  if (min === undefined || max === undefined) {
    const fallback = getFallbackRange(param);
    if (fallback) {
      min = min ?? fallback.min;
      max = max ?? fallback.max;
      step = step ?? fallback.step;
    }
  }

  if (min === undefined || max === undefined) return null;
  if (min >= max) return null;

  const effectiveStep = step ?? 1;
  const count = Math.round((max - min) / effectiveStep) + 1;

  if (count > 200 || count < 2) return null;

  const opts: number[] = [];
  for (let i = 0; i < count; i++) {
    const val = min + i * effectiveStep;
    opts.push(Math.round(val * 1000) / 1000);
  }
  return opts;
}
