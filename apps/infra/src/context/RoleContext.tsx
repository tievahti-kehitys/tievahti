import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useProject } from './ProjectContext';

export type AppRole = 'admin' | 'edit' | 'watch';

export interface ProjectMember {
  id: string;
  userId: string;
  email?: string;
  role: AppRole;
  createdAt: Date;
}

interface RoleContextType {
  // Project-specific role (or null if no project)
  role: AppRole | null;
  // Global role derived from email domain
  globalRole: AppRole | null;
  loading: boolean;
  // Effective role = max(globalRole, projectRole)
  effectiveRole: AppRole | null;
  isAdmin: () => boolean;          // global admin
  isProjectAdmin: () => boolean;   // project admin OR global admin
  canEdit: () => boolean;          // can edit project (edit or admin, project-level)
  canView: () => boolean;          // can view project
  canCreateProject: () => boolean; // only tievahti.fi domain (edit/admin global)
  canManageCatalog: () => boolean; // only global admin
  canShareProject: () => boolean;  // admin or edit (not watch)
  // Member management (admin only)
  projectMembers: ProjectMember[];
  addMember: (email: string, role: AppRole) => Promise<{ error?: string }>;
  updateMemberRole: (userId: string, role: AppRole) => Promise<void>;
  removeMember: (userId: string) => Promise<{ error?: string }>;
  refreshMembers: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | null>(null);

// Role hierarchy for comparison
const ROLE_LEVEL: Record<AppRole, number> = { watch: 0, edit: 1, admin: 2 };

function maxRole(a: AppRole | null, b: AppRole | null): AppRole | null {
  if (!a) return b;
  if (!b) return a;
  return ROLE_LEVEL[a] >= ROLE_LEVEL[b] ? a : b;
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { project } = useProject();
  const [role, setRole] = useState<AppRole | null>(null);
  const [globalRole, setGlobalRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);

  // Fetch global role based on email domain (via RPC)
  const fetchGlobalRole = useCallback(async () => {
    if (!user) {
      setGlobalRole(null);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_user_global_role', {
        _user_id: user.id,
      });
      if (error) {
        console.error('Error fetching global role:', error);
        // Fallback: derive from email client-side
        const email = user.email?.toLowerCase() || '';
        if (email === 'kehitys@tievahti.fi') {
          setGlobalRole('admin');
        } else if (email.endsWith('@tievahti.fi')) {
          setGlobalRole('edit');
        } else {
          setGlobalRole('watch');
        }
      } else {
        setGlobalRole((data as AppRole) || 'watch');
      }
    } catch {
      setGlobalRole('watch');
    }
  }, [user]);

  // Fetch project-specific role
  const fetchRole = useCallback(async () => {
    if (!user || !project) {
      setRole(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_project_role', {
        _user_id: user.id,
        _project_id: project.id,
      });
      if (error) {
        console.error('Error fetching project role:', error);
        setRole(null);
      } else {
        setRole((data as AppRole) || null);
      }
    } finally {
      setLoading(false);
    }
  }, [user, project?.id]);

  const fetchMembers = useCallback(async () => {
    if (!user || !project) {
      setProjectMembers([]);
      return;
    }
    const { data, error } = await supabase
      .from('project_roles')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at');

    if (error) {
      console.error('Error fetching members:', error);
      return;
    }

    setProjectMembers(
      (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        role: row.role as AppRole,
        createdAt: new Date(row.created_at),
      }))
    );
  }, [user, project?.id]);

  useEffect(() => {
    fetchGlobalRole();
  }, [fetchGlobalRole]);

  useEffect(() => {
    fetchRole();
    fetchMembers();
  }, [fetchRole, fetchMembers]);

  // Effective role: max of global and project roles
  const effectiveRole = maxRole(globalRole, role);

  // Permission helpers
  const isAdmin = useCallback(() => globalRole === 'admin', [globalRole]);

  const isProjectAdmin = useCallback(() => {
    return globalRole === 'admin' || role === 'admin';
  }, [globalRole, role]);

  const canEdit = useCallback(() => {
    // For project editing: check project role first, fall back to global
    const effective = maxRole(globalRole, role);
    return effective === 'admin' || effective === 'edit';
  }, [globalRole, role]);

  const canView = useCallback(() => effectiveRole !== null, [effectiveRole]);

  const canCreateProject = useCallback(() => {
    return globalRole === 'admin' || globalRole === 'edit';
  }, [globalRole]);

  const canManageCatalog = useCallback(() => globalRole === 'admin', [globalRole]);

  const canShareProject = useCallback(() => {
    // Project owner/admin or global admin can share
    return isProjectAdmin() || globalRole === 'edit';
  }, [isProjectAdmin, globalRole]);

  const addMember = useCallback(async (email: string, newRole: AppRole): Promise<{ error?: string }> => {
    if (!project) return { error: 'No active project' };

    const { data, error } = await supabase.functions.invoke('manage-project-role', {
      body: { action: 'add', projectId: project.id, email, role: newRole },
    });

    if (error || data?.error) {
      return { error: data?.error || error?.message || 'Käyttäjää ei löydy' };
    }

    await fetchMembers();
    return {};
  }, [project, fetchMembers]);

  const updateMemberRole = useCallback(async (userId: string, newRole: AppRole) => {
    if (!project) return;

    // Only project admins can grant admin role
    if (newRole === 'admin' && !isProjectAdmin()) {
      console.warn('Only project admins can grant admin role');
      return;
    }

    // Route through edge function so edit-role users can also update roles
    // (RLS on project_roles only allows admins to write directly)
    const { data, error } = await supabase.functions.invoke('manage-project-role', {
      body: { action: 'update_role', projectId: project.id, userId, role: newRole },
    });

    if (error || data?.error) {
      console.error('Error updating role:', error || data?.error);
      return;
    }
    await fetchMembers();
  }, [project, isProjectAdmin, fetchMembers]);

  const removeMember = useCallback(async (userId: string): Promise<{ error?: string }> => {
    if (!project) return { error: 'No active project' };

    const { data, error } = await supabase.functions.invoke('manage-project-role', {
      body: { action: 'remove', projectId: project.id, userId },
    });

    if (error || data?.error) {
      const msg = data?.error || error?.message || 'Poisto epäonnistui';
      console.error('Error removing member:', msg);
      return { error: msg };
    }
    await fetchMembers();
    return {};
  }, [project, fetchMembers]);

  return (
    <RoleContext.Provider
      value={{
        role,
        globalRole,
        loading,
        effectiveRole,
        isAdmin,
        isProjectAdmin,
        canEdit,
        canView,
        canCreateProject,
        canManageCatalog,
        canShareProject,
        projectMembers,
        addMember,
        updateMemberRole,
        removeMember,
        refreshMembers: fetchMembers,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
