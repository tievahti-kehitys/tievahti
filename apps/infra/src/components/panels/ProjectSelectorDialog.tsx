import React, { useEffect } from 'react';
import { X, FolderOpen, Plus, Trash2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useProject } from '@/context/ProjectContext';
import { useRole } from '@/context/RoleContext';

interface ProjectSelectorDialogProps {
  onSelect: (projectId: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
  currentProjectId: string | null;
}

export function ProjectSelectorDialog({ 
  onSelect, 
  onCreateNew, 
  onClose,
  currentProjectId 
}: ProjectSelectorDialogProps) {
  const { projects, refreshProjects, deleteProject } = useProject();
  const { canCreateProject, isAdmin } = useRole();
  const [searchQuery, setSearchQuery] = React.useState('');

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const handleDelete = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Only admins can delete projects
    if (!isAdmin()) return;
    if (confirm('Haluatko varmasti poistaa tämän projektin?')) {
      await deleteProject(projectId);
    }
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: Date) => {
    try {
      return date.toLocaleDateString('fi-FI', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-elevated border border-border w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-foreground">Projektit</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-background rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search and New Project */}
        <div className="p-3 border-b border-border space-y-3">
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Hae projekteja..."
            className="bg-background"
          />
          {canCreateProject() && (
            <Button onClick={onCreateNew} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Luo uusi projekti
            </Button>
          )}
        </div>

        {/* Projects list */}
        <div className="flex-1 overflow-auto">
          {filteredProjects.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Ei projekteja</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredProjects.map(project => (
                <button
                  key={project.id}
                  onClick={() => onSelect(project.id)}
                  className={cn(
                    "flex items-start justify-between w-full p-4 text-left hover:bg-muted/50 transition-colors",
                    project.id === currentProjectId && "bg-primary/10 border-l-4 border-l-primary"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate">
                        {project.name}
                      </span>
                      {project.id === currentProjectId && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                          Avoinna
                        </span>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>Muokattu: {formatDate(project.updatedAt)}</span>
                    </div>
                  </div>
                  {isAdmin() && (
                    <button
                      onClick={(e) => handleDelete(project.id, e)}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md ml-2"
                      title="Poista projekti"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
