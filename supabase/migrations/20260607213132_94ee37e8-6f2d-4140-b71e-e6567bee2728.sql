
-- 1) workspace_dte_config (1 fila por workspace)
CREATE TABLE public.workspace_dte_config (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openfactura',
  ambiente text NOT NULL DEFAULT 'sandbox' CHECK (ambiente IN ('sandbox','production')),
  api_key text,
  rut_emisor text,
  resolucion_sii text,
  fecha_resolucion date,
  activo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_dte_config TO authenticated;
GRANT ALL ON public.workspace_dte_config TO service_role;
ALTER TABLE public.workspace_dte_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dte_config select" ON public.workspace_dte_config
  FOR SELECT TO authenticated
  USING (public.has_permission(workspace_id, auth.uid(), 'finance_view'));

CREATE POLICY "dte_config write" ON public.workspace_dte_config
  FOR ALL TO authenticated
  USING (public.has_permission(workspace_id, auth.uid(), 'admin_settings')
         OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'))
  WITH CHECK (public.has_permission(workspace_id, auth.uid(), 'admin_settings')
              OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'));

CREATE TRIGGER trg_dte_config_updated_at
  BEFORE UPDATE ON public.workspace_dte_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) invoices
CREATE TYPE public.invoice_status AS ENUM ('draft','scheduled','emitted','paid','cancelled');

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  numero_interno text,
  tipo_dte integer NOT NULL DEFAULT 33, -- 33 factura electrónica, 34 exenta, 39 boleta...
  descripcion text,
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  mes integer,
  anio integer,
  currency text NOT NULL DEFAULT 'CLP',
  monto_neto numeric(14,2) NOT NULL DEFAULT 0,
  monto_iva numeric(14,2) NOT NULL DEFAULT 0,
  monto_total numeric(14,2) NOT NULL DEFAULT 0,
  monto_clp numeric(14,2),
  estado public.invoice_status NOT NULL DEFAULT 'draft',
  folio_sii text,
  token_sii text,
  pdf_url text,
  xml_url text,
  emitido_at timestamptz,
  pagada_at timestamptz,
  cancelada_at timestamptz,
  motivo_cancelacion text,
  dtes_asociados jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_workspace ON public.invoices(workspace_id);
CREATE INDEX idx_invoices_contract ON public.invoices(contract_id);
CREATE INDEX idx_invoices_account ON public.invoices(account_id);
CREATE INDEX idx_invoices_estado ON public.invoices(estado);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices select" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.has_permission(workspace_id, auth.uid(), 'finance_view'));

CREATE POLICY "invoices write" ON public.invoices
  FOR ALL TO authenticated
  USING (public.has_permission(workspace_id, auth.uid(), 'finance_invoice')
         OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'))
  WITH CHECK (public.has_permission(workspace_id, auth.uid(), 'finance_invoice')
              OR public.has_permission(workspace_id, auth.uid(), 'finance_manage'));

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) invoice_lines
CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  cantidad numeric(14,2) NOT NULL DEFAULT 1,
  monto_unitario numeric(14,2) NOT NULL DEFAULT 0,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CLP',
  contract_payment_id uuid REFERENCES public.contract_payments(id) ON DELETE SET NULL,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_lines select" ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
                  WHERE i.id = invoice_lines.invoice_id
                    AND public.has_permission(i.workspace_id, auth.uid(), 'finance_view')));

CREATE POLICY "invoice_lines write" ON public.invoice_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
                  WHERE i.id = invoice_lines.invoice_id
                    AND (public.has_permission(i.workspace_id, auth.uid(), 'finance_invoice')
                         OR public.has_permission(i.workspace_id, auth.uid(), 'finance_manage'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i
                       WHERE i.id = invoice_lines.invoice_id
                         AND (public.has_permission(i.workspace_id, auth.uid(), 'finance_invoice')
                              OR public.has_permission(i.workspace_id, auth.uid(), 'finance_manage'))));

-- 4) contract_payments.invoice_id
ALTER TABLE public.contract_payments
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contract_payments_invoice ON public.contract_payments(invoice_id);

-- 5) Asignar permiso a templates "Finanzas" y "Admin completo" en todos los workspaces
UPDATE public.role_templates
   SET permissions = ARRAY(
       SELECT DISTINCT unnest(permissions || ARRAY['finance_invoice']::public.workspace_permission[])
   )
 WHERE name IN ('Finanzas','Admin completo');
