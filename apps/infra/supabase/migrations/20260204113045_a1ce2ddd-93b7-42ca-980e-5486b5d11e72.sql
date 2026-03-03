-- Add name_formula and price_formula columns to catalog_items
ALTER TABLE public.catalog_items 
ADD COLUMN name_formula text,
ADD COLUMN price_formula text;

-- Change hours_per_unit from numeric to text to support formulas
-- First add a new text column
ALTER TABLE public.catalog_item_work 
ADD COLUMN hours_formula text;

-- Copy existing values as strings
UPDATE public.catalog_item_work 
SET hours_formula = hours_per_unit::text 
WHERE hours_per_unit IS NOT NULL AND hours_per_unit != 0;

-- Set default for new column
ALTER TABLE public.catalog_item_work 
ALTER COLUMN hours_formula SET DEFAULT '0';

-- Add comments for documentation
COMMENT ON COLUMN public.catalog_items.name_formula IS 'Dynamic name formula, e.g., ''Rumpu Ø'' + leveys + ''mm''';
COMMENT ON COLUMN public.catalog_items.price_formula IS 'Dynamic price formula using parameters';
COMMENT ON COLUMN public.catalog_item_work.hours_formula IS 'Work hours formula, can reference parameters like (0.2 / length) + (width / 8000)';