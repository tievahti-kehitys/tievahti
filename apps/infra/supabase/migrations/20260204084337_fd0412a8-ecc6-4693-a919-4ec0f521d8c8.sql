-- ============================================
-- HANKEKARTTA ARCHITECTURE REFACTOR
-- New unified schema for Products & Operations
-- ============================================

-- 1. Update work_types table (already exists, add any missing columns)
-- No changes needed - already has id, name, hourly_rate, vat_rate, description

-- 2. Create catalog_items table (unified Products + Operations)
CREATE TABLE public.catalog_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('product', 'operation')),
  unit TEXT NOT NULL DEFAULT 'kpl',
  unit_price NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 25.5,
  default_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  quantity_formula TEXT,
  marker_style JSONB DEFAULT '{"color": "#505050", "shape": "circle", "size": 24}'::jsonb,
  measure_type INTEGER NOT NULL DEFAULT 2, -- 1=road segment, 2=local/point
  allowed_geometries TEXT[] NOT NULL DEFAULT ARRAY['point']::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Create catalog_composition table (Parent-Child relationships for Operations)
CREATE TABLE public.catalog_composition (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  child_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  quantity_factor_formula TEXT NOT NULL DEFAULT '1',
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(parent_item_id, child_item_id)
);

-- 4. Create catalog_item_work table (Labor requirements per item)
CREATE TABLE public.catalog_item_work (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  work_type_id UUID NOT NULL REFERENCES public.work_types(id) ON DELETE CASCADE,
  hours_per_unit NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  UNIQUE(catalog_item_id, work_type_id)
);

-- 5. Create project_items table (Map items for each project)
CREATE TABLE public.project_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  geometry JSONB NOT NULL,
  user_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  visible BOOLEAN NOT NULL DEFAULT true,
  locked BOOLEAN NOT NULL DEFAULT false,
  style_overrides JSONB,
  chainage_start NUMERIC,
  chainage_end NUMERIC,
  offset_m NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Enable RLS on all new tables
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_composition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for catalog_items
CREATE POLICY "Public read access to catalog_items" 
ON public.catalog_items 
FOR SELECT 
USING (true);

CREATE POLICY "Public write access to catalog_items" 
ON public.catalog_items 
FOR ALL 
USING (true)
WITH CHECK (true);

-- 8. Create RLS policies for catalog_composition
CREATE POLICY "Public read access to catalog_composition" 
ON public.catalog_composition 
FOR SELECT 
USING (true);

CREATE POLICY "Public write access to catalog_composition" 
ON public.catalog_composition 
FOR ALL 
USING (true)
WITH CHECK (true);

-- 9. Create RLS policies for catalog_item_work
CREATE POLICY "Public read access to catalog_item_work" 
ON public.catalog_item_work 
FOR SELECT 
USING (true);

CREATE POLICY "Public write access to catalog_item_work" 
ON public.catalog_item_work 
FOR ALL 
USING (true)
WITH CHECK (true);

-- 10. Create RLS policies for project_items
CREATE POLICY "Public read access to project_items" 
ON public.project_items 
FOR SELECT 
USING (true);

CREATE POLICY "Public write access to project_items" 
ON public.project_items 
FOR ALL 
USING (true)
WITH CHECK (true);

-- 11. Create updated_at triggers
CREATE TRIGGER update_catalog_items_updated_at
BEFORE UPDATE ON public.catalog_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_items_updated_at
BEFORE UPDATE ON public.project_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Create indexes for performance
CREATE INDEX idx_catalog_items_type ON public.catalog_items(type);
CREATE INDEX idx_catalog_items_category ON public.catalog_items(category);
CREATE INDEX idx_catalog_composition_parent ON public.catalog_composition(parent_item_id);
CREATE INDEX idx_catalog_composition_child ON public.catalog_composition(child_item_id);
CREATE INDEX idx_catalog_item_work_item ON public.catalog_item_work(catalog_item_id);
CREATE INDEX idx_project_items_project ON public.project_items(project_id);
CREATE INDEX idx_project_items_catalog ON public.project_items(catalog_item_id);