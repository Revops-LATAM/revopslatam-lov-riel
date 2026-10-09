# Roadmap Riel 2.0

Estrategia: modernización por fases sobre la misma base de datos (Supabase / Lovable Cloud).

## Fase 0 — Base (hecha)
- [x] Importar Riel 1.0, regenerar lockfile, typecheck y build en verde.
- [x] Formato Prettier, Vitest y CI (typecheck, formato, tests, build).

## Fase 1 — Seguridad y deuda técnica
- [ ] Restringir `email_queue_dispatch` / `email_queue_wake` al servidor.
- [ ] `insert_task_assignees_bulk`: validar pertenencia al espacio.
- [ ] Hacer idempotente `regenerateContractPayments` (cuotas duplicadas).
- [ ] Programar o eliminar el cron `invoice-reminders`.
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
