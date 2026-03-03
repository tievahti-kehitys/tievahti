-- Remove public read policy on allowed_email_domains
DROP POLICY IF EXISTS "Anyone can read allowed domains" ON public.allowed_email_domains;

-- Replace with authenticated-only read policy
CREATE POLICY "Authenticated users can read domains"
ON public.allowed_email_domains
FOR SELECT
TO authenticated
USING (true);
