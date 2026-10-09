-- Fase 0+1: Renovaciones + cancelación + emisor del workspace

-- 1. Cancelación de contratos
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS fecha_cancelacion date,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

-- 2. Default puede_renovarse=true (hoy es false) y trigger para calcular fecha_aviso al activar
ALTER TABLE public.contracts ALTER COLUMN puede_renovarse SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.handle_contract_renewal_notice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.status = 'active'
     AND NEW.puede_renovarse = true
     AND NEW.end_date IS NOT NULL
     AND NEW.fecha_aviso_renovacion IS NULL THEN
    NEW.fecha_aviso_renovacion := NEW.end_date - COALESCE(NEW.anticipacion_renovacion_dias, 60);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_renewal_notice ON public.contracts;
CREATE TRIGGER trg_contract_renewal_notice
  BEFORE INSERT OR UPDATE OF status, end_date, puede_renovarse, anticipacion_renovacion_dias
  ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.handle_contract_renewal_notice();

-- 3. Datos del emisor (por workspace) - útil para DTE en Fase 3 y para mostrar en documentos
CREATE TABLE public.workspace_emisor (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rut text,
  razon_social text,
  giro text,
  direccion text,
  comuna text,
  acteco integer,
  email_contacto text,
  telefono text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_emisor TO authenticated;
GRANT ALL ON public.workspace_emisor TO service_role;

ALTER TABLE public.workspace_emisor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emisor_select_members"
  ON public.workspace_emisor FOR SELECT TO authenticated
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "emisor_manage_admins"
  ON public.workspace_emisor FOR ALL TO authenticated
  USING (app_private.has_permission(workspace_id, auth.uid(), 'admin_settings'))
  WITH CHECK (app_private.has_permission(workspace_id, auth.uid(), 'admin_settings'));

CREATE TRIGGER trg_workspace_emisor_updated_at
  BEFORE UPDATE ON public.workspace_emisor
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();