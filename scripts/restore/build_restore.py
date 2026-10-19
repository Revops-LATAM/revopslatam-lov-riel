#!/usr/bin/env python3
"""Convierte un respaldo `pg_dump -Fc` de Riel (Lovable Cloud) en SQL listo para un Supabase nuevo.

Uso:  python3 -I scripts/restore/build_restore.py RESPALDO.backup CARPETA_SALIDA
Requiere: pip install zstandard

Genera (en CARPETA_SALIDA, que NO debe estar dentro del repo):
  01_schema.sql   estructura del esquema public y app_private (tablas, funciones, RLS, triggers)
  02_data.sql     datos de las 87 tablas de public + auth.users + auth.identities
  03_storage.sql  registro de los buckets reales de Storage (los archivos se copian aparte)
"""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pgcustom as P

SKIP_BUCKETS = {"database_export_15_10_26"}
# Funciones de la cola de correos de Lovable (pgmq / vault / pg_cron / pg_net). Riel 2.0 envía
# directo por Resend y ya no las usa, así que no se restauran.
EMAIL_QUEUE_FUNCS = (
    "email_queue_dispatch",
    "email_queue_wake",
    "enqueue_email",
    "read_email_batch",
    "delete_email",
    "move_to_dlq",
)
FOREIGN_ROLES = ("sandbox_exec",)  # roles propios de Lovable que no existen en un Supabase nuevo


def clean(defn: str) -> str | None:
    if any(r in defn for r in FOREIGN_ROLES):
        return None
    # En Supabase gestionado el rol postgres no puede reasignar dueños a supabase_admin.
    defn = re.sub(r"^ALTER (?!DEFAULT)[^\n]*OWNER TO [^\n]*;\n?", "", defn, flags=re.M)
    return defn.strip() and defn.rstrip() + "\n"


FUNC_ACL = re.compile(r"^(REVOKE|GRANT) ALL ON FUNCTION (\S+?)\(.*?\) (?:FROM|TO) (\w+);$", re.M)
ROLES = ("anon", "authenticated", "service_role")


def function_privileges_sql(schema_sql: str) -> str:
    """Fija el EXECUTE de cada función igual que en producción.

    pg_dump emite los permisos como diferencia contra el valor inicial (dueño + PUBLIC). Un Supabase
    nuevo, además, concede EXECUTE a anon/authenticated/service_role a toda función nueva (privilegios
    por defecto), y eso NO lo deshacen los REVOKE ... FROM PUBLIC del respaldo: las funciones
    quedarían más abiertas que en producción. Por eso se limpian esos tres roles y se reaplica el estado
    final simulado a partir de las sentencias del respaldo.
    """
    acl: dict[str, set[str]] = {}
    for fn in re.findall(r"^CREATE FUNCTION (\S+?)\(", schema_sql, re.M):
        acl[fn] = {"PUBLIC"}
    for verb, fn, role in FUNC_ACL.findall(schema_sql):
        if fn in acl:
            acl[fn].add(role) if verb == "GRANT" else acl[fn].discard(role)
    groups: dict[tuple[bool, tuple[str, ...]], list[str]] = {}
    for fn, roles in sorted(acl.items()):
        groups.setdefault(("PUBLIC" in roles, tuple(sorted(roles & set(ROLES)))), []).append(fn)
    lines = [
        "-- Permisos de EXECUTE de las funciones: igual que en producción (ver function_privileges_sql).",
        "DO $acl$",
        "DECLARE r record; g record;",
        "BEGIN",
        "  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p",
        "    WHERE p.pronamespace IN ('public'::regnamespace, 'app_private'::regnamespace) LOOP",
        "    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', r.sig);",
        "  END LOOP;",
        "  FOR g IN SELECT * FROM (VALUES",
    ]
    rows = []
    for (public, roles), fns in groups.items():
        arr = ",".join(f"'{f}'" for f in fns)
        rows.append(f"    ({str(public).lower()}, '{','.join(roles)}', ARRAY[{arr}])")
    lines.append(",\n".join(rows))
    lines += [
        "  ) AS t(keep_public, roles, names) LOOP",
        "    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p",
        "      WHERE (p.pronamespace::regnamespace::text || '.' || p.proname) = ANY(g.names) LOOP",
        "      IF NOT g.keep_public THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig); END IF;",
        "      IF g.roles <> '' THEN EXECUTE format('GRANT ALL ON FUNCTION %s TO %s', r.sig, g.roles); END IF;",
        "    END LOOP;",
        "  END LOOP;",
        "END",
        "$acl$;",
    ]
    return "\n".join(lines) + "\n"


def build_schema(toc) -> list[str]:
    """Sentencias DDL del esquema public/app_private, el trigger de auth y las políticas de Storage."""
    schema = [
        "SET check_function_bodies = false;\nSET client_min_messages = warning;\n",
        "CREATE SCHEMA IF NOT EXISTS app_private;\n",
    ]
    for e in toc:
        if e["desc"] in ("TABLE DATA", "DEFAULT ACL") or not e["defn"]:
            # DEFAULT ACL: privilegios por defecto de roles de Supabase (supabase_admin). Un
            # proyecto nuevo ya los trae y el rol postgres no puede cambiarlos.
            continue
        keep = (
            e["ns"] in ("public", "app_private")
            or (e["desc"] == "TRIGGER" and e["tag"] == "users on_auth_user_created")
            or (e["desc"] == "POLICY" and e["ns"] == "storage")
        )
        if not keep or e["desc"] in ("PUBLICATION TABLE", "SCHEMA"):
            continue
        if any(name in (e["tag"] or "") for name in EMAIL_QUEUE_FUNCS):
            continue
        d = clean(e["defn"])
        if d:
            schema.append(d)
    schema.append(function_privileges_sql("".join(schema)))
    return schema


def main(src: str, out: str) -> None:
    f, r, meta, toc = P.open_dump(src)
    os.makedirs(out, exist_ok=True)
    print(f"Respaldo {meta['version']} servidor {meta['server']} compresión {meta['compression']}")

    schema = build_schema(toc)
    open(os.path.join(out, "01_schema.sql"), "w").write("".join(schema))

    wanted = lambda e: e["desc"] == "TABLE DATA" and (
        e["ns"] == "public" or (e["ns"] == "auth" and e["tag"] in ("users", "identities"))
    )
    data = ["SET session_replication_role = replica;\n"]
    rows = 0
    for e in sorted((e for e in toc if wanted(e)), key=lambda e: (e["ns"] != "auth", e["tag"])):
        body = P.read_data(f, r, e, meta["compression"])
        data.append(e["copy"])
        data.append(body.decode("utf-8"))
        rows += sum(1 for l in body.split(b"\n") if l and l != b"\\.")
    data.append("RESET session_replication_role;\n")
    open(os.path.join(out, "02_data.sql"), "w").write("".join(data))
    print(f"Datos: {rows} filas")

    st = ["SET session_replication_role = replica;\n"]
    for e in toc:
        if e["desc"] == "TABLE DATA" and e["ns"] == "storage" and e["tag"] == "buckets":
            body = P.read_data(f, r, e, meta["compression"]).decode("utf-8")
            keep = [l for l in body.split("\n") if l and l.split("\t")[0] not in SKIP_BUCKETS]
            st.append(e["copy"] + "\n".join(keep) + "\n")
    st.append("RESET session_replication_role;\n")
    open(os.path.join(out, "03_storage.sql"), "w").write("".join(st))
    print("Listo:", out)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
