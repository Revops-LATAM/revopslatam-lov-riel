# Prompt maestro para recrear Riel (solo lectura)

## Objetivo
Redactar un prompt maestro en español, en lenguaje natural y en tiempo presente, que describa cómo está construido Riel y cómo funciona, con suficiente detalle para que otra persona o IA lo recree con el mismo comportamiento. No se modifica ningún archivo de la app ni la base de datos.

## Entregable
- Un archivo descargable `Riel_Prompt_Maestro.md` con todo el prompt dentro de un único bloque de código, para copiarlo con un clic.
- Sigue las 12 secciones pedidas: descripción, roles y permisos (tabla), acceso, pantallas, funcionalidades, modelo de datos con RLS en lenguaje simple, automatizaciones, integraciones, diseño, stack, orden de construcción en pasos independientes y pendientes.
- No lleva código, salvo nombres exactos de tablas, campos, rutas y valores.
- Lo que no exista o no se pueda confirmar se escribe como "Pendiente / no implementado".
- Por el tamaño, el bloque se organiza en partes numeradas dentro del mismo archivo y se avisa en el chat.

## Cómo se arma (solo lectura)
- Se reutiliza el análisis ya hecho en el informe de arquitectura.
- Se completa con lecturas puntuales de cada pantalla y módulo: formularios, campos obligatorios, validaciones con zod, mensajes de éxito y error, estados permitidos.
- Desde la base de datos se lee solo: columnas, tipos, valores por defecto, valores de listas, políticas RLS, triggers y tareas programadas.
- Se incluyen las reglas de negocio ya acordadas:
  - "Visible para el cliente" en comentarios viene desmarcado por defecto.
  - Los giros del SII deben ser solo códigos oficiales.
  - Las duraciones de los xlsx se convierten a horas.
  - Las cuotas, los sprints, la facturación dividida por razón social y las comisiones siguen sus reglas.
- Los secretos se nombran sin mostrar su valor y no se incluyen datos de clientes.

## Qué no se hace
- No se cambian código, configuración, base de datos ni paquetes.
