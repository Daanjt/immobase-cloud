// mieter-dokumente: Mieter/Bewerber laden nach der Vertragsunterschrift
// Betreibungsregister-Auszug und Pass/Ausweis hoch (nur ganze Wohnungen).
// Zugang nur mit dem persoenlichen Vertrags-Token. Ablage im privaten Bucket
// "documents" und in der Tabelle documents beim Bewerber bzw. Mieter.
//   GET  ?token=...            -> Status
//   POST multipart: token, art (betreibung|ausweis), file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-token",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

export const KAT = { betreibung: "Betreibungsregister-Auszug", ausweis: "Pass / Ausweis" } as const;
const ERLAUBT = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];
const MAX = 15 * 1024 * 1024;

function sanitize(s: string) {
  return (s || "").replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

async function ladeVertrag(sb: any, token: string) {
  if (!/^[a-f0-9]{32}$/.test(token || "")) return null;
  const { data: c } = await sb.from("contracts").select("id, token, status, contract_type, contract_data, apt_id, tenant_id, bewerber_id, mieter_vorname, mieter_nachname")
    .eq("token", token).maybeSingle();
  if (!c) return null;
  let wohnung = (c.contract_data && c.contract_data.vertragsart === "wohnung");
  if (!wohnung && c.apt_id) {
    const { data: a } = await sb.from("apartments").select("vermietungsart").eq("id", c.apt_id).maybeSingle();
    wohnung = !!a && a.vermietungsart === "wohnung";
  }
  const entity = c.tenant_id ? { type: "tenant", id: String(c.tenant_id) } : (c.bewerber_id ? { type: "applicant", id: String(c.bewerber_id) } : null);
  return { c, wohnung, entity };
}

async function status(sb: any, entity: { type: string; id: string }) {
  const { data } = await sb.from("documents").select("category, filename, uploaded_at")
    .eq("entity_type", entity.type).eq("entity_id", entity.id).in("category", [KAT.betreibung, KAT.ausweis]);
  const l = data || [];
  return {
    betreibung: l.filter((d: any) => d.category === KAT.betreibung).length,
    ausweis: l.filter((d: any) => d.category === KAT.ausweis).length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token") || "";
      const v = await ladeVertrag(sb, token);
      if (!v) return json({ error: "Ungueltiger Link" }, 404);
      if (!v.wohnung || !v.entity || ["zurueckgezogen", "storniert"].includes(v.c.status)) return json({ benoetigt: false });
      return json({ benoetigt: true, vorname: v.c.mieter_vorname || "", ...(await status(sb, v.entity)) });
    }
    if (req.method !== "POST") return json({ error: "Methode nicht erlaubt" }, 405);
    const fd = await req.formData();
    const token = String(fd.get("token") || "");
    const art = String(fd.get("art") || "") as keyof typeof KAT;
    const file = fd.get("file");
    const v = await ladeVertrag(sb, token);
    if (!v) return json({ error: "Ungueltiger Link" }, 404);
    if (!v.wohnung || !v.entity || ["zurueckgezogen", "storniert"].includes(v.c.status)) return json({ error: "Fuer diesen Vertrag sind keine Dokumente noetig." }, 400);
    if (!(art in KAT)) return json({ error: "Unbekannte Dokumentart" }, 400);
    if (!(file instanceof File)) return json({ error: "Keine Datei" }, 400);
    if (file.size > MAX) return json({ error: "Datei zu gross (max. 15 MB)" }, 400);
    const typ = (file.type || "").toLowerCase();
    if (!ERLAUBT.includes(typ)) return json({ error: "Bitte ein PDF oder Foto (JPG, PNG, HEIC) hochladen." }, 400);

    const kat = KAT[art];
    const ext = (file.name.split(".").pop() || (typ === "application/pdf" ? "pdf" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "pdf";
    const base = `${sanitize(v.c.mieter_nachname)}_${sanitize(v.c.mieter_vorname)}_${sanitize(kat)}`;
    const { data: vorhanden } = await sb.from("documents").select("filename").eq("entity_type", v.entity.type).eq("entity_id", v.entity.id);
    const namen = new Set((vorhanden || []).map((d: any) => String(d.filename).toLowerCase()));
    let name = `${base}.${ext}`, i = 2;
    while (namen.has(name.toLowerCase())) name = `${base}_${i++}.${ext}`;
    const pfad = `${v.entity.type}/${v.entity.id}/${Date.now()}_${name}`;
    const { error: upErr } = await sb.storage.from("documents").upload(pfad, file, { contentType: typ, upsert: false });
    if (upErr) return json({ error: "Upload fehlgeschlagen: " + upErr.message }, 500);
    const { error: insErr } = await sb.from("documents").insert([{
      entity_type: v.entity.type, entity_id: v.entity.id, category: kat, filename: name,
      storage_path: pfad, file_size: file.size, mime_type: typ, uploaded_by: "Mieter-Upload (Vertragslink)",
    }]);
    if (insErr) { await sb.storage.from("documents").remove([pfad]); return json({ error: "Speichern fehlgeschlagen" }, 500); }
    return json({ ok: true, ...(await status(sb, v.entity)) });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
