**⚠️ Dieses Projekt wurde aus Zeitgründen mit Unterstützung von KI erstellt. ⚠️**

# GymBuddie 🏋️

GymBuddie ist eine mobile Progressive Web App zum Erfassen von Übungen, Sätzen und
Trainingsverläufen. Die Oberfläche und die Trainingsdaten funktionieren nach dem ersten
erfolgreichen Produktionsaufruf auch offline.

## Funktionen

- Trainingskategorien und Übungen anlegen und löschen
- Gewicht und Wiederholungen pro Satz erfassen, bearbeiten und löschen
- Chronologische Trainingshistorie je Übung
- Optionale, geprüfte Links zu Technikvideos
- Lokale, versionierte Datenspeicherung mit Fehler- und Migrationsbehandlung
- JSON-Backups exportieren und nach Bestätigung wieder importieren
- Installierbare PWA mit Update-Hinweis und Offline-App-Shell
- Tastaturbedienbare, responsive Oberfläche mit reduzierten Animationen auf Wunsch

## Wichtig: lokale Daten und Backups

GymBuddie besitzt derzeit kein Benutzerkonto und keine Cloud-Synchronisierung. Trainingsdaten
bleiben im Browserspeicher des verwendeten Geräts. Das schützt die Privatsphäre, bedeutet aber
auch: Das Löschen von Website-Daten, ein Browser-/Gerätewechsel, eine Speicherbereinigung oder
ein Defekt können die Daten unrettbar entfernen.

Deshalb regelmäßig unter **Daten sichern → Backup exportieren** eine JSON-Datei sichern und
gelegentlich den Import testen. Ein Export enthält die vollständige Trainingshistorie und sollte
wie eine persönliche Datei behandelt werden.

Offline verfügbar sind die Anwendung und bereits lokal gespeicherte Trainingsdaten. Externe
Technikvideos benötigen weiterhin eine Internetverbindung. Vor dem ersten erfolgreichen Laden
beziehungsweise Installieren kann noch kein Service Worker Inhalte bereitstellen.

## Technik

- Vue 3, TypeScript, Pinia und Vue Router
- Vite und Tailwind CSS 4
- `vite-plugin-pwa`/Workbox für Manifest, Service Worker und Precache
- Vitest, Vue Test Utils und jsdom für Komponententests
- Playwright und axe-core für Browser-, Offline- und Barrierefreiheitstests
- GitHub Pages mit einem geprüften Actions-Deployment

## Voraussetzungen

- Node.js 24 LTS
- npm 11 oder neuer

## Lokale Entwicklung

```bash
git clone https://github.com/belagrf/GymBuddie.git
cd GymBuddie
npm ci
npm run dev
```

Vite zeigt die genaue Adresse im Terminal an. Mit der Standardkonfiguration liegt die App unter
`http://localhost:5173/GymBuddie/`. Der Entwicklungsserver aktiviert bewusst keinen produktiven
Service Worker; PWA- und Offline-Verhalten deshalb immer über den Preview-Build prüfen.

## Qualitätsprüfungen

```bash
# ESLint ohne automatische Änderungen
npm run lint

# Nur gezielte automatische ESLint-Korrekturen
npm run lint:fix

# Formatierung prüfen oder anwenden
npm run format:check
npm run format

# Unit-Tests
npm run test:unit

# Gesamter statischer Check inklusive TypeScript, Build und PWA-Artefakten
npm run check
```

Für die Browsertests muss Chromium einmalig installiert werden:

```bash
npm run test:e2e:install
npm run test:e2e
```

`npm run test:e2e` startet selbstständig einen Produktions-Preview und prüft unter anderem die
axe-core-Regeln, die Service-Worker-Registrierung und einen Reload ohne Netzwerk.

## Produktions-Build und PWA prüfen

```bash
npm run build
npm run verify:pwa
npm run preview
```

`npm run build` führt zuerst den TypeScript-Check und danach den Vite-Build aus. Der
PWA-Artefaktcheck schlägt fehl, falls `dist/sw.js`, das Manifest, die generierte
`workbox-*.js`-Datei oder der gebündelte Registrierungscode fehlen.

Für eine manuelle Kontrolle:

1. Die vom Preview-Server angezeigte `/GymBuddie/`-Adresse einmal online öffnen.
2. Auf den Hinweis warten, dass GymBuddie offline verfügbar ist.
3. In den Browser-Entwicklertools Manifest und Service Worker kontrollieren.
4. Den Netzwerkmodus auf „Offline“ setzen und die Seite neu laden.

## Deployment

Der Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) prüft Pull Requests und
führt bei Änderungen auf `main` folgende Schritte aus:

1. reproduzierbare Installation mit `npm ci` und Dependency-Audit,
2. Linting, Formatcheck, Unit-Tests, TypeScript-Check und Produktions-Build,
3. Playwright-/axe-Tests,
4. explizite Prüfung der Service-Worker- und Workbox-Dateien,
5. Upload ausschließlich des erzeugten `dist`-Ordners und Deployment auf GitHub Pages.

Im Repository muss unter **Settings → Pages → Build and deployment → Source** einmalig
**GitHub Actions** gewählt werden. Ein erfolgreicher Push auf `main` aktualisiert danach die
öffentliche Seite.
