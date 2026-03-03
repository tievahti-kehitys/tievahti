import React from 'react';
import { useProject } from '@/context/ProjectContext';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/context/RoleContext';
import { ProjectPanel } from '../panels/ProjectPanel';
import { ProjectDetailsPanel } from '../panels/ProjectDetailsPanel';
import { ProjectItemsPanel } from '../panels/ProjectItemsPanel';
import { CostEstimatePanel } from '../panels/CostEstimatePanel';
import { BuildPlanPanel } from '../panels/BuildPlanPanel';
import { BuildPlanTextSectionsPanel } from '../panels/BuildPlanTextSectionsPanel';
import { CatalogSettingsPanel } from '../panels/CatalogSettingsPanel';
import { BearingCapacityPanel } from '../bearing-capacity/BearingCapacityPanel';
import { ProjectMembersPanel } from '../panels/ProjectMembersPanel';
import { CategoryFilterDropdown } from '../ui/CategoryFilterDropdown';
import {
  FolderOpen,
  MapPin,
  Calculator,
  X,
  Save,
  AlertCircle,
  Check,
  FileText,
  Settings,
  Building,
  FileEdit,
  LogOut,
  BarChart3,
  Users,
  Crown,
  Edit2,
  Eye,
} from 'lucide-react';
import tievahtiLogo from '@/assets/tievahti-logo.svg';
import { cn } from '@/lib/utils';
import { AppRole } from '@/context/RoleContext';

export type PanelType = 'project' | 'project-details' | 'items' | 'costs' | 'plan' | 'plan-texts' | 'bearing' | 'settings' | 'members';

interface SidebarProps {
  onClose?: () => void;
  activePanel: PanelType;
  onPanelChange: (panel: PanelType) => void;
}

const RoleBadge = ({ globalRole, projectRole }: { globalRole: AppRole | null; projectRole: AppRole | null }) => {
  const displayRole = globalRole;
  if (!displayRole) return null;
  const configs = {
    admin: { icon: Crown, label: 'Admin', cls: 'text-destructive bg-destructive/10' },
    edit: { icon: Edit2, label: 'Muokkaa', cls: 'text-primary bg-primary/10' },
    watch: { icon: Eye, label: 'Katselu', cls: 'text-muted-foreground bg-muted' },
  };
  const c = configs[displayRole];
  return (
    <div className="flex items-center gap-1">
      <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold', c.cls)}>
        <c.icon className="w-2.5 h-2.5" />
        {c.label}
      </span>
      {projectRole && projectRole !== globalRole && (
        <span className="text-[10px] text-sidebar-foreground/40">({projectRole})</span>
      )}
    </div>
  );
};

export function Sidebar({ onClose, activePanel, onPanelChange }: SidebarProps) {
  const { saveStatus, project } = useProject();
  const { signOut, user } = useAuth();
  const { role, globalRole, isAdmin, canManageCatalog, isProjectAdmin, canEdit } = useRole();

  const handleNavClick = (id: PanelType) => {
    onPanelChange(id);
  };

  const allNavItems = [
    { id: 'project' as PanelType, icon: FolderOpen, label: 'Projekti', always: true },
    { id: 'project-details' as PanelType, icon: Building, label: 'Tiedot', always: true },
    { id: 'items' as PanelType, icon: MapPin, label: 'Kohteet', always: true },
    { id: 'costs' as PanelType, icon: Calculator, label: 'Kustannukset', always: true },
    { id: 'plan' as PanelType, icon: FileText, label: 'Suunnitelma', always: true },
    { id: 'plan-texts' as PanelType, icon: FileEdit, label: 'Tekstit', always: true },
    { id: 'bearing' as PanelType, icon: BarChart3, label: 'Kantavuus', always: true },
    // Settings (tuoteluettelo, työtyypit): vain global admin
    { id: 'settings' as PanelType, icon: Settings, label: 'Asetukset', show: canManageCatalog() },
    // Members: edit-oikeus tai ylöspäin
    { id: 'members' as PanelType, icon: Users, label: 'Jäsenet', show: canEdit() },
  ];

  const navItems = allNavItems.filter(item => item.always || item.show);

  const renderSaveStatus = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <Save className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-sidebar-foreground/60">Tallennetaan...</span>
          </div>
        );
      case 'saved':
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <Check className="w-3.5 h-3.5 text-success" />
            <span className="text-sidebar-foreground/60">Tallennettu</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <AlertCircle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-destructive/80">Virhe</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <aside className="flex flex-col h-full bg-sidebar border-r border-sidebar-border w-80">
      {/* Header - Tievahti Infra */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <img src={tievahtiLogo} alt="Tievahti" className="w-10 h-10 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-black text-sidebar-foreground text-base tracking-tight">Tievahti</h1>
            <div className="h-4">{renderSaveStatus()}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors shrink-0"
          title="Sulje sivupalkki"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation - compact grid on mobile */}
      <nav className="flex flex-wrap gap-1 p-2 border-b border-sidebar-border shrink-0">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => handleNavClick(item.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-150",
              activePanel === item.id
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Category filter */}
      <div className="px-3 py-1.5 border-b border-sidebar-border shrink-0">
        <CategoryFilterDropdown />
      </div>

      {/* Panel Content - scrollable, fills remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-sidebar-accent/20">
        {activePanel === 'project' && <ProjectPanel />}
        {activePanel === 'project-details' && <ProjectDetailsPanel />}
        {activePanel === 'items' && <ProjectItemsPanel />}
        {activePanel === 'costs' && <CostEstimatePanel />}
        {activePanel === 'plan' && <BuildPlanPanel />}
        {activePanel === 'plan-texts' && <BuildPlanTextSectionsPanel />}
        {activePanel === 'bearing' && <BearingCapacityPanel />}
        {activePanel === 'settings' && canManageCatalog() && <CatalogSettingsPanel />}
        {activePanel === 'members' && canEdit() && <ProjectMembersPanel />}
      </div>

      {/* Footer with project name, role badge and sign out */}
      <div className="px-4 py-3 border-t border-sidebar-border bg-sidebar shrink-0">
        {project && (
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50 font-bold mb-1">Aktiivinen projekti</p>
            <p className="text-sm font-bold text-sidebar-foreground truncate">{project.name}</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            title="Kirjaudu ulos"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{user?.email}</span>
          </button>
          <RoleBadge globalRole={globalRole} projectRole={role} />
        </div>
      </div>
    </aside>
  );
}
