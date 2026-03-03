-- Assign all existing projects to the first registered user
UPDATE public.projects 
SET user_id = '5feb7c4f-a972-49c7-8e44-f13972ab3a18' 
WHERE user_id IS NULL;
