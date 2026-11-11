// Kleiner MCP-Client fuer Elev8 (https://mcp.elev8-suite.com/mcp), gleiche Logik wie elev8-sync.
const MCP = "https://mcp.elev8-suite.com/mcp";

export class Elev8 {
  sid = ""; id = 0;
  constructor(private key: string, private mode: "xapikey" | "bearer" = "xapikey") {}
  async rpc(method: string, params: unknown, notify = false) {
    const h: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
    if (this.mode === "bearer") h["Authorization"] = "Bearer " + this.key; else h["X-API-Key"] = this.key;
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
    await this.rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "immobase", version: "1" } });
    await this.rpc("notifications/initialized", {}, true);
  }
  async tool(name: string, args: Record<string, unknown>) {
    const res = await this.rpc("tools/call", { name, arguments: args });
    if (res?.isError) throw new Error(`Elev8 ${name}: ${JSON.stringify(res.content).slice(0, 300)}`);
    if (res?.structuredContent) return res.structuredContent;
    const t = (res?.content || []).find((c: any) => c.type === "text")?.text || "{}";
    try { return JSON.parse(t); } catch { return { text: t }; }
  }
}

// Verbindung mit dem ersten funktionierenden ELEV8-Secret
export async function elev8Verbinden(): Promise<Elev8> {
  const env = Deno.env.toObject();
  const namen = Object.keys(env).filter((k) => /ELEV8/i.test(k) && env[k]).sort((a, b) => (a === "ELEV8_MCP_KEY" ? -1 : b === "ELEV8_MCP_KEY" ? 1 : 0));
  const versuche: string[] = [];
  for (const n of namen) for (const mode of ["xapikey", "bearer"] as const) {
    const c = new Elev8(env[n].trim(), mode);
    try { await c.init(); return c; } catch (e) { versuche.push(`${n}/${mode}: ${String((e as Error).message).slice(0, 120)}`); }
  }
  throw new Error("Keine Verbindung zu Elev8 (" + (namen.length ? versuche.join(" | ") : "kein ELEV8-Secret") + ")");
}
