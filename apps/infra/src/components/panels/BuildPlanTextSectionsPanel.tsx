import React, { useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useProjectTextSections } from '@/hooks/useProjectTextSections';
import { useRole } from '@/context/RoleContext';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ChevronDown, ChevronRight, FileText, Plus, Trash2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BuildPlanTextSectionsPanel() {
  const { project } = useProject();
  const { sections, isLoading, updateSection, addSection, deleteSection } = useProjectTextSections(project?.id);
  const { canEdit } = useRole();
  const isReadOnly = !canEdit();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [showAddNew, setShowAddNew] = useState(false);
  const [newSectionKey, setNewSectionKey] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');

  if (!project) {
    return <div className="p-4 text-sidebar-foreground/70 text-sm">Luo projekti ensin.</div>;
  }

  if (isLoading) {
    return <div className="p-4 text-sidebar-foreground/70 text-sm">Ladataan...</div>;
  }

  const toggleSection = (id: string) => {
    setExpandedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleContentChange = (id: string, content: string) => {
    setEditedContent(prev => ({ ...prev, [id]: content }));
  };

  const handleSave = (id: string) => {
    const content = editedContent[id];
    if (content !== undefined) {
      updateSection({ id, updates: { content } });
      setEditedContent(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleToggleEnabled = (id: string, isEnabled: boolean) => {
    updateSection({ id, updates: { isEnabled } });
  };

  const handleAddNew = () => {
    if (newSectionKey.trim() && newSectionTitle.trim()) {
      addSection({ 
        sectionKey: newSectionKey.trim().toLowerCase().replace(/\s+/g, '_'), 
        title: newSectionTitle.trim(), 
        content: '' 
      });
      setNewSectionKey('');
      setNewSectionTitle('');
      setShowAddNew(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-sidebar-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Rakennussuunnitelman tekstit
        </h3>
        {!isReadOnly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddNew(!showAddNew)}
            className="h-7 px-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Lisää osio
          </Button>
        )}
      </div>

      {/* Add new section form */}
      {showAddNew && (
        <div className="p-3 bg-sidebar-accent/50 rounded-lg border border-sidebar-border space-y-2 mb-4">
          <Input
            value={newSectionTitle}
            onChange={e => setNewSectionTitle(e.target.value)}
            placeholder="Otsikko, esim. Sillat"
            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddNew} disabled={!newSectionTitle.trim()} className="h-7 text-xs">
              Lisää
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddNew(false)} className="h-7 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
              Peruuta
            </Button>
          </div>
        </div>
      )}

      {/* Section list */}
      <div className="space-y-2">
        {sections.map(section => {
          const isExpanded = expandedSections.includes(section.id);
          const hasUnsavedChanges = editedContent[section.id] !== undefined;
          const currentContent = editedContent[section.id] ?? section.content;

          return (
            <div key={section.id} className={cn(
              "rounded-lg border overflow-hidden",
              section.isEnabled ? "border-sidebar-border bg-sidebar-accent/20" : "border-sidebar-border/50 bg-sidebar-accent/10 opacity-60"
            )}>
              {/* Section header */}
              <div className="flex items-center gap-2 p-2">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-sidebar-foreground/50" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-sidebar-foreground/50" />
                  )}
                  <span className="text-xs font-semibold text-sidebar-foreground">{section.title}</span>
                </button>
                
                <div className="flex items-center gap-2">
                  {!isReadOnly && (
                    <Switch
                      checked={section.isEnabled}
                      onCheckedChange={checked => handleToggleEnabled(section.id, checked)}
                      className="scale-75"
                    />
                  )}
                  {!isReadOnly && hasUnsavedChanges && (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleSave(section.id)}
                      className="h-6 px-2 text-xs"
                    >
                      <Save className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Section content */}
              {isExpanded && (
                <div className="px-2 pb-2">
                  <Textarea
                    value={currentContent}
                    onChange={isReadOnly ? undefined : (e => handleContentChange(section.id, e.target.value))}
                    readOnly={isReadOnly}
                    className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs min-h-[120px] resize-y"
                    placeholder={isReadOnly ? '' : 'Kirjoita osion sisältö...'}
                  />
                  {!isReadOnly && (
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[10px] text-sidebar-foreground/50">
                        {currentContent.length} merkkiä
                      </span>
                      {section.sectionKey.startsWith('custom_') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteSection(section.id)}
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/20"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Poista
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sections.length === 0 && (
        <div className="text-center py-8 text-sidebar-foreground/50 text-xs">
          Ei tekstiosioita. Tekstit luodaan automaattisesti kun tallennat projektin.
        </div>
      )}
    </div>
  );
}
