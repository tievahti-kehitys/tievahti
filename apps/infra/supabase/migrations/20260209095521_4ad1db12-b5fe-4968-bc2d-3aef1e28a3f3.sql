-- Add geometry column to road_branches for storing road geometry as GeoJSON
ALTER TABLE public.road_branches
ADD COLUMN geometry JSONB DEFAULT NULL;

-- Add a comment to clarify the format
COMMENT ON COLUMN public.road_branches.geometry IS 'GeoJSON LineString geometry for the road branch';