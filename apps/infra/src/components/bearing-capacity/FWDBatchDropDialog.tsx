import React, { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { extractBranchName, parseFWDFile, FWDMeasurementPoint } from '@/lib/fwdParser';
import { FileArchive, FileUp, Loader2, CheckCircle2, XCircle, Upload } from 'lucide-react';
import { toast } from 'sonner';

interface ParsedFWDFile {
  fileName: string;
  branchName: string;
  content: string;
  points: FWDMeasurementPoint[];
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface FWDBatchDropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (files: { branchName: string; content: string }[]) => Promise<void>;
}

export function FWDBatchDropDialog({ open, onOpenChange, onImport }: FWDBatchDropDialogProps) {
  const [files, setFiles] = useState<ParsedFWDFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isFWDFile = (name: string) => /\.(fwd|txt)$/i.test(name);

  const processFileContent = (fileName: string, content: string): ParsedFWDFile | null => {
    const points = parseFWDFile(content);
    if (points.length === 0) return null;
    const branchName = extractBranchName(content) || fileName.replace(/\.(fwd|txt)$/i, '');
    return { fileName, branchName, content, points, status: 'pending' };
  };

  // Read all files from a dropped directory entry recursively
  const readDirectoryEntries = (dirEntry: FileSystemDirectoryEntry): Promise<File[]> => {
    return new Promise((resolve) => {
      const reader = dirEntry.createReader();
      const allFiles: File[] = [];

      const readBatch = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(allFiles);
            return;
          }
          for (const entry of entries) {
            if (entry.isFile) {
              const file = await new Promise<File>((res) =>
                (entry as FileSystemFileEntry).file(res)
              );
              allFiles.push(file);
            } else if (entry.isDirectory) {
              const subFiles = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
              allFiles.push(...subFiles);
            }
          }
          readBatch(); // continue reading (batched API)
        });
      };
      readBatch();
    });
  };

  const handleFiles = useCallback(async (fileList: File[]) => {
    const newParsed: ParsedFWDFile[] = [];

    for (const file of fileList) {
      if (file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
        try {
          const zip = await JSZip.loadAsync(file);
          const entries = Object.entries(zip.files);
          for (const [path, entry] of entries) {
            if (entry.dir) continue;
            const name = path.split('/').pop() || path;
            if (!isFWDFile(name)) continue;
            const content = await entry.async('text');
            const parsed = processFileContent(name, content);
            if (parsed) newParsed.push(parsed);
          }
        } catch {
          toast.error(`ZIP-tiedoston ${file.name} purkaminen epäonnistui`);
        }
      } else if (isFWDFile(file.name)) {
        const content = await file.text();
        const parsed = processFileContent(file.name, content);
        if (parsed) newParsed.push(parsed);
      }
    }

    if (newParsed.length === 0) {
      toast.error('Yhtään FWD-mittauspistettä ei löytynyt tiedostoista');
      return;
    }

    setFiles(prev => [...prev, ...newParsed]);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    const items = e.dataTransfer.items;
    const collectedFiles: File[] = [];

    if (items && items.length > 0) {
      // Use webkitGetAsEntry to handle folders
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }

      for (const entry of entries) {
        if (entry.isDirectory) {
          const dirFiles = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
          collectedFiles.push(...dirFiles);
        } else if (entry.isFile) {
          const file = await new Promise<File>((res) =>
            (entry as FileSystemFileEntry).file(res)
          );
          collectedFiles.push(file);
        }
      }
    } else if (e.dataTransfer.files.length > 0) {
      collectedFiles.push(...Array.from(e.dataTransfer.files));
    }

    if (collectedFiles.length > 0) {
      handleFiles(collectedFiles);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    if (files.length === 0) return;
    setImporting(true);

    try {
      await onImport(files.map(f => ({ branchName: f.branchName, content: f.content })));
      setFiles([]);
      onOpenChange(false);
      toast.success(`${files.length} tiehaaraa tuotu onnistuneesti`);
    } catch (err: any) {
      toast.error(err?.message || 'Tuonti epäonnistui');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!importing) {
      setFiles([]);
      onOpenChange(v);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg z-[1100]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-primary" />
            FWD-tiedostojen tuonti
          </DialogTitle>
          <DialogDescription>
            Pudota ZIP-kansio tai yksittäisiä FWD-tiedostoja. Ohjelma luo jokaiselle tiedostolle oman tiehaaran automaattisesti.
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragging
              ? 'border-primary bg-primary/10'
              : 'border-sidebar-border hover:border-primary/50 hover:bg-sidebar-accent/30'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-sidebar-foreground/70">
            {dragging ? 'Pudota tiedostot tähän' : 'Klikkaa tai pudota tiedostot tähän'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            ZIP, .fwd tai .txt -tiedostot
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.fwd,.txt,.FWD,.TXT,.ZIP"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files && e.target.files.length > 0) {
                handleFiles(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {files.map((f, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/50 border border-sidebar-border text-sm"
              >
                {f.status === 'done' && <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
                {f.status === 'error' && <XCircle className="w-4 h-4 text-destructive shrink-0" />}
                {f.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                {f.status === 'pending' && <FileUp className="w-4 h-4 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sidebar-foreground truncate">{f.branchName}</p>
                  <p className="text-xs text-muted-foreground">{f.points.length} pistettä · {f.fileName}</p>
                </div>
                {f.status === 'pending' && !importing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeFile(idx)}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Import button */}
        {files.length > 0 && (
          <Button
            onClick={handleImport}
            disabled={importing}
            className="w-full"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Tuodaan...
              </>
            ) : (
              <>
                <FileArchive className="w-4 h-4 mr-2" />
                Tuo {files.length} {files.length === 1 ? 'haara' : 'haaraa'}
              </>
            )}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
