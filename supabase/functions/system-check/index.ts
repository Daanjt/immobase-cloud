// system-check - schickt Daan eine Warnmail, wenn die Ueberwachung Probleme findet.
// Aufgerufen von intern.system_check_run() (pg_cron, alle 30 Min.) mit Service-Role-JWT.
// Die Daten sammelt die Datenbank (intern.system_health); hier wird nur die Mail gebaut.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMPFAENGER = ["daan.theijse@dthomes.ch"];

function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function zeit(v: unknown) {
  const d = new Date(String(v || ""));
  return isNaN(d.getTime()) ? "" : d.toLocaleString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function istServiceRole(req: Request) {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!t) return false;
  if (t === SERVICE_KEY) return true;
  try { const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return p.role === "service_role"; } catch { return false; }
}

Deno.serve(async (req) => {
  if (!istServiceRole(req)) return new Response("forbidden", { status: 403 });
  const { health: h = {}, tagesmeldung = false } = await req.json().catch(() => ({}));
  const block = (titel: string, zeilen: string[], farbe = "#9b4a3e") => zeilen.length
    ? `<h3 style="font-size:15px;color:${farbe};margin:22px 0 8px">${titel} (${zeilen.length})</h3><ul style="margin:0;padding-left:18px">${zeilen.map((z) => `<li style="margin:0 0 6px">${z}</li>`).join("")}</ul>` : "";
  const appF = (h.app_fehler || []).map((f: any) => `<b>${esc(f.app)}</b>${f.bereich ? " · " + esc(f.bereich) : ""} · ${zeit(f.created_at)}<br>${esc(f.meldung)}${f.benutzer ? `<br><span style="color:#8a8174">${esc(f.benutzer)}</span>` : ""}${f.seite ? `<br><span style="color:#8a8174">${esc(f.seite)}</span>` : ""}`);
  const mehr = (h.app_fehler_anzahl || 0) > appF.length ? [`… und ${h.app_fehler_anzahl - appF.length} weitere`] : [];
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1b17;max-width:640px">
<p>Die automatische Überwachung von ImmoBase hat Folgendes gefunden:</p>
${block("Seite nicht erreichbar", (h.seiten_fehler || []).map((f: any) => `<b>${esc(f.url)}</b><br>Zwei Prüfungen hintereinander ohne Antwort oder mit Fehler`))}
${block("Fehler in ImmoBase, Mieterportal oder Formular", [...appF, ...mehr])}
${block("Automatische Abläufe laufen nicht mehr (seit über 26 Std. kein erfolgreicher Lauf)", (h.job_still || []).map((f: any) => `<b>${esc(f.job)}</b> · letzter erfolgreicher Lauf: ${f.letzter ? zeit(f.letzter) : "unbekannt"}`))}
${block("Automatische Abläufe fehlgeschlagen", (h.cron_fehler || []).map((f: any) => `<b>${esc(f.job)}</b> · ${zeit(f.zeit)}<br>${esc(f.meldung)}`))}
${block("Server-Funktionen mit Fehler", (h.http_fehler || []).map((f: any) => `Status ${esc(f.status ?? "keine Antwort")} · ${zeit(f.zeit)}<br><span style="color:#8a8174">${esc(f.meldung)}</span>`))}
${block("Einladung zum Übergabeprotokoll nicht versendet", (h.einladung_fehler || []).map((f: any) => `<b>${esc(f.mieter)}</b><br>${esc(f.fehler)}`))}
${block("Geplante Mails mit Fehler", (h.mail_fehler || []).map((f: any) => `${esc(f.an)} · ${esc(f.betreff)}<br>${esc(f.fehler)}`))}
${block("Bexio-Sync-Fehler", (h.bexio_fehler || []).map((f: any) => `${esc(f.mieter)}: ${esc(f.fehler)}`), "#8a6a2e")}
${block("Übergabeprotokolle kurz vor Fristablauf (noch nicht eingereicht)", (h.protokolle_offen || []).map((f: any) => `<b>${esc(f.mieter)}</b> · Frist ${zeit(f.frist)} · ${esc(f.fotos)} Fotos`), "#8a6a2e")}
<p style="color:#8a8174;font-size:12px;margin-top:26px">Diese Mail kommt nur, wenn etwas gefunden wurde. Prüfung alle 30 Minuten${tagesmeldung ? ", Hinweise einmal täglich" : ""}.</p></div>`;
  const nFehler = (h.app_fehler_anzahl || 0) + (h.seiten_fehler || []).length + (h.job_still || []).length + (h.cron_fehler || []).length + (h.http_fehler || []).length + (h.einladung_fehler || []).length + (h.mail_fehler || []).length;
  const betreff = nFehler > 0 ? `⚠ ImmoBase: ${nFehler} ${nFehler === 1 ? "Fehler" : "Fehler"} gefunden` : "ImmoBase: Tageshinweise";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "ImmoBase Überwachung <noreply@dthomes.ch>", to: EMPFAENGER, subject: betreff, html }),
  });
  const txt = await r.text();
  return new Response(JSON.stringify({ ok: r.ok, status: r.status, resend: txt.slice(0, 200) }), { status: r.ok ? 200 : 502, headers: { "Content-Type": "application/json" } });
});
