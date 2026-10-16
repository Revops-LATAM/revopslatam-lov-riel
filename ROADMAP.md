# Roadmap Riel 2.0

Estrategia: modernización por fases sobre la misma base de datos (Supabase / Lovable Cloud).

## Fase 0 — Base (hecha)
- [x] Importar Riel 1.0, regenerar lockfile, typecheck y build en verde.
- [x] Formato Prettier, Vitest y CI (typecheck, formato, tests, build).

## Fase 1 — Seguridad y deuda técnica
- [x] Salir de Lovable: correos directos por Resend, sin cola `pgmq` (ver `docs/correos.md`).
- [ ] Salir de Lovable: login con Google propio, Slack y HubSpot sin `connector-gateway`.
- [x] `email_queue_dispatch` / `email_queue_wake`: permisos verificados (solo service_role y postgres); migración idempotente de refuerzo.
- [x] `insert_task_assignees_bulk`: validar pertenencia al espacio (migración escrita, falta aplicar y probar en Lovable).
- [x] Cuotas duplicadas: lógica extraída y probada (`contract-payments.ts`, corrige cuota perdida) y migración que hace idempotente `generate_contract_monthly_payments` (falta aplicar y probar en Lovable).
- [ ] Programar el cron `invoice-reminders` (ya envía por Resend; falta crear el trabajo programado).
- [ ] Investigar pantalla en blanco al subir TanStack (react-start 1.168.60 / router 1.170.41).
- [ ] Retirar `content_pieces` v1 y `CreateContractWizard` v1; limpiar metadatos y `drizzle`/Stripe sin uso.

## Fase 2 — Diseño y UX
- [ ] Sistema de diseño 2.0 (tokens), modo oscuro, responsive real, navegación simplificada.
- [ ] Reemplazar colores fijos por tokens.

## Fase 3 — Rendimiento y estructura
- [ ] SSR/prefetch en rutas autenticadas, code-splitting de vistas pesadas (Gantt, PDF, xlsx).
- [ ] Dividir `operations.functions.ts`, `dte.functions.ts`, `_authenticated.tsx` por subdominio.

## Fase 4 — Calidad
- [ ] Pruebas de reglas de dinero (cuotas, splits, comisiones) y e2e con Playwright.
- [ ] Corregir advertencias de lint (hooks, `any`).
