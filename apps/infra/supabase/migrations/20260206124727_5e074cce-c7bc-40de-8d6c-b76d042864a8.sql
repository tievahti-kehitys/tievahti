
-- 1. Add user_id column to projects table
ALTER TABLE public.projects ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Drop ALL existing overly permissive RLS policies

-- projects
DROP POLICY IF EXISTS "Public access" ON public.projects;
DROP POLICY IF EXISTS "Public access to projects" ON public.projects;

-- custom_costs
DROP POLICY IF EXISTS "Public access" ON public.custom_costs;
DROP POLICY IF EXISTS "Public access to custom_costs" ON public.custom_costs;

-- catalog_items
DROP POLICY IF EXISTS "Public read access" ON public.catalog_items;
DROP POLICY IF EXISTS "Public read access to catalog_items" ON public.catalog_items;
DROP POLICY IF EXISTS "Public write access" ON public.catalog_items;
DROP POLICY IF EXISTS "Public write access to catalog_items" ON public.catalog_items;

-- catalog_composition
DROP POLICY IF EXISTS "Public read access" ON public.catalog_composition;
DROP POLICY IF EXISTS "Public read access to catalog_composition" ON public.catalog_composition;
DROP POLICY IF EXISTS "Public write access" ON public.catalog_composition;
DROP POLICY IF EXISTS "Public write access to catalog_composition" ON public.catalog_composition;

-- catalog_item_work
DROP POLICY IF EXISTS "Public read access" ON public.catalog_item_work;
DROP POLICY IF EXISTS "Public read access to catalog_item_work" ON public.catalog_item_work;
DROP POLICY IF EXISTS "Public write access" ON public.catalog_item_work;
DROP POLICY IF EXISTS "Public write access to catalog_item_work" ON public.catalog_item_work;

-- work_types
DROP POLICY IF EXISTS "Public read access" ON public.work_types;
DROP POLICY IF EXISTS "Public read access to work_types" ON public.work_types;
DROP POLICY IF EXISTS "Public write access" ON public.work_types;
DROP POLICY IF EXISTS "Public write access to work_types" ON public.work_types;

-- project_items
DROP POLICY IF EXISTS "Public read access" ON public.project_items;
DROP POLICY IF EXISTS "Public read access to project_items" ON public.project_items;
DROP POLICY IF EXISTS "Public write access" ON public.project_items;
DROP POLICY IF EXISTS "Public write access to project_items" ON public.project_items;

-- project_text_sections
DROP POLICY IF EXISTS "Public access" ON public.project_text_sections;
DROP POLICY IF EXISTS "Public access to project_text_sections" ON public.project_text_sections;

-- 3. Create new secure RLS policies

-- PROJECTS: user can only access own projects
CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- CUSTOM_COSTS: access through project ownership
CREATE POLICY "Users can manage own project costs"
  ON public.custom_costs FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects WHERE id = custom_costs.project_id AND user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects WHERE id = custom_costs.project_id AND user_id = auth.uid()
  ));

-- PROJECT_ITEMS: access through project ownership
CREATE POLICY "Users can manage own project items"
  ON public.project_items FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects WHERE id = project_items.project_id AND user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects WHERE id = project_items.project_id AND user_id = auth.uid()
  ));

-- PROJECT_TEXT_SECTIONS: access through project ownership
CREATE POLICY "Users can manage own project text sections"
  ON public.project_text_sections FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects WHERE id = project_text_sections.project_id AND user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects WHERE id = project_text_sections.project_id AND user_id = auth.uid()
  ));

-- CATALOG_ITEMS: read for all authenticated, write for all authenticated (shared catalog)
CREATE POLICY "Authenticated users can read catalog items"
  ON public.catalog_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage catalog items"
  ON public.catalog_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- CATALOG_COMPOSITION: read for all authenticated, write for all authenticated
CREATE POLICY "Authenticated users can read catalog composition"
  ON public.catalog_composition FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage catalog composition"
  ON public.catalog_composition FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- CATALOG_ITEM_WORK: read for all authenticated, write for all authenticated
CREATE POLICY "Authenticated users can read catalog item work"
  ON public.catalog_item_work FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage catalog item work"
  ON public.catalog_item_work FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- WORK_TYPES: read for all authenticated, write for all authenticated
CREATE POLICY "Authenticated users can read work types"
  ON public.work_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage work types"
  ON public.work_types FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Secure storage buckets - restrict write ops to authenticated users

-- Drop existing permissive storage policies for marker-images
DROP POLICY IF EXISTS "Public read access for marker-images" ON storage.objects;
DROP POLICY IF EXISTS "Public upload access for marker-images" ON storage.objects;
DROP POLICY IF EXISTS "Public delete access for marker-images" ON storage.objects;
DROP POLICY IF EXISTS "Public update access for marker-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view marker images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload marker images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete marker images" ON storage.objects;

-- Drop existing permissive storage policies for product-images
DROP POLICY IF EXISTS "Public read access for product-images" ON storage.objects;
DROP POLICY IF EXISTS "Public upload access for product-images" ON storage.objects;
DROP POLICY IF EXISTS "Public delete access for product-images" ON storage.objects;
DROP POLICY IF EXISTS "Public update access for product-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update product images" ON storage.objects;

-- marker-images: public read, authenticated write
CREATE POLICY "Public can view marker images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'marker-images');

CREATE POLICY "Authenticated users can upload marker images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'marker-images');

CREATE POLICY "Authenticated users can delete marker images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'marker-images');

-- product-images: public read, authenticated write
CREATE POLICY "Public can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images');
