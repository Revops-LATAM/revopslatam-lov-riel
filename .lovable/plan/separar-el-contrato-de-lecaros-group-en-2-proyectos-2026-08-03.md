# Separar el contrato de Lecaros Group en 2 proyectos

El contrato **Lecaros Group - Servicios de Acompañamiento Performance Marketing & Hubspot - 2026** (31-07-2026 → 30-07-2027, recurrente mensual, 31 h por sprint) hoy tiene un solo proyecto con los 12 sprints.

## Resultado esperado

```text
Contrato Lecaros Group 2026 (31 h/sprint)
├── RevOps as a Service ............ 25 h/sprint (proyecto actual, conserva sprints y tareas)
└── Performance Marketing ..........  6 h/sprint (proyecto nuevo, 12 sprints propios)
```

## Cambios

1. **Renombrar el proyecto actual** a "RevOps as a Service" y bajar sus horas de 31 a **25** (proyecto y sus 12 sprints).
2. **Crear el proyecto "Performance Marketing"** en el mismo contrato y cuenta, tipo entrega RaaS, en curso, con **6 h** por sprint y las mismas fechas de inicio.
3. **Generar 12 sprints mensuales** para el proyecto nuevo con las mismas fechas que los existentes (03-08-2026 → 30-07-2027), 6 h contratadas cada uno.

No se toca el contrato ni la facturación: las 12 cuotas de 50 UF y la factura ya emitida (folio 2914) quedan igual. El total sigue siendo 31 h/sprint, ahora repartidas 25 + 6.

## Detalle técnico

- Actualización de datos sobre `projects` (nombre, `horas_presupuestadas_total`) y `sprints` (`contracted_hours`) del proyecto actual.
- Insert de un nuevo registro en `projects` con `contract_id` del contrato, `is_primary = false`, `orden = 1`, y 12 filas en `sprints` con `project_id` nuevo, `sprint_number` 1..12 y las fechas espejo de los sprints actuales.
- La vista de contrato (árbol de operaciones y resumen de sprints) ya soporta contratos multi-proyecto, así que no requiere cambios de código.
