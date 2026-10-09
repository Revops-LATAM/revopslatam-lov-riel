UPDATE public.invoices
SET estado = 'emitted',
    folio_sii = '2899',
    token_sii = 'e8922858caa9f634d83112f8247d250f2aa8d8c77b8b1bf1972a8b2ff2781df2',
    pdf_url = 'https://api.haulmer.com/v2/dte/document/e8922858caa9f634d83112f8247d250f2aa8d8c77b8b1bf1972a8b2ff2781df2/pdf',
    emitido_at = COALESCE(emitido_at, now())
WHERE id = '1daa15fc-8e7b-4bce-baa6-43a80457cdef'
  AND estado = 'draft';

UPDATE public.contract_payments
SET status = 'invoiced'
WHERE id = 'c0eb52b0-30c1-4b27-af01-078b69d9a5ba'
  AND status <> 'paid';