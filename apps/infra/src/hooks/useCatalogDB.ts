import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  CatalogItem,
  CatalogComposition,
  CatalogItemWork,
  WorkType,
  ProjectItem,
  CatalogItemWithRelations,
  CatalogParameter,
  MarkerStyle,
  catalogItemFromRow,
  catalogCompositionFromRow,
  catalogItemWorkFromRow,
  workTypeFromRow,
  projectItemFromRow,
  CatalogItemRow,
  CatalogCompositionRow,
  CatalogItemWorkRow,
  WorkTypeRow,
  ProjectItemRow,
} from '@/types/catalog';

interface CatalogState {
  items: CatalogItem[];
  workTypes: WorkType[];
  loading: boolean;
  error: string | null;
}

export function useCatalogDB() {
  const [state, setState] = useState<CatalogState>({
    items: [],
    workTypes: [],
    loading: true,
    error: null,
  });

  // Load all catalog data
  const loadData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const [itemsRes, workTypesRes] = await Promise.all([
        supabase.from('catalog_items').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('work_types').select('*').order('name'),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (workTypesRes.error) throw workTypesRes.error;

      setState({
        items: (itemsRes.data as CatalogItemRow[]).map(catalogItemFromRow),
        workTypes: (workTypesRes.data as WorkTypeRow[]).map(workTypeFromRow),
        loading: false,
        error: null,
      });
    } catch (err: any) {
      console.error('Error loading catalog:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: err.message,
      }));
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get catalog item with all relations (compositions, work requirements)
  const getItemWithRelations = useCallback(async (itemId: string): Promise<CatalogItemWithRelations | null> => {
    const { data: itemData, error: itemError } = await supabase
      .from('catalog_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !itemData) return null;

    const [compositionsRes, workRes] = await Promise.all([
      supabase
        .from('catalog_composition')
        .select('*, catalog_items!catalog_composition_child_item_id_fkey(*)')
        .eq('parent_item_id', itemId)
        .order('sort_order'),
      supabase
        .from('catalog_item_work')
        .select('*, work_types(*)')
        .eq('catalog_item_id', itemId),
    ]);

    const item = catalogItemFromRow(itemData as CatalogItemRow);

    return {
      ...item,
      compositions: (compositionsRes.data || []).map((row: any) => ({
        ...catalogCompositionFromRow(row),
        childItem: row.catalog_items ? catalogItemFromRow(row.catalog_items) : undefined,
      })),
      workRequirements: (workRes.data || []).map((row: any) => ({
        ...catalogItemWorkFromRow(row),
        workType: row.work_types ? workTypeFromRow(row.work_types) : undefined,
      })),
    };
  }, []);

  // Get items by type
  const getProducts = useCallback(() => {
    return state.items.filter(item => item.type === 'product');
  }, [state.items]);

  const getOperations = useCallback(() => {
    return state.items.filter(item => item.type === 'operation');
  }, [state.items]);

  // Get items by category
  const getItemsByCategory = useCallback((category: string) => {
    return state.items.filter(item => item.category === category);
  }, [state.items]);

  // Get unique categories
  const getCategories = useCallback(() => {
    const categories = new Set<string>();
    state.items.forEach(item => {
      if (item.category) categories.add(item.category);
    });
    return Array.from(categories).sort();
  }, [state.items]);

  // === CATALOG ITEM OPERATIONS ===
  const addItem = useCallback(async (item: Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<CatalogItem | null> => {
    const insertData = {
      name: item.name,
      type: item.type,
      unit: item.unit,
      unit_price: item.unitPrice,
      vat_rate: item.vatRate,
      default_parameters: item.defaultParameters as any,
      quantity_formula: item.quantityFormula,
      name_formula: item.nameFormula,
      price_formula: item.priceFormula,
      marker_style: item.markerStyle as any,
      measure_type: item.measureType,
      allowed_geometries: item.allowedGeometries,
      is_active: item.isActive,
      sort_order: item.sortOrder,
      category: item.category,
      default_images: (item.defaultImages || []) as any,
      default_instruction_text: item.defaultInstructionText || null,
    };
    
    const { data, error } = await supabase
      .from('catalog_items')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error adding catalog item:', error);
      return null;
    }

    const newItem = catalogItemFromRow(data as CatalogItemRow);
    setState(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    return newItem;
  }, []);

  const updateItem = useCallback(async (id: string, updates: Partial<CatalogItem>) => {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
    if (updates.unitPrice !== undefined) dbUpdates.unit_price = updates.unitPrice;
    if (updates.vatRate !== undefined) dbUpdates.vat_rate = updates.vatRate;
    if (updates.defaultParameters !== undefined) dbUpdates.default_parameters = updates.defaultParameters;
    if (updates.quantityFormula !== undefined) dbUpdates.quantity_formula = updates.quantityFormula;
    if (updates.nameFormula !== undefined) dbUpdates.name_formula = updates.nameFormula;
    if (updates.priceFormula !== undefined) dbUpdates.price_formula = updates.priceFormula;
    if (updates.markerStyle !== undefined) dbUpdates.marker_style = updates.markerStyle;
    if (updates.measureType !== undefined) dbUpdates.measure_type = updates.measureType;
    if (updates.allowedGeometries !== undefined) dbUpdates.allowed_geometries = updates.allowedGeometries;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.defaultImages !== undefined) dbUpdates.default_images = updates.defaultImages;
    if (updates.defaultInstructionText !== undefined) dbUpdates.default_instruction_text = updates.defaultInstructionText;

    const { error } = await supabase
      .from('catalog_items')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating catalog item:', error);
      return;
    }

    setState(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, ...updates, updatedAt: new Date() } : item),
    }));
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    // Soft delete - set is_active to false
    const { error } = await supabase
      .from('catalog_items')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error deleting catalog item:', error);
      return;
    }

    setState(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id),
    }));
  }, []);

  // === WORK TYPE OPERATIONS ===
  const addWorkType = useCallback(async (workType: Omit<WorkType, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkType | null> => {
    const { data, error } = await supabase
      .from('work_types')
      .insert({
        name: workType.name,
        hourly_rate: workType.hourlyRate,
        vat_rate: workType.vatRate,
        description: workType.description,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding work type:', error);
      return null;
    }

    const newWorkType = workTypeFromRow(data as WorkTypeRow);
    setState(prev => ({
      ...prev,
      workTypes: [...prev.workTypes, newWorkType],
    }));
    return newWorkType;
  }, []);

  const updateWorkType = useCallback(async (id: string, updates: Partial<WorkType>) => {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.hourlyRate !== undefined) dbUpdates.hourly_rate = updates.hourlyRate;
    if (updates.vatRate !== undefined) dbUpdates.vat_rate = updates.vatRate;
    if (updates.description !== undefined) dbUpdates.description = updates.description;

    const { error } = await supabase
      .from('work_types')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating work type:', error);
      return;
    }

    setState(prev => ({
      ...prev,
      workTypes: prev.workTypes.map(wt => wt.id === id ? { ...wt, ...updates } : wt),
    }));
  }, []);

  const deleteWorkType = useCallback(async (id: string) => {
    const { error } = await supabase.from('work_types').delete().eq('id', id);
    if (error) {
      console.error('Error deleting work type:', error);
      return;
    }
    setState(prev => ({
      ...prev,
      workTypes: prev.workTypes.filter(wt => wt.id !== id),
    }));
  }, []);

  // === COMPOSITION OPERATIONS (Parent-Child relationships) ===
  const getCompositions = useCallback(async (parentItemId: string): Promise<CatalogComposition[]> => {
    const { data, error } = await supabase
      .from('catalog_composition')
      .select('*, catalog_items!catalog_composition_child_item_id_fkey(*)')
      .eq('parent_item_id', parentItemId)
      .order('sort_order');

    if (error) {
      console.error('Error fetching compositions:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...catalogCompositionFromRow(row),
      childItem: row.catalog_items ? catalogItemFromRow(row.catalog_items) : undefined,
    }));
  }, []);

  const addComposition = useCallback(async (composition: Omit<CatalogComposition, 'id' | 'childItem'>): Promise<CatalogComposition | null> => {
    const { data, error } = await supabase
      .from('catalog_composition')
      .insert({
        parent_item_id: composition.parentItemId,
        child_item_id: composition.childItemId,
        quantity_factor_formula: composition.quantityFactorFormula,
        label: composition.label,
        sort_order: composition.sortOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding composition:', error);
      return null;
    }

    return catalogCompositionFromRow(data as CatalogCompositionRow);
  }, []);

  const updateComposition = useCallback(async (id: string, updates: Partial<CatalogComposition>) => {
    const dbUpdates: any = {};
    if (updates.childItemId !== undefined) dbUpdates.child_item_id = updates.childItemId;
    if (updates.quantityFactorFormula !== undefined) dbUpdates.quantity_factor_formula = updates.quantityFactorFormula;
    if (updates.label !== undefined) dbUpdates.label = updates.label;
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

    const { error } = await supabase
      .from('catalog_composition')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating composition:', error);
    }
  }, []);

  const deleteComposition = useCallback(async (id: string) => {
    const { error } = await supabase.from('catalog_composition').delete().eq('id', id);
    if (error) {
      console.error('Error deleting composition:', error);
    }
  }, []);

  const saveCompositions = useCallback(async (
    parentItemId: string,
    compositions: Omit<CatalogComposition, 'id' | 'childItem'>[]
  ): Promise<boolean> => {
    // Delete existing compositions
    const { error: deleteError } = await supabase
      .from('catalog_composition')
      .delete()
      .eq('parent_item_id', parentItemId);

    if (deleteError) {
      console.error('Error deleting compositions:', deleteError);
      return false;
    }

    if (compositions.length === 0) return true;

    // Insert new compositions
    const { error } = await supabase
      .from('catalog_composition')
      .insert(
        compositions.map((c, index) => ({
          parent_item_id: parentItemId,
          child_item_id: c.childItemId,
          quantity_factor_formula: c.quantityFactorFormula,
          label: c.label,
          sort_order: index,
        }))
      );

    if (error) {
      console.error('Error saving compositions:', error);
      return false;
    }

    return true;
  }, []);

  // === ITEM WORK OPERATIONS (Labor requirements) ===
  const getItemWork = useCallback(async (itemId: string): Promise<CatalogItemWork[]> => {
    const { data, error } = await supabase
      .from('catalog_item_work')
      .select('*, work_types(*)')
      .eq('catalog_item_id', itemId);

    if (error) {
      console.error('Error fetching item work:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...catalogItemWorkFromRow(row),
      workType: row.work_types ? workTypeFromRow(row.work_types) : undefined,
    }));
  }, []);

  const addItemWork = useCallback(async (itemWork: Omit<CatalogItemWork, 'id' | 'workType'>): Promise<CatalogItemWork | null> => {
    const { data, error } = await supabase
      .from('catalog_item_work')
      .insert({
        catalog_item_id: itemWork.catalogItemId,
        work_type_id: itemWork.workTypeId,
        hours_per_unit: itemWork.hoursPerUnit,
        hours_formula: itemWork.hoursFormula,
        description: itemWork.description,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding item work:', error);
      return null;
    }

    return catalogItemWorkFromRow(data as CatalogItemWorkRow);
  }, []);

  const updateItemWork = useCallback(async (id: string, updates: Partial<CatalogItemWork>) => {
    const dbUpdates: any = {};
    if (updates.workTypeId !== undefined) dbUpdates.work_type_id = updates.workTypeId;
    if (updates.hoursPerUnit !== undefined) dbUpdates.hours_per_unit = updates.hoursPerUnit;
    if (updates.hoursFormula !== undefined) dbUpdates.hours_formula = updates.hoursFormula;
    if (updates.description !== undefined) dbUpdates.description = updates.description;

    const { error } = await supabase
      .from('catalog_item_work')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating item work:', error);
    }
  }, []);

  const deleteItemWork = useCallback(async (id: string) => {
    const { error } = await supabase.from('catalog_item_work').delete().eq('id', id);
    if (error) {
      console.error('Error deleting item work:', error);
    }
  }, []);

  const saveItemWork = useCallback(async (
    itemId: string,
    workRequirements: Omit<CatalogItemWork, 'id' | 'workType'>[]
  ): Promise<boolean> => {
    // Delete existing work requirements
    const { error: deleteError } = await supabase
      .from('catalog_item_work')
      .delete()
      .eq('catalog_item_id', itemId);

    if (deleteError) {
      console.error('Error deleting item work:', deleteError);
      return false;
    }

    if (workRequirements.length === 0) return true;

    // Insert new work requirements
    const { error } = await supabase
      .from('catalog_item_work')
      .insert(
        workRequirements.map(w => ({
          catalog_item_id: itemId,
          work_type_id: w.workTypeId,
          hours_per_unit: w.hoursPerUnit,
          hours_formula: w.hoursFormula,
          description: w.description,
        }))
      );

    if (error) {
      console.error('Error saving item work:', error);
      return false;
    }

    return true;
  }, []);

  return {
    // State
    ...state,
    
    // Reload
    reload: loadData,
    
    // Getters
    getItemWithRelations,
    getProducts,
    getOperations,
    getItemsByCategory,
    getCategories,
    
    // Item operations
    addItem,
    updateItem,
    deleteItem,
    
    // Work type operations
    addWorkType,
    updateWorkType,
    deleteWorkType,
    
    // Composition operations
    getCompositions,
    addComposition,
    updateComposition,
    deleteComposition,
    saveCompositions,
    
    // Item work operations
    getItemWork,
    addItemWork,
    updateItemWork,
    deleteItemWork,
    saveItemWork,
  };
}
