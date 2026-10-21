// ============================================================
// Supabase Edge Function: contact-message
// D&T Partners GmbH / D&T Homes
//
// Nimmt eine Nachricht vom Kontaktformular der Webseite entgegen
// und sendet sie per Resend an info@dthomes.ch. Antwort-an ist die
// E-Mail des Absenders, damit direkt geantwortet werden kann.
// ============================================================
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim().slice(0, 120);
    const email = String(body.email ?? "").trim().slice(0, 160);
    const message = String(body.message ?? "").trim().slice(0, 5000);
    // simple honeypot: if a 'company' field is filled, silently accept (bot)
    if (body.company) return json({ ok: true });
    if (!name || !email || !message) return json({ error: "Bitte alle Felder ausfüllen." }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "Ungültige E-Mail-Adresse." }, 400);

    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f7f3eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1814;line-height:1.55;"><div style="max-width:560px;margin:0 auto;padding:30px 24px;"><div style="background:#fff;border:1px solid #e1d8c5;border-radius:14px;padding:28px 26px;"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a8174;margin:0 0 14px;font-weight:600;">Neue Nachricht &middot; Kontaktformular</p><table style="font-size:14px;border-collapse:collapse;width:100%;"><tr><td style="padding:6px 0;color:#8a8174;width:90px;vertical-align:top;">Name</td><td style="padding:6px 0;color:#1a1814;">${esc(name)}</td></tr><tr><td style="padding:6px 0;color:#8a8174;vertical-align:top;">E-Mail</td><td style="padding:6px 0;color:#1a1814;"><a href="mailto:${esc(email)}" style="color:#1a1814;">${esc(email)}</a></td></tr></table><div style="margin-top:18px;padding-top:16px;border-top:1px solid #f0eadd;"><div style="font-size:12px;color:#8a8174;margin-bottom:8px;">Nachricht</div><div style="font-size:14.5px;color:#1a1814;white-space:pre-wrap;">${esc(message)}</div></div></div><div style="text-align:center;margin-top:18px;font-size:11.5px;color:#8a8174;">Direkt antworten geht per Antworten auf diese E-Mail.</div></div></body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "D&T Homes Web <noreply@dthomes.ch>",
        to: ["info@dthomes.ch"],
        reply_to: email,
        subject: `Neue Nachricht über das Kontaktformular – ${name}`,
        html,
      }),
    });
    if (!res.ok) { const t = await res.text(); return json({ error: `Versand fehlgeschlagen: ${res.status} ${t}` }, 502); }
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
