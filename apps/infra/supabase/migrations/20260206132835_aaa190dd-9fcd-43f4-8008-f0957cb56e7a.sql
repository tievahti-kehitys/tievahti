
-- Fix overly permissive RLS policies for catalog_items
DROP POLICY IF EXISTS "Authenticated users can manage catalog items" ON public.catalog_items;
CREATE POLICY "Authenticated users can manage catalog items"
ON public.catalog_items
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Fix overly permissive RLS policies for catalog_composition
DROP POLICY IF EXISTS "Authenticated users can manage catalog composition" ON public.catalog_composition;
CREATE POLICY "Authenticated users can manage catalog composition"
ON public.catalog_composition
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Fix overly permissive RLS policies for catalog_item_work
DROP POLICY IF EXISTS "Authenticated users can manage catalog item work" ON public.catalog_item_work;
CREATE POLICY "Authenticated users can manage catalog item work"
ON public.catalog_item_work
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Fix overly permissive RLS policies for work_types
DROP POLICY IF EXISTS "Authenticated users can manage work types" ON public.work_types;
CREATE POLICY "Authenticated users can manage work types"
ON public.work_types
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
