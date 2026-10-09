create or replace function public.get_contract_sprint_summary(_contract_id uuid)
returns table (
  sprint_id uuid,
  sprint_number int,
  start_date date,
  end_date date,
  status text,
  contracted_hours numeric,
  project_id uuid,
  project_name text,
  estimated_hours numeric,
  real_hours numeric,
  tasks_total int,
  tasks_done int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    s.sprint_number,
    s.start_date,
    s.end_date,
    s.status::text,
    coalesce(s.contracted_hours, 0),
    s.project_id,
    coalesce(p.name, 'Sin proyecto'),
    coalesce(agg.estimated_hours, 0),
    coalesce(agg.real_hours, 0),
    coalesce(agg.tasks_total, 0),
    coalesce(agg.tasks_done, 0)
  from public.sprints s
  left join public.projects p on p.id = s.project_id
  left join lateral (
    select
      sum(case when t.status <> 'cancelada' then coalesce(t.total_effort_hours, 0) else 0 end) as estimated_hours,
      count(*) filter (where t.status <> 'cancelada')::int as tasks_total,
      count(*) filter (where t.status = 'completada')::int as tasks_done,
      coalesce((
        select sum(te.duration_minutes)::numeric / 60
        from public.time_entries te
        where te.task_id in (select t2.id from public.tasks t2 where t2.sprint_id = s.id)
      ), 0) as real_hours
    from public.tasks t
    where t.sprint_id = s.id
  ) agg on true
  where s.contract_id = _contract_id
  order by s.sprint_number, p.name;
$$;

grant execute on function public.get_contract_sprint_summary(uuid) to authenticated;