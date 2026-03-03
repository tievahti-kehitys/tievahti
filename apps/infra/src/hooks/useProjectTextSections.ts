import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProjectTextSection } from "@/types/project";

export function useProjectTextSections(projectId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: sections = [], isLoading } = useQuery<ProjectTextSection[]>({
    queryKey: ["project_text_sections", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from("project_text_sections")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        projectId: row.project_id,
        sectionKey: row.section_key,
        title: row.title,
        content: row.content,
        sortOrder: row.sort_order,
        isEnabled: row.is_enabled,
      }));
    },
  });

  const updateSection = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<ProjectTextSection, "title" | "content" | "isEnabled">>;
    }) => {
      const dbUpdates: any = {};
      console.log("XXXX");
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.content !== undefined) dbUpdates.content = updates.content;
      if (updates.isEnabled !== undefined) dbUpdates.is_enabled = updates.isEnabled;
      dbUpdates.updated_at = new Date().toISOString();

      const { error } = await supabase.from("project_text_sections").update(dbUpdates).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project_text_sections", projectId] });
    },
  });

  const addSection = useMutation({
    mutationFn: async ({ sectionKey, title, content }: { sectionKey: string; title: string; content: string }) => {
      if (!projectId) throw new Error("No project");

      const maxOrder = Math.max(0, ...sections.map((s) => s.sortOrder));

      const { error } = await supabase.from("project_text_sections").insert({
        project_id: projectId,
        section_key: sectionKey,
        title,
        content,
        sort_order: maxOrder + 1,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project_text_sections", projectId] });
    },
  });

  const deleteSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_text_sections").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project_text_sections", projectId] });
    },
  });

  return {
    sections,
    isLoading,
    updateSection: updateSection.mutate,
    addSection: addSection.mutate,
    deleteSection: deleteSection.mutate,
  };
}
