# Laedt alle Dateien aus dem Supabase-Speicher herunter (fuer das woechentliche Datei-Backup).
# Der Service-Schluessel wird zur Laufzeit ueber die Management API geholt und nirgends gespeichert.
import json, os, sys, urllib.request, urllib.parse, concurrent.futures
ref = os.environ["PROJECT_ID"]; tok = os.environ["SUPABASE_ACCESS_TOKEN"]
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json", "User-Agent": "immobase-backup"}
def api(path, data=None):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}{path}", data=json.dumps(data).encode() if data is not None else None, method="POST" if data is not None else "GET", headers=H)
    with urllib.request.urlopen(req, timeout=300) as r: return json.loads(r.read())
keys = api("/api-keys?reveal=true")
svc = next((k.get("api_key") for k in keys if k.get("name") == "service_role" and k.get("api_key")), None) \
   or next((k.get("api_key") for k in keys if k.get("type") == "secret" and k.get("api_key")), None)
if not svc: sys.exit("Kein Service-Schluessel erhalten")
base = f"https://{ref}.supabase.co/storage/v1/object"
liste = api("/database/query", {"query": "select bucket_id b, name n, (metadata->>'size')::bigint g from storage.objects where name not like '%/.emptyFolderPlaceholder' order by 1,2"})
out = sys.argv[1] if len(sys.argv) > 1 else "dateien"
def hole(o):
    ziel = os.path.join(out, o["b"], o["n"])
    os.makedirs(os.path.dirname(ziel), exist_ok=True)
    url = f'{base}/{urllib.parse.quote(o["b"])}/{urllib.parse.quote(o["n"])}'
    req = urllib.request.Request(url, headers={"apikey": svc, "Authorization": f"Bearer {svc}"})
    for versuch in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(ziel, "wb") as f: f.write(r.read())
            return None
        except Exception as e: fehler = str(e)
    return f'{o["b"]}/{o["n"]}: {fehler}'
with concurrent.futures.ThreadPoolExecutor(8) as ex: fehler = [x for x in ex.map(hole, liste) if x]
json.dump({"anzahl": len(liste), "fehler": fehler}, open(os.path.join(out, "_info.json"), "w"), indent=1)
print(f"{len(liste) - len(fehler)} von {len(liste)} Dateien geladen, {len(fehler)} Fehler")
for f in fehler[:20]: print("  ", f)
if len(fehler) > max(5, len(liste) // 50): sys.exit("Zu viele Fehler beim Herunterladen")
