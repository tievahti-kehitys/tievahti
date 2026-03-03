-- Add string_parameters column to project_items to store string/select parameter values
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS string_parameters JSONB NOT NULL DEFAULT '{}'::jsonb;
