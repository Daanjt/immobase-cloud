"""Laedt eine Datei aus dem Repo in Supabase Storage hoch (einmalige Uploads, z.B. Grundrisse).
Aufruf: python3 upload_file.py <repo-datei> <bucket>/<pfad>"""
import os, sys, json, mimetypes, urllib.request
PID = os.environ["PROJECT_ID"]; TOK = os.environ["SUPABASE_ACCESS_TOKEN"]
def api(p):
    r = urllib.request.Request("https://api.supabase.com/v1/projects/" + PID + p, headers={"Authorization": "Bearer " + TOK})
    return json.load(urllib.request.urlopen(r))
keys = api("/api-keys?reveal=true")
svc = next((k.get("api_key") for k in keys if k.get("name") == "service_role" and k.get("api_key")), None) \
   or next((k.get("api_key") for k in keys if k.get("type") == "secret" and k.get("api_key")), None)
src, dest = sys.argv[1], sys.argv[2]
ct = mimetypes.guess_type(src)[0] or "application/octet-stream"
req = urllib.request.Request(f"https://{PID}.supabase.co/storage/v1/object/{dest}", data=open(src, "rb").read(), method="POST",
    headers={"apikey": svc, "Authorization": f"Bearer {svc}", "Content-Type": ct, "x-upsert": "true"})
print(urllib.request.urlopen(req).status, dest)
