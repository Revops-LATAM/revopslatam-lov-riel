# Riel 2.0

Plataforma interna de operación de **Revops LATAM**: proyectos y tareas, horas y capacidad,
contratos, facturación (DTE/SII), comisiones, marketing y portal de tickets.

Riel 2.0 es la modernización por fases de Riel 1.0. Mantiene la misma base de datos y reglas de
negocio; renueva seguridad, diseño, rendimiento y calidad. Ver [`ROADMAP.md`](./ROADMAP.md).

## Desarrollo

```sh
cp .env.example .env   # completar con los valores del proyecto (nunca subir .env)
npm install
npm run dev            # http://localhost:8080
npm run typecheck && npm test && npm run build
```

## Reglas

- Ninguna credencial en código, commits ni prompts: solo variables de entorno.
- Cambios por Pull Request con revisión humana y CI en verde.
- No editar `src/routeTree.gen.ts` ni `src/integrations/supabase/types.ts` (generados). Conexión y login: ver [`docs/supabase.md`](./docs/supabase.md).
