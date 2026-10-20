# Restaurar Riel en un Supabase nuevo

Convierte el respaldo de Lovable Cloud (`pg_dump -Fc`, PostgreSQL 17/18, compresión zstd) en SQL
para un proyecto Supabase vacío. **Los datos reales nunca van al repo**: los archivos generados
quedan fuera de él.

Por qué no se usan las migraciones: la base real tiene tablas que no están en
`supabase/migrations` (`account_billing_entities`, `contract_billing_splits`). La estructura se
toma del propio respaldo, que sí es exacta (87 tablas, 207 políticas RLS, 116 triggers).

## 1. Generar los SQL

```sh
pip install zstandard
python3 -I scripts/restore/build_restore.py RESPALDO.backup ../riel-restore   # fuera del repo
```

Genera `01_schema.sql`, `02_data.sql` y `03_storage.sql`.

## 1b. Alternativa sin psql: SQL Editor de Supabase

```sh
python3 -I scripts/restore/build_editor_sql.py RESPALDO.backup data/sql-editor   # data/ está en .gitignore
```

Genera `00_schema.sql`, `01_datos.sql` … `NN_datos.sql` (~600 KB cada uno, como INSERT, porque el
editor no admite COPY) y `99_verificar.sql`. Se pegan y ejecutan en orden en el SQL Editor; al final
`99_verificar.sql` debe mostrar `ok = true` en las 90 filas. Cada archivo de datos desactiva los
triggers de su sesión (`session_replication_role = replica`), por lo que se pueden correr en cualquier orden
una vez aplicado el esquema.

## 2. Aplicar en el Supabase nuevo (vacío)

Usa la cadena de conexión _Session pooler_ o _Direct_ de _Project Settings → Database_, guardada
en una variable de entorno (nunca pegada en archivos ni chats):

```sh
psql "$SUPABASE_DB_URL" -f ../riel-restore/01_schema.sql
psql "$SUPABASE_DB_URL" -f ../riel-restore/02_data.sql
psql "$SUPABASE_DB_URL" -f ../riel-restore/03_storage.sql
```

Antes de `02_data.sql`: en _Database → Publications_ confirmar que `supabase_realtime` incluye
`time_entries` (el esquema no lo recrea).

## 3. Verificar

Resultado esperado: 89 tablas cargadas, 63.867 filas, 13 usuarios, 0 claves foráneas huérfanas.

## Fuera del alcance de estos SQL

- **Archivos de Storage** (`task-attachments` ≈ 101 MB / 139 archivos y `marketing-assets` ≈ 287 MB /
  6 archivos): el respaldo solo trae su registro; hay que copiarlos con la API de Storage.
- **Login con Google:** crear credenciales OAuth propias y activarlas en _Authentication → Providers_.
  Las identidades se conservan, así que cada persona entra con la misma cuenta.
- **Correos:** Riel 2.0 envía directo por Resend (ver `docs/correos.md`). Las funciones de la cola de
  Lovable (`pgmq`, vault, `pg_cron`) no se restauran.
- **Cron y secretos:** los 5 trabajos de `pg_cron` y las claves de Asana, HubSpot, Slack, Haulmer
  y Google Calendar se reconfiguran a mano.

## Permisos de las funciones (importante)

Un proyecto Supabase nuevo concede `EXECUTE` a `anon`, `authenticated` y `service_role` a toda función
que se crea, y los `REVOKE ... FROM PUBLIC` del respaldo no lo deshacen: sin corrección, las 106 funciones
de `public` quedan ejecutables por `anon` (en producción eran 60). `00_schema.sql` termina con un bloque
(`function_privileges_sql` en `build_restore.py`) que limpia esos tres roles y reaplica los permisos
exactos de producción. Verificar tras restaurar: `anon` debe poder ejecutar 60 funciones de `public`,
`authenticated` 88 y `service_role` 106; ninguna función `SECURITY DEFINER` sensible (p. ej.
`purge_deleted_tasks`, `enqueue_notification`) debe estar abierta a `anon`.

## Después de restaurar: endurecimiento

Aplicar `supabase/migrations/20261020000000_harden_function_privileges.sql`. El restauro deja los permisos igual que
Riel 1.0 (fiel a producción); esta migración los cierra: ninguna función para `anon`, las funciones de trigger fuera
del RPC y comprobación de acceso en `insert_phase_raw` y `upsert_sprint_raw`. Resultado esperado: `anon` 0 funciones
de `public`, `authenticated` 36, `service_role` 106.
