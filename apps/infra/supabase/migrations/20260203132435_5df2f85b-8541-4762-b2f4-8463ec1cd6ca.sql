-- ============================================
-- NORMALIZED PRODUCT LIBRARY SCHEMA
-- ============================================

-- 1. CATEGORIES TABLE
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to categories"
  ON public.categories FOR SELECT USING (true);

CREATE POLICY "Public write access to categories"
  ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- 2. WORK TYPES TABLE (global labor types with hourly rates)
CREATE TABLE public.work_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 25.5,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.work_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to work_types"
  ON public.work_types FOR SELECT USING (true);

CREATE POLICY "Public write access to work_types"
  ON public.work_types FOR ALL USING (true) WITH CHECK (true);

-- 3. PRODUCTS TABLE (normalized, no JSON arrays for relations)
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_code TEXT NOT NULL UNIQUE, -- e.g. 'rumpu-muovi-300-6000'
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kpl', -- m, kpl, m², tn, m³
  
  -- Pricing
  material_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 25.5,
  includes_work BOOLEAN NOT NULL DEFAULT true,
  
  -- Geometry & visualization
  measure_type INTEGER NOT NULL DEFAULT 2, -- 1=road segment, 2=point/local
  allowed_geometries TEXT[] NOT NULL DEFAULT ARRAY['point'],
  marker_image TEXT, -- URL or data URI
  marker_size INTEGER DEFAULT 24,
  color TEXT DEFAULT '#505050',
  line_style JSONB, -- {strokeWidth, strokeOffset, dashArray, opacity}
  
  -- Formulas (still JSON as they're evaluated dynamically)
  quantity_formula TEXT, -- e.g. 'pituus * leveys_m * paksuus_m'
  price_formula TEXT, -- e.g. 'määrä * yksikköhinta'
  unit_conversion JSONB, -- {coefficient, targetUnit}
  
  -- Metadata
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to products"
  ON public.products FOR SELECT USING (true);

CREATE POLICY "Public write access to products"
  ON public.products FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_code ON public.products(product_code);

-- 4. PRODUCT PARAMETERS TABLE (One-to-Many)
CREATE TABLE public.product_parameters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  param_key TEXT NOT NULL, -- e.g. 'width_m', 'halkaisija_mm'
  label TEXT NOT NULL, -- e.g. 'Leveys', 'Halkaisija'
  unit_suffix TEXT, -- e.g. 'm', 'mm'
  default_value DECIMAL(12,4) NOT NULL DEFAULT 0,
  min_value DECIMAL(12,4),
  max_value DECIMAL(12,4),
  step DECIMAL(12,4),
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  UNIQUE(product_id, param_key)
);

ALTER TABLE public.product_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to product_parameters"
  ON public.product_parameters FOR SELECT USING (true);

CREATE POLICY "Public write access to product_parameters"
  ON public.product_parameters FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_product_parameters_product ON public.product_parameters(product_id);

-- 5. PRODUCT WORK REQUIREMENTS TABLE (Many-to-Many linking products to work_types)
CREATE TABLE public.product_work_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  work_type_id UUID NOT NULL REFERENCES public.work_types(id) ON DELETE CASCADE,
  hours_per_unit DECIMAL(10,4) NOT NULL DEFAULT 0,
  description TEXT,
  
  UNIQUE(product_id, work_type_id)
);

ALTER TABLE public.product_work_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to product_work_requirements"
  ON public.product_work_requirements FOR SELECT USING (true);

CREATE POLICY "Public write access to product_work_requirements"
  ON public.product_work_requirements FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_work_requirements_product ON public.product_work_requirements(product_id);
CREATE INDEX idx_work_requirements_work_type ON public.product_work_requirements(work_type_id);

-- 6. PRODUCT COMPONENTS TABLE (For sub-products/recipes - self-referencing)
CREATE TABLE public.product_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  child_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  factor DECIMAL(10,4) NOT NULL DEFAULT 1, -- multiplier
  label TEXT, -- Custom label for this usage
  parameter_overrides JSONB DEFAULT '{}', -- Override child parameters
  
  UNIQUE(parent_product_id, child_product_id),
  CHECK (parent_product_id != child_product_id) -- Prevent self-reference
);

ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to product_components"
  ON public.product_components FOR SELECT USING (true);

CREATE POLICY "Public write access to product_components"
  ON public.product_components FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_product_components_parent ON public.product_components(parent_product_id);
CREATE INDEX idx_product_components_child ON public.product_components(child_product_id);

-- 7. PRODUCT DEFAULT IMAGES TABLE (instruction diagrams, etc.)
CREATE TABLE public.product_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  description TEXT,
  image_type TEXT NOT NULL DEFAULT 'instruction', -- 'instruction', 'example', 'diagram'
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to product_images"
  ON public.product_images FOR SELECT USING (true);

CREATE POLICY "Public write access to product_images"
  ON public.product_images FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_product_images_product ON public.product_images(product_id);

-- Add updated_at triggers
CREATE TRIGGER update_work_types_updated_at
  BEFORE UPDATE ON public.work_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();