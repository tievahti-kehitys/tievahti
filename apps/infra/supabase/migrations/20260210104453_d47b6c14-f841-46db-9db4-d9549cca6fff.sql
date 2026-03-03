
-- Add column to store the PDF file path
ALTER TABLE public.mass_calc_runs
ADD COLUMN pdf_path TEXT;

-- Create storage bucket for mass calc PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('mass-calc-pdfs', 'mass-calc-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload/read PDFs
CREATE POLICY "Authenticated users can upload mass calc PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'mass-calc-pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read mass calc PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'mass-calc-pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update mass calc PDFs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'mass-calc-pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete mass calc PDFs"
ON storage.objects FOR DELETE
USING (bucket_id = 'mass-calc-pdfs' AND auth.role() = 'authenticated');
