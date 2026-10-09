create or replace function app_private.attachment_task_id(_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select nullif(
    (case
       when (storage.foldername(_name))[1] = 'tickets' then (storage.foldername(_name))[2]
       else (storage.foldername(_name))[1]
     end),
    ''
  )::uuid
$$;

drop policy if exists attachments_storage_select on storage.objects;
drop policy if exists attachments_storage_update on storage.objects;
drop policy if exists attachments_storage_delete on storage.objects;

create policy attachments_storage_select on storage.objects for select to authenticated
using (bucket_id = 'task-attachments' and app_private.can_access_task(app_private.attachment_task_id(name), auth.uid()));

create policy attachments_storage_update on storage.objects for update to authenticated
using (bucket_id = 'task-attachments' and app_private.can_access_task(app_private.attachment_task_id(name), auth.uid()));

create policy attachments_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'task-attachments' and app_private.can_access_task(app_private.attachment_task_id(name), auth.uid()));