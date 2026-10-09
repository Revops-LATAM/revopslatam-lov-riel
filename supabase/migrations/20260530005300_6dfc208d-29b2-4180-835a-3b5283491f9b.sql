DROP POLICY IF EXISTS workspaces_select_owner ON public.workspaces;
CREATE POLICY workspaces_select_owner
ON public.workspaces
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());