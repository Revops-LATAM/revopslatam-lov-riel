-- Elimina 100 tareas duplicadas insertadas en un batch parcial previo del import USACH Diplomados
DELETE FROM public.tasks
WHERE project_id = 'c0350ac1-003b-4400-89f7-f1eb323b6e34'
  AND created_at < '2026-07-21 19:40:00+00';