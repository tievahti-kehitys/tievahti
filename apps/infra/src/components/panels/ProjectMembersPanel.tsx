import React, { useState, useEffect, useCallback } from 'react';
import { useRole, AppRole, ProjectMember } from '@/context/RoleContext';
import { useProject } from '@/context/ProjectContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Crown, Edit2, Eye, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  edit: 'Muokkaa',
  watch: 'Katselu',
};

const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'text-destructive bg-destructive/10',
  edit: 'text-primary bg-primary/10',
  watch: 'text-muted-foreground bg-muted',
};

const RoleIcon = ({ role, className }: { role: AppRole; className?: string }) => {
  if (role === 'admin') return <Crown className={cn('w-3 h-3', className)} />;
  if (role === 'edit') return <Edit2 className={cn('w-3 h-3', className)} />;
  return <Eye className={cn('w-3 h-3', className)} />;
};

export function ProjectMembersPanel() {
  const { isAdmin, isProjectAdmin, canEdit, projectMembers, addMember, updateMemberRole, removeMember } = useRole();
  const { project } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();

  const [membersWithEmail, setMembersWithEmail] = useState<(ProjectMember & { email: string })[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('watch');
  const [adding, setAdding] = useState(false);
  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);

  // Fetch project owner id
  useEffect(() => {
    if (!project) return;
    supabase.from('projects').select('user_id').eq('id', project.id).single()
      .then(({ data }) => { if (data) setProjectOwnerId(data.user_id); });
  }, [project?.id]);

  const isProjectOwner = projectOwnerId === user?.id;
  const canRemove = isProjectOwner || isAdmin();
  const canGrantAdmin = isProjectAdmin();

  // Fetch members with emails via edge function
  const fetchMembersWithEmails = useCallback(async () => {
    if (!project || !canEdit()) return;
    const { data, error } = await supabase.functions.invoke('manage-project-role', {
      body: { action: 'list_with_emails', projectId: project.id },
    });
    if (!error && data?.members) {
      setMembersWithEmail(
        data.members.map((m: any) => ({
          id: m.id,
          userId: m.user_id,
          email: m.email,
          role: m.role as AppRole,
          createdAt: new Date(m.created_at),
        }))
      );
    }
  }, [project, isAdmin]);

  useEffect(() => {
    fetchMembersWithEmails();
  }, [fetchMembersWithEmails, projectMembers]);

  const handleAdd = async () => {
    if (!newEmail.trim()) return;
    setAdding(true);
    const { error } = await addMember(newEmail.trim(), newRole);
    if (error) {
      toast({ title: 'Virhe', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Käyttäjä lisätty', description: `${newEmail} lisätty roolilla ${ROLE_LABELS[newRole]}` });
      setNewEmail('');
      await fetchMembersWithEmails();
    }
    setAdding(false);
  };

  const handleRoleChange = async (userId: string, newR: AppRole) => {
    await updateMemberRole(userId, newR);
    await fetchMembersWithEmails();
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!confirm(`Poista käyttäjä ${email} projektista?`)) return;
    const { error } = await removeMember(userId);
    if (error) {
      toast({ title: 'Virhe', description: error, variant: 'destructive' });
    } else {
      await fetchMembersWithEmails();
    }
  };

  if (!canEdit()) {
    return (
      <div className="p-4 text-center text-sm text-sidebar-foreground/50">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>Vain muokkausoikeuden omaavat voivat hallita jäseniä</p>
      </div>
    );
  }

  const displayMembers = membersWithEmail.length > 0 ? membersWithEmail : projectMembers.map(m => ({ ...m, email: m.userId }));

  return (
    <div className="p-3 space-y-4">
      <p className="text-xs text-sidebar-foreground/60">
        Hallitse projektin jäseniä ja heidän oikeuksiaan. Jäsenet lisätään sähköpostiosoitteen perusteella.
      </p>

      {/* Current members */}
      <div className="space-y-1.5">
        {displayMembers.map(member => (
          <div key={member.id} className="flex items-center gap-2 bg-sidebar-accent/30 rounded px-2 py-2">
            <div className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold', ROLE_COLORS[member.role])}>
              <RoleIcon role={member.role} />
              <span>{ROLE_LABELS[member.role]}</span>
            </div>
            <span className="text-xs text-sidebar-foreground flex-1 truncate">{member.email}</span>
            <select
              value={member.role}
              onChange={(e) => handleRoleChange(member.userId, e.target.value as AppRole)}
              className="text-xs bg-sidebar-accent border border-sidebar-border rounded px-1 py-0.5 text-sidebar-foreground"
            >
              {canGrantAdmin && <option value="admin">Admin</option>}
              <option value="edit">Muokkaa</option>
              <option value="watch">Katselu</option>
            </select>
            {canRemove && (
              <button
                onClick={() => handleRemove(member.userId, member.email)}
                className="p-1 hover:bg-destructive/20 rounded"
                title="Poista jäsen"
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </button>
            )}
          </div>
        ))}
        {displayMembers.length === 0 && (
          <p className="text-xs text-sidebar-foreground/40 text-center py-2">Ei jäseniä</p>
        )}
      </div>

      {/* Add member */}
      <div className="space-y-2 border-t border-sidebar-border pt-3">
        <Label className="text-xs text-sidebar-foreground/70">Lisää jäsen sähköpostilla</Label>
        <div className="flex gap-2">
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="sahkoposti@tievahti.fi"
            className="flex-1 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as AppRole)}
            className="text-xs bg-sidebar-accent border border-sidebar-border rounded px-2 text-sidebar-foreground"
          >
            {canGrantAdmin && <option value="admin">Admin</option>}
            <option value="edit">Muokkaa</option>
            <option value="watch">Katselu</option>
          </select>
        </div>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={adding || !newEmail.trim()}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-1" />
          {adding ? 'Lisätään...' : 'Lisää jäsen'}
        </Button>
      </div>

      {/* Role legend */}
      <div className="border-t border-sidebar-border pt-3 space-y-1">
        <p className="text-[10px] font-bold text-sidebar-foreground/50 uppercase tracking-wider">Roolien oikeudet</p>
        <div className="space-y-1 text-xs text-sidebar-foreground/60">
          <div className="flex items-center gap-1.5"><Crown className="w-3 h-3 text-destructive" /><span><strong>Admin</strong> — täysi hallinta</span></div>
          <div className="flex items-center gap-1.5"><Edit2 className="w-3 h-3 text-primary" /><span><strong>Muokkaa</strong> — projektit, kartta, kustannukset</span></div>
          <div className="flex items-center gap-1.5"><Eye className="w-3 h-3 text-muted-foreground" /><span><strong>Katselu</strong> — vain lukuoikeus + export</span></div>
        </div>
        {!canRemove && (
          <p className="text-[10px] text-sidebar-foreground/40 mt-1">Vain projektin omistaja voi poistaa jäseniä</p>
        )}
      </div>
    </div>
  );
}
