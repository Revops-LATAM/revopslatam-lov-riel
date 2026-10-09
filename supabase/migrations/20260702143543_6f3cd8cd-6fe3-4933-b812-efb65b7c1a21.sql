
CREATE INDEX IF NOT EXISTS idx_contract_payments_contract_due ON public.contract_payments (contract_id, due_date);
CREATE INDEX IF NOT EXISTS idx_contract_payments_contract_status ON public.contract_payments (contract_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_ws_fecha ON public.invoices (workspace_id, fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_ws_estado ON public.invoices (workspace_id, estado);
CREATE INDEX IF NOT EXISTS idx_currency_rates_ws_currency_date ON public.currency_rates (workspace_id, currency, rate_date DESC);
