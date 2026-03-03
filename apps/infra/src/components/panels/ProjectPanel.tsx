import React, { useState, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useRole } from '@/context/RoleContext';
import { Plus, FolderOpen, Calendar, ChevronRight, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ProjectSelectorDialog } from './ProjectSelectorDialog';

export function ProjectPanel() {
  const { project, projects, createProject, updateProject, loadProject } = useProject();
  const { canEdit, canCreateProject } = useRole();
  const [isCreating, setIsCreating] = useState(!project);
  const [showSelector, setShowSelector] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const handleCreate = async () => {
    if (newName.trim()) {
      await createProject(newName.trim(), newDescription.trim());
      setIsCreating(false);
      setNewName('');
      setNewDescription('');
    }
  };

  const handleSelectProject = async (projectId: string) => {
    await loadProject(projectId);
    setShowSelector(false);
  };

  const handleCreateNew = () => {
    setShowSelector(false);
    setIsCreating(true);
  };

  const savedProjectCount = projects.length;

  if (isCreating || !project) {
    // Watch-käyttäjä ei voi luoda projekteja
    if (!canCreateProject()) {
      return (
        <div className="p-4">
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <Lock className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm font-semibold text-sidebar-foreground/70">Vain luku</p>
            <p className="text-xs text-sidebar-foreground/50">
              Sinulla on katseluoikeus. Uusien projektien luonti vaatii @tievahti.fi-tunnuksen.
            </p>
            {projects.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setIsCreating(false); setShowSelector(true); }}
                className="text-xs bg-sidebar-accent hover:bg-sidebar-accent/80 border-sidebar-border text-sidebar-foreground"
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1" />
                Avaa projekti ({projects.length})
              </Button>
            )}
          </div>
          {showSelector && (
            <ProjectSelectorDialog
              onSelect={handleSelectProject}
              onCreateNew={handleCreateNew}
              onClose={() => setShowSelector(false)}
              currentProjectId={project?.id || null}
            />
          )}
        </div>
      );
    }

    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-sidebar-foreground">Uusi projekti</h2>
          {savedProjectCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setIsCreating(false);
                setShowSelector(true);
              }}
              className="text-xs bg-sidebar-accent hover:bg-sidebar-accent/80 border-sidebar-border text-sidebar-foreground"
            >
              <FolderOpen className="w-3.5 h-3.5 mr-1" />
              Avaa ({savedProjectCount})
            </Button>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Projektin nimi</label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="esim. Metsätie 1234"
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Kuvaus</label>
            <Textarea
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Hankkeen kuvaus..."
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground resize-none"
              rows={3}
            />
          </div>
          <Button onClick={handleCreate} className="w-full" disabled={!newName.trim()}>
            <Plus className="w-4 h-4 mr-2" />
            Luo projekti
          </Button>
        </div>

        {showSelector && (
          <ProjectSelectorDialog
            onSelect={handleSelectProject}
            onCreateNew={handleCreateNew}
            onClose={() => setShowSelector(false)}
            currentProjectId={project?.id || null}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Project switcher button */}
      <button
        onClick={() => setShowSelector(true)}
        className="w-full flex items-center justify-between p-3 mb-4 bg-sidebar-accent hover:bg-sidebar-accent/80 rounded-lg border border-sidebar-border transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-bold text-sidebar-foreground truncate">{project.name}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-sidebar-foreground/60">
          <span>Vaihda</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </button>

      <div className="space-y-4">
        {/* Project name */}
        <div>
          <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Nimi</label>
          <Input
            value={project.name}
            onChange={canEdit() ? (e => updateProject({ name: e.target.value })) : undefined}
            readOnly={!canEdit()}
            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Kuvaus</label>
          <Textarea
            value={project.description}
            onChange={canEdit() ? (e => updateProject({ description: e.target.value })) : undefined}
            readOnly={!canEdit()}
            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground resize-none"
            rows={2}
          />
        </div>

        {/* VAT and currency */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">ALV %</label>
            <Input
              type="number"
              value={project.vatPercentage}
              onChange={canEdit() ? (e => updateProject({ vatPercentage: parseFloat(e.target.value) || 0 })) : undefined}
              readOnly={!canEdit()}
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Valuutta</label>
            <Input
              value={project.currency}
              onChange={canEdit() ? (e => updateProject({ currency: e.target.value })) : undefined}
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              disabled
            />
          </div>
        </div>

        {/* Dates */}
        <div className="flex items-center gap-2 text-xs text-sidebar-foreground/50 pt-2 border-t border-sidebar-border">
          <Calendar className="w-3.5 h-3.5" />
          <span>
            Luotu: {project.createdAt.toLocaleDateString('fi-FI')}
          </span>
        </div>
      </div>

      {showSelector && (
        <ProjectSelectorDialog
          onSelect={handleSelectProject}
          onCreateNew={handleCreateNew}
          onClose={() => setShowSelector(false)}
          currentProjectId={project.id}
        />
      )}
    </div>
  );
}
