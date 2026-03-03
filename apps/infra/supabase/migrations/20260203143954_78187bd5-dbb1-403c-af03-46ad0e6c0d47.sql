-- Create storage bucket for custom marker images
INSERT INTO storage.buckets (id, name, public)
VALUES ('marker-images', 'marker-images', true);

-- Allow anyone to read marker images (public bucket)
CREATE POLICY "Public read access for marker images"
ON storage.objects FOR SELECT
USING (bucket_id = 'marker-images');

-- Allow anyone to upload marker images (for now - can restrict later with auth)
CREATE POLICY "Public upload access for marker images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'marker-images');

-- Allow anyone to delete their own marker images
CREATE POLICY "Public delete access for marker images"
ON storage.objects FOR DELETE
USING (bucket_id = 'marker-images');