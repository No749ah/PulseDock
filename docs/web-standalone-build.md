# PulseDock Web — Standalone Build & Deployment

## Warum standalone?

`next.config.js` hat `output: 'standalone'` gesetzt. Das erzeugt ein minimales
`server.js` ohne unnötige node_modules — gut für Docker/Container.

**Wichtige Konsequenz:** Static files (`_next/static`, `public/`) werden vom
standalone-Build NICHT automatisch mitgeliefert. Sie müssen manuell kopiert werden.

---

## Was passiert ohne den Copy-Schritt?

| Symptom | Ursache |
|---------|---------|
| Seite lädt, aber kein CSS/JS | `_next/static` fehlt in standalone |
| HTTP 404 auf `/_next/static/*` | Static-Ordner nicht kopiert |
| `next start` funktioniert nicht | Falscher Start-Befehl für standalone |

---

## Richtiger Start-Ablauf

### 1. Build
```bash
cd projects/PulseDock
npm run build   # oder: npm run build:web
```

### 2. Static Assets kopieren (IMMER nach Build!)
```bash
bash scripts/copy-standalone-assets.sh
```

Was kopiert wird:
- `apps/web/.next/static/` → `apps/web/.next/standalone/apps/web/.next/static/`
- `apps/web/public/`       → `apps/web/.next/standalone/apps/web/public/`

### 3. Server starten
```bash
bash scripts/start-web.sh
# oder direkt:
WEB_PORT=1234 HOSTNAME=0.0.0.0 PORT=1234 node apps/web/.next/standalone/apps/web/server.js
```

**NICHT** `next start` oder `npx next start` verwenden — das funktioniert nicht
korrekt mit `output: 'standalone'`.

---

## Cloudflare Cache

Static assets haben `Cache-Control: public, max-age=31536000, immutable` —
das ist korrekt, da Next.js Content-Hashes im Dateinamen verwendet.

**Nach einem Re-Deploy mit neuem Build:** Cloudflare cached keine veränderten
Hashes (neue Dateinamen). Kein manuelles Purgen nötig.

**Bei einem 404-Cache-Problem** (z.B. Server war down, CF hat 404 gecacht):
→ Cloudflare Dashboard → Caching → Purge Cache → Custom Purges: `/_next/static/*`

---

## Heartbeat-Check

Der Agent prüft periodisch ob der Web-Server läuft. Bei Ausfall:
```bash
bash /home/node/.openclaw/workspace/scripts/stop-web.sh
bash /home/node/.openclaw/workspace/scripts/start-web.sh
```

---

## Zusammenfassung

```
Build → copy-standalone-assets.sh → node standalone/server.js
         ^^^^^^^^^^^^^^^^^^^^^^^^^
         DIESER SCHRITT NICHT VERGESSEN
```
