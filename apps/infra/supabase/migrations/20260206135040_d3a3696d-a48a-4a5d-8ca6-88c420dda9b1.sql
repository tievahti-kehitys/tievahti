
-- Table for allowed email domains
CREATE TABLE public.allowed_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.allowed_email_domains ENABLE ROW LEVEL SECURITY;

-- Anyone can read domains (needed for signup validation)
CREATE POLICY "Anyone can read allowed domains"
ON public.allowed_email_domains
FOR SELECT
USING (true);

-- Only authenticated users can manage domains
CREATE POLICY "Authenticated users can manage domains"
ON public.allowed_email_domains
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Insert tievahti.fi as initial allowed domain
INSERT INTO public.allowed_email_domains (domain) VALUES ('tievahti.fi');
