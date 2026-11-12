// wgzimmer-import: holt wgzimmer.ch Kontaktanfragen aus dem Outlook-Postfach (Graph, App-only)
// und legt sie als Bewerber (quelle = wgzimmer) an. Laeuft per pg_cron alle 10 Minuten.
// Zusaetzlich: weegee.ch-Nachrichten (info@weegee.ch, "Neue Nachricht fuer dein weegee.ch-Inserat"), quelle = weegee.
// - Dedupe ueber internetMessageId (wg_import_log) und E-Mail-Adresse (applicants)
// - Inserat -> Zimmer ueber Tabelle wg_inserate (erste 8 Zeichen der Inserat-ID)
// - owner bleibt leer: der Name erscheint erst, wenn jemand dem Lead schreibt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

function htmlToText(h: string): string {
  return h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parse(html: string) {
  const t = htmlToText(html);
  const link = (html.match(/https:\/\/www\.wgzimmer\.ch\/wglink\/[a-z]{2}\/([0-9a-f-]{36})[^"'\s<]*/i) || []);
  const inseratId = link[1] || "";
  const inseratUrl = link[0] || "";
  // Kontaktblock: nach "Kontakt Angaben" / "contact details" bis zur Leerzeile
  let block = "";
  const kb = t.match(/(?:Kontakt Angaben des Senders|contact details of the sender|Coordonn[ée]es de l.exp[ée]diteur|dati di contatto)[^\n]*\n([\s\S]*?)\n\s*\n/i);
  if (kb) block = kb[1];
  const lines = block.split("\n").map((s) => s.trim()).filter(Boolean);
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  let email = (lines.find((l) => emailRe.test(l)) || "").match(emailRe)?.[0] || "";
  if (!email) {
    const all = t.match(new RegExp(emailRe.source, "gi")) || [];
    email = all.find((e) => !/wgzimmer\.ch$/i.test(e)) || "";
  }
  const name = lines[0] && !emailRe.test(lines[0]) ? lines[0] : "";
  const phone = lines.find((l) => !emailRe.test(l) && l !== name && /^[+0-9 ()\/.-]{6,}$/.test(l)) || "";
  const nm = t.match(/(?:\nNachricht|\nMessage|\nMessaggio)\s*\n([\s\S]*?)\n\s*(?:Um die Person zu kontaktieren|To contact|Pour contacter|Per contattare)/i);
  const nachricht = nm ? nm[1].trim() : "";
  return { inseratId, inseratUrl, email: email.toLowerCase(), name, phone, nachricht };
}

// weegee.ch: "Um die Person zu kontaktieren ... Oder schreibe direkt an x@y.", Nachricht zwischen den <hr>
function parseWeegee(html: string, subject: string) {
  const t = htmlToText(html.replace(/<hr\s*\/?>/gi, "\n@@HR@@\n"));
  const link = html.match(/https:\/\/weegee\.ch\/[a-z]{2}\/wg\/[^"'\s<]*\/([A-Za-z0-9._-]+)/i) || [];
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const dm = t.match(/schreibe direkt an\s+([^\s]+@[^\s]+?)\.?\s*$/im) || t.match(/write directly to\s+([^\s]+@[^\s]+?)\.?\s*$/im);
  let email = dm ? dm[1] : "";
  if (!email) email = ((t.match(new RegExp(emailRe.source, "gi")) || []).find((e) => !/weegee\.ch$/i.test(e)) || "");
  const teile = t.split("@@HR@@");
  const nachricht = teile.length >= 3 ? teile[1].trim() : "";
  const phone = (nachricht.match(/(?:\+|00)\d[\d \/.-]{7,}\d|\b0\d{2}[ \/.-]?\d{3}[ \/.-]?\d{2}[ \/.-]?\d{2}\b/) || [""])[0];
  const adr = (subject.match(/Inserat\s*[–-]\s*(.+)$/) || [])[1] || "";
  return { inseratId: link[1] || "", inseratUrl: link[0] || "", email: email.toLowerCase(), name: "", phone, nachricht, adresse: adr.trim() };
}

// Schweizer Nummern einheitlich: +41 78 778 16 66
function telFormat(t: string): string {
  const d = (t || "").replace(/[^\d+]/g, "");
  let n = "";
  if (/^\+41\d{9}$/.test(d)) n = d.slice(3);
  else if (/^0041\d{9}$/.test(d)) n = d.slice(4);
  else if (/^0\d{9}$/.test(d)) n = d.slice(1);
  if (!n) return (t || "").trim();
  return `+41 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
}

async function aiAuswertung(p: { name: string; phone: string; nachricht: string; email?: string; plattform?: string }) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  const prompt = `Du verarbeitest eine Anfrage auf ein WG-Zimmer-Inserat (${p.plattform || "wgzimmer.ch"}) fuer D&T Homes in Zuerich.
Absendername: ${p.name || "-"}
E-Mail: ${p.email || "-"} (wenn kein Name bekannt ist, Vor- und Nachname wenn moeglich aus Nachricht oder E-Mail-Adresse ableiten)
Telefon (roh): ${p.phone || "-"}
Nachricht:
"""${p.nachricht.slice(0, 4000)}"""

Antworte NUR mit einem JSON-Objekt:
{"interessent": true wenn die Person selbst ein Zimmer sucht, false bei Werbung, Plattform-/Geschaeftsanfragen oder Spam, "vorname": "...", "nachname": "... oder leer", "sprache": "de" oder "en" (de nur wenn die Nachricht auf Deutsch ist, sonst en), "telefon": "internationales Format mit Leerzeichen, z.B. +41 77 966 40 73 (Schweizer Mobilnummern immer +41 7X XXX XX XX); Schweizer Nummern ohne Vorwahl mit +41; leer wenn keine", "einzug": "YYYY-MM-DD wenn ein konkretes Einzugsdatum genannt ist, sonst leer", "notiz": "1 bis 3 kurze Saetze auf Deutsch: wer die Person ist (Alter, Herkunft, Studium/Beruf), Einzug/Dauer, Wuensche wie Besichtigung. Keine Gedankenstriche, keine Anrede."}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    const txt = (d.content || []).map((c: any) => c.text || "").join("");
    const m = txt.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (_) { return null; }
}

// Nur mit Service-Role-Key aufrufbar (pg_cron). verify_jwt = true prueft die Signatur.
function istServiceRole(req: Request): boolean {
  try {
    const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const pl = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return pl.role === "service_role";
  } catch (_) { return false; }
}

Deno.serve(async (req) => {
  if (!istServiceRole(req)) return json({ error: "forbidden" }, 403);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const tage = Math.min(30, Math.max(1, +body.tage || 2));
  const dryRun = !!body.dryRun;

  const { data: cfg } = await sb.from("app_config").select("key,value").in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
  const c: Record<string, string> = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
  if (!c.graph_tenant_id || !c.graph_mailbox) return json({ error: "graph config missing" }, 500);
  const tokRes = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const tok = (await tokRes.json()).access_token;
  if (!tok) return json({ error: "no token" }, 500);

  const since = new Date(Date.now() - tage * 86400000).toISOString();
  const flt = encodeURIComponent(`from/emailAddress/address eq 'no-reply@wgzimmer.ch' and receivedDateTime ge ${since}`);
  let url: string | null = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}/messages?$filter=${flt}&$select=id,subject,receivedDateTime,body,internetMessageId&$top=50`;
  const msgs: any[] = [];
  // Graph liefert ab und zu kurzzeitig 429/5xx ohne Meldung: bis zu 3 Versuche, bevor es als Fehler gilt
  const graphGet = async (u: string) => {
    let r: Response = new Response(null, { status: 599 }); let d: any = {};
    for (let i = 0; i < 3; i++) {
      r = await fetch(u, { headers: { Authorization: `Bearer ${tok}` } });
      d = await r.json().catch(() => ({}));
      if (r.ok || (r.status !== 429 && r.status < 500)) break;
      await new Promise((ok) => setTimeout(ok, 2000 * (i + 1)));
    }
    return { r, d };
  };
  while (url && msgs.length < 300) {
    const { r, d } = await graphGet(url);
    if (!r.ok) return json({ error: "graph_failed", status: r.status, detail: d?.error?.message || d?.error?.code || "" }, 500);
    msgs.push(...(d.value || []));
    url = d["@odata.nextLink"] || null;
  }
  for (const m of msgs) m._q = "wgzimmer";
  const flt2 = encodeURIComponent(`from/emailAddress/address eq 'info@weegee.ch' and receivedDateTime ge ${since}`);
  let url2: string | null = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.graph_mailbox)}/messages?$filter=${flt2}&$select=id,subject,receivedDateTime,body,internetMessageId&$top=50`;
  while (url2 && msgs.length < 400) {
    const { r, d } = await graphGet(url2);
    if (!r.ok) break;
    for (const m of (d.value || [])) { m._q = "weegee"; msgs.push(m); }
    url2 = d["@odata.nextLink"] || null;
  }
  const anfragen = msgs.filter((m) => m._q === "weegee" ? /Neue Nachricht|new message/i.test(m.subject || "") : /Kontaktanfrage|contact request/i.test(m.subject || ""))
    .sort((a, b) => String(a.receivedDateTime).localeCompare(String(b.receivedDateTime)));

  const { data: inserate } = await sb.from("wg_inserate").select("inserat_prefix,zimmer_id,bezeichnung");
  const result: any[] = [];

  for (const m of anfragen) {
    const mid = m.internetMessageId || m.id;
    const { data: done } = await sb.from("wg_import_log").select("message_id").eq("message_id", mid).maybeSingle();
    if (done) continue;
    const q: string = m._q;
    const plattform = q === "weegee" ? "weegee.ch" : "wgzimmer.ch";
    const p: any = q === "weegee" ? parseWeegee(m.body?.content || "", m.subject || "") : parse(m.body?.content || "");
    const ins = (inserate || []).find((i: any) => p.inseratId && (q === "weegee" ? i.inserat_prefix === "weegee:" + p.inseratId : p.inseratId.startsWith(i.inserat_prefix)));
    const zimmer = ins?.zimmer_id || null;
    const bez = ins?.bezeichnung || (q === "weegee" && p.adresse ? p.adresse : (p.inseratId ? `unbekanntes Inserat ${p.inseratId.slice(0, 8)}` : "Inserat unbekannt"));
    const log = async (ergebnis: string, applicant_id: string | null = null) => {
      result.push({ subject: m.subject, email: p.email, ergebnis, zimmer });
      if (!dryRun) await sb.from("wg_import_log").insert({ message_id: mid, received_at: m.receivedDateTime, email: p.email, applicant_id, ergebnis });
    };
    if (!p.email) { await log("keine E-Mail gefunden"); continue; }

    // Bereits als Bewerber vorhanden? Dann nur Hinweis anhaengen.
    const { data: vorh } = await sb.from("applicants").select("id,notiz,zimmer_wunsch").ilike("email", p.email).order("created_at", { ascending: false }).limit(1);
    if (vorh && vorh.length) {
      const a = vorh[0];
      const datum = new Date(m.receivedDateTime).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" });
      const zusatz = `Weitere ${q}-Anfrage am ${datum} (${bez}).`;
      // Nur vermerken, wenn die Anfrage ein anderes Inserat betrifft als der bestehende Eintrag
      const anderesInserat = (zimmer || "") !== (a.zimmer_wunsch || "") && !(a.notiz || "").includes(bez);
      if (!dryRun && anderesInserat) {
        await sb.from("applicants").update({ notiz: [a.notiz, zusatz].filter(Boolean).join("\n") }).eq("id", a.id);
      }
      await log("duplikat", a.id);
      continue;
    }

    // Gleiche Person kurz zuvor mit anderer (z.B. vertippter) Adresse fuer dasselbe Inserat?
    if (p.name) {
      const seit = new Date(new Date(m.receivedDateTime).getTime() - 3 * 86400000).toISOString();
      const bis = new Date(new Date(m.receivedDateTime).getTime() + 3 * 86400000).toISOString();
      const vn = p.name.split(/\s+/)[0];
      const { data: gleich } = await sb.from("applicants").select("id").eq("quelle", q).ilike("vorname", vn)
        .gte("created_at", seit).lte("created_at", bis).eq("zimmer_wunsch", zimmer ?? "").limit(1);
      if (gleich && gleich.length) { await log("duplikat (gleicher Name)", gleich[0].id); continue; }
    }

    const ai = await aiAuswertung({ ...p, plattform });
    if (ai && ai.interessent === false) { await log("kein Interessent (Werbung/Anfrage)"); continue; }
    const teile = (p.name || "").split(/\s+/).filter(Boolean);
    const vorname = (ai?.vorname || teile[0] || p.name || p.email.split("@")[0] || "").trim();
    const nachname = (ai?.nachname ?? teile.slice(1).join(" ")).trim();
    const notizText = (ai?.notiz || p.nachricht.replace(/\s+/g, " ").slice(0, 400)).replace(/\s[–—]\s/g, ", ");
    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      vorname, nachname,
      email: p.email,
      phone: telFormat(ai?.telefon || p.phone || ""),
      quelle: q,
      status: "Neu",
      zimmer_wunsch: zimmer,
      sprache: ai?.sprache === "de" ? "de" : (ai?.sprache === "en" ? "en" : "de"),
      notiz: `${q}-Lead · ${bez}. ${notizText}${p.inseratUrl && !ins ? `\nInserat: ${p.inseratUrl}` : ""}`,
      bemerkung: p.nachricht || null,
      created_at: m.receivedDateTime,
      owner: null,
      gender: "k.A.",
    };
    if (ai?.einzug && /^\d{4}-\d{2}-\d{2}$/.test(ai.einzug)) row.einzug = ai.einzug;
    if (dryRun) { result.push({ dryRun: true, row }); continue; }
    const { error } = await sb.from("applicants").insert(row);
    if (error) { result.push({ email: p.email, error: error.message }); continue; }
    await log("importiert", row.id as string);
  }
  return json({ geprueft: anfragen.length, ergebnisse: result });
});
