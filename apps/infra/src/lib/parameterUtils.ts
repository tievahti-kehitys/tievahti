import type { CatalogParameter } from '@/types/catalog';

type ParamsLike = Record<string, unknown> | null | undefined;

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }

  return undefined;
}

function legacyCandidatesForSlug(slugLower: string): string[] {
  // NOTE: These are *migration* fallbacks for older saved projects.
  // The goal is still that formulas use the canonical slugs.
  switch (slugLower) {
    case 'pituus_m':
      return ['pituus_m', 'pituus', 'length', 'm', 'p'];
    case 'leveys_m':
      return ['leveys_m', 'leveys', 'width', 'width_m', 'l', 'w'];
    case 'paksuus_m':
      return ['paksuus_m', 'paksuus', 'thickness', 'thickness_m', 't'];
    case 'korkeus_m':
      return ['korkeus_m', 'korkeus', 'height', 'height_m', 'k'];
    case 'syvyys_m':
      return ['syvyys_m', 'syvyys', 'depth', 'depth_m', 's'];
    case 'maara_kpl':
      return ['maara_kpl', 'maara', 'kpl', 'quantity', 'count', 'q'];
    default:
      return [slugLower];
  }
}

/**
 * Returns params that are safe to use in formula evaluation:
 * - keeps existing numeric keys
 * - ensures every catalog defaultParameter slug has a value
 *   (either from saved params, legacy fallbacks, or the parameter default)
 */
export function buildEffectiveParameters(
  params: ParamsLike,
  defaultParameters: CatalogParameter[]
): Record<string, number> {
  const out: Record<string, number> = {};

  // Keep any existing numeric keys as-is
  for (const [key, value] of Object.entries(params ?? {})) {
    const n = coerceNumber(value);
    if (n !== undefined) out[key] = n;
  }

  // Case-insensitive lookup
  const outLower: Record<string, number> = {};
  for (const [k, v] of Object.entries(out)) {
    outLower[k.toLowerCase()] = v;
  }

  for (const p of defaultParameters ?? []) {
    const slug = p.slug;
    const slugLower = slug.toLowerCase();

    let value = outLower[slugLower];
    if (value === undefined) {
      const candidates = legacyCandidatesForSlug(slugLower);
      for (const c of candidates) {
        const candidateValue = outLower[c.toLowerCase()];
        if (candidateValue !== undefined) {
          value = candidateValue;
          break;
        }
      }
    }

    if (value === undefined) value = p.default;
    out[slug] = value;
  }

  return out;
}

/**
 * Produces a strict parameters object containing ONLY the catalog parameter slugs.
 * Useful for saving back to the project so formulas always have matching keys.
 */
export function stripToCatalogParameterSlugs(
  params: ParamsLike,
  defaultParameters: CatalogParameter[]
): Record<string, number> {
  const effective = buildEffectiveParameters(params, defaultParameters);
  const cleaned: Record<string, number> = {};
  for (const p of defaultParameters ?? []) {
    cleaned[p.slug] = effective[p.slug];
  }
  return cleaned;
}
