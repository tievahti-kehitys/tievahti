import React from 'react';
import { useProject } from '@/context/ProjectContext';
import { useRole } from '@/context/RoleContext';
import { Input } from '@/components/ui/input';
import { Building, User, Phone, Mail, MapPin, Users, Hash } from 'lucide-react';

export function ProjectDetailsPanel() {
  const { project, updateProject } = useProject();
  const { canEdit } = useRole();
  const isReadOnly = !canEdit();

  if (!project) {
    return <div className="p-4 text-sidebar-foreground/70 text-sm">Luo projekti ensin.</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-bold text-sidebar-foreground flex items-center gap-2">
        <Building className="w-4 h-4 text-primary" />
        Projektin tiedot
      </h3>

      {/* Projektin tyyppi */}
      <div>
        <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Projektin tyyppi</label>
        <Input
          value={project.projectType || ''}
          onChange={isReadOnly ? undefined : (e => updateProject({ projectType: e.target.value }))}
          readOnly={isReadOnly}
          placeholder="esim. Perusparannus"
          className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
        />
      </div>

      {/* Tiekunta */}
      <div>
        <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Tiekunta</label>
        <Input
          value={project.tiekunta || ''}
          onChange={isReadOnly ? undefined : (e => updateProject({ tiekunta: e.target.value }))}
          readOnly={isReadOnly}
          placeholder="Tiekunnan nimi"
          className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
        />
      </div>

      {/* Käyttöoikeusyksikkötunnus */}
      <div>
        <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Käyttöoikeusyksikkötunnus</label>
        <Input
          value={project.kayttooikeusyksikkotunnus || ''}
          onChange={isReadOnly ? undefined : (e => updateProject({ kayttooikeusyksikkotunnus: e.target.value }))}
          readOnly={isReadOnly}
          placeholder="esim. 123-456-789"
          className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
        />
      </div>

      {/* Kunta */}
      <div>
        <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          Kunta
        </label>
        <Input
          value={project.kunta || ''}
          onChange={isReadOnly ? undefined : (e => updateProject({ kunta: e.target.value }))}
          readOnly={isReadOnly}
          placeholder="Kunnan nimi"
          className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
        />
      </div>

      {/* Kohdeosoite */}
      <div>
        <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Kohdeosoite</label>
        <Input
          value={project.kohdeosoite || ''}
          onChange={isReadOnly ? undefined : (e => updateProject({ kohdeosoite: e.target.value }))}
          readOnly={isReadOnly}
          placeholder="Osoite"
          className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
        />
      </div>

      {/* Osakas- ja yksikkömäärä */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block flex items-center gap-1">
            <Users className="w-3 h-3" />
            Osakasmäärä
          </label>
          <Input
            type="number"
            value={project.osakasCount || 0}
            onChange={isReadOnly ? undefined : (e => updateProject({ osakasCount: parseInt(e.target.value) || 0 }))}
            readOnly={isReadOnly}
            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block flex items-center gap-1">
            <Hash className="w-3 h-3" />
            Yksikkömäärä
          </label>
          <Input
            type="number"
            value={project.yksikkoCount || 0}
            onChange={isReadOnly ? undefined : (e => updateProject({ yksikkoCount: parseInt(e.target.value) || 0 }))}
            readOnly={isReadOnly}
            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
          />
        </div>
      </div>

      {/* Vastuuhenkilö */}
      <div className="border-t border-sidebar-border pt-4 mt-4">
        <h4 className="text-xs font-bold text-sidebar-foreground mb-3 flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          Vastuuhenkilö
        </h4>
        
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block">Nimi</label>
            <Input
              value={project.vastuuhenkiloName || ''}
              onChange={isReadOnly ? undefined : (e => updateProject({ vastuuhenkiloName: e.target.value }))}
              readOnly={isReadOnly}
              placeholder="Vastuuhenkilön nimi"
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block flex items-center gap-1">
              <Phone className="w-3 h-3" />
              Puhelin
            </label>
            <Input
              type="tel"
              value={project.vastuuhenkiloPhone || ''}
              onChange={isReadOnly ? undefined : (e => updateProject({ vastuuhenkiloPhone: e.target.value }))}
              readOnly={isReadOnly}
              placeholder="Puhelinnumero"
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-sidebar-foreground/70 mb-1.5 block flex items-center gap-1">
              <Mail className="w-3 h-3" />
              Sähköposti
            </label>
            <Input
              type="email"
              value={project.vastuuhenkiloEmail || ''}
              onChange={isReadOnly ? undefined : (e => updateProject({ vastuuhenkiloEmail: e.target.value }))}
              readOnly={isReadOnly}
              placeholder="Sähköpostiosoite"
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
