import React, { useRef, useState } from 'react';
import { FileDown, FileUp, Upload, AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  parseCatalogExcel,
  commitCatalogImport,
  type ImportPreview,
} from '@/lib/catalogExcel';
import { useCatalog } from '@/context/CatalogContext';
import { exportCatalogToExcel } from '@/lib/catalogExcel';

interface CatalogExcelDialogProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';

export function CatalogExcelDialog({ open, onClose, onImportComplete }: CatalogExcelDialogProps) {
  const { items, workTypes, reload } = useCatalog();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('idle');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportCatalogToExcel(items, workTypes);
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setStep('parsing');
    setPreview(null);
    setErrorMsg('');

    try {
      const result = await parseCatalogExcel(file);
      setPreview(result);
      setStep('preview');
    } catch (err: any) {
      setErrorMsg(err.message || 'Tiedoston lukeminen epäonnistui');
      setStep('error');
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setStep('importing');
    const result = await commitCatalogImport(preview);
    if (result.ok) {
      await reload();
      setStep('done');
      onImportComplete();
    } else {
      setErrorMsg(result.error || 'Tuonti epäonnistui');
      setStep('error');
    }
  };

  const reset = () => {
    setStep('idle');
    setPreview(null);
    setErrorMsg('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-sidebar text-sidebar-foreground border-sidebar-border">
        <DialogHeader>
          <DialogTitle className="text-sidebar-foreground">Katalogi – Excel-vienti / -tuonti</DialogTitle>
        </DialogHeader>

        {/* Export section */}
        <div className="border border-sidebar-border rounded-md p-3 space-y-2">
          <p className="text-xs font-medium text-sidebar-foreground/70 uppercase tracking-wide">Vienti (Export)</p>
          <p className="text-xs text-sidebar-foreground/60">
            Lataa koko katalogi Excel-tiedostona. Sisältää tuotteet, toimenpiteet, työtyypit,
            koosteet ja työmäärät.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4 mr-2" />
            )}
            Lataa Excel
          </Button>
        </div>

        {/* Import section */}
        <div className="border border-sidebar-border rounded-md p-3 space-y-2">
          <p className="text-xs font-medium text-sidebar-foreground/70 uppercase tracking-wide">Tuonti (Import)</p>
          <p className="text-xs text-sidebar-foreground/60">
            Tuo uusia tuotteita / toimenpiteitä / työtyyppejä Excel-tiedostosta. Olemassa olevia
            rivejä ei päivitetä — ainoastaan uudet luodaan.
          </p>

          {step === 'idle' && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80"
              >
                <FileUp className="w-4 h-4 mr-2" />
                Valitse Excel-tiedosto
              </Button>
            </>
          )}

          {step === 'parsing' && (
            <div className="flex items-center gap-2 text-sm text-sidebar-foreground/70 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Luetaan tiedostoa…
            </div>
          )}

          {step === 'importing' && (
            <div className="flex items-center gap-2 text-sm text-sidebar-foreground/70 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Tallennetaan tietokantaan…
            </div>
          )}

          {step === 'done' && (
            <div className="flex items-center gap-2 text-sm text-green-400 py-2">
              <CheckCircle2 className="w-4 h-4" />
              Tuonti onnistui!
              <Button variant="ghost" size="sm" onClick={reset} className="ml-auto text-sidebar-foreground/60 hover:text-sidebar-foreground">
                Tuo lisää
              </Button>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
                Yritä uudelleen
              </Button>
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-3">
              {/* Validation errors */}
              {preview.errors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded p-2 space-y-1">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Validointivirheet
                  </p>
                  {preview.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive/80">{e}</p>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div className="bg-sidebar-accent/40 rounded p-2 space-y-1">
                <p className="text-xs font-medium text-sidebar-foreground">Esikatselu – luodaan uusia:</p>
                <SummaryRow label="Tuotteita / toimenpiteitä" count={preview.newItems.length} />
                <SummaryRow label="Työtyyppejä" count={preview.newWorkTypes.length} />
                <SummaryRow label="Koosteita" count={preview.newCompositions.length} />
                <SummaryRow label="Työmäärä-rivejä" count={preview.newWorkReqs.length} />
              </div>

              {/* Item list preview */}
              {preview.newItems.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-0.5">
                  {preview.newItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 px-1.5 py-0.5 rounded text-xs hover:bg-sidebar-accent/30">
                      <span className={`px-1 rounded text-[10px] ${item.type === 'product' ? 'bg-primary/20 text-primary' : 'bg-accent/20 text-accent-foreground'}`}>
                        {item.type === 'product' ? 'Tuote' : 'Toimenpide'}
                      </span>
                      <span className="text-sidebar-foreground truncate">{item.name}</span>
                      <span className="text-sidebar-foreground/40 ml-auto shrink-0">{item.category}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
                >
                  <X className="w-3 h-3 mr-1" /> Peruuta
                </Button>
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={preview.newItems.length === 0 && preview.newWorkTypes.length === 0}
                  className="flex-1"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Tuo tietokantaan ({preview.newItems.length + preview.newWorkTypes.length} riviä)
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-sidebar-foreground/70">{label}</span>
      <span className={`font-medium ${count > 0 ? 'text-green-400' : 'text-sidebar-foreground/40'}`}>{count}</span>
    </div>
  );
}
