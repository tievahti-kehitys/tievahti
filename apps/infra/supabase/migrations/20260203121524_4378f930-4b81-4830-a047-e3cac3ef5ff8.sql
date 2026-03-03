-- Create table for projects
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  vat_percentage DECIMAL DEFAULT 25.5,
  products JSONB DEFAULT '[]'::jsonb,
  map_center JSONB,
  zoom_level INTEGER DEFAULT 15,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for custom costs (lisäkulut)
CREATE TABLE public.custom_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for product library (user's custom products)
CREATE TABLE public.product_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT DEFAULT 'kpl',
  unit_price DECIMAL DEFAULT 0,
  color TEXT,
  marker_type TEXT DEFAULT 'circle',
  custom_marker_image TEXT,
  parameters JSONB DEFAULT '[]'::jsonb,
  work_requirements JSONB DEFAULT '[]'::jsonb,
  cost_formula TEXT,
  sub_products JSONB DEFAULT '[]'::jsonb,
  default_images JSONB DEFAULT '[]'::jsonb,
  is_custom BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS but allow public access for now (no auth yet)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_library ENABLE ROW LEVEL SECURITY;

-- Create public access policies (can be restricted later with auth)
CREATE POLICY "Public access to projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to custom_costs" ON public.custom_costs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to product_library" ON public.product_library FOR ALL USING (true) WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_library_updated_at
  BEFORE UPDATE ON public.product_library
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();