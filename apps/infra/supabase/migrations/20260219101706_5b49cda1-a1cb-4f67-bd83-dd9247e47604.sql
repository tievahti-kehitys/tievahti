
CREATE OR REPLACE FUNCTION public.can_edit_project(_user_id uuid, _project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    -- Global admin can always edit
    public.is_global_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
    ) OR EXISTS (
      SELECT 1 FROM public.project_roles
      WHERE project_id = _project_id AND user_id = _user_id AND role IN ('admin', 'edit')
    );
$function$;
