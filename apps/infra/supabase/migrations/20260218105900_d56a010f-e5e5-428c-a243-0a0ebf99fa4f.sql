

-- 1. Create app_role enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'app_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'edit', 'watch');
  END IF;
END $$;

-- 2. Create project_roles table (project-specific RBAC)
CREATE TABLE public.project_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  invited_by UUID,
  UNIQUE(project_id, user_id)
);

ALTER TABLE public.project_roles ENABLE ROW LEVEL SECURITY;

-- 3. Create audit_log table for admin actions
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  project_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 4. Security definer helper functions (bypass RLS to avoid recursion)

-- Check if user can access project (any role OR project owner)
CREATE OR REPLACE FUNCTION public.can_access_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_roles WHERE project_id = _project_id AND user_id = _user_id
  );
$$;

-- Check if user can edit project (admin or edit role OR project owner)
CREATE OR REPLACE FUNCTION public.can_edit_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_roles
    WHERE project_id = _project_id AND user_id = _user_id AND role IN ('admin', 'edit')
  );
$$;

-- Check if user is admin in project (admin role OR project owner)
CREATE OR REPLACE FUNCTION public.is_project_admin(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_roles
    WHERE project_id = _project_id AND user_id = _user_id AND role = 'admin'
  );
$$;

-- Get user's effective role in a project (owner = admin implicitly)
CREATE OR REPLACE FUNCTION public.get_project_role(_user_id UUID, _project_id UUID)
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id)
    THEN 'admin'::public.app_role
    ELSE (
      SELECT role FROM public.project_roles
      WHERE project_id = _project_id AND user_id = _user_id
      LIMIT 1
    )
  END;
$$;

-- 5. RLS policies for project_roles
CREATE POLICY "Project members can view roles"
  ON public.project_roles FOR SELECT
  USING (public.can_access_project(auth.uid(), project_id));

CREATE POLICY "Project admins can manage roles"
  ON public.project_roles FOR ALL
  USING (public.is_project_admin(auth.uid(), project_id))
  WITH CHECK (public.is_project_admin(auth.uid(), project_id));

-- 6. RLS for audit_log
CREATE POLICY "Project admins can view audit log"
  ON public.audit_log FOR SELECT
  USING (public.is_project_admin(auth.uid(), project_id));

CREATE POLICY "Authenticated users can insert audit log"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 7. Update projects RLS to support shared access
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view accessible projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id OR public.can_access_project(auth.uid(), id));

DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Owners and admins can update projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id OR public.is_project_admin(auth.uid(), id));

DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Owners can delete projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- 8. Update project_items RLS
DROP POLICY IF EXISTS "Users can manage own project items" ON public.project_items;

CREATE POLICY "Project members can view items"
  ON public.project_items FOR SELECT
  USING (public.can_access_project(auth.uid(), project_id));

CREATE POLICY "Project editors can insert items"
  ON public.project_items FOR INSERT
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

CREATE POLICY "Project editors can update items"
  ON public.project_items FOR UPDATE
  USING (public.can_edit_project(auth.uid(), project_id));

CREATE POLICY "Project editors can delete items"
  ON public.project_items FOR DELETE
  USING (public.can_edit_project(auth.uid(), project_id));

-- 9. Update custom_costs RLS
DROP POLICY IF EXISTS "Users can manage own project costs" ON public.custom_costs;

CREATE POLICY "Project members can view costs"
  ON public.custom_costs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = custom_costs.project_id AND public.can_access_project(auth.uid(), custom_costs.project_id))
  );

CREATE POLICY "Project editors can manage costs"
  ON public.custom_costs FOR ALL
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

-- 10. Update project_categories RLS
DROP POLICY IF EXISTS "Users can manage own project categories" ON public.project_categories;

CREATE POLICY "Project members can view categories"
  ON public.project_categories FOR SELECT
  USING (public.can_access_project(auth.uid(), project_id));

CREATE POLICY "Project editors can manage categories"
  ON public.project_categories FOR ALL
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

-- 11. Update project_text_sections RLS
DROP POLICY IF EXISTS "Users can manage own project text sections" ON public.project_text_sections;

CREATE POLICY "Project members can view text sections"
  ON public.project_text_sections FOR SELECT
  USING (public.can_access_project(auth.uid(), project_id));

CREATE POLICY "Project editors can manage text sections"
  ON public.project_text_sections FOR ALL
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

-- 12. Update mass_calc_runs RLS
DROP POLICY IF EXISTS "Users can manage own mass calc runs" ON public.mass_calc_runs;

CREATE POLICY "Project members can view mass calc runs"
  ON public.mass_calc_runs FOR SELECT
  USING (public.can_access_project(auth.uid(), project_id));

CREATE POLICY "Project editors can manage mass calc runs"
  ON public.mass_calc_runs FOR ALL
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

-- 13. Update mass_calc_settings RLS
DROP POLICY IF EXISTS "Users can manage own mass calc settings" ON public.mass_calc_settings;

CREATE POLICY "Project members can view mass calc settings"
  ON public.mass_calc_settings FOR SELECT
  USING (public.can_access_project(auth.uid(), project_id));

CREATE POLICY "Project editors can manage mass calc settings"
  ON public.mass_calc_settings FOR ALL
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

-- 14. Update road_branches RLS
DROP POLICY IF EXISTS "Users can manage own project branches" ON public.road_branches;

CREATE POLICY "Project members can view branches"
  ON public.road_branches FOR SELECT
  USING (public.can_access_project(auth.uid(), project_id));

CREATE POLICY "Project editors can manage branches"
  ON public.road_branches FOR ALL
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

-- 15. Update measurement_points RLS
DROP POLICY IF EXISTS "Users can manage own measurement points" ON public.measurement_points;

CREATE POLICY "Project members can view measurement points"
  ON public.measurement_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.road_branches rb
      WHERE rb.id = branch_id AND public.can_access_project(auth.uid(), rb.project_id)
    )
  );

CREATE POLICY "Project editors can manage measurement points"
  ON public.measurement_points FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.road_branches rb
      WHERE rb.id = branch_id AND public.can_edit_project(auth.uid(), rb.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.road_branches rb
      WHERE rb.id = branch_id AND public.can_edit_project(auth.uid(), rb.project_id)
    )
  );

-- 16. Trigger: auto-assign admin role when project is created
CREATE OR REPLACE FUNCTION public.auto_assign_project_admin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.project_roles (project_id, user_id, role)
    VALUES (NEW.id, NEW.user_id, 'admin')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_assign_project_admin_trigger
AFTER INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_project_admin();

-- 17. Backfill admin roles for existing project owners
INSERT INTO public.project_roles (project_id, user_id, role)
SELECT id, user_id, 'admin'::public.app_role
FROM public.projects
WHERE user_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;
