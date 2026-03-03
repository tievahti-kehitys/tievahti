/**
 * Hook for mass calculation operations.
 * Manages global settings, triggers calculation, holds results,
 * and persists/loads PDF reports from Supabase Storage.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { runMassCalculation, MassCalcResult, MassCalcGlobalSettings, buildMapJson, MapRepairSegment } from '@/lib/massCalcEngine';
import { generateMassCalcPdf } from '@/lib/massCalcPdf';

export function useMassCalc(projectId: string | undefined) {
  const [settings, setSettings] = useState<MassCalcGlobalSettings>({
    influenceDistanceM: 25,
    cutLengthM: 100,
    surfaceThicknessM: 0.05,
    springFactor: 1.0,
  });
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [result, setResult] = useState<MassCalcResult | null>(null);
  const [mapSegments, setMapSegments] = useState<MapRepairSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasExistingResults, setHasExistingResults] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Check for existing mass calc items and stored PDF
  const checkExistingResults = useCallback(async () => {
    if (!projectId) return;
    const { count } = await supabase
      .from('project_items')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('source', 'mass_calc');
    const hasItems = (count ?? 0) > 0;
    setHasExistingResults(hasItems);

    if (hasItems) {
      // Check for latest stored PDF
      const { data: run } = await supabase
        .from('mass_calc_runs')
        .select('pdf_path')
        .eq('project_id', projectId)
        .not('pdf_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (run?.pdf_path) {
        const { data: urlData } = supabase.storage
          .from('mass-calc-pdfs')
          .getPublicUrl(run.pdf_path);
        setPdfUrl(urlData?.publicUrl || null);
      }
    }
  }, [projectId]);

  // Load settings
  const loadSettings = useCallback(async () => {
    if (!projectId) return;
    setSettingsLoading(true);
    const { data } = await supabase
      .from('mass_calc_settings')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (data) {
      setSettings({
        influenceDistanceM: Number(data.influence_distance_m),
        cutLengthM: Number(data.cut_length_m),
        surfaceThicknessM: Number(data.surface_thickness_m),
        springFactor: Number(data.spring_factor),
      });
    }
    setSettingsLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadSettings();
    checkExistingResults();
  }, [loadSettings, checkExistingResults]);

  // Save settings
  const saveSettings = useCallback(async (newSettings: MassCalcGlobalSettings) => {
    if (!projectId) return;
    setSettings(newSettings);
    
    const row = {
      project_id: projectId,
      influence_distance_m: newSettings.influenceDistanceM,
      cut_length_m: newSettings.cutLengthM,
      surface_thickness_m: newSettings.surfaceThicknessM,
      spring_factor: newSettings.springFactor,
    };

    const { data: existing } = await supabase
      .from('mass_calc_settings')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (existing) {
      await supabase.from('mass_calc_settings').update(row).eq('project_id', projectId);
    } else {
      await supabase.from('mass_calc_settings').insert(row);
    }
  }, [projectId]);

  // Upload PDF to storage and save path to mass_calc_runs
  const uploadAndSavePdf = useCallback(async (blob: Blob, runId: string, projectName: string) => {
    const safeName = projectName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
    const fileName = `${projectId}/${runId}_${safeName || 'report'}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from('mass-calc-pdfs')
      .upload(fileName, blob, { contentType: 'application/pdf', upsert: true });

    if (uploadErr) {
      console.error('PDF upload error:', uploadErr);
      return;
    }

    // Save path to run record
    await supabase
      .from('mass_calc_runs')
      .update({ pdf_path: fileName } as any)
      .eq('id', runId);

    const { data: urlData } = supabase.storage
      .from('mass-calc-pdfs')
      .getPublicUrl(fileName);
    setPdfUrl(urlData?.publicUrl || null);
  }, [projectId]);

  // Run calculation
  const calculate = useCallback(async (branchIds: string[], _roadCoords?: [number, number][], projectName?: string) => {
    if (!projectId || branchIds.length === 0) return null;
    setLoading(true);
    setError(null);
    try {
      const calcResult = await runMassCalculation(projectId, branchIds);
      setResult(calcResult);
      setHasExistingResults(true);
      
      const segments = buildMapJson(calcResult);
      setMapSegments(segments);

      // Generate and upload PDF
      if (projectName) {
        try {
          const blob = await generateMassCalcPdf(calcResult, projectName);
          await uploadAndSavePdf(blob, calcResult.runId, projectName);
        } catch (pdfErr) {
          console.error('PDF auto-save error:', pdfErr);
        }
      }

      return calcResult;
    } catch (err: any) {
      console.error('Mass calc error:', err);
      setError(err?.message || 'Massalaskenta epäonnistui');
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectId, uploadAndSavePdf]);

  // Download PDF - fetch blob from storage to avoid adblocker issues
  const downloadPdf = useCallback(async (projectName: string) => {
    if (pdfUrl) {
      try {
        const response = await fetch(pdfUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Massalaskenta_${projectName.replace(/\s+/g, '_')}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      } catch (err) {
        console.error('PDF download from storage failed:', err);
      }
    }
    // Fallback: generate from in-memory result
    if (!result) return;
    try {
      const blob = await generateMassCalcPdf(result, projectName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Massalaskenta_${projectName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation error:', err);
    }
  }, [result, pdfUrl]);

  return {
    settings,
    settingsLoading,
    saveSettings,
    loading,
    result,
    mapSegments,
    error,
    calculate,
    downloadPdf,
    hasExistingResults,
    pdfUrl,
  };
}
