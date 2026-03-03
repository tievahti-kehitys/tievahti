-- Fix projects UPDATE policy: allow edit-role users to update project data
-- (road geometry, description etc.), not just owners and project admins

DROP POLICY IF EXISTS "Owners and admins can update projects" ON public.projects;

CREATE POLICY "Project editors can update projects"
  ON public.projects
  FOR UPDATE
  USING (can_edit_project(auth.uid(), id));