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


def main(src: str, out: str) -> None:
    f, r, meta, toc = P.open_dump(src)
    os.makedirs(out, exist_ok=True)
    print(f"Respaldo {meta['version']} servidor {meta['server']} compresión {meta['compression']}")

    schema = [
        "SET check_function_bodies = false;\nSET client_min_messages = warning;\n",
        "CREATE SCHEMA IF NOT EXISTS app_private;\n",
    ]
    for e in toc:
        if e["desc"] == "TABLE DATA" or not e["defn"]:
            continue
        keep = e["ns"] in ("public", "app_private") or (
            e["desc"] == "TRIGGER" and e["tag"] == "users on_auth_user_created"
        )
        if not keep or e["desc"] in ("PUBLICATION TABLE", "SCHEMA"):
            continue
        if any(name in (e["tag"] or "") for name in EMAIL_QUEUE_FUNCS):
            continue
        d = clean(e["defn"])
        if d:
            schema.append(d)
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
