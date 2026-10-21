// send-protocol-email - stillgelegt (altes Protokoll-System uebergabe_protokolle).
// Ersetzt durch finalize-handover / send-handover-pdf. Antwortet nur noch mit 410.
Deno.serve((req: Request) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({ error: "Diese Funktion ist stillgelegt." }), { status: 410, headers: { ...cors, "Content-Type": "application/json" } });
});
