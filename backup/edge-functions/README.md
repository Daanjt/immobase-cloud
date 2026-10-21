# Kopie der Edge Functions, die nicht über supabase/functions ausgeliefert werden

Diese Funktionen wurden direkt in Supabase bereitgestellt (nicht über GitHub Actions).
Hier liegt eine Sicherungskopie des Quellcodes (Stand siehe `_deployed.json`: Version, verify_jwt).
Dieser Ordner wird NICHT automatisch deployed. Wiederherstellen im Notfall:

    supabase functions deploy <name> --project-ref <ref> [--no-verify-jwt]

(`--no-verify-jwt` nur bei Funktionen mit "verify_jwt": false in `_deployed.json`.)
