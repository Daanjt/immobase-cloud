import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const strip = (h: string) => (h || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { deal_id } = await req.json().catch(() => ({}));
    if (!deal_id) return json({ error: "deal_id fehlt" }, 400);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox", "anthropic_api_key", "anthropic_model"]);
    const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
    if (!c.anthropic_api_key) return json({ error: "not_configured", hint: "anthropic_api_key fehlt in app_config" }, 400);

    const { data: deal } = await sb.from("pipeline").select("*").eq("id", deal_id).maybeSingle();
    if (!deal || !deal.contact_email) return json({ error: "kein Kontakt beim Deal" }, 400);

    // Graph-Token + letzte eingehende Nachricht der Ansprechperson
    const tokRes = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
    const tok = (await tokRes.json()).access_token;
    let incoming = "";
    if (tok) {
      const flt = `from/emailAddress/address eq '${(deal.contact_email || "").replace(/'/g, "''")}'`;
      const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}/messages?$filter=${encodeURIComponent(flt)}&$orderby=receivedDateTime desc&$top=1&$select=subject,body,bodyPreview`, { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json();
      const m = j && Array.isArray(j.value) ? j.value[0] : null;
      if (m) incoming = strip((m.body && m.body.content) || m.bodyPreview || "");
    }
    if (!incoming) return json({ error: "keine eingegangene Nachricht gefunden" }, 404);

    const vorname = (deal.contact_name || "").trim().split(" ")[0] || "";
    const adr = [deal.strasse, [deal.plz, deal.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const sys = "Du bist Daan Theijse von D&T Homes in Zürich. D&T Homes mietet möblierte und unmöblierte Wohnungen von Verwaltungen und Eigentümern zu marktüblichen Konditionen an und vermietet sie möbliert an Studierende und Young Professionals weiter. Nutzen für die Verwaltung: ein zuverlässiger Vertragspartner, planbare Mieteinnahmen, kein Leerstand, und D&T übernimmt Vermarktung, Mieterbetreuung und Rückgabe. Du schreibst professionell, freundlich, per Du (Schweizer Stil), knapp und konkret. Kein Em-Dash, Schweizer ss statt ß. Schreibe nur den Mailtext, ohne Betreff, ohne Signatur, ohne Anrede-Erklärungen.";
    const usr = `Kontext: Anfrage zur Wohnung ${adr || "(Adresse unbekannt)"}, Verwaltung ${deal.agency_name || "unbekannt"}, Ansprechperson ${deal.contact_name || "unbekannt"}.\n\nDie Ansprechperson hat uns geantwortet:\n"""\n${incoming.slice(0, 4000)}\n"""\n\nSchreibe einen passenden, konkreten Antwort-Entwurf auf diese Nachricht. Beginne mit "Guten Tag ${deal.contact_name || ""},". Gehe auf die Punkte der Person ein, beantworte Fragen so gut wie möglich aus D&T-Sicht, und schlage bei Bedarf einen nächsten Schritt vor (z. B. Vertrag zusenden, kurzes Telefonat, Besichtigung). Halte es kurz.`;

    const aRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": c.anthropic_api_key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: c.anthropic_model || "claude-sonnet-4-5", max_tokens: 700, system: sys, messages: [{ role: "user", content: usr }] }),
    });
    const aj = await aRes.json();
    if (!aRes.ok) return json({ error: "anthropic_error", detail: aj }, 502);
    const draft = (aj.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim();
    return json({ draft, incoming: incoming.slice(0, 4000) });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
