#!/usr/bin/env python3
"""Genera archivos SQL pegables en el SQL Editor de Supabase (sin COPY ni psql).

Uso:  python3 -I scripts/restore/build_editor_sql.py RESPALDO.backup CARPETA_SALIDA
Requiere: pip install zstandard

El SQL Editor no admite `COPY ... FROM stdin`, así que los datos salen como INSERT y se parten en
archivos de ~MAX_BYTES para que se puedan pegar. CARPETA_SALIDA no debe estar dentro del repo (o
debe estar ignorada por git): contiene datos reales.
"""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pgcustom as P
from build_restore import SKIP_BUCKETS, build_schema

MAX_BYTES = 600_000
ROWS_PER_INSERT = 50
HEADER = "SET session_replication_role = replica;\nSET standard_conforming_strings = on;\n"
ESC = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}


def unescape(field: str) -> str | None:
    """Decodifica un campo del formato texto de COPY. `\\N` es NULL."""
    if field == "\\N":
        return None
    out, i = [], 0
    while i < len(field):
        c = field[i]
        if c != "\\" or i + 1 >= len(field):
            out.append(c)
            i += 1
            continue
        n = field[i + 1]
        if n in ESC:
            out.append(ESC[n]); i += 2
        elif n == "x" and re.match(r"[0-9a-fA-F]{1,2}", field[i + 2 : i + 4] or ""):
            m = re.match(r"[0-9a-fA-F]{1,2}", field[i + 2 : i + 4])
            out.append(chr(int(m.group(), 16))); i += 2 + len(m.group())
        elif n in "01234567":
            m = re.match(r"[0-7]{1,3}", field[i + 1 : i + 4])
            out.append(chr(int(m.group(), 8))); i += 1 + len(m.group())
        else:
            out.append(n); i += 2
    return "".join(out)


def lit(v: str | None) -> str:
    return "NULL" if v is None else "'" + v.replace("'", "''") + "'"


def inserts(copy_stmt: str, body: str):
    """Rinde sentencias INSERT (como texto) para un bloque COPY."""
    m = re.match(r"COPY (\S+) \((.*)\) FROM stdin;", copy_stmt)
    table, cols = m.group(1), m.group(2)
    head = f"INSERT INTO {table} ({cols}) VALUES\n"
    batch = []
    n_rows = 0
    for line in body.split("\n"):
        if not line or line == "\\.":
            continue
        batch.append("(" + ", ".join(lit(unescape(x)) for x in line.split("\t")) + ")")
        n_rows += 1
        if len(batch) == ROWS_PER_INSERT:
            yield head + ",\n".join(batch) + ";\n"
            batch = []
    if batch:
        yield head + ",\n".join(batch) + ";\n"
    yield f"-- COUNT {table} {n_rows}\n"


def main(src: str, out: str) -> None:
    f, r, meta, toc = P.open_dump(src)
    os.makedirs(out, exist_ok=True)
    for old in os.listdir(out):
        if re.match(r"\d\d_.*\.sql$", old):
            os.remove(os.path.join(out, old))

    open(os.path.join(out, "00_schema.sql"), "w").write("".join(build_schema(toc)))

    def wanted(e):
        return e["desc"] == "TABLE DATA" and (
            e["ns"] == "public"
            or (e["ns"] == "auth" and e["tag"] in ("users", "identities"))
            or (e["ns"] == "storage" and e["tag"] == "buckets")
        )

    entries = sorted((e for e in toc if wanted(e)), key=lambda e: (e["ns"] != "auth", e["ns"], e["tag"]))
    counts: dict[str, int] = {}
    files: list[list[str]] = [[HEADER]]
    size = len(HEADER)
    for e in entries:
        body = P.read_data(f, r, e, meta["compression"]).decode("utf-8")
        if e["ns"] == "storage":
            body = "\n".join(l for l in body.split("\n") if l.split("\t")[0] not in SKIP_BUCKETS)
        for stmt in inserts(e["copy"], body):
            m = re.match(r"-- COUNT (\S+) (\d+)", stmt)
            if m:
                counts[m.group(1)] = int(m.group(2))
                continue
            if size + len(stmt) > MAX_BYTES and size > len(HEADER):
                files.append([HEADER]); size = len(HEADER)
            files[-1].append(stmt); size += len(stmt)
    for i, parts in enumerate(files, 1):
        open(os.path.join(out, f"{i:02d}_datos.sql"), "w").write("".join(parts))

    values = ",\n  ".join(f"('{t}', {n})" for t, n in sorted(counts.items()))
    verify = f"""-- Compara las filas cargadas con las esperadas (columna ok debe ser true en todas).
SELECT t.name AS tabla, t.esperadas,
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %s', t.name), false, true, '')))[1]::text::int AS cargadas,
  t.esperadas = (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %s', t.name), false, true, '')))[1]::text::int AS ok
FROM (VALUES
  {values}
) AS t(name, esperadas)
ORDER BY ok, t.name;
"""
    open(os.path.join(out, "99_verificar.sql"), "w").write(verify)
    total = sum(counts.values())
    print(f"{len(files)} archivos de datos, {len(counts)} tablas, {total} filas")
    for fn in sorted(os.listdir(out)):
        print(f"  {fn}: {os.path.getsize(os.path.join(out, fn)) // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
