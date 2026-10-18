// elev8-sync: holt Buchungen und Sperrzeiten aus Elev8 (MCP-Schnittstelle, X-API-Key) nach elev8_bookings / elev8_blocks.
// Laeuft per pg_cron alle 5 Minuten. Ersetzt den frueheren Smoobu-Abgleich.
// Ohne Secret ELEV8_MCP_KEY wird nichts gemacht (Status 200, Hinweis in elev8_sync_status).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MCP = "https://mcp.elev8-suite.com/mcp";
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const iso = (d: Date) => d.toISOString().slice(0, 10);

class Mcp {
  sid = ""; id = 0;
  constructor(private key: string) {}
  async rpc(method: string, params: unknown, notify = false) {
    const h: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "X-API-Key": this.key };
    if (this.sid) h["Mcp-Session-Id"] = this.sid;
    const body: Record<string, unknown> = { jsonrpc: "2.0", method, params };
    if (!notify) body.id = ++this.id;
    const r = await fetch(MCP, { method: "POST", headers: h, body: JSON.stringify(body) });
    const sid = r.headers.get("mcp-session-id"); if (sid) this.sid = sid;
    const txt = await r.text();
    if (!r.ok) throw new Error(`Elev8 ${method}: HTTP ${r.status} ${txt.slice(0, 200)}`);
    if (notify) return null;
    let msg: any = null;
    if ((r.headers.get("content-type") || "").includes("text/event-stream")) {
      for (const line of txt.split("\n")) if (line.startsWith("data:")) { try { const m = JSON.parse(line.slice(5)); if (m.id === body.id) msg = m; } catch { /* */ } }
    } else msg = JSON.parse(txt);
    if (!msg) throw new Error(`Elev8 ${method}: leere Antwort`);
    if (msg.error) throw new Error(`Elev8 ${method}: ${JSON.stringify(msg.error).slice(0, 200)}`);
    return msg.result;
  }
  async init() {
    await this.rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "immobase-elev8-sync", version: "1" } });
    await this.rpc("notifications/initialized", {}, true);
  }
  async tool(name: string, args: Record<string, unknown>) {
    const res = await this.rpc("tools/call", { name, arguments: args });
    if (res?.isError) throw new Error(`Elev8 ${name}: ${JSON.stringify(res.content).slice(0, 200)}`);
    if (res?.structuredContent) return res.structuredContent;
    const t = (res?.content || []).find((c: any) => c.type === "text")?.text || "{}";
    return JSON.parse(t);
  }
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const key = Deno.env.get("ELEV8_MCP_KEY") || "";
  const now = new Date();
  if (!key) {
    await sb.from("elev8_sync_status").update({ last_run: now.toISOString(), last_error: "Kein Elev8-Schluessel (Secret ELEV8_MCP_KEY) hinterlegt" }).eq("id", 1);
    return json({ ok: false, skipped: "kein Schluessel" });
  }
  try {
    const m = new Mcp(key); await m.init();
    const von = new Date(now); von.setDate(von.getDate() - 60);
    const bis = new Date(now); bis.setDate(bis.getDate() + 540);
    const r = await m.tool("get_reservations_by_period", { from_date: iso(von), to_date: iso(bis), date_field: "check_in" });
    const res = Array.isArray(r?.results) ? r.results : [];
    const bEnd = new Date(now); bEnd.setDate(bEnd.getDate() + 364);
    const b = await m.tool("get_blocked_dates", { from_date: iso(now), to_date: iso(bEnd), listing_tag: "", listing_name: "" });
    const blocks = Array.isArray(b?.results) ? b.results : [];
    // Sicherheitsnetz: leere Antwort nie als "alles storniert" interpretieren
    if (res.length === 0) throw new Error("Elev8 lieferte keine Buchungen, Abgleich uebersprungen");
    const { data: n, error: e1 } = await sb.rpc("elev8_sync", { p: res, von: iso(von), bis: iso(bis) });
    if (e1) throw new Error("DB: " + e1.message);
    const { data: nb, error: e2 } = await sb.rpc("elev8_set_blocks", { p: blocks });
    if (e2) throw new Error("DB: " + e2.message);
    await sb.from("elev8_sync_status").update({ last_run: now.toISOString(), last_ok: now.toISOString(), last_error: null, reservations: n, blocks: nb }).eq("id", 1);
    return json({ ok: true, reservations: n, blocks: nb });
  } catch (e) {
    const msg = String((e as Error).message || e).slice(0, 300);
    await sb.from("elev8_sync_status").update({ last_run: now.toISOString(), last_error: msg }).eq("id", 1);
    return json({ ok: false, error: msg }, 500);
  }
});
