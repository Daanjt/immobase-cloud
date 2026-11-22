// Sendet eine E-Mail via Microsoft Graph (App-only, Berechtigung Mail.Send).
// Absender: das eigene @dthomes.ch-Postfach der eingeloggten Person (Akquise-Team),
// sonst das Standardpostfach. Admins und Server duerfen ein Absender-Postfach angeben.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aufrufer, verweigert } from "../_shared/auth.ts";
import { graphConfig, graphToken, postfachFuer } from "../_shared/graph.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const wer = await aufrufer(req);
  if (!wer || !(wer.server || wer.role === "admin" || wer.role === "akquise")) return verweigert(cors);
  try {
    const { to, subject, body, cc, attachments, html, absender } = await req.json().catch(() => ({}));
    if (!to) return json({ error: "empfaenger fehlt" }, 400);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const c = await graphConfig(sb);
    if (!c) return json({ error: "not_configured" });
    const tok = await graphToken(c);
    if (!tok) return json({ error: "auth_failed" });

    const wunsch = (wer.server || wer.role === "admin") && absender ? absender : wer.email;
    const mbox = postfachFuer(c, wunsch);

    const toList = String(to).split(/[;,]/).map((x) => x.trim()).filter(Boolean).map((a) => ({ emailAddress: { address: a } }));
    const ccList = (cc ? String(cc).split(/[;,]/).map((x) => x.trim()).filter(Boolean) : []).map((a) => ({ emailAddress: { address: a } }));
    const message: any = { subject: subject || "", body: html ? { contentType: "HTML", content: html } : { contentType: "Text", content: body || "" }, toRecipients: toList };
    if (ccList.length) message.ccRecipients = ccList;

    if (Array.isArray(attachments) && attachments.length) {
      const atts: any[] = [];
      for (const a of attachments) {
        if (!a || !a.url) continue;
        try {
          const r = await fetch(a.url);
          if (!r.ok) continue;
          const buf = new Uint8Array(await r.arrayBuffer());
          let bin = ""; const CH = 0x8000;
          for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CH)) as unknown as number[]);
          atts.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name || "Anhang.pdf", contentType: a.contentType || "application/pdf", contentBytes: btoa(bin) });
        } catch (_) { /* Anhang ignorieren wenn nicht ladbar */ }
      }
      if (atts.length) message.attachments = atts;
    }

    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mbox)}/sendMail`, {
      method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    if (sendRes.status === 202) return json({ ok: true, absender: mbox });
    const err = await sendRes.text();
    return json({ error: "send_failed", absender: mbox, detail: err.slice(0, 300) });
  } catch (e) {
    return json({ error: String(e) });
  }
});
