import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseFWDFile, FWDMeasurementPoint } from '@/lib/fwdParser';

export interface RoadBranch {
  id: string;
  projectId: string;
  name: string;
  targetBearingCapacity: number;
  roadWidth: number;
  createdAt: string;
  geometry?: any;
}

export interface MeasurementPoint {
  id: string;
  branchId: string;
  station: number;
  measuredValue: number;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export function useBearingCapacity(projectId: string | undefined) {
  const [branches, setBranches] = useState<RoadBranch[]>([]);
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBranches = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from('road_branches')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setBranches(data.map(r => ({
        id: r.id,
        projectId: r.project_id,
        name: r.name,
        targetBearingCapacity: Number(r.target_bearing_capacity),
        roadWidth: Number(r.road_width),
        createdAt: r.created_at,
        geometry: r.geometry,
      })));
    }
  }, [projectId]);

  const fetchPoints = useCallback(async () => {
    if (!projectId) return;
    // Fetch all points for all branches in this project
    const { data: branchData } = await supabase
      .from('road_branches')
      .select('id')
      .eq('project_id', projectId);

    if (!branchData || branchData.length === 0) {
      setPoints([]);
      return;
    }

    const branchIds = branchData.map(b => b.id);
    const { data, error } = await supabase
      .from('measurement_points')
      .select('*')
      .in('branch_id', branchIds)
      .order('station', { ascending: true });

    if (!error && data) {
      setPoints(data.map(p => ({
        id: p.id,
        branchId: p.branch_id,
        station: Number(p.station),
        measuredValue: Number(p.measured_value),
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        createdAt: p.created_at,
      })));
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchBranches(), fetchPoints()]);
    setLoading(false);
  }, [fetchBranches, fetchPoints]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addBranch = useCallback(async (name: string, targetBearingCapacity: number, roadWidth: number) => {
    if (!projectId) return;
    const { error } = await supabase.from('road_branches').insert({
      project_id: projectId,
      name,
      target_bearing_capacity: targetBearingCapacity,
      road_width: roadWidth,
    });
    if (error) {
      console.error('Add branch failed:', error);
      throw error;
    }
    await refresh();
  }, [projectId, refresh]);

  const updateBranch = useCallback(async (branchId: string, name: string, targetBearingCapacity: number, roadWidth: number) => {
    const { error } = await supabase.from('road_branches').update({
      name,
      target_bearing_capacity: targetBearingCapacity,
      road_width: roadWidth,
    }).eq('id', branchId);
    if (error) {
      console.error('Update branch failed:', error);
      throw error;
    }
    await refresh();
  }, [refresh]);

  const deleteBranch = useCallback(async (branchId: string) => {
    // Points are cascade-deleted
    const { error } = await supabase.from('road_branches').delete().eq('id', branchId);
    if (error) {
      console.error('Delete branch failed:', error);
      throw error;
    }
    await refresh();
  }, [refresh]);

  const uploadFWDFile = useCallback(async (branchId: string, fileContent: string) => {
    const parsed = parseFWDFile(fileContent);
    if (parsed.length === 0) {
      throw new Error('Tiedostosta ei löytynyt mittauspisteitä');
    }

    const rows = parsed.map(p => ({
      branch_id: branchId,
      station: p.station,
      measured_value: p.measuredValue,
      latitude: p.latitude,
      longitude: p.longitude,
    }));

    const { error } = await supabase.from('measurement_points').insert(rows);
    if (error) {
      console.error('Upload points failed:', error);
      throw error;
    }
    await refresh();
    return parsed; // Return full parsed points for road geometry fetch
  }, [refresh]);

  const deletePointsForBranch = useCallback(async (branchId: string) => {
    const { error } = await supabase.from('measurement_points').delete().eq('branch_id', branchId);
    if (error) {
      console.error('Delete points failed:', error);
      throw error;
    }
    await refresh();
  }, [refresh]);

  const updateBranchGeometry = useCallback(async (branchId: string, geometry: any) => {
    const { error } = await supabase
      .from('road_branches')
      .update({ geometry })
      .eq('id', branchId);
    if (error) {
      console.error('Update branch geometry failed:', error);
      throw error;
    }
    await refresh();
  }, [refresh]);

  return {
    branches,
    points,
    loading,
    addBranch,
    updateBranch,
    deleteBranch,
    uploadFWDFile,
    deletePointsForBranch,
    updateBranchGeometry,
    refresh,
  };
}
