import React, { createContext, useContext, useMemo } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useBearingCapacity, RoadBranch, MeasurementPoint } from '@/hooks/useBearingCapacity';
import { FWDMeasurementPoint } from '@/lib/fwdParser';

interface BearingCapacityContextValue {
  branches: RoadBranch[];
  points: MeasurementPoint[];
  loading: boolean;
  addBranch: (name: string, target: number, width: number) => Promise<void>;
  updateBranch: (branchId: string, name: string, target: number, width: number) => Promise<void>;
  deleteBranch: (branchId: string) => Promise<void>;
  uploadFWDFile: (branchId: string, fileContent: string) => Promise<FWDMeasurementPoint[]>;
  deletePointsForBranch: (branchId: string) => Promise<void>;
  updateBranchGeometry: (branchId: string, geometry: any) => Promise<void>;
  refresh: () => Promise<void>;
  /** All branch geometries merged into a flat segments array for snapping & rendering */
  mergedRoadSegments: [number, number][][];
}

const BearingCapacityContext = createContext<BearingCapacityContextValue | null>(null);

export function BearingCapacityProvider({ children }: { children: React.ReactNode }) {
  const { project } = useProject();
  const value = useBearingCapacity(project?.id);

  // Merge all branch geometries into segments for cross-branch snapping
  const mergedRoadSegments = useMemo<[number, number][][]>(() => {
    const segments: [number, number][][] = [];
    for (const branch of value.branches) {
      const geo = branch.geometry as any;
      if (!geo) continue;
      const coords: [number, number][] = geo.coordinates?.length >= 2
        ? geo.coordinates
        : (geo.segments?.length > 0 && geo.segments[0]?.length >= 2 ? geo.segments[0] : []);
      if (coords.length >= 2) {
        segments.push(coords);
      }
    }
    return segments;
  }, [value.branches]);

  return (
    <BearingCapacityContext.Provider value={{ ...value, mergedRoadSegments }}>
      {children}
    </BearingCapacityContext.Provider>
  );
}

export function useBearingCapacityContext() {
  const ctx = useContext(BearingCapacityContext);
  if (!ctx) throw new Error('useBearingCapacityContext must be used within BearingCapacityProvider');
  return ctx;
}
