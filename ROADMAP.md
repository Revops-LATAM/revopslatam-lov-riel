# Roadmap Riel 2.0

Estrategia: modernización por fases sobre la misma base de datos (Supabase / Lovable Cloud).

## Fase 0 — Base (hecha)

- [x] Importar Riel 1.0, regenerar lockfile, typecheck y build en verde.
- [x] Formato Prettier, Vitest y CI (typecheck, formato, tests, build).

## Fase 1 — Seguridad y deuda técnica

- [x] Salir de Lovable: correos directos por Resend, sin cola `pgmq` (ver `docs/correos.md`).
- [x] Salir de Lovable: login con Google nativo de Supabase (ver `docs/supabase.md`).
- [x] Compila para Vercel y guía de despliegue (`docs/despliegue.md`); cron propio (`supabase/cron/schedule.sql`).
- [ ] **En pausa, para el final:** Slack y HubSpot sin `connector-gateway` (esperan los tokens del equipo).
- [ ] Servidor MCP sin `mcp-js` y logo de correos en `public/` (necesita el archivo `logo-revopslatam-blanco.png`).
- [x] `email_queue_dispatch` / `email_queue_wake`: permisos verificados (solo service_role y postgres); migración idempotente de refuerzo.
- [x] `insert_task_assignees_bulk`: validar pertenencia al espacio (aplicada y verificada en Supabase nuevo).
- [x] Cuotas duplicadas: lógica extraída y probada (`contract-payments.ts`, corrige cuota perdida) y migración que hace idempotente `generate_contract_monthly_payments` (aplicada y verificada en Supabase nuevo).
- [ ] Programar el cron `invoice-reminders` (ya envía por Resend; falta crear el trabajo programado).
- [x] TanStack actualizado (react-start 1.168.61 / router 1.170.45): causa de la pantalla en blanco corregida y `npm run smoke` en el CI.
- [x] Limpieza: `CreateContractWizard` v1, metadatos duplicados, drizzle y Stripe sin uso.
- [ ] `content_pieces` v1 sigue en uso por campañas y plantillas de marketing: migrarlas a `content_pieces_v2` antes de retirarlo.

## Fase 2 — Diseño y UX

- [ ] Sistema de diseño 2.0 (tokens), modo oscuro, responsive real, navegación simplificada.
- [ ] Reemplazar colores fijos por tokens.

## Fase 3 — Rendimiento y estructura

- [ ] SSR/prefetch en rutas autenticadas, code-splitting de vistas pesadas (Gantt, PDF, xlsx).
- [ ] Dividir `operations.functions.ts`, `dte.functions.ts`, `_authenticated.tsx` por subdominio.

## Fase 4 — Calidad

- [ ] Pruebas de reglas de dinero (cuotas, splits, comisiones) y e2e con Playwright.
- [ ] Corregir advertencias de lint (hooks, `any`).

## Estado del Supabase nuevo (`db_riel`)

- [x] Esquema, datos (63.867 filas), 182 claves foráneas sin huérfanos, RLS en las 87 tablas.
- [x] Permisos EXECUTE de funciones iguales a producción (60/88/106 para anon/authenticated/service_role).
- [x] Migraciones de asignados en lote y cuotas idempotentes aplicadas.
- [ ] Archivos de Storage: `task-attachments` (139) pendiente. `marketing-assets`: se subieron 3 de 6; **omitidos por ahora**
      (ver `docs/storage-pendiente.md`).
- [ ] Tareas programadas (`supabase/cron/schedule.sql`) y secretos en Vault.
- [x] Endurecimiento de funciones: `anon` 0 (antes 60), `authenticated` 36 (antes 88), triggers fuera del RPC y
      3 funciones SECURITY DEFINER sin control de acceso corregidas (`20261020000000_harden_function_privileges.sql`).
- [ ] Opcional: mover a `app_private` los helpers de políticas que aún se pueden llamar por RPC (25 avisos INFO/WARN restantes).
