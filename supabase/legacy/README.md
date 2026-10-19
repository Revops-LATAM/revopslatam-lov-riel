# SQL heredado (solo referencia)

Estos tres archivos venían de `drizzle/migrations` en Riel 1.0. **No se ejecutan**: su efecto ya está en
el respaldo de producción y en `scripts/restore`.

- `0000_billing_entities_splits.sql`: crea `account_billing_entities` y `contract_billing_splits`, las dos
  tablas que no estaban en `supabase/migrations`.
- `0001` y `0002`: refuerzos de seguridad (cola de correos y funciones `SECURITY DEFINER`).
