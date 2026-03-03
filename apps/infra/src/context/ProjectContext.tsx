import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import { Project, ProductInstance, SaveStatus, RoadGeometry, CustomCost } from '@/types/project';
import { useProjectItems } from '@/hooks/useProjectItems';
import { Json } from '@/integrations/supabase/types';
import { calculateChainage } from '@/lib/chainageCalculator';

// Migrate old single-line road geometry to multi-segment format
function migrateRoadGeometry(raw: any): RoadGeometry | null {
  if (!raw) return null;
  const geo = raw as RoadGeometry;
  if (geo.segments && geo.segments.length > 0) return geo;
  // Legacy: has coordinates but no segments
  if (geo.coordinates && geo.coordinates.length >= 2) {
    return { ...geo, segments: [geo.coordinates] };
  }
  return geo.segments ? geo : { ...geo, segments: [] };
}

interface ProjectContextType {
  project: Project | null;
  projects: Project[];
  /** All products: manual (from project.products) + DB items (from project_items table), deduplicated */
  allProducts: ProductInstance[];
  saveStatus: SaveStatus;
  createProject: (name: string, description?: string) => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  updateProject: (updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => Promise<void>;
  setRoadGeometry: (geometry: RoadGeometry | null) => void;
  addProduct: (product: Omit<ProductInstance, 'id'>) => string;
  /** Updates a product - works for both manual (JSONB) and DB (project_items) products */
  updateProduct: (id: string, updates: Partial<ProductInstance>) => void;
  /** Removes a product - works for both manual (JSONB) and DB (project_items) products */
  removeProduct: (id: string) => void;
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
  addCustomCost: (description: string, amount: number) => Promise<void>;
  removeCustomCost: (id: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

// Conversion helpers
function dbRowToProject(row: any, customCosts: CustomCost[] = []): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    roadGeometry: migrateRoadGeometry(row.road_geometry as any),
    stakingOrigin: row.staking_origin as [number, number] | null,
    vatPercentage: Number(row.vat_percentage) || 25.5,
    currency: row.currency || 'EUR',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    products: Array.isArray(row.products) ? row.products as unknown as ProductInstance[] : [],
    customCosts,
    // Extended project details
    projectType: row.project_type || undefined,
    tiekunta: row.tiekunta || undefined,
    kayttooikeusyksikkotunnus: row.kayttooikeusyksikkotunnus || undefined,
    kunta: row.kunta || undefined,
    kohdeosoite: row.kohdeosoite || undefined,
    osakasCount: row.osakas_count ?? 0,
    yksikkoCount: row.yksikko_count ?? 0,
    vastuuhenkiloName: row.vastuuhenkilo_name || undefined,
    vastuuhenkiloPhone: row.vastuuhenkilo_phone || undefined,
    vastuuhenkiloEmail: row.vastuuhenkilo_email || undefined,
  };
}

function projectToDbRow(project: Project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    road_geometry: project.roadGeometry as unknown as Json,
    staking_origin: project.stakingOrigin as unknown as Json,
    map_center: null as Json,
    zoom_level: 15,
    vat_percentage: project.vatPercentage,
    currency: project.currency,
    products: [] as unknown as Json, // Always empty - products now in project_items
    // Extended project details
    project_type: project.projectType || null,
    tiekunta: project.tiekunta || null,
    kayttooikeusyksikkotunnus: project.kayttooikeusyksikkotunnus || null,
    kunta: project.kunta || null,
    kohdeosoite: project.kohdeosoite || null,
    osakas_count: project.osakasCount ?? 0,
    yksikko_count: project.yksikkoCount ?? 0,
    vastuuhenkilo_name: project.vastuuhenkiloName || null,
    vastuuhenkilo_phone: project.vastuuhenkiloPhone || null,
    vastuuhenkilo_email: project.vastuuhenkiloEmail || null,
  };
}

