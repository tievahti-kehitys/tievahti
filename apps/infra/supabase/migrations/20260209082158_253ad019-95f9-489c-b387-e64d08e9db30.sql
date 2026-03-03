
-- Table: road_branches
CREATE TABLE public.road_branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_bearing_capacity NUMERIC NOT NULL DEFAULT 80,
  road_width NUMERIC NOT NULL DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table: measurement_points
CREATE TABLE public.measurement_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.road_branches(id) ON DELETE CASCADE,
  station NUMERIC NOT NULL,
  measured_value NUMERIC NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.road_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_points ENABLE ROW LEVEL SECURITY;

-- RLS for road_branches: users can manage branches of their own projects
CREATE POLICY "Users can manage own project branches"
ON public.road_branches
FOR ALL
USING (EXISTS (
  SELECT 1 FROM projects WHERE projects.id = road_branches.project_id AND projects.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM projects WHERE projects.id = road_branches.project_id AND projects.user_id = auth.uid()
));

-- RLS for measurement_points: users can manage points in their own project branches
CREATE POLICY "Users can manage own measurement points"
ON public.measurement_points
FOR ALL
USING (EXISTS (
  SELECT 1 FROM road_branches
  JOIN projects ON projects.id = road_branches.project_id
  WHERE road_branches.id = measurement_points.branch_id AND projects.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM road_branches
  JOIN projects ON projects.id = road_branches.project_id
  WHERE road_branches.id = measurement_points.branch_id AND projects.user_id = auth.uid()
));

-- Indexes for performance
CREATE INDEX idx_road_branches_project_id ON public.road_branches(project_id);
CREATE INDEX idx_measurement_points_branch_id ON public.measurement_points(branch_id);
