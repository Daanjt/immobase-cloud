// Microsoft Graph (App-only): Zugangsdaten aus app_config, Token, und welches Postfach
// fuer eine Person verwendet wird. Eigene Postfaecher nur fuer echte @dthomes.ch-Adressen
// (ohne +Alias); sonst das Standardpostfach (graph_mailbox).
export type GraphCfg = Record<string, string>;

export async function graphConfig(sb: any): Promise<GraphCfg | null> {
  const { data } = await sb.from("app_config").select("key,value")
    .in("key", ["graph_tenant_id", "graph_client_id", "graph_client_secret", "graph_mailbox"]);
  const c: GraphCfg = {};
  for (const r of data ?? []) c[r.key] = r.value;
  if (!c.graph_tenant_id || !c.graph_client_id || !c.graph_client_secret || !c.graph_mailbox) return null;
  return c;
}

export async function graphToken(c: GraphCfg): Promise<string | null> {
  const r = await fetch(`https://login.microsoftonline.com/${c.graph_tenant_id}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.graph_client_id, client_secret: c.graph_client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const j = await r.json().catch(() => ({}));
  return j.access_token || null;
}

export function eigenesPostfach(email: string | null | undefined): boolean {
  const e = String(email || "").trim().toLowerCase();
  return /^[a-z0-9._-]+@dthomes\.ch$/.test(e);
}

export function postfachFuer(c: GraphCfg, email: string | null | undefined): string {
  const e = String(email || "").trim().toLowerCase();
  return eigenesPostfach(e) ? e : String(c.graph_mailbox).toLowerCase();
}
