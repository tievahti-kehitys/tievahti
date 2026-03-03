
-- Mass calculation runs (one PDF per run, can include multiple branches)
CREATE TABLE public.mass_calc_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  branch_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'completed',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mass_calc_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own mass calc runs"
ON public.mass_calc_runs FOR ALL
USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = mass_calc_runs.project_id AND projects.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = mass_calc_runs.project_id AND projects.user_id = auth.uid()));

-- Mass calc global settings per project (one row per project)
CREATE TABLE public.mass_calc_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE UNIQUE,
  spring_factor NUMERIC NOT NULL DEFAULT 1.0,
  influence_distance_m NUMERIC NOT NULL DEFAULT 25,
  cut_length_m NUMERIC NOT NULL DEFAULT 100,
  surface_thickness_m NUMERIC NOT NULL DEFAULT 0.05,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mass_calc_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own mass calc settings"
ON public.mass_calc_settings FOR ALL
USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = mass_calc_settings.project_id AND projects.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = mass_calc_settings.project_id AND projects.user_id = auth.uid()));

-- Add suodatinkangas (geotextile) catalog item
INSERT INTO public.catalog_items (name, type, category, unit, unit_price, measure_type, allowed_geometries, default_parameters, marker_style, sort_order, vat_rate, quantity_formula)
VALUES (
  'Suodatinkangas',
  'product',
  'Murskeet',
  'm²',
  2.5,
  1,
  ARRAY['line_tied', 'line_free'],
  '[{"slug": "leveys_m", "label": "Leveys (m)", "unit": "m", "default": 4, "step": 0.5, "min": 1, "max": 20}, {"slug": "pituus_m", "label": "Pituus (m)", "unit": "m", "default": 100, "step": 1, "min": 1, "max": 10000}]'::jsonb,
  '{"color": "#8B4513", "shape": "circle", "size": 24, "lineWidth": 3}'::jsonb,
  10,
  25.5,
  'pituus_m * leveys_m'
);
