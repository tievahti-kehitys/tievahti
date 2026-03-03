
-- =====================================================
-- GLOBAL ROLE SYSTEM
-- Tievahti RBAC: domain-based + project-specific roles
-- =====================================================

-- Global roles table (separate from project_roles)
CREATE TABLE IF NOT EXISTS public.user_global_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'watch',
  set_by uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_global_roles ENABLE ROW LEVEL SECURITY;

-- Only admins can manage global roles
CREATE POLICY "Admins can manage global roles"
  ON public.user_global_roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_global_roles ugr
      WHERE ugr.user_id = auth.uid() AND ugr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_global_roles ugr
      WHERE ugr.user_id = auth.uid() AND ugr.role = 'admin'
    )
  );

-- Users can read their own global role
CREATE POLICY "Users can read own global role"
  ON public.user_global_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- Function: get_user_global_role
-- Returns the global role for a user (from table or derived from email)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_user_global_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_role public.app_role;
  user_email text;
  user_domain text;
BEGIN
  -- First check if there's an explicit role stored
  SELECT role INTO stored_role
  FROM public.user_global_roles
  WHERE user_id = _user_id;
  
  IF stored_role IS NOT NULL THEN
    RETURN stored_role;
  END IF;
  
  -- Otherwise derive from email domain
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = _user_id;
  
  IF user_email IS NULL THEN
    RETURN 'watch'::public.app_role;
  END IF;
  
  user_domain := lower(split_part(user_email, '@', 2));
  
  -- kehitys@tievahti.fi is always admin
  IF lower(user_email) = 'kehitys@tievahti.fi' THEN
    RETURN 'admin'::public.app_role;
  END IF;
  
  -- All other tievahti.fi users get edit
  IF user_domain = 'tievahti.fi' THEN
    RETURN 'edit'::public.app_role;
  END IF;
  
  -- Everyone else gets watch
  RETURN 'watch'::public.app_role;
END;
$$;

-- =====================================================
-- Function: is_tievahti_domain
-- Returns true if user has @tievahti.fi email
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_tievahti_domain(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = _user_id;
  IF user_email IS NULL THEN RETURN false; END IF;
  RETURN lower(split_part(user_email, '@', 2)) = 'tievahti.fi';
END;
$$;

-- =====================================================
-- Function: is_global_admin
-- Returns true if user has admin global role
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_global_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.get_user_global_role(_user_id) = 'admin'::public.app_role;
END;
$$;

-- =====================================================
-- Function: can_create_project
-- Only tievahti.fi users (edit or admin global role) can create projects
-- =====================================================
CREATE OR REPLACE FUNCTION public.can_create_project(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.get_user_global_role(_user_id) IN ('admin'::public.app_role, 'edit'::public.app_role);
END;
$$;

-- =====================================================
-- Update existing RLS policies
-- =====================================================

-- Projects: only tievahti.fi users can create projects
DROP POLICY IF EXISTS "Users can create own projects" ON public.projects;
CREATE POLICY "Users can create own projects"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_create_project(auth.uid()));

-- catalog_items: only global admins can insert/update/delete
DROP POLICY IF EXISTS "Authenticated users can manage catalog items" ON public.catalog_items;
CREATE POLICY "Global admins can manage catalog items"
  ON public.catalog_items
  FOR ALL
  TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

-- catalog_item_work: only global admins
DROP POLICY IF EXISTS "Authenticated users can manage catalog item work" ON public.catalog_item_work;
CREATE POLICY "Global admins can manage catalog item work"
  ON public.catalog_item_work
  FOR ALL
  TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

-- catalog_composition: only global admins
DROP POLICY IF EXISTS "Authenticated users can manage catalog composition" ON public.catalog_composition;
CREATE POLICY "Global admins can manage catalog composition"
  ON public.catalog_composition
  FOR ALL
  TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

-- work_types: only global admins
DROP POLICY IF EXISTS "Authenticated users can manage work types" ON public.work_types;
CREATE POLICY "Global admins can manage work types"
  ON public.work_types
  FOR ALL
  TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

-- Update project_roles: project admins OR global admins can manage roles
DROP POLICY IF EXISTS "Project admins can manage roles" ON public.project_roles;
CREATE POLICY "Project or global admins can manage roles"
  ON public.project_roles
  FOR ALL
  TO authenticated
  USING (
    public.is_project_admin(auth.uid(), project_id) OR
    public.is_global_admin(auth.uid())
  )
  WITH CHECK (
    public.is_project_admin(auth.uid(), project_id) OR
    public.is_global_admin(auth.uid())
  );

-- update updated_at trigger for global roles
CREATE TRIGGER update_user_global_roles_updated_at
  BEFORE UPDATE ON public.user_global_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-populate global role on signup using email domain
-- This trigger runs when a new user is created in auth.users
-- We handle this via the sign-in flow in edge function instead,
-- since we can't trigger on auth.users directly. 
-- But we DO pre-populate for kehitys@tievahti.fi if they exist.
