DROP POLICY IF EXISTS "members can read task assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "members can write task assignees" ON public.task_assignees;

CREATE POLICY "members can read task assignees"
ON public.task_assignees
FOR SELECT
TO authenticated
USING (public.can_access_task(task_id, auth.uid()));

CREATE POLICY "members can write task assignees"
ON public.task_assignees
FOR ALL
TO authenticated
USING (public.can_access_task(task_id, auth.uid()))
WITH CHECK (public.can_access_task(task_id, auth.uid()));