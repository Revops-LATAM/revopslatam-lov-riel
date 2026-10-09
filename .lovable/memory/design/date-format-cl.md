---
name: Chilean date format
description: Todas las fechas visibles al usuario van en dd/MM/yyyy (Chile)
type: design
---
Formato estándar de display: **dd/MM/yyyy** con separador `/` (ej: 31/10/2026). Cortos: `dd/MM`. Con hora: `dd/MM/yyyy HH:mm` (24h).

- Usar helpers de `src/lib/date-format.ts` (`formatDateCL`, `formatDateShortCL`, `formatDateTimeCL`) en tablas, drawers, emails y PDFs.
- Para date-fns usar `CL_DATE_PATTERN` (`dd/MM/yyyy`) / `CL_DATE_SHORT_PATTERN` (`dd/MM`).
- **NO** cambiar valores en formato ISO `yyyy-MM-dd` cuando se guardan en BD o van al DTE — ese es el contrato de datos (los `toLocaleDateString("en-CA", { timeZone: "America/Santiago" })` en `dte.functions.ts`, `EmitDteDialog.tsx`, `CreateInvoiceDialog.tsx` son intencionales).
- `<input type="date">` muestra formato controlado por el navegador — no se puede forzar dd/MM sin migrar a un input mascarado; queda pendiente.
