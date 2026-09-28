import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const API = "https://api.bexio.com/2.0";

// "1.10.2026" oder "2026-10-01" -> Tag (1..31)
function einzugTag(s: string): number {
  if (!s) return 1;
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return parseInt(m[3], 10);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) return parseInt(m[1], 10);
  return 1;
}
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function round2(n: number) { return Math.round(n * 100) / 100; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = await req.json();

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Konfiguration aus app_config (oder Env)
    const cfgKeys = ["bexio_api_token", "bexio_bank_account_id", "bexio_user_id",
      "bexio_tax_id_miete", "bexio_tax_id_nebenkosten", "bexio_tax_id_aufschlag", "bexio_tax_id_moeblierung"];
    const { data: cfgRows } = await sb.from("app_config").select("key,value").in("key", cfgKeys);
    const cfg: Record<string, string> = {};
    (cfgRows || []).forEach((r: any) => (cfg[r.key] = r.value));
    const token = Deno.env.get("BEXIO_API_TOKEN") || cfg.bexio_api_token || "";
    if (!token) return j({ error: "Kein Bexio-Token hinterlegt." }, 200);
    const bankAccountId = parseInt(cfg.bexio_bank_account_id || "2", 10);
    const userId = parseInt(cfg.bexio_user_id || "1", 10);
    const taxMiete = parseInt(cfg.bexio_tax_id_miete || "3", 10);
    const taxNebenkosten = parseInt(cfg.bexio_tax_id_nebenkosten || "3", 10);
    const taxAufschlag = parseInt(cfg.bexio_tax_id_aufschlag || "3", 10);
    const taxMoeblierung = parseInt(cfg.bexio_tax_id_moeblierung || "3", 10);

    const H = { "Authorization": `Bearer ${token}`, "Accept": "application/json", "Content-Type": "application/json" };
    async function bx(method: string, path: string, body?: unknown) {
      const r = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
      const txt = await r.text();
      let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
      return { ok: r.ok, status: r.status, data };
    }

    // 1) Kontakt finden oder anlegen
    const c = p.contact || {};
    let contactId = p.bexioContactId ? parseInt(String(p.bexioContactId), 10) : 0;
    if (!contactId) {
      const body: Record<string, unknown> = {
        contact_type_id: 2,
        name_1: (c.name_1 || c.nachname || "Mieter").toString(),
        name_2: (c.name_2 || c.vorname || "").toString(),
        user_id: userId,
        owner_id: userId,
      };
      if (c.mail) body.mail = String(c.mail);
      if (c.phone) body.phone_mobile = String(c.phone);
      if (c.postcode) body.postcode = String(c.postcode);
      if (c.city) body.city = String(c.city);
      if (c.country_id) body.country_id = parseInt(String(c.country_id), 10);
      const created = await bx("POST", "/contact", body);
      if (!created.ok || !created.data?.id) return j({ error: "Kontakt konnte nicht angelegt werden.", details: created.data }, 200);
      contactId = created.data.id;
      // Strasse nachtragen, falls vorhanden (im Create nicht erlaubt)
      if (c.address) { await bx("POST", `/contact/${contactId}`, { address: String(c.address) }); }
      // Bexio-Kontakt-ID am Mieter merken
      if (p.tenantId) { await sb.from("tenants").update({ bexio_contact_id: contactId }).eq("id", p.tenantId); }
    }

    // 2) Positionen bauen (getrennt, nur Betraege > 0)
    const a = p.amounts || {};
    const defs: Array<[string, number, number]> = [
      ["Nettomiete", +a.nettomiete || 0, taxMiete],
      ["Nebenkosten / Strom (pauschal)", +a.nebenkosten || 0, taxNebenkosten],
      ["Serviceaufschlag", +a.aufschlag || 0, taxAufschlag],
      ["Möblierung (monatlich)", +a.moeblierung || 0, taxMoeblierung],
    ];
    function positions(factor: number) {
      return defs.filter(([, v]) => v > 0).map(([text, v, tax]) => ({
        type: "KbPositionCustom",
        amount: "1",
        unit_price: round2(v * factor).toFixed(2),
        text: factor === 0.5 ? `${text} (halber Monat)` : text,
        tax_id: tax,
        discount_in_percent: "0",
      }));
    }

    const today = new Date();
    const valid = new Date(today.getTime() + 30 * 86400000);
    async function makeInvoice(title: string, factor: number) {
      const pos = positions(factor);
      if (pos.length === 0) return null;
      const body = {
        title,
        contact_id: contactId,
        user_id: userId,
        language_id: 1,
        bank_account_id: bankAccountId,
        currency_id: 1,
        mwst_type: 0,
        mwst_is_net: true,
        show_position_taxes: false,
        is_valid_from: ymd(today),
        is_valid_to: ymd(valid),
        positions: pos,
      };
      const r = await bx("POST", "/kb_invoice", body);
      if (!r.ok || !r.data?.id) return { error: r.data };
      return { id: r.data.id, nr: r.data.document_nr, total: r.data.total, title };
    }

    // 3) Ein oder zwei Rechnungen je nach Einzugstag
    const obj = [p.aptAdresse, p.roomLabel].filter(Boolean).join(", ");
    const adr = obj ? ` – ${obj}` : "";
    const halb = einzugTag(p.einzug || "") >= 15;
    const invoices: unknown[] = [];
    if (halb) {
      const inv1 = await makeInvoice(`Miete anteilig, halber erster Monat${adr}`, 0.5);
      const inv2 = await makeInvoice(`Miete ab Folgemonat${adr}`, 1);
      if (inv1) invoices.push(inv1);
      if (inv2) invoices.push(inv2);
    } else {
      const inv = await makeInvoice(`Miete${adr}`, 1);
      if (inv) invoices.push(inv);
    }

    return j({ contactId, halberMonat: halb, invoices });
  } catch (e) {
    return j({ error: String((e as Error).message || e) }, 200);
  }
});
