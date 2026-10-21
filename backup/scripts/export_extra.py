# Ergaenzt das naechtliche Datenbank-Backup um:
#  - schema.sql: Tabellenstruktur, Constraints, Indizes, Funktionen, Trigger, RLS, Policies, Rechte, Buckets, Cron-Jobs
#  - _edge_functions.json: Liste der bereitgestellten Server-Funktionen (Version, verify_jwt)
#  - _secrets_namen.json: Namen der Server-Secrets (ohne Werte)
#  - _dateien.json: Verzeichnis aller Dateien im Speicher (Pfad, Groesse, Datum)
import json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from schema_queries import QUERIES
ref = os.environ["PROJECT_ID"]; tok = os.environ["SUPABASE_ACCESS_TOKEN"]
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json", "User-Agent": "immobase-backup"}
def api(path, data=None):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}{path}", data=json.dumps(data).encode() if data is not None else None, method="POST" if data is not None else "GET", headers=H)
    with urllib.request.urlopen(req, timeout=300) as r: return json.loads(r.read())
def q(sql): return api("/database/query", {"query": sql})
out = sys.argv[1] if len(sys.argv) > 1 else "dump"
os.makedirs(out, exist_ok=True)
teile = ["-- ImmoBase Struktur-Export (automatisch). Wiederherstellung in ein frisches Supabase-Projekt:",
         "-- psql <verbindung> -f schema.sql, danach die Daten aus den JSON-Dateien einspielen.", ""]
for titel, sql in QUERIES:
    try:
        rows = q(sql)
        teile.append(f"-- ===== {titel} ({len(rows)}) =====")
        teile += [r["s"] for r in rows]
    except Exception as e:
        teile.append(f"-- ===== {titel}: FEHLER beim Export: {e} =====")
    teile.append("")
open(f"{out}/schema.sql", "w").write("\n".join(teile))
try:
    fns = api("/functions")
    json.dump([{k: f.get(k) for k in ("slug", "version", "verify_jwt", "updated_at", "entrypoint_path")} for f in fns], open(f"{out}/_edge_functions.json", "w"), indent=1)
except Exception as e: print("Edge-Functions-Liste fehlgeschlagen:", e)
try:
    sec = api("/secrets")
    json.dump(sorted(s.get("name") for s in sec), open(f"{out}/_secrets_namen.json", "w"), indent=1)
except Exception as e: print("Secret-Namen fehlgeschlagen:", e)
dateien = q("select bucket_id b, name n, (metadata->>'size')::bigint g, metadata->>'eTag' e, updated_at::text u from storage.objects order by 1,2")
json.dump(dateien, open(f"{out}/_dateien.json", "w"))
print(f"schema.sql {sum(len(t) for t in teile)} Zeichen, {len(dateien)} Dateien im Verzeichnis")
