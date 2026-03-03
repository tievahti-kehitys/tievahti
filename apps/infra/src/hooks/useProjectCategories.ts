import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProjectCategory {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: Date;
}

export function useProjectCategories(projectId: string | undefined) {
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    if (!projectId) {
      setCategories([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_categories')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to fetch project_categories:', error);
        setCategories([]);
        return;
      }

      setCategories(
        (data || []).map((row) => ({
          id: row.id,
          projectId: row.project_id,
          name: row.name,
          color: row.color,
          createdAt: new Date(row.created_at),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const createCategory = useCallback(
    async (name: string, color: string): Promise<string | null> => {
      if (!projectId) return null;
      const { data, error } = await supabase
        .from('project_categories')
        .insert({ project_id: projectId, name, color })
        .select('id')
        .single();

      if (error) {
        console.error('Create category failed:', error);
        return null;
      }
      await fetchCategories();
      return data.id;
    },
    [projectId, fetchCategories]
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      const { error } = await supabase
        .from('project_categories')
        .delete()
        .eq('id', categoryId);

      if (error) {
        console.error('Delete category failed:', error);
        return;
      }
      await fetchCategories();
    },
    [fetchCategories]
  );

  return { categories, loading, fetchCategories, createCategory, deleteCategory };
}
