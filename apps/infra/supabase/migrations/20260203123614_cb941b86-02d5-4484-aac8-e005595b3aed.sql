-- Extend tables so the app can persist full project state + full product definitions in the database.

-- 1) Projects: store road geometry + staking origin + currency
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS road_geometry jsonb,
  ADD COLUMN IF NOT EXISTS staking_origin jsonb,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';

-- 2) Product library: store full ProductDefinition payload
ALTER TABLE public.product_library
  ADD COLUMN IF NOT EXISTS definition jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Ensure product_id is unique so we can update products deterministically
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_library_product_id_key'
      AND conrelid = 'public.product_library'::regclass
  ) THEN
    ALTER TABLE public.product_library
      ADD CONSTRAINT product_library_product_id_key UNIQUE (product_id);
  END IF;
END$$;

-- 4) Keep updated_at correct automatically
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_library_updated_at ON public.product_library;
CREATE TRIGGER update_product_library_updated_at
BEFORE UPDATE ON public.product_library
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
