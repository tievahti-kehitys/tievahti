-- Add default_images column to catalog_items for storing product default/instruction images
ALTER TABLE public.catalog_items 
ADD COLUMN IF NOT EXISTS default_images jsonb DEFAULT '[]'::jsonb;

-- Create storage bucket for product images (field photos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for product-images bucket
CREATE POLICY "Public read access for product-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Public upload access for product-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Public update access for product-images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images');

CREATE POLICY "Public delete access for product-images"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images');

-- Comment for documentation
COMMENT ON COLUMN public.catalog_items.default_images IS 'Array of default/instruction images for this catalog item. Format: [{url: string, description?: string}]';