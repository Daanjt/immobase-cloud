// Leitet eine Schadenmeldung aus dem Mieterportal per E-Mail an die Ansprechperson der Liegenschaft weiter.
// Aufruf nur aus ImmoBase (Admin). Text und Empfänger kommen aus dem Dialog in ImmoBase,
// die Fotos der Meldung werden als Anhang mitgeschickt. Antworten gehen an info@, Daan in BCC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istAdminOderServer, verweigert } from "../_shared/auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FROM_EMAIL = "D&T Homes <noreply@dthomes.ch>";
const REPLY_TO = "info@dthomes.ch";
const BCC = "daan.theijse@dthomes.ch";
const MAX_ANHANG = 30 * 1024 * 1024;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

function b64(bytes: Uint8Array) {
  let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as unknown as number[]);
  return btoa(bin);
}
// Jede Zeile als eigenes <div>, Leerzeilen als <div><br></div> (wie eine normale Outlook-Mail)
function textZuHtml(text: string) {
  const zeilen = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const inner = zeilen.map((z) => z.trim() === "" ? "<div><br></div>" : `<div>${esc(z).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</div>`).join("\n");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;color:#1a1814;">${inner}</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await istAdminOderServer(req))) return verweigert(CORS);
  try {
    const b = await req.json().catch(() => ({}));
    const an = String(b.an || "").split(/[;,]/).map((x: string) => x.trim()).filter(Boolean);
    const cc = String(b.cc || "").split(/[;,]/).map((x: string) => x.trim()).filter(Boolean);
    if (!an.length || !an.every(emailOk) || !cc.every(emailOk)) return json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
    if (!String(b.text || "").trim()) return json({ error: "Der Text ist leer." }, 400);
    const { data: s } = await sb.from("schadenmeldungen").select("id, status, fotos").eq("id", b.id).maybeSingle();
    if (!s) return json({ error: "Meldung nicht gefunden." }, 404);

    const anhaenge: any[] = [];
    let gesamt = 0, ausgelassen = 0;
    if (b.fotos !== false) {
      for (const [i, pfad] of ((s.fotos || []) as string[]).entries()) {
        const { data: blob } = await sb.storage.from("documents").download(pfad);
        if (!blob) { ausgelassen++; continue; }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (gesamt + bytes.length > MAX_ANHANG) { ausgelassen++; continue; }
        gesamt += bytes.length;
        const ext = (pfad.split(".").pop() || "jpg").toLowerCase();
        anhaenge.push({ filename: `Foto_${i + 1}.${ext}`, content: b64(bytes), content_type: blob.type || "image/jpeg" });
      }
    }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL, to: an, ...(cc.length ? { cc } : {}), bcc: [BCC], reply_to: REPLY_TO,
        subject: String(b.betreff || "Schadenmeldung").slice(0, 200), html: textZuHtml(b.text), text: String(b.text),
        attachments: anhaenge,
      }),
    });
    if (!r.ok) return json({ error: "Versand fehlgeschlagen: " + (await r.text()).slice(0, 200) }, 502);
    const upd: Record<string, unknown> = { weitergeleitet_an: an.join(", "), weitergeleitet_at: new Date().toISOString() };
    if (s.status === "neu") upd.status = "in_arbeit";
    await sb.from("schadenmeldungen").update(upd).eq("id", s.id);
    return json({ ok: true, fotos: anhaenge.length, ausgelassen });
  } catch (e) {
    console.error("schaden-weiterleiten", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
