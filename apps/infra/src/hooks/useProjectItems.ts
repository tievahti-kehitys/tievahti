/**
 * Hook to fetch project_items from the DB (including mass_calc generated items)
 * and convert them to ProductInstance format for unified map rendering.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProductInstance } from '@/types/project';

export function useProjectItems(projectId: string | undefined) {
  const [dbItems, setDbItems] = useState<ProductInstance[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!projectId) {
      setDbItems([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_items')
        .select('*')
        .eq('project_id', projectId);

      if (error) {
        console.error('Failed to fetch project_items:', error);
        setDbItems([]);
        return;
      }

      const converted: ProductInstance[] = (data || []).map(row => ({
        id: row.id,
        productDefinitionId: row.catalog_item_id,
        geometry: row.geometry as any,
        parameters: (row.user_parameters as Record<string, number>) || {},
        stringParameters: (row.string_parameters as Record<string, string>) || {},
        photos: Array.isArray(row.photos) ? (row.photos as any[]) : [],
        notes: row.notes || '',
        visible: row.visible ?? true,
        locked: row.locked ?? false,
        colorOverride: (row.style_overrides as any)?.colorOverride,
        customMarkerImage: (row.style_overrides as any)?.customMarkerImage,
        offsetM: row.offset_m != null ? Number(row.offset_m) : undefined,
        chainageStart: row.chainage_start != null ? Number(row.chainage_start) : undefined,
        chainageEnd: row.chainage_end != null ? Number(row.chainage_end) : undefined,
        categoryId: (row as any).category_id ?? null,
      }));

      setDbItems(converted);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Listen for mass calc completion OR category assignment refresh to refetch
  useEffect(() => {
    const handler = () => fetchItems();
    window.addEventListener('mass-calc-complete', handler);
    window.addEventListener('project-items-refresh', handler);
    return () => {
      window.removeEventListener('mass-calc-complete', handler);
      window.removeEventListener('project-items-refresh', handler);
    };
  }, [fetchItems]);

  return { dbItems, loading, refetch: fetchItems };
}