/** Convert a project_item DB row to ProductInstance */
function dbItemRowToProductInstance(row: any): ProductInstance {
  return {
    id: row.id,
    productDefinitionId: row.catalog_item_id,
    geometry: row.geometry as any,
    parameters: (row.user_parameters as Record<string, number>) || {},
    photos: Array.isArray(row.photos) ? (row.photos as any[]) : [],
    notes: row.notes || '',
    visible: row.visible ?? true,
    locked: row.locked ?? false,
    colorOverride: (row.style_overrides as any)?.colorOverride,
    customMarkerImage: (row.style_overrides as any)?.customMarkerImage,
    offsetM: row.offset_m != null ? Number(row.offset_m) : undefined,
    chainageStart: row.chainage_start != null ? Number(row.chainage_start) : undefined,
    chainageEnd: row.chainage_end != null ? Number(row.chainage_end) : undefined,
    categoryId: row.category_id ?? null,
  };
}

/** Migrate legacy JSONB products to project_items table. Returns true if migration happened. */
async function migrateLegacyProducts(projectId: string, legacyProducts: ProductInstance[]): Promise<boolean> {
  if (legacyProducts.length === 0) return false;

  const { data: existingItems } = await supabase
    .from('project_items')
    .select('id')
    .eq('project_id', projectId);
  const existingIds = new Set((existingItems || []).map((r: any) => r.id));
  const toMigrate = legacyProducts.filter(p => !existingIds.has(p.id));

  if (toMigrate.length > 0) {
    const { error } = await supabase.from('project_items').insert(
      toMigrate.map(p => ({
        id: p.id,
        project_id: projectId,
        catalog_item_id: p.productDefinitionId,
        geometry: p.geometry as unknown as Json,
        user_parameters: (p.parameters || {}) as unknown as Json,
        notes: p.notes || null,
        photos: (p.photos as unknown as Json) || null,
        visible: p.visible,
        locked: p.locked,
        source: 'manual',
        category_id: p.categoryId ?? null,
        offset_m: p.offsetM ?? null,
        chainage_start: p.chainageStart ?? null,
        chainage_end: p.chainageEnd ?? null,
      }))
    );
    if (error) {
      console.error('Legacy migration insert failed:', error);
    }
  }

  // Always clear JSONB products field
  await supabase.from('projects').update({ products: [] as unknown as Json }).eq('id', projectId);
  return true;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch DB items from project_items table
  const { dbItems, refetch: refetchDbItems } = useProjectItems(project?.id);

  // Merge manual (legacy JSONB) + DB items, deduplicated
  const allProducts = useMemo(() => {
    const manual = project?.products || [];
    const manualIds = new Set(manual.map(p => p.id));
    const uniqueDbItems = dbItems.filter(di => !manualIds.has(di.id));
    return [...manual, ...uniqueDbItems];
  }, [project?.products, dbItems]);

  // Set of DB item IDs for routing updates/deletes
  const dbItemIds = useMemo(() => new Set(dbItems.map(d => d.id)), [dbItems]);

  // Fetch all projects list
  const refreshProjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setProjects(data.map((r) => dbRowToProject(r)));
    }
  }, []);

  // Load on mount + load most recent project
  useEffect(() => {
    (async () => {
      await refreshProjects();
      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const row = data[0];
        const { data: costs } = await supabase
          .from('custom_costs')
          .select('*')
          .eq('project_id', row.id);
        const customCosts: CustomCost[] = (costs || []).map((c) => ({
          id: c.id,
          description: c.description,
          amount: Number(c.amount),
        }));
        const projectData = dbRowToProject(row, customCosts);

        // Migrate legacy JSONB products → project_items
        const legacyProducts: ProductInstance[] = Array.isArray(row.products) ? row.products as unknown as ProductInstance[] : [];
        await migrateLegacyProducts(row.id, legacyProducts);
        projectData.products = [];

        setProject(projectData);
      }
    })();
  }, [refreshProjects]);

  // Realtime subscription: refresh project_items when another user makes changes
  useEffect(() => {
    if (!project?.id) return;

    const channel = supabase
      .channel(`project_items:${project.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_items',
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          refetchDbItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project?.id, refetchDbItems]);

  // Realtime subscription: refresh road geometry / project data when another user makes changes
  useEffect(() => {
    if (!project?.id) return;

    const channel = supabase
      .channel(`projects:${project.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${project.id}`,
        },
        async (payload) => {
          // Only update road_geometry and metadata, not products (managed by project_items)
          const updated = payload.new as any;
          setProject(prev => {
            if (!prev) return prev;
            // Don't overwrite local state if we're the one who made the change (debounce guard)
            const newRoadGeometry = migrateRoadGeometry(updated.road_geometry);
            return {
              ...prev,
              roadGeometry: newRoadGeometry,
              stakingOrigin: updated.staking_origin as [number, number] | null,
              name: updated.name,
              description: updated.description || '',
              vatPercentage: Number(updated.vat_percentage) || 25.5,
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project?.id]);

  // Auto-save project changes (road geometry, metadata – NOT products)
  useEffect(() => {
    if (!project) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user can edit this project before attempting save
      const { data: canEdit } = await supabase.rpc('can_edit_project', {
        _project_id: project.id,
        _user_id: user.id,
      });

      if (!canEdit) {
        // Watch-only user: silently skip saving
        return;
      }

      setSaveStatus('saving');

      const row = projectToDbRow(project);
      const { error } = await supabase
        .from('projects')
        .update(row)
        .eq('id', project.id);
      if (error) {
        console.error('Save failed:', error);
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
      }
    }, 800);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [project]);

  const createProject = useCallback(async (name: string, description = '') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return;
    }

    const id = uuidv4();
    const newProject: Project = {
      id,
      name,
      description,
      roadGeometry: null,
      stakingOrigin: null,
      vatPercentage: 25.5,
      currency: 'EUR',
      createdAt: new Date(),
      updatedAt: new Date(),
      products: [],
      customCosts: [],
    };

    const row = { ...projectToDbRow(newProject), user_id: user.id };
    const { error } = await supabase.from('projects').insert(row);
    if (error) {
      console.error('Create failed:', error);
      return;
    }
    setProject(newProject);
    setSelectedProductId(null);
    await refreshProjects();
  }, [refreshProjects]);

  const loadProject = useCallback(async (projectId: string) => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error || !data) {
      console.error('Load failed:', error);
      return;
    }

    const { data: costs } = await supabase
      .from('custom_costs')
      .select('*')
      .eq('project_id', projectId);
    const customCosts: CustomCost[] = (costs || []).map((c) => ({
      id: c.id,
      description: c.description,
      amount: Number(c.amount),
    }));

    const projectData = dbRowToProject(data, customCosts);

    // Migrate any legacy JSONB products into project_items table
    const legacyProducts: ProductInstance[] = Array.isArray(data.products) ? data.products as unknown as ProductInstance[] : [];
    await migrateLegacyProducts(projectId, legacyProducts);
    projectData.products = [];

    setProject(projectData);
    setSelectedProductId(null);
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    await supabase.from('custom_costs').delete().eq('project_id', projectId);
    await supabase.from('projects').delete().eq('id', projectId);
    if (project?.id === projectId) {
      setProject(null);
    }
    await refreshProjects();
  }, [project?.id, refreshProjects]);

  const updateProject = useCallback((updates: Partial<Project>) => {
    setProject((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updates, updatedAt: new Date() };
    });
  }, []);

  const setRoadGeometry = useCallback((geometry: RoadGeometry | null) => {
    if (!geometry) {
      updateProject({ roadGeometry: null, stakingOrigin: null });
      return;
    }
    const segments = geometry.segments || (geometry.coordinates?.length ? [geometry.coordinates] : []);
    const coordinates = segments.length > 0 ? segments[0] : geometry.coordinates || [];
    const normalizedGeometry = { ...geometry, segments, coordinates };
    updateProject({ roadGeometry: normalizedGeometry, stakingOrigin: coordinates[0] || null });
  }, [updateProject]);

  const addProduct = useCallback((product: Omit<ProductInstance, 'id'>): string => {
    const id = uuidv4();
    const newProduct: ProductInstance = { ...product, id };

    if (project) {
      // Optimistically add to local state so it shows on the map immediately
      setProject((prev) => {
        if (!prev) return prev;
        return { ...prev, products: [...prev.products, newProduct] };
      });

      // Calculate chainage automatically, then insert
      const doInsert = async () => {
        let chainageStart = newProduct.chainageStart ?? null;
        let chainageEnd = newProduct.chainageEnd ?? null;

        // Auto-calculate chainage from nearest road branch if not set
        if (chainageStart == null) {
          try {
            const chainage = await calculateChainage(project.id, newProduct.geometry);
            if (chainage) {
              chainageStart = chainage.chainageStart;
              chainageEnd = chainage.chainageEnd ?? null;
            }
          } catch (e) {
            console.warn('Chainage calculation failed:', e);
          }
        }

        const { error } = await supabase.from('project_items').insert({
          id,
          project_id: project.id,
          catalog_item_id: newProduct.productDefinitionId,
          geometry: newProduct.geometry as unknown as Json,
          user_parameters: (newProduct.parameters || {}) as unknown as Json,
          notes: newProduct.notes || null,
          photos: (newProduct.photos as unknown as Json) || null,
          visible: newProduct.visible,
          locked: newProduct.locked,
          source: 'manual',
          category_id: newProduct.categoryId ?? null,
          offset_m: newProduct.offsetM ?? null,
          chainage_start: chainageStart,
          chainage_end: chainageEnd,
          style_overrides: (newProduct.colorOverride || newProduct.customMarkerImage) ? {
            colorOverride: newProduct.colorOverride,
            customMarkerImage: newProduct.customMarkerImage,
          } as unknown as Json : null,
        });

        if (error) {
          console.error('Insert project_item failed:', error);
          setProject((prev) => {
            if (!prev) return prev;
            return { ...prev, products: [...prev.products, newProduct], updatedAt: new Date() };
          });
        } else {
          setProject((prev) => {
            if (!prev) return prev;
            return { ...prev, products: prev.products.filter(p => p.id !== id) };
          });
          refetchDbItems();
        }
      };

      doInsert();
    } else {
      setProject((prev) => {
        if (!prev) return prev;
        return { ...prev, products: [...prev.products, newProduct], updatedAt: new Date() };
      });
    }

    return id;
  }, [project, refetchDbItems]);

  const updateProduct = useCallback((id: string, updates: Partial<ProductInstance>) => {
    // Check if this is a DB item (project_items table)
    if (dbItemIds.has(id)) {
      // Optimistic update in local dbItems via project state trick
      // Then persist to DB
      const dbUpdate: Record<string, any> = {};
      if (updates.parameters !== undefined) dbUpdate.user_parameters = updates.parameters;
      if (updates.stringParameters !== undefined) dbUpdate.string_parameters = updates.stringParameters;
      if (updates.notes !== undefined) dbUpdate.notes = updates.notes;
      if (updates.photos !== undefined) dbUpdate.photos = updates.photos;
      if (updates.visible !== undefined) dbUpdate.visible = updates.visible;
      if (updates.locked !== undefined) dbUpdate.locked = updates.locked;
      if (updates.geometry !== undefined) dbUpdate.geometry = updates.geometry;
      if (updates.categoryId !== undefined) dbUpdate.category_id = updates.categoryId;
      if (updates.colorOverride !== undefined || updates.customMarkerImage !== undefined) {
        dbUpdate.style_overrides = {
          colorOverride: updates.colorOverride,
          customMarkerImage: updates.customMarkerImage,
        };
      }

      // If geometry changed, recalculate chainage
      if (updates.geometry !== undefined && project) {
        calculateChainage(project.id, updates.geometry).then(chainage => {
          if (chainage) {
            dbUpdate.chainage_start = chainage.chainageStart;
            dbUpdate.chainage_end = chainage.chainageEnd ?? null;
          }
          supabase.from('project_items').update(dbUpdate).eq('id', id).then(({ error }) => {
            if (error) console.error('Update project_item failed:', error);
            else refetchDbItems();
          });
        }).catch(() => {
          supabase.from('project_items').update(dbUpdate).eq('id', id).then(({ error }) => {
            if (error) console.error('Update project_item failed:', error);
            else refetchDbItems();
          });
        });
      } else {
        supabase.from('project_items').update(dbUpdate).eq('id', id).then(({ error }) => {
          if (error) console.error('Update project_item failed:', error);
          else refetchDbItems();
        });
      }
      return;
    }

    // Manual product in JSONB
    // If setting categoryId, migrate to project_items table
    if (updates.categoryId !== undefined && updates.categoryId !== null && project) {
      const manual = project.products.find(p => p.id === id);
      if (manual) {
        const merged = { ...manual, ...updates };
        supabase.from('project_items').insert({
          id: manual.id,
          project_id: project.id,
          catalog_item_id: manual.productDefinitionId,
          geometry: merged.geometry as unknown as Json,
          user_parameters: (merged.parameters || {}) as unknown as Json,
          notes: merged.notes || null,
          photos: (merged.photos as unknown as Json) || null,
          visible: merged.visible,
          locked: merged.locked,
          source: 'manual',
          category_id: updates.categoryId,
          offset_m: manual.offsetM ?? null,
        }).then(({ error }) => {
          if (error) {
            console.error('Migrate manual product to project_items failed:', error);
            return;
          }
          // Remove from JSONB
          setProject((prev) => {
            if (!prev) return prev;
            return { ...prev, products: prev.products.filter(p => p.id !== id), updatedAt: new Date() };
          });
          refetchDbItems();
        });
        return;
      }
    }

    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        products: prev.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        updatedAt: new Date(),
      };
    });
  }, [dbItemIds, refetchDbItems, project]);

  const removeProduct = useCallback((id: string) => {
    // Check if this is a DB item
    if (dbItemIds.has(id)) {
      supabase.from('project_items').delete().eq('id', id).then(({ error }) => {
        if (error) console.error('Delete project_item failed:', error);
        else refetchDbItems();
      });
    } else {
      setProject((prev) => {
        if (!prev) return prev;
        return { ...prev, products: prev.products.filter((p) => p.id !== id), updatedAt: new Date() };
      });
    }
    if (selectedProductId === id) {
      setSelectedProductId(null);
    }
  }, [selectedProductId, dbItemIds, refetchDbItems]);

  // Custom costs stored in separate table
  const addCustomCost = useCallback(async (description: string, amount: number) => {
    if (!project) return;
    const id = uuidv4();
    const { error } = await supabase.from('custom_costs').insert({
      id,
      project_id: project.id,
      description,
      amount,
    });
    if (error) {
      console.error('Add custom cost failed:', error);
      return;
    }
    const newCost: CustomCost = { id, description, amount };
    setProject((prev) => {
      if (!prev) return prev;
      return { ...prev, customCosts: [...prev.customCosts, newCost], updatedAt: new Date() };
    });
  }, [project]);

  const removeCustomCost = useCallback(async (id: string) => {
    if (!project) return;
    const { error } = await supabase.from('custom_costs').delete().eq('id', id);
    if (error) {
      console.error('Remove custom cost failed:', error);
      return;
    }
    setProject((prev) => {
      if (!prev) return prev;
      return { ...prev, customCosts: prev.customCosts.filter((c) => c.id !== id), updatedAt: new Date() };
    });
  }, [project]);

  return (
    <ProjectContext.Provider
       value={{
        project,
        projects,
        allProducts,
        saveStatus,
        createProject,
        loadProject,
        deleteProject,
        updateProject,
        setRoadGeometry,
        addProduct,
        updateProduct,
        removeProduct,
        selectedProductId,
        setSelectedProductId,
        addCustomCost,
        removeCustomCost,
        refreshProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
