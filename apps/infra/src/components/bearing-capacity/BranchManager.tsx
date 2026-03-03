import React, { useState, useRef } from 'react';
import { RoadBranch, MeasurementPoint } from '@/hooks/useBearingCapacity';
import { FWDMeasurementPoint } from '@/lib/fwdParser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, X, FileUp, AlertCircle, Pencil, Check, Route, Search, MapPin, FileArchive } from 'lucide-react';
import { toast } from 'sonner';
import { useRoadGeoEditor } from '@/context/RoadGeometryEditorContext';
import { RoadGeometryEditorPanel } from '@/components/road-geometry/RoadGeometryEditorPanel';
import { FWDBatchDropDialog } from './FWDBatchDropDialog';

interface BranchManagerProps {
  branches: RoadBranch[];
  points: MeasurementPoint[];
  onAddBranch: (name: string, target: number, width: number) => Promise<void>;
  onUpdateBranch: (branchId: string, name: string, target: number, width: number) => Promise<void>;
  onDeleteBranch: (branchId: string) => Promise<void>;
  onUploadFWD: (branchId: string, fileContent: string) => Promise<FWDMeasurementPoint[]>;
  onDeletePoints: (branchId: string) => Promise<void>;
  onClearGeometry: (branchId: string) => Promise<void>;
  onBatchImport: (files: { branchName: string; content: string }[]) => Promise<void>;
  readOnly?: boolean;
}

