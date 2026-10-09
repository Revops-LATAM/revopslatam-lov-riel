CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_workspace_tipo_folio_active
ON public.invoices (workspace_id, tipo_dte, folio_sii)
WHERE folio_sii IS NOT NULL AND estado <> 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_token_sii_not_null
ON public.invoices (token_sii)
WHERE token_sii IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_lines_contract_payment_not_null
ON public.invoice_lines (contract_payment_id)
WHERE contract_payment_id IS NOT NULL;