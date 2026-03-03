-- TEST: this should end up in infra schema

CREATE TABLE public.test_db (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

ALTER TABLE public.test_db
ADD COLUMN default_instruction_text TEXT DEFAULT NULL;