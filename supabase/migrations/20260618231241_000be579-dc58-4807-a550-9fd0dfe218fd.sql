-- Step 1: extend enums (must commit before being usable)
ALTER TYPE public.area ADD VALUE IF NOT EXISTS 'internal';
ALTER TYPE public.workspace_permission ADD VALUE IF NOT EXISTS 'internal_view';
ALTER TYPE public.workspace_permission ADD VALUE IF NOT EXISTS 'internal_manage';