
-- Fix catalog_items: add permissive SELECT policy so all authenticated users can read
CREATE POLICY "Authenticated users can read catalog items permissive"
  ON public.catalog_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix catalog_composition: add permissive SELECT policy
CREATE POLICY "Authenticated users can read catalog composition permissive"
  ON public.catalog_composition
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix catalog_item_work: add permissive SELECT policy
CREATE POLICY "Authenticated users can read catalog item work permissive"
  ON public.catalog_item_work
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix work_types: add permissive SELECT policy
CREATE POLICY "Authenticated users can read work types permissive"
  ON public.work_types
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix allowed_email_domains: add permissive SELECT policy
CREATE POLICY "Authenticated users can read domains permissive"
  ON public.allowed_email_domains
  FOR SELECT
  TO authenticated
  USING (true);
