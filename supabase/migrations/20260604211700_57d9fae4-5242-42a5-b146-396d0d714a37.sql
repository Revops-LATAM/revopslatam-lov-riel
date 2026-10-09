
-- Add super_admin role and migrate existing admin members
ALTER TYPE public.workspace_role ADD VALUE IF NOT EXISTS 'super_admin';
