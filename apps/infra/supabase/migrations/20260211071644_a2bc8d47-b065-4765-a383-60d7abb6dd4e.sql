
-- Create project_categories table
CREATE TABLE public.project_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_categories ENABLE ROW LEVEL SECURITY;

-- RLS: Users can manage categories of their own projects
CREATE POLICY "Users can manage own project categories"
  ON public.project_categories
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = project_categories.project_id AND projects.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = project_categories.project_id AND projects.user_id = auth.uid()
  ));

-- Add category_id to project_items
ALTER TABLE public.project_items
  ADD COLUMN category_id UUID REFERENCES public.project_categories(id) ON DELETE SET NULL;
