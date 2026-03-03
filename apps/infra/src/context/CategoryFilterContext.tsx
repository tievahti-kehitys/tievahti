import React, { createContext, useContext, useState, useCallback } from 'react';
import { useProjectCategories, ProjectCategory } from '@/hooks/useProjectCategories';
import { useProject } from '@/context/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { mergeAdjacentSegments } from '@/lib/spatialPhasingService';
import { ProductInstance } from '@/types/project';

type FilterValue = 'all' | 'uncategorized' | string; // string = category UUID

interface CategoryFilterContextType {
  filter: FilterValue;
  setFilter: (value: FilterValue) => void;
  categories: ProjectCategory[];
  categoriesLoading: boolean;
  refreshCategories: () => Promise<void>;
  createCategory: (name: string, color: string) => Promise<string | null>;
  deleteCategory: (id: string) => Promise<void>;
  /** Delete category, reset items to uncategorized, and merge adjacent segments */
  deleteCategoryWithMerge: (categoryId: string) => Promise<void>;
}

const CategoryFilterContext = createContext<CategoryFilterContextType | null>(null);

export function CategoryFilterProvider({ children }: { children: React.ReactNode }) {
  const { project, allProducts } = useProject();
  const [filter, setFilter] = useState<FilterValue>('all');
  const {
    categories,
    loading: categoriesLoading,
    fetchCategories: refreshCategories,
    createCategory,
    deleteCategory,
  } = useProjectCategories(project?.id);

  const deleteCategoryWithMerge = useCallback(async (categoryId: string) => {
    if (!project) return;

    // 1. Find all items belonging to this category
    const { data: affectedItems, error: fetchErr } = await supabase
      .from('project_items')
      .select('*')
      .eq('project_id', project.id)
      .eq('category_id', categoryId);

    if (fetchErr) {
      console.error('Failed to fetch category items:', fetchErr);
      throw fetchErr;
    }

    const affectedIds = (affectedItems || []).map((r) => r.id);
    console.log(`[CategoryDelete] Resetting ${affectedIds.length} items to uncategorized`);

    // 2. Set category_id = null for all affected items
    if (affectedIds.length > 0) {
      const { error: updateErr } = await supabase
        .from('project_items')
        .update({ category_id: null })
        .eq('category_id', categoryId)
        .eq('project_id', project.id);

      if (updateErr) {
        console.error('Failed to reset category_id:', updateErr);
        throw updateErr;
      }
    }

    // 3. Delete the category row
    await deleteCategory(categoryId);

    // 4. Re-fetch all items to get updated state for merge
    const { data: allDbItems, error: refetchErr } = await supabase
      .from('project_items')
      .select('*')
      .eq('project_id', project.id);

    if (refetchErr || !allDbItems) {
      console.error('Failed to re-fetch items for merge:', refetchErr);
      window.dispatchEvent(new Event('project-items-refresh'));
      await refreshCategories();
      return;
    }

    // Convert to ProductInstance format for merge algorithm
    const items: ProductInstance[] = allDbItems.map((row) => ({
      id: row.id,
      productDefinitionId: row.catalog_item_id,
      geometry: row.geometry as any,
      parameters: (row.user_parameters as Record<string, number>) || {},
      photos: Array.isArray(row.photos) ? (row.photos as any[]) : [],
      notes: row.notes || '',
      visible: row.visible ?? true,
      locked: row.locked ?? false,
      categoryId: row.category_id ?? null,
      offsetM: row.offset_m != null ? Number(row.offset_m) : undefined,
    }));

    // 5. Run merge on each affected item
    const mergedAwayIds = new Set<string>();
    for (const affId of affectedIds) {
      if (mergedAwayIds.has(affId)) continue;

      const result = mergeAdjacentSegments(items, affId);
      if (!result) continue;

      console.log(`[CategoryDelete] Merging ${affId} with ${result.mergedIds.length} neighbors`);

      // Update the target with merged geometry
      const { error: mergeErr } = await supabase
        .from('project_items')
        .update({ geometry: result.mergedGeometry as any })
        .eq('id', affId);

      if (mergeErr) {
        console.error('Merge update failed:', mergeErr);
        continue;
      }

      // Delete merged-away records
      for (const mId of result.mergedIds) {
        mergedAwayIds.add(mId);
        await supabase.from('project_items').delete().eq('id', mId);
      }

      // Update in-memory items array so subsequent merges see correct state
      const targetIdx = items.findIndex((i) => i.id === affId);
      if (targetIdx >= 0) {
        items[targetIdx] = { ...items[targetIdx], geometry: result.mergedGeometry };
      }
      // Remove merged items from array
      for (const mId of result.mergedIds) {
        const idx = items.findIndex((i) => i.id === mId);
        if (idx >= 0) items.splice(idx, 1);
      }
    }

    console.log(`[CategoryDelete] Merge complete. Removed ${mergedAwayIds.size} duplicate segments`);

    // 6. Reset filter if it was pointing to the deleted category
    setFilter((prev) => (prev === categoryId ? 'all' : prev));

    // Trigger refresh without navigating to bearing capacity
    window.dispatchEvent(new Event('project-items-refresh'));
    await refreshCategories();
  }, [project, deleteCategory, refreshCategories]);

  return (
    <CategoryFilterContext.Provider
      value={{
        filter,
        setFilter,
        categories,
        categoriesLoading,
        refreshCategories,
        createCategory,
        deleteCategory,
        deleteCategoryWithMerge,
      }}
    >
      {children}
    </CategoryFilterContext.Provider>
  );
}

const FALLBACK: CategoryFilterContextType = {
  filter: 'all',
  setFilter: () => {},
  categories: [],
  categoriesLoading: true,
  refreshCategories: async () => {},
  createCategory: async () => null,
  deleteCategory: async () => {},
  deleteCategoryWithMerge: async () => {},
};

export function useCategoryFilter() {
  const context = useContext(CategoryFilterContext);
  return context ?? FALLBACK;
}
