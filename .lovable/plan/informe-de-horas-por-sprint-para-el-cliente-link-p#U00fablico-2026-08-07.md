# Informe de horas por sprint para el cliente (link público)

Un link público, revocable y sin expiración, que muestra al cliente el resumen de horas de uno o varios sprints, con el listado de tareas de cada sprint.

## Cómo se usa

1. En el proyecto (o en la pestaña Sprints), botón **Compartir informe**.
2. Se abre un diálogo donde eliges qué sprints incluir:
   - Solo un sprint (por ejemplo el sprint en curso)
   - Varios sprints seleccionados
   - Todos los sprints del proyecto
3. Se genera un link tipo `riel.revopslatam.com/informe/<token>` para copiar y enviar.
4. En el mismo diálogo se ven los links ya creados y se pueden **revocar** en cualquier momento.

## Qué ve el cliente

Página pública, sin login, con la marca de Riel/RevOps:

- Encabezado: cliente, proyecto y rango de fechas del informe.
- **Resumen por sprint**: número de sprint, fechas, horas planificadas (estimadas), horas reales registradas, % de consumo y saldo. Si el proyecto tiene horas contratadas por sprint, se muestra contra ese tope.
- **Totales generales** del informe.
- **Detalle de tareas por sprint** (colapsable): título de la tarea, estado, horas estimadas y horas reales.
- No se muestran costos, tarifas, márgenes ni nombres de personas del equipo.
- Botón "Imprimir / Guardar PDF" para enviar el informe también como archivo.

## Detalle técnico

**Base de datos**
- Reutilizar `project_share_tokens` agregando el scope `report` y una columna `config jsonb` para guardar los sprints seleccionados (`{"sprintIds": [...]}`, vacío = todos).
- Sin cambios de RLS: el acceso público pasa por el endpoint con service role, validando token, revocación y expiración.

**Backend**
- `src/lib/api/report-share.functions.ts`: `createReportShareToken` (projectId + sprintIds), `listReportShareTokens`, `revokeReportShareToken`, todas con `requireSupabaseAuth`.
- `src/routes/api/public/report.$token.ts`: valida el token y devuelve JSON con proyecto, cliente, sprints seleccionados, tareas por sprint (título, estado, estimado) y horas reales agregadas desde `time_entries` por tarea. Sin PII del equipo (no se devuelven `user_id` ni emails).

**Frontend**
- `src/routes/informe.$token.tsx`: página pública (`ssr: false`), fetch al endpoint, tabla de resumen + acordeón de tareas, estilos de impresión.
- `src/components/tasko/ReportShareDialog.tsx`: selector de sprints (uno / varios / todos), generar, copiar y revocar links. Se monta con un botón en la vista de sprints del proyecto, siguiendo el patrón del botón de compartir Gantt.

Fechas en formato dd/mm/aaaa y horas con 1 decimal, como en el resto de la app.