export function BranchManager({ branches, points, onAddBranch, onUpdateBranch, onDeleteBranch, onUploadFWD, onDeletePoints, onClearGeometry, onBatchImport, readOnly = false }: BranchManagerProps) {
  const [showBatchDrop, setShowBatchDrop] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('80');
  const [width, setWidth] = useState('4');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editWidth, setEditWidth] = useState('');
  const [googleBranchId, setGoogleBranchId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const roadGeoEditor = useRoadGeoEditor();

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onAddBranch(name.trim(), parseFloat(target) || 80, parseFloat(width) || 4);
      setName('');
      setTarget('80');
      setWidth('4');
      setShowForm(false);
      toast.success('Tiehaara lisätty');
    } catch {
      toast.error('Tiehaaran lisäys epäonnistui');
    }
    setSubmitting(false);
  };

  const handleFileUpload = async (branchId: string, file: File) => {
    try {
      const content = await file.text();
      const parsedPoints = await onUploadFWD(branchId, content);
      toast.success(`${parsedPoints.length} mittauspistettä ladattu`);
    } catch (err: any) {
      toast.error(err?.message || 'Tiedoston käsittely epäonnistui');
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    if (!confirm('Poistetaanko tiehaara ja kaikki sen mittauspisteet?')) return;
    try {
      await onDeleteBranch(branchId);
      toast.success('Tiehaara poistettu');
    } catch {
      toast.error('Poisto epäonnistui');
    }
  };

  const startEdit = (branch: RoadBranch) => {
    setEditingId(branch.id);
    setEditName(branch.name);
    setEditTarget(String(branch.targetBearingCapacity));
    setEditWidth(String(branch.roadWidth));
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setSubmitting(true);
    try {
      await onUpdateBranch(editingId, editName.trim(), parseFloat(editTarget) || 80, parseFloat(editWidth) || 4);
      setEditingId(null);
      toast.success('Tiehaara päivitetty');
    } catch {
      toast.error('Päivitys epäonnistui');
    }
    setSubmitting(false);
  };

  const getPointCount = (branchId: string) => points.filter(p => p.branchId === branchId).length;

  const getBranchGeometryInfo = (branch: RoadBranch) => {
    const geo = branch.geometry as any;
    if (!geo?.coordinates || geo.coordinates.length < 2) return null;
    return { pointCount: geo.coordinates.length };
  };

  const handleStartDraw = (branchId: string) => {
    setGoogleBranchId(null);
    window.dispatchEvent(new CustomEvent('branch-road-edit', {
      detail: { branchId, action: 'draw' },
    }));
  };

  const handleStartGoogle = (branchId: string) => {
    if (googleBranchId === branchId) {
      setGoogleBranchId(null);
      roadGeoEditor.deactivate();
      // Exit edit mode on map
      window.dispatchEvent(new CustomEvent('branch-road-edit', {
        detail: { branchId: null, action: 'stop' },
      }));
    } else {
      setGoogleBranchId(branchId);
      roadGeoEditor.activate();
      roadGeoEditor.setTargetBranchId(branchId);
      // Also set editing branch on map for visual edit mode
      window.dispatchEvent(new CustomEvent('branch-road-edit', {
        detail: { branchId, action: 'google' },
      }));
    }
  };

  const handleClearGeometry = async (branchId: string) => {
    if (!confirm('Tyhjennä tiegeometria tästä haarasta?')) return;
    try {
      await onClearGeometry(branchId);
      toast.success('Tiegeometria tyhjennetty');
    } catch {
      toast.error('Tyhjennys epäonnistui');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-sidebar-foreground/70 uppercase tracking-wider">Tiehaarat</h3>
        {!readOnly && (
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowBatchDrop(true)}
              className="text-xs"
              title="Tuo FWD-tiedostot kerralla"
            >
              <FileArchive className="w-3.5 h-3.5 mr-1" />
              Tuo FWD
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowForm(!showForm)}
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {showForm ? <X className="w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              {showForm ? 'Peruuta' : 'Lisää haara'}
            </Button>
          </div>
        )}
      </div>

      <FWDBatchDropDialog
        open={showBatchDrop}
        onOpenChange={setShowBatchDrop}
        onImport={onBatchImport}
      />

      {/* Add branch form */}
      {showForm && (
        <div className="bg-sidebar-accent/50 rounded-lg p-3 border border-sidebar-border space-y-2">
          <div>
            <label className="text-xs font-bold text-sidebar-foreground/70 mb-1 block">Nimi</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="esim. Päätie"
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-sidebar-foreground/70 mb-1 block">Tavoite (MN/m²)</label>
              <Input
                type="number"
                value={target}
                onChange={e => setTarget(e.target.value)}
                className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-sidebar-foreground/70 mb-1 block">Leveys (m)</label>
              <Input
                type="number"
                value={width}
                onChange={e => setWidth(e.target.value)}
                className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
              />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={submitting || !name.trim()} size="sm" className="w-full">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Lisää tiehaara
          </Button>
        </div>
      )}

      {/* Branch list */}
      {branches.length === 0 && !showForm && (
        <div className="text-xs text-sidebar-foreground/50 flex items-center gap-2 py-2">
          <AlertCircle className="w-3.5 h-3.5" />
          Ei tiehaaroja. Lisää ensimmäinen tiehaara.
        </div>
      )}

      {branches.map(branch => {
        const pointCount = getPointCount(branch.id);
        const isEditing = editingId === branch.id;
        const geoInfo = getBranchGeometryInfo(branch);

        return (
          <div
            key={branch.id}
            className="bg-sidebar-accent/50 rounded-lg p-3 border border-sidebar-border"
          >
            {isEditing ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-bold text-sidebar-foreground/70 mb-1 block">Nimi</label>
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-sidebar-foreground/70 mb-1 block">Tavoite (MN/m²)</label>
                    <Input
                      type="number"
                      value={editTarget}
                      onChange={e => setEditTarget(e.target.value)}
                      className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-sidebar-foreground/70 mb-1 block">Leveys (m)</label>
                    <Input
                      type="number"
                      value={editWidth}
                      onChange={e => setEditWidth(e.target.value)}
                      className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button onClick={handleSaveEdit} disabled={submitting || !editName.trim()} size="sm" className="flex-1 text-xs">
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Tallenna
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="text-xs">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-sidebar-foreground">{branch.name}</p>
                    <p className="text-xs text-sidebar-foreground/60">
                      Tavoite: {branch.targetBearingCapacity} MN/m² · Leveys: {branch.roadWidth} m
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-sidebar-foreground/50 hover:text-primary"
                        onClick={() => startEdit(branch)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-sidebar-foreground/50 hover:text-destructive"
                        onClick={() => handleDeleteBranch(branch.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Geometry status + tools */}
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-[10px] text-sidebar-foreground/50 mr-auto">
                    {geoInfo
                      ? <span className="text-success">🛣️ Tie: {geoInfo.pointCount} pistettä</span>
                      : <span className="text-sidebar-foreground/40">Ei tiegeometriaa</span>
                    }
                  </span>
                  {!readOnly && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[10px] h-6 px-1.5 text-sidebar-foreground/60 hover:text-primary"
                        onClick={() => handleStartDraw(branch.id)}
                        title="Piirrä tie kartalle"
                      >
                        <Route className="w-3 h-3 mr-0.5" />
                        Piirrä
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`text-[10px] h-6 px-1.5 ${googleBranchId === branch.id ? 'text-primary bg-primary/10' : 'text-sidebar-foreground/60 hover:text-info'}`}
                        onClick={() => handleStartGoogle(branch.id)}
                        title="Hae tiegeometria Googlesta"
                      >
                        <Search className="w-3 h-3 mr-0.5" />
                        Google
                      </Button>
                      {geoInfo && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[10px] h-6 px-1.5 text-sidebar-foreground/60 hover:text-destructive"
                          onClick={() => handleClearGeometry(branch.id)}
                          title="Tyhjennä tiegeometria"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* Google search panel inline */}
                {googleBranchId === branch.id && (
                  <RoadGeometryEditorPanel embedded targetBranchId={branch.id} />
                )}

                {/* FWD data section */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-sidebar-foreground/60">
                    {pointCount > 0 ? `${pointCount} mittauspistettä` : 'Ei mittauspisteitä'}
                  </span>
                  {!readOnly && (
                    <div className="flex gap-1">
                      {pointCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[10px] h-7 px-2 text-sidebar-foreground/60 hover:text-destructive"
                          onClick={async () => {
                            if (!confirm('Poistetaanko kaikki mittauspisteet tästä haarasta?')) return;
                            try {
                              await onDeletePoints(branch.id);
                              toast.success('Mittauspisteet poistettu');
                            } catch {
                              toast.error('Poisto epäonnistui');
                            }
                          }}
                        >
                          <Trash2 className="w-3 h-3 mr-0.5" />
                          Tyhjennä
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-[10px] h-7 px-2"
                        onClick={() => fileInputRefs.current[branch.id]?.click()}
                      >
                        <FileUp className="w-3 h-3 mr-0.5" />
                        FWD
                      </Button>
                      <input
                        ref={el => { fileInputRefs.current[branch.id] = el; }}
                        type="file"
                        accept=".fwd,.txt,.FWD,.TXT"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            await handleFileUpload(branch.id, file);
                            e.target.value = '';
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
