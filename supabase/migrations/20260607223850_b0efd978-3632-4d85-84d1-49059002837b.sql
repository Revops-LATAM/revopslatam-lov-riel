CREATE INDEX IF NOT EXISTS idx_invoices_workspace_fecha
  ON public.invoices (workspace_id, fecha_emision DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_anio_mes
  ON public.invoices (workspace_id, anio, mes);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_estado
  ON public.invoices (workspace_id, estado);