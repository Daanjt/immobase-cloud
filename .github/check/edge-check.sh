#!/usr/bin/env bash
# Prueft alle Edge Functions vor dem Deploy (laeuft in deploy-functions.yml).
# Fatal sind nur echte Fehler, die zur Laufzeit crashen wuerden:
#   Syntaxfehler (TS1xxx), unbekannte Namen (TS2304/TS2552), doppelte Deklarationen
#   (TS2300/TS2451), fehlende Module/Exporte (TS2305/TS2307/TS2614/TS2724), Import-Fehler.
# Reine Typ-Feinheiten (z.B. TS2339 bei pdf.js-Typen) blockieren den Deploy nicht.
# Manuell: bash .github/check/edge-check.sh   (im Repo-Hauptordner)
set -u
cd "$(dirname "$0")/../../supabase/functions"
CFG="../../.github/check/deno.json"
FATAL='TS1[0-9]{3}|TS2304|TS2552|TS2300|TS2451|TS2305|TS2307|TS2614|TS2724|TS2393'
fehler=0
for f in */index.ts; do
  out=$(deno check --quiet --config "$CFG" "$f" 2>&1)
  if [ $? -eq 0 ]; then continue; fi
  clean=$(printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g')
  treffer=$(printf '%s\n' "$clean" | grep -E -A3 "($FATAL) \[ERROR\]")
  if printf '%s\n' "$clean" | grep -qE '^error: (Module not found|Import|Relative import|Unable to load|The module)'; then
    treffer="$treffer"$'\n'"$(printf '%s\n' "$clean" | grep -E '^error:' | head -3)"
  fi
  if [ -n "$(printf '%s' "$treffer" | tr -d '[:space:]')" ]; then
    echo "::error::${f%/index.ts}: Fehler gefunden"
    printf '%s\n' "$treffer" | head -20
    fehler=$((fehler+1))
  fi
done
if [ $fehler -gt 0 ]; then echo "Edge-Pruefung: $fehler Function(s) mit Fehlern, Deploy abgebrochen"; exit 1; fi
echo "Edge-Pruefung ok"
