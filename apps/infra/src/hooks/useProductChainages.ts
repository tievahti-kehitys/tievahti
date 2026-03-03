/**
 * Hook to resolve chainage (paalupiste/paaluväli) for all project items.
 * Uses stored DB values first, calculates on-the-fly for missing ones.
 */

import { useState, useEffect, useMemo } from 'react';
import { ProductInstance } from '@/types/project';
import { calculateChainage } from '@/lib/chainageCalculator';

export interface ResolvedChainage {
  chainageStart: number | null;
  chainageEnd: number | null;
}

export function useProductChainages(
  projectId: string | undefined,
  products: ProductInstance[],
) {
  const [calculated, setCalculated] = useState<Record<string, ResolvedChainage>>({});

  // Products that already have chainage in DB
  const fromDb = useMemo(() => {
    const map: Record<string, ResolvedChainage> = {};
    for (const p of products) {
      if (p.chainageStart != null) {
        map[p.id] = {
          chainageStart: p.chainageStart,
          chainageEnd: p.chainageEnd ?? null,
        };
      }
    }
    return map;
  }, [products]);

  // Products missing chainage - need calculation
  useEffect(() => {
    if (!projectId) return;

    const missing = products.filter(p => p.chainageStart == null);
    if (missing.length === 0) {
      setCalculated({});
      return;
    }

    let cancelled = false;

    (async () => {
      const results: Record<string, ResolvedChainage> = {};

      // Calculate all missing in parallel
      const promises = missing.map(async (p) => {
        const result = await calculateChainage(projectId, p.geometry);
        if (result) {
          results[p.id] = {
            chainageStart: result.chainageStart,
            chainageEnd: result.chainageEnd ?? null,
          };
        }
      });

      await Promise.all(promises);

      if (!cancelled) {
        setCalculated(results);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, products]);

  // Merge DB values with calculated values
  const chainageMap = useMemo(() => {
    return { ...calculated, ...fromDb };
  }, [fromDb, calculated]);

  return chainageMap;
}

/**
 * Format chainage as a display string.
 * Point: "PL 150"
 * Range: "PL 100 – 350"
 */
export function formatChainageDisplay(
  chainageStart: number | null | undefined,
  chainageEnd: number | null | undefined,
  isLine: boolean,
): string {
  if (chainageStart == null) return '';
  const start = Math.round(chainageStart);
  if (isLine && chainageEnd != null && chainageEnd !== chainageStart) {
    const end = Math.round(chainageEnd);
    return `${start} – ${end}`;
  }
  return `${start}`;
}
