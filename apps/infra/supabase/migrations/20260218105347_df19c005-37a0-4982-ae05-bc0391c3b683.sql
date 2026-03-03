
-- Allow anon role to read catalog items (they are shared/public product definitions)
CREATE POLICY "Anyone can read active catalog items"
  ON public.catalog_items
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can read catalog composition"
  ON public.catalog_composition
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can read catalog item work"
  ON public.catalog_item_work
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can read work types"
  ON public.work_types
  FOR SELECT
  TO anon
  USING (true);
