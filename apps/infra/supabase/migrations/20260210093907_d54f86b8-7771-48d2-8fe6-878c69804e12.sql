
-- Add provenance columns to project_items for mass calc generated items
ALTER TABLE public.project_items 
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS mass_calc_run_id uuid REFERENCES public.mass_calc_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mass_calc_branch_id uuid REFERENCES public.road_branches(id) ON DELETE SET NULL;

-- Index for fast deletion on re-run
CREATE INDEX IF NOT EXISTS idx_project_items_mass_calc 
  ON public.project_items (mass_calc_branch_id, source) 
  WHERE source = 'mass_calc';

-- Add notes column to project_items if missing (already exists per schema check - skip if exists)
-- notes already exists

-- Update mass_calc_runs to add branch_ids if not present (already exists per schema)
