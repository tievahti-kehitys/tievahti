import React, { createContext, useContext, useEffect } from 'react';
import { useCatalogDB } from '@/hooks/useCatalogDB';
import { supabase } from '@/integrations/supabase/client';
import {
  CatalogItem,
  CatalogComposition,
  CatalogItemWork,
  WorkType,
  CatalogItemWithRelations,
  CatalogParameter,
  MarkerStyle,
} from '@/types/catalog';

interface CatalogContextType {
  // State
  items: CatalogItem[];
  workTypes: WorkType[];
  loading: boolean;
  error: string | null;
  
  // Getters
  getItemWithRelations: (itemId: string) => Promise<CatalogItemWithRelations | null>;
  getProducts: () => CatalogItem[];
  getOperations: () => CatalogItem[];
  getItemsByCategory: (category: string) => CatalogItem[];
  getCategories: () => string[];
  getItemById: (id: string) => CatalogItem | undefined;
  getWorkTypeById: (id: string) => WorkType | undefined;
  
  // Item operations
  addItem: (item: Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<CatalogItem | null>;
  updateItem: (id: string, updates: Partial<CatalogItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  
  // Work type operations
  addWorkType: (workType: Omit<WorkType, 'id' | 'createdAt' | 'updatedAt'>) => Promise<WorkType | null>;
  updateWorkType: (id: string, updates: Partial<WorkType>) => Promise<void>;
  deleteWorkType: (id: string) => Promise<void>;
  
  // Composition operations (Parent-Child for Operations)
  getCompositions: (parentItemId: string) => Promise<CatalogComposition[]>;
  addComposition: (composition: Omit<CatalogComposition, 'id' | 'childItem'>) => Promise<CatalogComposition | null>;
  updateComposition: (id: string, updates: Partial<CatalogComposition>) => Promise<void>;
  deleteComposition: (id: string) => Promise<void>;
  saveCompositions: (parentItemId: string, compositions: Omit<CatalogComposition, 'id' | 'childItem'>[]) => Promise<boolean>;
  
  // Item work operations (Labor requirements)
  getItemWork: (itemId: string) => Promise<CatalogItemWork[]>;
  addItemWork: (itemWork: Omit<CatalogItemWork, 'id' | 'workType'>) => Promise<CatalogItemWork | null>;
  updateItemWork: (id: string, updates: Partial<CatalogItemWork>) => Promise<void>;
  deleteItemWork: (id: string) => Promise<void>;
  saveItemWork: (itemId: string, workRequirements: Omit<CatalogItemWork, 'id' | 'workType'>[]) => Promise<boolean>;
  
  reload: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextType | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const db = useCatalogDB();

  // Reload catalog when auth session becomes available
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        db.reload();
      }
    });
    return () => subscription.unsubscribe();
  }, [db.reload]);

  // Helper getters
  const getItemById = (id: string) => db.items.find(item => item.id === id);
  const getWorkTypeById = (id: string) => db.workTypes.find(wt => wt.id === id);

  const value: CatalogContextType = {
    // State
    items: db.items,
    workTypes: db.workTypes,
    loading: db.loading,
    error: db.error,
    
    // Getters
    getItemWithRelations: db.getItemWithRelations,
    getProducts: db.getProducts,
    getOperations: db.getOperations,
    getItemsByCategory: db.getItemsByCategory,
    getCategories: db.getCategories,
    getItemById,
    getWorkTypeById,
    
    // Item operations
    addItem: db.addItem,
    updateItem: db.updateItem,
    deleteItem: db.deleteItem,
    
    // Work type operations
    addWorkType: db.addWorkType,
    updateWorkType: db.updateWorkType,
    deleteWorkType: db.deleteWorkType,
    
    // Composition operations
    getCompositions: db.getCompositions,
    addComposition: db.addComposition,
    updateComposition: db.updateComposition,
    deleteComposition: db.deleteComposition,
    saveCompositions: db.saveCompositions,
    
    // Item work operations
    getItemWork: db.getItemWork,
    addItemWork: db.addItemWork,
    updateItemWork: db.updateItemWork,
    deleteItemWork: db.deleteItemWork,
    saveItemWork: db.saveItemWork,
    
    reload: db.reload,
  };

  return (
    <CatalogContext.Provider value={value}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error('useCatalog must be used within a CatalogProvider');
  }
  return context;
}

// Re-export types for convenience
export type { 
  CatalogItem, 
  CatalogComposition, 
  CatalogItemWork, 
  WorkType, 
  CatalogItemWithRelations,
  CatalogParameter,
  MarkerStyle,
};
