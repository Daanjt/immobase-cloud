// Passwort-Tresor: Wiederherstellung per E-Mail.
// Der Datenschluessel des Tresors wird zusaetzlich serverseitig hinterlegt (verschluesselt mit einem
// aus dem Service-Role-Key abgeleiteten Schluessel) und nur nach Bestaetigung eines per E-Mail
// versandten Codes an einen eingeloggten Admin herausgegeben.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "D&T Homes <noreply@dthomes.ch>";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const enc = new TextEncoder();
const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u)));
const ub64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function escrowKey() {
  const base = await crypto.subtle.importKey("raw", enc.encode(SERVICE_KEY), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("dthomes-pw-tresor-escrow-v1"), info: enc.encode("escrow") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function sha(s: string) { return b64(await crypto.subtle.digest("SHA-256", enc.encode(s))); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    const email = u?.user?.email?.toLowerCase();
    if (!email) return json({ error: "Nicht angemeldet." }, 401);
    const { data: au } = await sb.from("allowed_users").select("role").ilike("email", email).maybeSingle();
    if (!au || au.role !== "admin") return json({ error: "Keine Berechtigung." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "escrow") {
      const raw = ub64(String(body.dek || ""));
      if (raw.length !== 32) return json({ error: "Ungültiger Schlüssel." }, 400);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await escrowKey(), raw);
      const { error } = await sb.from("passwort_tresor_escrow").upsert({ id: 1, escrow_wrapped: b64(iv) + ":" + b64(ct), updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "request") {
      const { data: row } = await sb.from("passwort_tresor_escrow").select("escrow_wrapped").eq("id", 1).maybeSingle();
      if (!row?.escrow_wrapped) return json({ error: "Für diesen Tresor ist keine E-Mail-Wiederherstellung hinterlegt. Bitte den Wiederherstellungsschlüssel verwenden." }, 400);
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const exp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await sb.from("passwort_tresor_escrow").update({ code_hash: await sha(code + "|" + email), code_email: email, code_exp: exp, code_tries: 0, updated_at: new Date().toISOString() }).eq("id", 1);
      const html = `<div style="font-family:Aptos,Segoe UI,Arial,sans-serif;font-size:14px;color:#2a2620">
<p>Hallo</p><p>Für den Passwort-Tresor in ImmoBase wurde eine Wiederherstellung angefordert. Dein Code:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700;font-family:monospace">${code}</p>
<p>Der Code ist 15 Minuten gültig. Falls du das nicht warst, ignoriere diese E-Mail und informiere Martijn bzw. Daan.</p>
<p style="color:#8a8174;font-size:12px">D&amp;T Homes · ImmoBase</p></div>`;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject: "ImmoBase: Code zur Wiederherstellung des Passwort-Tresors", html }),
      });
      if (!r.ok) throw new Error("E-Mail konnte nicht gesendet werden: " + (await r.text()).slice(0, 200));
      return json({ ok: true, email });
    }

    if (action === "verify") {
      const { data: row } = await sb.from("passwort_tresor_escrow").select("*").eq("id", 1).maybeSingle();
      if (!row?.code_hash || !row.code_exp) return json({ error: "Kein Code angefordert." }, 400);
      if (new Date(row.code_exp).getTime() < Date.now()) return json({ error: "Der Code ist abgelaufen. Bitte neu anfordern." }, 400);
      if ((row.code_tries || 0) >= 5) return json({ error: "Zu viele Versuche. Bitte neuen Code anfordern." }, 429);
      if (row.code_email !== email || (await sha(String(body.code || "").trim() + "|" + email)) !== row.code_hash) {
        await sb.from("passwort_tresor_escrow").update({ code_tries: (row.code_tries || 0) + 1 }).eq("id", 1);
        return json({ error: "Code falsch." }, 400);
      }
      await sb.from("passwort_tresor_escrow").update({ code_hash: null, code_exp: null, code_tries: 0 }).eq("id", 1);
      const [iv, ct] = String(row.escrow_wrapped).split(":");
      const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub64(iv) }, await escrowKey(), ub64(ct));
      return json({ ok: true, dek: b64(raw) });
    }

    return json({ error: "Unbekannte Aktion." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
