import React, { useState } from 'react';
import { useMassCalc } from '@/hooks/useMassCalc';
import { useBearingCapacityContext } from '@/context/BearingCapacityContext';
import { useProject } from '@/context/ProjectContext';
import { useRole } from '@/context/RoleContext';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Calculator, FileDown, Settings2, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';

export function MassCalcPanel() {
  const { project } = useProject();
  const { branches, points, mergedRoadSegments } = useBearingCapacityContext();
  const { canEdit } = useRole();
  const isReadOnly = !canEdit();
  const projectId = project?.id;
  const {
    settings,
    settingsLoading,
    saveSettings,
    loading,
    result,
    error,
    calculate,
    downloadPdf,
    hasExistingResults,
    pdfUrl,
  } = useMassCalc(projectId);

  const [showSettings, setShowSettings] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());

  // Local settings state for editing
  const [localSettings, setLocalSettings] = useState(settings);
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Auto-select all branches
  React.useEffect(() => {
    if (branches.length > 0 && selectedBranches.size === 0) {
      setSelectedBranches(new Set(branches.map(b => b.id)));
    }
  }, [branches]);

  const toggleBranch = (id: string) => {
    setSelectedBranches(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveSettings = async () => {
    await saveSettings(localSettings);
    toast.success('Asetukset tallennettu');
  };

  const handleCalculate = async () => {
    if (!project) return;
    const branchIds = Array.from(selectedBranches);
    if (branchIds.length === 0) {
      toast.error('Valitse vähintään yksi tiehaara');
      return;
    }

    // Get road coords from merged branch geometries
    const roadCoords = mergedRoadSegments.flat() as [number, number][];

    const res = await calculate(branchIds, roadCoords, project.name);
    if (res) {
      toast.success(`Massalaskenta valmis – ${res.branches.length} haaraa käsitelty`);
      // Notify other components (e.g. map) to refresh project_items
      window.dispatchEvent(new Event('mass-calc-complete'));
    }
  };

  const handleDownloadPdf = async () => {
    if (!project) return;
    if (pdfUrl) {
      // Download from stored PDF
      downloadPdf(project.name);
    } else if (result) {
      // Fallback: generate from in-memory result
      downloadPdf(project.name);
    } else {
      toast.error('PDF-raporttia ei löydy. Aja laskenta uudelleen.');
    }
  };

  if (!project) {
    return <div className="p-4 text-sm text-muted-foreground">Valitse ensin projekti.</div>;
  }

  if (isReadOnly) {
    // Watch users can only download existing PDF reports
    if (!hasExistingResults && !pdfUrl) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-sidebar-accent/50 rounded-lg border border-sidebar-border text-xs text-sidebar-foreground/60">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>Ei massalaskentatuloksia saatavilla.</span>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className="bg-sidebar-accent/50 rounded-lg p-3 border border-sidebar-border space-y-2">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-sidebar-foreground">Massalaskenta on suoritettu</span>
          </div>
          <p className="text-xs text-sidebar-foreground/60">
            Voit ladata PDF-raportin alla olevasta painikkeesta.
          </p>
          <Button
            onClick={handleDownloadPdf}
            variant="secondary"
            size="sm"
            className="w-full text-xs"
          >
            <FileDown className="w-3.5 h-3.5 mr-1.5" />
            {pdfUrl ? 'Lataa PDF-raportti' : 'Generoi ja lataa PDF-raportti'}
          </Button>
        </div>
      </div>
    );
  }

  const branchesWithPoints = branches.filter(b => points.some(p => p.branchId === b.id));

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-sidebar-foreground/70 uppercase tracking-wider">
          Massalaskenta
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings2 className="w-3.5 h-3.5 mr-1" />
          Asetukset
          {showSettings ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
        </Button>
      </div>

      {/* Global settings */}
      {showSettings && (
        <div className="bg-sidebar-accent/50 rounded-lg p-3 border border-sidebar-border space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-sidebar-foreground/70 block mb-0.5">
                Kevätkantavuuskerroin
              </label>
              <Input
                type="number"
                step="0.1"
                value={localSettings.springFactor}
                onChange={e => setLocalSettings({ ...localSettings, springFactor: parseFloat(e.target.value) || 1 })}
                className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs h-8"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-sidebar-foreground/70 block mb-0.5">
                Vaikutusetäisyys (m)
              </label>
              <Input
                type="number"
                value={localSettings.influenceDistanceM}
                onChange={e => setLocalSettings({ ...localSettings, influenceDistanceM: parseFloat(e.target.value) || 25 })}
                className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs h-8"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-sidebar-foreground/70 block mb-0.5">
                Katkaisupituus (m)
              </label>
              <Input
                type="number"
                value={localSettings.cutLengthM}
                onChange={e => setLocalSettings({ ...localSettings, cutLengthM: parseFloat(e.target.value) || 100 })}
                className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs h-8"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-sidebar-foreground/70 block mb-0.5">
                Pintamurske (mm)
              </label>
              <Input
                type="number"
                value={localSettings.surfaceThicknessM * 1000}
                onChange={e => setLocalSettings({ ...localSettings, surfaceThicknessM: (parseFloat(e.target.value) || 50) / 1000 })}
                className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs h-8"
              />
            </div>
          </div>
          <Button onClick={handleSaveSettings} size="sm" className="w-full text-xs h-7">
            Tallenna asetukset
          </Button>
        </div>
      )}

      {/* Branch selection */}
      {branchesWithPoints.length === 0 ? (
        <div className="text-xs text-sidebar-foreground/50 py-2">
          Ei tiehaaroja mittaustiedoin. Lisää ensin mittauspisteitä.
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-sidebar-foreground/70 block">
            Valitse haarat laskentaan
          </label>
          {branchesWithPoints.map(b => {
            const count = points.filter(p => p.branchId === b.id).length;
            const selected = selectedBranches.has(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggleBranch(b.id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-sidebar-accent transition-colors text-left"
              >
                {selected
                  ? <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                  : <Square className="w-3.5 h-3.5 text-sidebar-foreground/40 shrink-0" />
                }
                <span className="font-semibold text-sidebar-foreground truncate">{b.name}</span>
                <span className="text-sidebar-foreground/50 ml-auto shrink-0">{count} pist.</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Calculate button */}
      <Button
        onClick={handleCalculate}
        disabled={loading || selectedBranches.size === 0}
        className="w-full"
        size="sm"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Lasketaan...
          </>
        ) : (
          <>
            <Calculator className="w-4 h-4 mr-2" />
            Laske massat
          </>
        )}
      </Button>

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">{error}</div>
      )}

      {/* Results summary */}
      {result && (
        <div className="space-y-2">
          <div className="bg-sidebar-accent/50 rounded-lg p-3 border border-sidebar-border space-y-1.5">
            <h4 className="text-[10px] font-bold text-sidebar-foreground/70 uppercase tracking-wider">Tulokset</h4>
            {result.branches.map(br => (
              <div key={br.branch.id} className="text-xs text-sidebar-foreground">
                <span className="font-semibold">{br.branch.name}:</span>{' '}
                {br.segments.length} korjausjaksoa
                {br.segments.length > 0 && (
                  <span className="text-sidebar-foreground/60">
                    {' '}· KaM32: {br.totals.kam32_t.toFixed(2)} tn
                    {br.totals.kam56_t > 0 && ` · KaM56: ${br.totals.kam56_t.toFixed(2)} tn`}
                  </span>
                )}
              </div>
            ))}
            <div className="border-t border-sidebar-border pt-1.5 mt-1.5 text-xs font-semibold text-sidebar-foreground">
              Yhteensä: KaM16 {result.grandTotals.kam16_t.toFixed(2)} tn
              · KaM32 {result.grandTotals.kam32_t.toFixed(2)} tn
              · KaM56 {result.grandTotals.kam56_t.toFixed(2)} tn
            </div>
          </div>

          <Button
            onClick={handleDownloadPdf}
            variant="secondary"
            size="sm"
            className="w-full text-xs"
          >
            <FileDown className="w-3.5 h-3.5 mr-1.5" />
            Lataa PDF-raportti
          </Button>
        </div>
      )}

      {/* Show existing results notice when no fresh result but items exist */}
      {!result && hasExistingResults && (
        <div className="bg-sidebar-accent/50 rounded-lg p-3 border border-sidebar-border space-y-2">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-sidebar-foreground">Massalaskenta on suoritettu</span>
          </div>
          <p className="text-xs text-sidebar-foreground/60">
            Tuotteet näkyvät kartalla ja kustannusarviossa. Aja laskenta uudelleen päivittääksesi.
          </p>
          <Button
            onClick={handleDownloadPdf}
            variant="secondary"
            size="sm"
            className="w-full text-xs"
          >
            <FileDown className="w-3.5 h-3.5 mr-1.5" />
            {pdfUrl ? 'Lataa PDF-raportti' : 'Generoi ja lataa PDF-raportti'}
          </Button>
        </div>
      )}
    </div>
  );
}

function getRoadCoords(roadGeometry: any): [number, number][] {
  if (!roadGeometry) return [];
  const segments = roadGeometry.segments || (roadGeometry.coordinates?.length ? [roadGeometry.coordinates] : []);
  const allCoords: [number, number][] = [];
  for (const seg of segments) {
    if (seg.length >= 2) allCoords.push(...seg);
  }
  return allCoords;
}
