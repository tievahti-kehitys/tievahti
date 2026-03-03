import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CatalogComposition, CatalogItem } from '@/types/catalog';
import { catalogItemFromRow, catalogCompositionFromRow } from '@/types/catalog';

interface CompositionWithChild extends CatalogComposition {
  childItem: CatalogItem;
}

/**
 * Hook to fetch catalog compositions (child products) for a set of parent item IDs.
 * Used for rendering child product lines on the map.
 */
export function useChildCompositions(parentItemIds: string[]) {
  return useQuery<Record<string, CompositionWithChild[]>>({
    queryKey: ['child_compositions', parentItemIds],
    enabled: parentItemIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_composition')
        .select('*, catalog_items!catalog_composition_child_item_id_fkey(*)')
        .in('parent_item_id', parentItemIds)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Error fetching compositions:', error);
        return {};
      }

      // Group by parent_item_id
      const grouped: Record<string, CompositionWithChild[]> = {};
      for (const row of data || []) {
        const composition = catalogCompositionFromRow(row);
        const childItem = catalogItemFromRow(row.catalog_items);
        const withChild: CompositionWithChild = { ...composition, childItem };

        if (!grouped[composition.parentItemId]) {
          grouped[composition.parentItemId] = [];
        }
        grouped[composition.parentItemId].push(withChild);
      }

      return grouped;
    },
  });
}
