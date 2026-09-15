import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const nowIso = new Date().toISOString();
  const { data: due } = await sb.from("scheduled_mails").select("*").eq("status", "pending").lte("send_at", nowIso).order("send_at").limit(50);
  if (!due || !due.length) return json({ sent: 0, total: 0 });

  const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
  const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
  if (!c.graph_tenant_id || !c.graph_client_id || !c.graph_client_secret || !c.graph_mailbox) return json({ error: "graph config missing" }, 500);

  const tokRes = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const tok = (await tokRes.json()).access_token;
  if (!tok) return json({ error: "no token" }, 500);

  let sent = 0;
  for (const m of due) {
    try {
      // Catch-up: nur senden, wenn keine Antwort seit reply_check_after
      if (m.is_followup && m.reply_check_after) {
        try {
          const flt = `from/emailAddress/address eq '${(m.to_addr||"").replace(/'/g,"''")}' and receivedDateTime ge ${new Date(m.reply_check_after).toISOString()}`;
          const rr = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}/messages?$filter=${encodeURIComponent(flt)}&$top=1&$select=id`, { headers: { Authorization: `Bearer ${tok}` } });
          const rj = await rr.json();
          if (rj && Array.isArray(rj.value) && rj.value.length > 0) {
            await sb.from("scheduled_mails").update({ status: "skipped_reply" }).eq("id", m.id);
            continue;
          }
        } catch (_) { /* bei Fehler trotzdem senden */ }
      }
      const message: any = {
        subject: m.subject || "",
        body: m.html ? { contentType: "HTML", content: m.html } : { contentType: "Text", content: m.body || "" },
        toRecipients: [{ emailAddress: { address: m.to_addr } }],
      };
      const atts: any[] = [];
      const attachments = Array.isArray(m.attachments) ? m.attachments : [];
      for (const a of attachments) {
        if (!a || !a.url) continue;
        try {
          const r = await fetch(a.url); if (!r.ok) continue;
          const buf = new Uint8Array(await r.arrayBuffer());
          let bin = ""; const CH = 0x8000;
          for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CH)) as unknown as number[]);
          atts.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name || "Anhang.pdf", contentType: a.contentType || "application/pdf", contentBytes: btoa(bin) });
        } catch (_) { /* skip */ }
      }
      if (atts.length) message.attachments = atts;

      const sr = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}/sendMail`, {
        method: "POST", headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message, saveToSentItems: true }),
      });
      if (sr.status === 202) {
        await sb.from("scheduled_mails").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", m.id);
        sent++;
      } else {
        const t = await sr.text();
        await sb.from("scheduled_mails").update({ status: "error", error: ("HTTP " + sr.status + " " + t).slice(0, 500) }).eq("id", m.id);
      }
    } catch (e) {
      await sb.from("scheduled_mails").update({ status: "error", error: String(e).slice(0, 500) }).eq("id", m.id);
    }
  }
  return json({ sent, total: due.length });
});
