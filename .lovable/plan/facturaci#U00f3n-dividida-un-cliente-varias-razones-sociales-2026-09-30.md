# Facturación dividida: un cliente, varias razones sociales

## Idea
El cliente (el grupo) sigue siendo **una sola empresa** en Riel y **un solo contrato**. A esa empresa se le agregan sus **razones sociales de facturación** (las 11), y en el contrato se define **cuánto paga cada una** (monto fijo). Cuando llega una cuota, Riel prepara **una factura por cada razón social**, cada una con sus datos, su OC y su correo.

```text
Cliente: Grupo X  ──  Contrato (ej. 110 UF/mes)
   ├─ Razón social A  → 15 UF  → factura propia, OC propia, correo A
   ├─ Razón social B  → 10 UF  → factura propia, OC propia, correo B
   └─ ... (11 en total, deben sumar 110 UF)
```

## Qué verás
1. **Ficha del cliente → nueva sección "Razones sociales de facturación"**: agregar/editar cada una con RUT, razón social, giro (buscador SII), dirección, comuna, correo de facturación y CC. La razón social actual del cliente queda como la principal.
2. **Contrato → nueva opción "Dividir facturación"**: eliges las razones sociales y el monto fijo de cada una. Riel avisa si la suma no cuadra con el valor de la cuota.
3. **Gestión de facturas**: la cuota de un contrato dividido aparece con el detalle de las 11 partes. Al emitir:
   - Se abre la misma ventana de revisión actual, pero con una pestaña/lista por razón social, cada una editable (monto, glosa, **OC propia**).
   - Puedes emitirlas todas juntas o una por una; la cuota queda "Facturada" cuando todas las partes están emitidas y "Pagada" cuando todas están pagadas.
4. **Envío por correo**: cada factura se manda al correo de su razón social con sus propios CC.
5. Contratos sin división siguen funcionando exactamente igual que hoy.

## Detalles técnicos
- Nueva tabla `account_billing_entities` (account_id, rut, razon_social, giro, direccion, comuna, email_facturacion, cc_emails[], is_primary, activo) con GRANTs + RLS vía `can_access_account`.
- Nueva tabla `contract_billing_splits` (contract_id, billing_entity_id, monto, moneda, orden) con GRANTs + RLS vía acceso al contrato.
- `invoices` recibe columna nullable `billing_entity_id`; `contract_payments` puede tener varias facturas (relación por `invoice_lines`/nueva tabla `payment_invoices` en lugar de un único `invoice_id` para cuotas divididas; el `invoice_id` actual se mantiene para las no divididas).
- `EmitDteDialog`: modo multi-receptor que itera sobre los splits, pre-llenando receptor desde la razón social y emitiendo N DTE vía `dte.functions.ts`.
- `dte-email.functions.ts`: destinatario/CC desde la razón social de la factura cuando existe.
- `list_workspace_payments`: agrega estado agregado de las partes (emitidas X/N, pagadas X/N).
- Backfill: por cada cliente existente se crea su razón social principal a partir de los datos actuales.
