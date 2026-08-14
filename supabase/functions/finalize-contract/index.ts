// ════════════════════════════════════════════════════════════════════════════
// EDGE FUNCTION: finalize-contract
// ════════════════════════════════════════════════════════════════════════════
// Mieter-Signatur und Ort/Datum werden mit pdf-lib gezeichnet. Die Position wird
// primär aus dem gerenderten PDF ausgelesen (detectAnchors: sucht die Label
// "Datum:"/"Unterschrift:" inkl. x-Position und Breite) und folgt so automatisch
// dem Layout. Fallback auf feste Koordinaten, falls die Erkennung fehlschlägt.
// Mail-Bilder laufen über gehostete Links (mieter.dthomes.ch), nicht eingebettet.
// ════════════════════════════════════════════════════════════════════════════

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDateTimeDE(d) {
  return d.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateLongDE(d) {
  const monate = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  return `${d.getDate()}. ${monate[d.getMonth()]} ${d.getFullYear()}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function attachmentFilenameFor(pdfInfo, idx) {
  if (pdfInfo.name) return `${pdfInfo.name.replace(/\.pdf$/i, "")}-signiert.pdf`;
  if (pdfInfo.type === "amz") return "Anfangsmietzins-signiert.pdf";
  if (pdfInfo.type === "umv") return "Untermietvertrag-signiert.pdf";
  return `Vertrag-${idx + 1}-signiert.pdf`;
}

// Dateinamen fuer die Dokumente-Sektion bereinigen (wie in der Admin-App)
function sanitizeDoc(str) {
  return (str || "")
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/[ß]/g, "ss")
    .replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

// ─── EMAIL TEMPLATES ───────────────────────────────────────────────────
function notificationEmailToDaan(contract, downloadLinks, ip) {
  const data = contract.contract_data || {};
  const apt = (data.apt || data.vertrag?.apt) || {};
  const room = (data.room || data.vertrag?.room) || {};
  const linksHtml = downloadLinks.map(l =>
    `<a href="${l.url}" style="display:inline-block;background:#1a1814;color:#fefcf7;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;margin:4px 6px 4px 0;">📄 ${l.label}</a>`
  ).join("");
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fefcf7;margin:0;padding:24px;color:#1a1814;">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e1d8c5;border-radius:10px;padding:32px 28px;">
  <img src="https://mieter.dthomes.ch/dt-logo.png" alt="D&amp;T Homes" width="60" style="display:block;width:60px;height:auto;border:0;outline:none;margin-bottom:14px;"/>
  <div style="font-size:9px;color:#8a8174;letter-spacing:.25em;text-transform:uppercase;margin-bottom:28px;">Vertragsunterschrift</div>
  <h1 style="font-size:22px;font-weight:300;margin:0 0 12px;color:#5a6e4a;">✓ Vertrag unterzeichnet</h1>
  <p style="font-size:14px;color:#4a4439;line-height:1.6;margin:0 0 24px;">
    <strong>${contract.mieter_vorname} ${contract.mieter_nachname}</strong> hat den Vertrag erfolgreich unterzeichnet.
  </p>
  <div style="background:#f5efe2;border-radius:8px;padding:18px 20px;margin-bottom:20px;">
    <div style="font-size:10px;color:#8a8174;text-transform:uppercase;letter-spacing:.25em;margin-bottom:12px;">Vertragsdetails</div>
    <table style="width:100%;font-size:13px;">
      <tr><td style="padding:4px 0;color:#8a8174;width:40%;">Mieter</td><td style="text-align:right;font-weight:500;">${contract.mieter_vorname} ${contract.mieter_nachname}</td></tr>
      <tr><td style="padding:4px 0;color:#8a8174;">E-Mail</td><td style="text-align:right;">${contract.mieter_email}</td></tr>
      ${apt.adresse ? `<tr><td style="padding:4px 0;color:#8a8174;">Wohnung</td><td style="text-align:right;font-weight:500;">${apt.adresse}</td></tr>` : ""}
    </table>
  </div>
  <div style="background:#fff;border:1px solid #e1d8c5;border-radius:8px;padding:14px 16px;margin-bottom:24px;font-size:11px;color:#5a5448;line-height:1.6;">
    <strong style="color:#1a1814;">Audit-Trail</strong><br>
    Unterzeichnet am ${formatDateTimeDE(new Date(contract.signed_at || new Date()))}<br>
    IP: ${ip}<br>Vertragsnummer: ${(contract.id || "").substring(0, 8)}
  </div>
  <div style="margin-bottom:20px;">${linksHtml}</div>
  <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e1d8c5;font-size:11px;color:#8a8174;line-height:1.6;">D&amp;T Partners GmbH · Zürich</div>
</div></body></html>`;
}

function confirmationEmailToTenant(contract, downloadLinks) {
  const data = contract.contract_data || {};
  const vertrag = data.vertrag || data || {};
  const apt = vertrag.apt || {};
  const room = vertrag.room || {};
  const vorname = contract.mieter_vorname || "";
  const vornameNice = vorname ? (vorname.charAt(0).toUpperCase() + vorname.slice(1).toLowerCase()) : "";
  const nachname = contract.mieter_nachname || "";
  const fullName = `${vorname} ${nachname}`.trim();
  const zimmerNr = (room.id || "").split("-")[1] || "";
  const wohnungParts = [];
  if (apt.adresse) wohnungParts.push(apt.adresse);
  if (zimmerNr) wohnungParts.push(`Zimmer ${zimmerNr}`);
  if (apt.plz || apt.ort) wohnungParts.push(`${apt.plz || ""} ${apt.ort || ""}`.trim());
  const wohnung = wohnungParts.join(", ");
  const monate = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  function formatLongDate(s) {
    if (!s) return "-";
    let d;
    if (s.includes("-")) d = new Date(s);
    else if (s.includes(".")) { const [day, mon, year] = s.split("."); d = new Date(+year, +mon - 1, +day); }
    else return s;
    if (isNaN(d.getTime())) return s;
    return `${d.getDate()}. ${monate[d.getMonth()]} ${d.getFullYear()}`;
  }
  const einzugStr = formatLongDate(vertrag.einzug);
  function computeErsteBelastung(einzug) {
    if (!einzug) return "-";
    let d;
    if (einzug.includes("-")) d = new Date(einzug);
    else if (einzug.includes(".")) { const [day, mon, year] = einzug.split("."); d = new Date(+year, +mon - 1, +day); }
    else return "-";
    if (isNaN(d.getTime())) return "-";
    d.setMonth(d.getMonth() - 1); d.setDate(25);
    return `25. ${monate[d.getMonth()]} ${d.getFullYear()}`;
  }
  const ersteBelastungStr = computeErsteBelastung(vertrag.einzug);
  const total = vertrag.total || vertrag.bruttomiete || 0;
  const mietzinsStr = `CHF ${Number(total).toLocaleString("de-CH", {minimumFractionDigits: 2, maximumFractionDigits: 2})} / Monat (inkl. Strom + NK)`;
  const referenz = `Miete ${apt.adresse || ""} & ${fullName}`;
  const vertragId = (contract.id || "").substring(0, 8);
  const linksHtml = downloadLinks.map(l =>
    `<a href="${l.url}" style="display:inline-block;background:#1a1814;color:#fefcf7;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:13.5px;font-weight:600;letter-spacing:.04em;margin:4px 6px 4px 0;">📄 ${l.label}</a>`
  ).join("");
  const isVerlaengerung = contract.contract_type === "verlaengerung" || contract.contract_type === "nachtrag";
  if (isVerlaengerung) {
    const endeStr = formatLongDate(vertrag.mietende || vertrag.auszug);
    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Verl&auml;ngerung best&auml;tigt</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fefcf7;margin:0;padding:24px;color:#1a1814;">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e1d8c5;border-radius:10px;padding:36px 32px;">
  <div style="text-align:left;margin-bottom:24px;"><img src="https://mieter.dthomes.ch/dt-logo.png" alt="D&amp;T Homes" width="70" style="width:70px;height:auto;display:block;border:0;outline:none;"></div>
  <p style="font-size:15px;font-weight:400;color:#4a4439;margin:0 0 16px;line-height:1.6;">Hallo ${vornameNice}</p>
  <p style="font-size:15px;color:#4a4439;line-height:1.6;margin:0 0 20px;">
    Die Verl&auml;ngerung deines Mietvertrags bei D&amp;T Homes ist unterzeichnet. Vielen Dank!
  </p>
  <div style="background:#e8eadb;border-radius:8px;padding:18px 20px;margin:24px 0;">
    <div style="font-size:10px;color:#5a6e4a;text-transform:uppercase;letter-spacing:.25em;margin-bottom:8px;font-weight:600;">&#10003; Verl&auml;ngerung erfolgreich unterzeichnet</div>
    <div style="font-size:13px;color:#3d4f2f;line-height:1.6;">Den unterzeichneten Nachtrag findest du im Anhang oder &uuml;ber den Button unten.</div>
  </div>
  <div style="margin-bottom:24px;">${linksHtml}</div>
  <div style="background:#f9f5ec;border-left:3px solid #b8843e;padding:16px 20px;margin:28px 0;border-radius:0 8px 8px 0;">
    <div style="font-size:10px;color:#b8843e;text-transform:uppercase;letter-spacing:.25em;font-weight:700;margin-bottom:12px;">&#128203; Deine Verl&auml;ngerung</div>
    <div style="display:flex;padding:5px 0;font-size:14px;"><div style="color:#8a8174;min-width:130px;">Wohnung</div><div style="color:#1a1814;font-weight:600;">${wohnung}</div></div>
    <div style="display:flex;padding:5px 0;font-size:14px;"><div style="color:#8a8174;min-width:130px;">Verl&auml;ngert bis</div><div style="color:#1a1814;font-weight:600;">${endeStr}</div></div>
  </div>
  <div style="margin-top:28px;padding:18px 20px;background:#f5efe2;border-radius:8px;font-size:14px;color:#4a4439;line-height:1.7;">
    Du musst nichts weiter tun. Dein Mietverh&auml;ltnis l&auml;uft zu den bisherigen Bedingungen unver&auml;ndert weiter, neu befristet bis und mit dem <strong>${endeStr}</strong>. Miete und Kaution bleiben wie gehabt.
  </div>
  <div style="margin-top:24px;padding:16px 20px;background:#f5efe2;border-radius:8px;font-size:13px;color:#4a4439;line-height:1.6;">
    <strong style="color:#1a1814;">Fragen?</strong><br>
    &#128231; <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a>
  </div>
  <p style="font-size:14px;color:#4a4439;line-height:1.6;margin:24px 0 0;">
    Beste Gr&uuml;sse,<br><strong>D&amp;T Homes Team</strong>
  </p>
  <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e1d8c5;font-size:11px;color:#8a8174;line-height:1.6;text-align:center;">
    D&amp;T Partners GmbH, D&amp;T Homes, Z&uuml;rich &middot; Vertragsnr. ${vertragId}
  </div>
</div></body></html>`;
  }
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Willkommen bei D&amp;T Homes</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fefcf7;margin:0;padding:24px;color:#1a1814;">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e1d8c5;border-radius:10px;padding:36px 32px;">
  <div style="text-align:left;margin-bottom:24px;"><img src="https://mieter.dthomes.ch/dt-logo.png" alt="D&amp;T Homes" width="70" style="width:70px;height:auto;display:block;border:0;outline:none;"></div>
  <p style="font-size:15px;font-weight:400;color:#4a4439;margin:0 0 16px;line-height:1.6;">Hallo ${vornameNice}!</p>
  <p style="font-size:15px;color:#4a4439;line-height:1.6;margin:0 0 20px;">
    Dein Untermietvertrag ist unterzeichnet. Herzlich willkommen bei D&amp;T Homes!
  </p>
  <div style="background:#e8eadb;border-radius:8px;padding:18px 20px;margin:24px 0;">
    <div style="font-size:10px;color:#5a6e4a;text-transform:uppercase;letter-spacing:.25em;margin-bottom:8px;font-weight:600;">&#10003; Vertrag erfolgreich unterzeichnet</div>
    <div style="font-size:13px;color:#3d4f2f;line-height:1.6;">Deine unterzeichneten Vertrags-PDFs findest du im Anhang oder &uuml;ber die Buttons unten.</div>
  </div>
  <div style="margin-bottom:24px;">${linksHtml}</div>
  <div style="background:#f9f5ec;border-left:3px solid #b8843e;padding:16px 20px;margin:28px 0;border-radius:0 8px 8px 0;">
    <div style="font-size:10px;color:#b8843e;text-transform:uppercase;letter-spacing:.25em;font-weight:700;margin-bottom:12px;">&#128203; Deine Konditionen</div>
    <div style="display:flex;padding:5px 0;font-size:14px;"><div style="color:#8a8174;min-width:110px;">Wohnung</div><div style="color:#1a1814;font-weight:600;">${wohnung}</div></div>
    <div style="display:flex;padding:5px 0;font-size:14px;"><div style="color:#8a8174;min-width:110px;">Einzug</div><div style="color:#1a1814;font-weight:600;">${einzugStr}</div></div>
    <div style="display:flex;padding:5px 0;font-size:14px;"><div style="color:#8a8174;min-width:110px;">Mietzins</div><div style="color:#1a1814;font-weight:600;">${mietzinsStr}</div></div>
  </div>
  <div style="margin:32px 0;padding-top:24px;border-top:1px solid #e8e0cd;">
    <span style="display:inline-block;background:#1a1814;color:#fefcf7;width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;font-size:13px;font-weight:700;margin-right:10px;vertical-align:middle;">1</span>
    <span style="font-size:16px;font-weight:600;color:#1a1814;vertical-align:middle;">Kaution einrichten</span>
    <div style="font-size:14px;color:#4a4439;line-height:1.7;margin:14px 0 0 38px;">
      Wir nutzen f&uuml;r Mietkautionen die Schweizer Plattform <strong>Evorest</strong>. Du erh&auml;ltst eine separate Email von Evorest mit einem Link.
    </div>
  </div>
  <div style="margin:32px 0;padding-top:24px;border-top:1px solid #e8e0cd;">
    <span style="display:inline-block;background:#1a1814;color:#fefcf7;width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;font-size:13px;font-weight:700;margin-right:10px;vertical-align:middle;">2</span>
    <span style="font-size:16px;font-weight:600;color:#1a1814;vertical-align:middle;">Mietzahlung einrichten</span>
    <div style="font-size:14px;color:#4a4439;line-height:1.7;margin:14px 0 0 38px;">
      <table cellpadding="0" cellspacing="0" border="0" style="background:#f9f5ec;border:2px dashed #c5bca8;border-radius:10px;padding:20px;margin:14px 0;width:100%;">
        <tr>
          <td style="width:140px;vertical-align:middle;padding-right:20px;">
            <div style="width:140px;height:140px;background:#fff;border:1px solid #d8c9a4;border-radius:6px;padding:10px;box-sizing:border-box;">
              <img src="https://aohcqrxpsqronlcwssrk.supabase.co/storage/v1/object/public/email-assets/dt-qr.png" alt="QR-Rechnung" style="width:100%;height:100%;object-fit:contain;">
            </div>
          </td>
          <td style="vertical-align:middle;font-size:12px;line-height:1.7;">
            <div style="padding:3px 0;"><span style="color:#8a8174;font-size:10px;text-transform:uppercase;letter-spacing:.12em;">Bank</span><br><span style="color:#1a1814;font-weight:600;">Graub&uuml;ndner Kantonalbank</span></div>
            <div style="padding:3px 0;"><span style="color:#8a8174;font-size:10px;text-transform:uppercase;letter-spacing:.12em;">IBAN</span><br><span style="color:#1a1814;font-weight:600;font-family:'Menlo','Monaco',monospace;">CH80 0077 4010 5279 2690 0</span></div>
            <div style="padding:3px 0;"><span style="color:#8a8174;font-size:10px;text-transform:uppercase;letter-spacing:.12em;">Betrag</span><br><span style="color:#1a1814;font-weight:600;">${mietzinsStr}</span></div>
            <div style="padding:3px 0;"><span style="color:#8a8174;font-size:10px;text-transform:uppercase;letter-spacing:.12em;">Referenz</span><br><span style="color:#1a1814;font-weight:600;">${referenz}</span></div>
            <div style="padding:3px 0;"><span style="color:#8a8174;font-size:10px;text-transform:uppercase;letter-spacing:.12em;">Erste Belastung</span><br><span style="color:#1a1814;font-weight:600;">${ersteBelastungStr}</span></div>
          </td>
        </tr>
      </table>
    </div>
  </div>
  <div style="margin-top:32px;padding:18px 20px;background:#f5efe2;border-radius:8px;font-size:13px;color:#4a4439;line-height:1.6;">
    <strong style="color:#1a1814;">Fragen?</strong><br>
    &#128231; <a href="mailto:info@dthomes.ch" style="color:#5a5448;">info@dthomes.ch</a>
  </div>
  <p style="font-size:14px;color:#4a4439;line-height:1.6;margin:24px 0 0;">
    Wir freuen uns auf eine angenehme Zusammenarbeit!<br><br>
    Beste Gr&uuml;sse,<br><strong>D&amp;T Homes Team</strong>
  </p>
  <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e1d8c5;font-size:11px;color:#8a8174;line-height:1.6;text-align:center;">
    D&amp;T Partners GmbH, D&amp;T Homes, Z&uuml;rich · Vertragsnr. ${vertragId}
  </div>
</div></body></html>`;
}

// ─── ANKER-ERKENNUNG ───────────────────────────────────────────────────
// Liest Position UND Breite der Label "Datum:"/"Unterschrift:" direkt aus dem
// gerenderten PDF, damit Signatur und Datum der tatsächlichen Layout-Position
// folgen (direkt hinter dem Label). Bei jedem Fehler: null -> Fallback.
async function detectAnchors(pdfBytes, isUmv) {
  try {
    const { getDocumentProxy } = await import("https://esm.sh/unpdf@1.6.2");
    const pdf = await getDocumentProxy(pdfBytes);
    // Von hinten nach vorne suchen: die erste Seite mit BEIDEN Labels gewinnt.
    // So sitzt die Unterschrift auch dann richtig, wenn der Signaturblock nicht
    // auf der allerletzten Seite liegt (z.B. Anhang nach den Unterschriften).
    for (let p = pdf.numPages; p >= 1; p--) {
      const page = await pdf.getPage(p);
      const pageW = page.getViewport({ scale: 1 }).width;
      const items = (await page.getTextContent()).items
        .filter((i) => i && i.str && i.str.trim())
        .map((i) => ({ str: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
      const inSide = (i) => isUmv ? i.x < pageW / 2 : i.x >= pageW / 2;
      const findLabel = (labels) => {
        for (const L of labels) {
          const c = items.filter((i) => i.str === L && inSide(i)).sort((a, b) => b.y - a.y)[0];
          if (c) return c;
        }
        return null;
      };
      const datum = findLabel(isUmv ? ["Ort, Datum:", "Datum:"] : ["Datum:"]);
      const sig = findLabel(["Unterschrift:"]);
      if (datum && sig) return { datumX: datum.x, datumW: datum.w, datumY: datum.y, sigX: sig.x, sigW: sig.w, sigY: sig.y, page: p };
    }
    return null;
  } catch (e) {
    console.error("detectAnchors failed, using fallback:", e?.message);
    return null;
  }
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const { token, signature_png, user_agent } = body;
    if (!token || typeof token !== "string" || token.length < 16) return jsonResponse({ error: "Invalid token" }, 400);
    if (!signature_png || !signature_png.startsWith("data:image/png;base64,")) return jsonResponse({ error: "Invalid signature" }, 400);

    const forwarded = req.headers.get("x-forwarded-for") || "";
    const ip = forwarded.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
    const ua = user_agent || req.headers.get("user-agent") || "";

    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: contract, error: dbErr } = await supabase.from("contracts").select("*").eq("token", token).maybeSingle();
    if (dbErr) return jsonResponse({ error: "Database error" }, 500);
    if (!contract) return jsonResponse({ error: "Contract not found" }, 404);
    if (contract.status === "signiert") return jsonResponse({ error: "Already signed" }, 400);
    if (contract.status === "mieter_signiert") return jsonResponse({ error: "Already signed by tenant, awaiting counter-signature" }, 400);
    if (contract.status === "storniert") return jsonResponse({ error: "Contract cancelled" }, 400);
    if (contract.expires_at && new Date(contract.expires_at) < new Date()) {
      await supabase.from("contracts").update({ status: "abgelaufen" }).eq("token", token);
      return jsonResponse({ error: "Contract expired" }, 400);
    }

    const pdfsToSign = [];
    if (contract.unsigned_pdfs && Array.isArray(contract.unsigned_pdfs) && contract.unsigned_pdfs.length > 0) {
      pdfsToSign.push(...contract.unsigned_pdfs);
    } else if (contract.unsigned_pdf_path) {
      pdfsToSign.push({ path: contract.unsigned_pdf_path, type: "umv", name: "Untermietvertrag" });
    } else {
      return jsonResponse({ error: "PDF not found" }, 404);
    }

    const now = new Date();
    const ortDatumStr = `Z\u00fcrich, ${formatDateLongDE(now)}`;
    const auditText = `Digital unterzeichnet am ${formatDateTimeDE(now)} via mieter.dthomes.ch`;
    const auditText2 = `IP: ${ip} \u00b7 Vertragsnr: ${contract.id.substring(0, 8)}`;

    // Decode signature
    const sigBase64 = signature_png.replace(/^data:image\/png;base64,/, "");
    const sigBinary = atob(sigBase64);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) sigBytes[i] = sigBinary.charCodeAt(i);

    // Sign each PDF using direct PDF draw at precise coordinates
    const signedPdfs = [];
    const signedBytesArr = [];

    for (const u of pdfsToSign) {
      const { data: pdfData, error: pdfErr } = await supabase.storage.from("contracts").download(u.path);
      if (pdfErr || !pdfData) {
        console.error("PDF download error:", u.path, pdfErr);
        return jsonResponse({ error: `Could not load PDF: ${u.name || u.path}` }, 500);
      }
      const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const sigImage = await pdfDoc.embedPng(sigBytes);
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pages = pdfDoc.getPages();
      const lastPage = pages[pages.length - 1];
      const pageHeight = lastPage.getHeight();

      const isUmv = (u.type === "umv" || u.type === "untermietvertrag");
      const isAmz = (u.type === "amz" || u.type === "anfangsmietzins");
      const isNachtrag = (u.type === "verlaengerung" || u.type === "nachtrag");

      // ─── COORDINATES per PDF type ─────────────────────────────────────
      // Primär: aus dem PDF gelesene Label-Position (detectAnchors: x, Breite, y),
      // Datum und Signatur werden direkt hinter das Label gesetzt (Label-x + Breite + 8).
      // sonst feste Fallback-Werte. pdf-lib: bottom-left origin, A4 (595 x 842 pt).
      let sigPlaced = false;
      const anchors = await detectAnchors(pdfBytes, isUmv || isNachtrag);
      const targetPage = (anchors && anchors.page) ? pages[anchors.page - 1] : lastPage;

      if (isUmv || isNachtrag) {
        // UMV / Nachtrag: Untermieter*in sig-block LINKS auf der letzten Seite
        const datumX = anchors ? anchors.datumX + 74 : 125, datumY = anchors ? anchors.datumY : 601;
        const sigX = anchors ? anchors.sigX + 74 : 125, sigY = (anchors ? anchors.sigY - 13 : 580), sigMaxW = 150, sigMaxH = 24;
        const dims = sigImage.scaleToFit(sigMaxW, sigMaxH);
        targetPage.drawText(ortDatumStr, { x: datumX, y: datumY, size: 9, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
        targetPage.drawImage(sigImage, { x: sigX, y: sigY, width: dims.width, height: dims.height });
        sigPlaced = true;
      } else if (isAmz) {
        // AMZ: Mieter*in block RECHTS auf der letzten Seite
        const datumX = anchors ? anchors.datumX + 74 : 385, datumY = anchors ? anchors.datumY : 545;
        const sigX = anchors ? anchors.sigX + 74 : 390, sigY = (anchors ? anchors.sigY - 8 : 523), sigMaxW = 150, sigMaxH = 22;
        const dims = sigImage.scaleToFit(sigMaxW, sigMaxH);
        targetPage.drawText(ortDatumStr, { x: datumX, y: datumY, size: 9, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
        targetPage.drawImage(sigImage, { x: sigX, y: sigY, width: dims.width, height: dims.height });
        sigPlaced = true;
      }

      // Fallback (unknown type): legacy position at bottom-left
      if (!sigPlaced) {
        const dims = sigImage.scaleToFit(150, 60);
        lastPage.drawImage(sigImage, { x: 80, y: 100, width: dims.width, height: dims.height });
      }

      // Audit trail at very bottom (subtle, gray)
      targetPage.drawText(auditText, { x: 51, y: 50, size: 6.5, font: helvetica, color: rgb(0.55, 0.55, 0.55) });
      targetPage.drawText(auditText2, { x: 51, y: 41, size: 6.5, font: helvetica, color: rgb(0.55, 0.55, 0.55) });

      const signedBytes = await pdfDoc.save();

      let signedPath = u.path.replace(/\.pdf$/, "-signed.pdf");
      if (signedPath.endsWith("-signed-signed.pdf")) signedPath = signedPath.replace("-signed-signed", "-signed");
      const { error: uploadErr } = await supabase.storage.from("contracts").upload(signedPath, signedBytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (uploadErr) return jsonResponse({ error: "Upload failed: " + uploadErr.message }, 500);

      signedPdfs.push({ ...u, path: signedPath });
      signedBytesArr.push(signedBytes);

      // Hinweis: Die vom Bewerber signierte Fassung wird NICHT mehr in die
      // Dokumente-Sektion gespeichert. Nur die vollstaendig gegengezeichnete
      // Version wird dort abgelegt (siehe countersign-contract). Die signierte
      // PDF liegt weiterhin im contracts-Bucket fuer die Gegenzeichnung bereit.
    }

    // Update Contract Record
    // Neuer Ablauf: Der Mieter hat zuerst unterschrieben. Der Vertrag ist
    // jetzt "mieter_signiert" und wartet auf die Gegenzeichnung durch D&T.
    // Erst dann wird er "signiert" und die Bestaetigungsmail geht raus.
    const updateFields = {
      status: "mieter_signiert",
      signed_at: now.toISOString(),
      signed_ip: ip,
      signed_user_agent: ua,
      mieter_signature_png: signature_png,
      signed_pdf_path: signedPdfs[0].path,
    };
    if (contract.unsigned_pdfs && Array.isArray(contract.unsigned_pdfs) && contract.unsigned_pdfs.length > 0) {
      updateFields.signed_pdfs = signedPdfs;
    }
    const { error: updateErr } = await supabase.from("contracts").update(updateFields).eq("token", token);
    if (updateErr) return jsonResponse({ error: "Update failed: " + updateErr.message }, 500);

    // Send Emails
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      const pdfAttachments = signedPdfs.map((sp, idx) => ({
        filename: attachmentFilenameFor(sp, idx),
        content: bytesToBase64(signedBytesArr[idx]),
        content_type: "application/pdf",
      }));
      const downloadLinks = [];
      for (let i = 0; i < signedPdfs.length; i++) {
        const sp = signedPdfs[i];
        const { data } = await supabase.storage.from("contracts").createSignedUrl(sp.path, 30 * 24 * 3600);
        if (data?.signedUrl) {
          let label = "Vertrag herunterladen";
          if (sp.name) label = sp.name + " (signiert)";
          else if (sp.type === "amz") label = "Anfangsmietzins (signiert)";
          else if (sp.type === "umv") label = "Untermietvertrag (signiert)";
          downloadLinks.push({ url: data.signedUrl, label });
        }
      }
      const contractWithSignedAt = { ...contract, signed_at: now.toISOString() };

      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "D&T Homes <noreply@dthomes.ch>",
            to: ["daan.theijse@dthomes.ch"],
            subject: `\u270d Wartet auf Gegenzeichnung: ${contract.mieter_vorname} ${contract.mieter_nachname}`,
            html: notificationEmailToDaan(contractWithSignedAt, downloadLinks, ip),
            attachments: pdfAttachments,
          }),
        });
      } catch (e) { console.error("Daan email failed:", e); }

      // Bestaetigungsmail an den Mieter wird BEWUSST noch nicht gesendet.
      // Sie geht erst raus, wenn D&T gegengezeichnet hat (Gegenzeichnungs-Schritt
      // in ImmoBase). So erhaelt der Mieter die Bestaetigung samt final
      // beidseitig unterschriebenem Vertrag erst, wenn der Vertrag gueltig ist.

      // notification_sent_at bewusst NICHT gesetzt, damit der Gegenzeichnungs-
      // Schritt erkennt, dass die Abschlussmail noch aussteht.
    }

    return jsonResponse({
      success: true,
      message: "Vertrag erfolgreich unterzeichnet",
      contract_id: contract.id,
      signed_at: now.toISOString(),
    });

  } catch (e) {
    console.error("Error:", e);
    return jsonResponse({ error: "Server error: " + e.message }, 500);
  }
});
