# 🏠 ImmoBase Cloud — Setup-Anleitung

Komplette Web-App mit Supabase-Datenbank, E-Mail-Login und öffentlichem Bewerbungsformular.

---

## 📦 Was du in diesem Ordner findest

- **`index.html`** — Die Haupt-App mit Login (für euer Team)
- **`mietbewerbung.html`** — Das öffentliche Bewerbungsformular (für Bewerber)
- **`README.md`** — Diese Anleitung

---

## 🚀 Schritt 1: Auf Vercel hochladen (5 Minuten, kostenlos)

Vercel hostet beide HTML-Dateien automatisch und stellt sie über eine sichere URL bereit.

### Option A: Über die Vercel-Website (am einfachsten)

1. Gehe auf **[vercel.com](https://vercel.com)** → **Sign Up** mit deinem GitHub- oder Google-Konto
2. Klick **"Add New..."** → **"Project"**
3. Wähle **"Continue with Other Tools"** ganz unten (oder direkter Drag-and-Drop)
4. Drag-and-Drop den **gesamten Ordner** in das Vercel-Fenster
5. Klick **"Deploy"**
6. Nach ~30 Sekunden bekommst du eine URL wie `https://immobase-xyz.vercel.app`

### Option B: Vercel CLI (für technisch Versierte)

```bash
npm i -g vercel
cd /pfad/zu/diesem/ordner
vercel
```

---

## 🔐 Schritt 2: Login testen

1. Öffne deine Vercel-URL: `https://deine-app.vercel.app`
2. Du siehst die Login-Seite
3. Gib deine E-Mail ein (z.B. `daan.theijse@dthomes.ch`)
4. Du bekommst einen Login-Link per E-Mail
5. Klick drauf → du bist drin!

⚠️ **Falls keine E-Mail kommt:**
- Spam-Ordner prüfen
- Sicherstellen dass die E-Mail in der `allowed_users`-Tabelle in Supabase eingetragen ist

---

## 📋 Schritt 3: Bewerbungsformular nutzen

Das Formular ist erreichbar unter: `https://deine-app.vercel.app/mietbewerbung.html`

Diesen Link kannst du an Bewerber senden. Sobald jemand das Formular ausfüllt:
- ✓ Bewerbung wird automatisch in der Datenbank gespeichert
- ✓ Erscheint sofort im Bewerber-Tab eurer App (Echtzeit-Sync!)

---

## 🌐 Schritt 4 (optional): Eigene Domain

Statt `https://immobase-xyz.vercel.app` möchtet ihr vielleicht `https://immobase.dthomes.ch`?

1. In Vercel → Projekt-Settings → **"Domains"**
2. Eigene Domain eingeben
3. Den DNS-Eintrag bei eurem Domain-Anbieter eintragen (Vercel zeigt dir genau wie)
4. Fertig nach ein paar Minuten

---

## 👥 Neue Nutzer hinzufügen / entfernen

1. Login auf [supabase.com](https://supabase.com)
2. Projekt **"Immobase"** öffnen
3. Linke Sidebar → **Table Editor** → **`allowed_users`**
4. Klick **"+ Insert"** für neuen Nutzer, oder Zeile rechts-klick → Delete

Alternativ via SQL Editor:

```sql
-- Hinzufügen
INSERT INTO allowed_users (email, role) VALUES ('neu@dthomes.ch', 'admin');

-- Entfernen
DELETE FROM allowed_users WHERE email = 'alt@dthomes.ch';
```

---

## 🔄 Daten direkt in Supabase bearbeiten

Genauso wie in Google Sheets:

1. Login auf [supabase.com](https://supabase.com)
2. **Table Editor** → Tabelle wählen (`apartments`, `rooms`, `tenants`, `applicants`)
3. Doppelklick auf eine Zelle → bearbeiten → Enter
4. Änderung erscheint **sofort** in der App (Echtzeit!)

---

## 💾 Backup

Supabase erstellt automatisch tägliche Backups (auch im Free-Plan).
Manueller Export jederzeit möglich:

1. Table Editor → Tabelle wählen → **Export as CSV** (oben rechts)

---

## 🛠 Häufige Probleme

**"Diese E-Mail ist nicht freigeschaltet"**
→ E-Mail in `allowed_users` eintragen (siehe oben)

**Bewerbungsformular speichert nichts**
→ Browser-Konsole öffnen (F12) → Fehlermeldung prüfen
→ Wahrscheinlich fehlt die "Anyone can submit application" Policy in Supabase

**App lädt nicht / weißer Bildschirm**
→ Browser-Konsole prüfen
→ Internet-Verbindung prüfen
→ Vercel-Status: [vercel-status.com](https://www.vercel-status.com)

---

## 📞 Support

Bei Fragen einfach Claude fragen — die App und Datenbank sind komplett dokumentiert und erweiterbar.
