# Informe técnico de arquitectura de Riel (solo lectura)

## Objetivo
Entregar un análisis técnico completo del proyecto, siguiendo las 14 secciones del documento subido, sin modificar ningún archivo de la app ni la base de datos.

## Entregable
Un documento Markdown en español: `Riel_Informe_Arquitectura.md`, descargable desde Archivos. Lleva diagramas Mermaid (módulos y entidad-relación) y tablas para las rutas, tablas de la base de datos, variables de entorno e integraciones. Cada afirmación cita el archivo que la respalda, y lo que no se pueda confirmar se marca como "no confirmado".

Por su largo, se divide en 3 partes y se avisa al pasar de una a otra:
1. Secciones 1 a 5: resumen, tecnologías, estructura de carpetas, arquitectura y rutas.
2. Secciones 6 a 10: componentes, estado y datos, base de datos y backend, autenticación e integraciones.
3. Secciones 11 a 14: lógica de negocio, diseño, evaluación técnica y guía para seguir desarrollando.

## Cómo se arma (solo lectura)
- Leer `package.json`, la configuración (vite, tsconfig, styles.css, start.ts, server.ts) y todos los archivos de `src/routes`, `src/lib/api`, `src/components` y `src/lib/mcp`.
- Consultar la base de datos solo con lecturas: tablas, columnas, claves foráneas, políticas de acceso (RLS), funciones y triggers.
- Revisar integraciones: Asana, HubSpot, Slack, correos, facturación electrónica (DTE/SII), UF, Google Calendar, portal de clientes y el servidor MCP.
- Listar los secretos solo por nombre, nunca con su valor.
- En la evaluación técnica, incluir los pendientes ya conocidos: funciones de la cola de correos aún expuestas, validación de miembros en la asignación masiva de tareas y la actualización de paquetes que deja la app en blanco.

## Qué no se hace
- No se cambian código, configuración, base de datos ni paquetes.
- No se muestran claves, tokens ni datos personales de clientes.
