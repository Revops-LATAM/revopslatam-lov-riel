"""Lector mínimo de dumps PostgreSQL formato custom (1.16, zstd/gzip/none)."""
import io, struct, sys, zlib
import zstandard

class R:
    def __init__(s, f): s.f = f; s.int_size = 4; s.off_size = 8
    def b(s): return s.f.read(1)[0]
    def int(s):
        sign = s.b(); v = 0
        for i in range(s.int_size): v |= s.b() << (8 * i)
        return -v if sign else v
    def str(s):
        n = s.int()
        return None if n < 0 else s.f.read(n).decode("utf-8", "replace")
    def off(s):
        flag = s.b(); v = int.from_bytes(s.f.read(s.off_size), "little"); return flag, v

def open_dump(path):
    f = open(path, "rb"); r = R(f)
    assert f.read(5) == b"PGDMP"
    vmaj, vmin, vrev = r.b(), r.b(), r.b()
    r.int_size, r.off_size, fmt = r.b(), r.b(), r.b()
    assert fmt == 1, "no es formato custom"
    comp = r.b() if (vmaj, vmin) >= (1, 15) else r.int()
    for _ in range(7): r.int()  # fecha
    meta = dict(version=(vmaj, vmin, vrev), compression=comp, db=r.str(), server=r.str(), pgdump=r.str())
    n = r.int(); toc = []
    for _ in range(n):
        e = {}
        e["id"] = r.int(); e["had_dumper"] = r.int()
        e["tableoid"] = r.str(); e["oid"] = r.str(); e["tag"] = r.str(); e["desc"] = r.str()
        e["section"] = r.int(); e["defn"] = r.str(); e["drop"] = r.str(); e["copy"] = r.str()
        e["ns"] = r.str(); e["tablespace"] = r.str(); e["tableam"] = r.str()
        e["relkind"] = r.int() if (vmaj, vmin) >= (1, 16) else None
        e["owner"] = r.str(); r.str()  # with_oids
        deps = []
        while True:
            d = r.str()
            if d is None: break
            deps.append(d)
        e["deps"] = deps
        e["flag"], e["offset"] = r.off()
        toc.append(e)
    return f, r, meta, toc

def read_data(f, r, e, comp):
    f.seek(e["offset"]); blk = r.b(); did = r.int()
    assert blk == 1 and did == e["id"], (blk, did, e["id"])
    chunks = []
    while True:
        n = r.int()
        if n == 0: break
        chunks.append(f.read(n))
    raw = b"".join(chunks)
    if comp == 3: return zstandard.ZstdDecompressor().stream_reader(io.BytesIO(raw)).read()
    if comp == 1: return zlib.decompress(raw)
    return raw
