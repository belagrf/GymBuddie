<p align="center">
  <img src="./public/pwa-icon.svg" alt="GymBuddie Logo" width="96" height="96" />
</p>

<h1 align="center">GymBuddie</h1>

<p align="center">
  Ein privater, offline-fähiger Trainingstracker für Übungen, Sätze und Fortschritt.
</p>

<p align="center">
  <a href="https://belagrf.github.io/GymBuddie/"><strong>Live-App öffnen</strong></a>
  ·
  <a href="https://github.com/belagrf/GymBuddie/actions/workflows/pages.yml">Build-Status</a>
</p>

<p align="center">
  <a href="https://github.com/belagrf/GymBuddie/actions/workflows/pages.yml">
    <img src="https://github.com/belagrf/GymBuddie/actions/workflows/pages.yml/badge.svg" alt="Quality checks and GitHub Pages" />
  </a>
</p>

GymBuddie ist eine mobile Progressive Web App (PWA), mit der sich Krafttraining ohne
Benutzerkonto oder Cloud-Dienst dokumentieren lässt. Alle Trainingsdaten bleiben im
Website-Speicher des verwendeten Browserprofils. Nach einem erfolgreichen Online-Laden und der
Aktivierung des Service Workers funktioniert die App auch ohne Internetverbindung.

## Funktionen

- Trainingskategorien und Übungen verwalten, umbenennen und bearbeiten, ohne die Historie zu verlieren
- Gewicht (mit Dezimalkomma, z. B. `42,5`) und Wiederholungen für einzelne Sätze erfassen
- Gespeicherte Sätze nachträglich bearbeiten oder löschen
- Trainingshistorie nach Trainingstag gruppiert anzeigen: die letzten drei Einheiten sofort,
  ältere auf Wunsch
- Tagesfortschritt direkt auf der Startseite sehen
- Optionale Links zu Übungsanleitungen hinterlegen (`youtube.com/…` wird automatisch zu `https://…`)
- Vollständige JSON-Backups exportieren und nach einer Vorschau kontrolliert importieren
- Automatische Sicherungskopien vor dem Ersetzen oder Bereinigen von Daten
- Als App installieren und nach dem ersten Laden offline verwenden
- Tastaturbedienbare, responsive Oberfläche mit Unterstützung für reduzierte Animationen

## Schnellstart

1. Unter **Trainingskategorie hinzufügen** einen Namen eingeben und **Hinzufügen** wählen.
2. In der neuen Kategorie **+ Übung hinzufügen** öffnen.
3. **Name der Übung** und optional **Anleitung als Link** ausfüllen, danach **Übung speichern**.
4. **Gewicht (kg)** und **Wiederholungen** eintragen und den **Satz speichern**.
5. Gespeicherte Sätze direkt in der geöffneten **Trainingshistorie** prüfen oder bearbeiten.

## PWA und Offline-Verhalten

GymBuddie enthält ein Web-App-Manifest, einen Workbox Service Worker, eine vorab
zwischengespeicherte App-Shell und eigene Installationssymbole. Sobald eine neue Version
bereitsteht, bietet die App ein kontrolliertes Update an.

| Funktion                            | Offline verfügbar?                      |
| ----------------------------------- | --------------------------------------- |
| App öffnen                          | Ja, nach dem ersten erfolgreichen Laden |
| Übungen und Sätze verwalten         | Ja                                      |
| Trainingshistorie ansehen           | Ja                                      |
| Backup exportieren oder importieren | Ja                                      |
| Externe Anleitungslinks öffnen      | Nein                                    |
| Erstinstallation und App-Updates    | Benötigen eine Internetverbindung       |

Unterstützt werden aktuelle Versionen von Chrome, Edge, Firefox und Safari, auf iPhone und iPad ab
iOS 15.4.

### Installation

1. [GymBuddie im Browser öffnen](https://belagrf.github.io/GymBuddie/).
2. Die Installationsfunktion des Browsers beziehungsweise **Zum Home-Bildschirm** verwenden.
3. Die App einmal vollständig online laden, damit die Offline-Dateien gespeichert werden.

> **iPhone und iPad:** Eine über **Zum Home-Bildschirm** installierte App hat einen eigenen,
> von Safari getrennten Speicher. Wer GymBuddie vorher in Safari genutzt hat, exportiert dort ein
> Backup und importiert es anschließend in der installierten App. Danach am besten nur noch die
> installierte App verwenden.

Der Entwicklungsserver registriert bewusst keinen produktiven Service Worker. Offline- und
Update-Verhalten deshalb über einen Produktions-Build mit `npm run preview` prüfen.

## Daten, Datenschutz und Backups

> **Wichtig:** GymBuddie besitzt kein Benutzerkonto, kein Backend und keine Cloud-Synchronisierung.
> Das Löschen der Website-Daten, der Wechsel des Browsers beziehungsweise Browserprofils oder ein
> Gerätewechsel entfernt daher den Zugriff auf die lokal gespeicherten Trainingsdaten, sofern
> vorher kein Backup erstellt wurde.

Unter **Daten sichern → Backup exportieren** lässt sich jederzeit eine vollständige JSON-Datei
mit dem Namen `gymbuddie-backup-YYYY-MM-DD.json` erstellen. Der Bereich zeigt außerdem, wann zuletzt
ein Backup erstellt wurde und ob der Browser die Daten dauerhaft speichert. Nach dem ersten
gespeicherten Satz bittet GymBuddie den Browser um dauerhaften Speicher (Firefox fragt dabei einmal
nach). Ohne diese Freigabe kann der Browser die Daten bei Speichermangel löschen – Safari tut das für
nicht installierte Websites bereits nach sieben Tagen ohne Nutzung. Regelmäßige Backups bleiben
deshalb wichtig.

Der Import akzeptiert nur GymBuddie-Backups bis 20 MB mit mindestens einer gültigen Kategorie. Vor
dem Ersetzen zeigt GymBuddie eine Vorschau mit Kategorien, Übungen und Sätzen des Backups sowie des
aktuellen Stands und bietet an, die aktuellen Daten zuerst zu exportieren.

Die lokale Datenhaltung umfasst:

- ein versioniertes Speicherformat unter `gymbuddie:data:v2`,
- sofortiges Speichern jeder Änderung; schlägt das Speichern fehl, wird die Änderung zurückgenommen
  und der Fehler direkt am Formular angezeigt,
- automatische Bereinigung und Validierung importierter Daten,
- sichere Migration älterer `gymData`-Bestände,
- Sicherungskopien unter `gymbuddie:backup:*`: der Altdatenbestand vor der Migration, bis zu drei
  unveränderte Kopien beschädigter Daten und der Datenstand vor dem letzten Import. Sie lassen sich
  unter **Daten sichern** herunterladen, wiederherstellen oder löschen. Die Import-Kopie wird bei
  vollem Speicher als Erstes freigegeben,
- Schreibschutz, solange unlesbare Daten weder gesichert noch bewusst verworfen wurden oder aus einer
  neueren GymBuddie-Version stammen,
- Synchronisierung zwischen geöffneten Tabs desselben Browsers; hat ein anderer Tab zuerst
  gespeichert, wird dessen Stand geladen statt überschrieben.

Backups enthalten die vollständige Trainingshistorie und sollten wie persönliche Dateien
behandelt werden.

## Technischer Aufbau

| Bereich       | Umsetzung                            |
| ------------- | ------------------------------------ |
| Oberfläche    | Vue 3, TypeScript und Tailwind CSS 4 |
| Zustand       | Pinia                                |
| Navigation    | Vue Router                           |
| Build         | Vite                                 |
| PWA           | `vite-plugin-pwa` und Workbox        |
| Unit-Tests    | Vitest, Vue Test Utils und jsdom     |
| Browser-Tests | Playwright und axe-core              |
| Hosting       | GitHub Pages über GitHub Actions     |

Wichtige Projektbereiche:

| Pfad                                | Aufgabe                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `src/domain/gymData.ts`             | Datenschema, Validierung, Migration und Serialisierung     |
| `src/stores/gymStore.ts`            | Trainingszustand, Persistenz und Tab-Synchronisierung      |
| `src/views/HomeView.vue`            | Hauptansicht und Verwaltung der Trainingskategorien        |
| `src/components/ExerciseCard.vue`   | Satzerfassung, Bearbeitung und Trainingshistorie           |
| `src/components/DataManagement.vue` | Backup-Export, Import und Speicherfehler                   |
| `src/components/PwaPrompt.vue`      | Offline-, Update- und Service-Worker-Rückmeldungen         |
| `vite.config.ts`                    | Basispfad, Manifest, App-Symbole und Workbox-Konfiguration |
| `tests/unit`                        | Tests für Datenlogik, Store und UI-Hilfsfunktionen         |
| `tests/e2e`                         | Browser-, Offline-, Migrations- und Accessibility-Tests    |

## Lokale Entwicklung

### Voraussetzungen

- Node.js 24 (mindestens 24.15). Die Version steht in `.node-version`; mise, nvm und fnm lesen sie
  automatisch.
- npm 11.6.4 oder neuer. npm 11.6.2 schreibt unvollständige Lockfiles, an denen `npm ci` scheitert,
  deshalb bricht das Projekt mit dieser Version über `devEngines` ab (`EBADDEVENGINES`). Abhilfe:
  Node 24 verwenden (z. B. `mise install` im Projektordner) oder `npm install -g npm@latest`.

### Projekt starten

```bash
git clone https://github.com/belagrf/GymBuddie.git
cd GymBuddie
npm ci
npm run dev
```

Die lokale Anwendung ist standardmäßig unter
[`http://localhost:5173/GymBuddie/`](http://localhost:5173/GymBuddie/) erreichbar.

### Befehle

| Befehl                     | Zweck                                                    |
| -------------------------- | -------------------------------------------------------- |
| `npm run dev`              | Entwicklungsserver starten                               |
| `npm run build`            | TypeScript prüfen und Produktions-Build erzeugen         |
| `npm run preview`          | Produktions-Build lokal ausliefern                       |
| `npm run lint`             | ESLint ohne automatische Änderungen ausführen            |
| `npm run format:check`     | Prettier-Formatierung prüfen                             |
| `npm run test:unit`        | Unit-Tests einmalig ausführen                            |
| `npm run test:e2e:install` | Chromium inklusive benötigter Systempakete installieren  |
| `npm run test:e2e`         | Browser-, Offline- und axe-Tests ausführen               |
| `npm run test`             | Unit-Tests und anschließend Browser-Tests ausführen      |
| `npm run audit`            | Bei hohen oder kritischen Sicherheitslücken fehlschlagen |
| `npm run lockfile:check`   | Prüfen, ob `package-lock.json` zu `package.json` passt   |
| `npm run check`            | Lockfile, Lint, Format, Unit-Tests, Typen, Build und PWA |
| `npm run verify:pwa`       | Vorhandenen `dist`-Build auf PWA-Artefakte prüfen        |

Für die vollständige lokale Prüfung:

```bash
npm run check
npm run test:e2e:install # nur vor dem ersten Browser-Test nötig
npm run test:e2e
npm run audit
```

## Qualitätssicherung

Die automatisierten Prüfungen decken unter anderem folgende Fälle ab:

- Migration alter und gemischter Datenschemata ohne Verlust gültiger Sätze
- Wiederherstellung bei beschädigten lokalen Daten, Sicherungskopien und Schreibschutz
- Validierung von Namen, Gewichten, Wiederholungen, IDs und Video-URLs
- Ablehnung fremder oder leerer Backups, Import-Vorschau und Wiederherstellung
- Zurücknehmen fehlgeschlagener Änderungen und Konflikte zwischen Browser-Tabs
- Tagesgrenze um Mitternacht mit festgelegter Uhrzeit statt echter Uhr
- vollständiger Trainingsablauf bei einer Breite von 320 Pixeln
- Fokusführung in einem reinen Tastaturablauf
- axe-core-Prüfung der leeren und befüllten Oberfläche sowie geöffneter Formulare
- Service-Worker-Registrierung, Neuladen ohne Netzwerk und Weiterleitung unbekannter Pfade
- Manifest-Semantik (ID, Scope, keine Ausrichtungssperre, Symbolgrößen) im Build

## Deployment

Der Workflow [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) läuft bei Pull Requests
und bei Änderungen an `main`.

1. `npm ci` installiert exakt den Lockfile-Stand.
2. Linting, Formatierung, Unit-Tests, Typprüfung und Build werden ausgeführt.
3. Chromium prüft Kernabläufe, Barrierefreiheit, Migration und Offline-Verhalten; bei Fehlern
   werden die Playwright-Ergebnisse als Artefakt hochgeladen.
4. Die erzeugten PWA-Dateien werden nochmals explizit validiert.
5. Das Dependency-Audit läuft nach den Tests, blockiert aber weiterhin das Deployment.
6. Nur bei `main` wird ausschließlich der erzeugte `dist`-Ordner auf GitHub Pages veröffentlicht.
   Nur dieser Job erhält Schreibrechte für Pages.

Dependabot schlägt wöchentlich Updates für npm-Pakete und GitHub Actions vor. Kleinere Updates
kommen gebündelt, große Versionssprünge zusammengehöriger Werkzeuge (Vite, ESLint, Pinia/Vue Router)
jeweils in einem gemeinsamen Pull Request. Neue Versionen werden erst nach einigen Tagen
vorgeschlagen. TypeScript ab 6.1 und neue Hauptversionen von `@types/node` sind bewusst
zurückgestellt, bis `typescript-eslint` bzw. die Laufzeitumgebung nachziehen.

Der Produktions-Basispfad wird in GitHub Actions aus `GITHUB_REPOSITORY` abgeleitet
(`<owner>.github.io`-Repositories werden unter `/` ausgeliefert) und kann für andere Ziele über die
Repository-Variable `VITE_BASE_PATH` überschrieben werden. In einem Fork muss GitHub Pages einmalig
auf **GitHub Actions** als Veröffentlichungsquelle eingestellt werden.

Die öffentliche Version ist unter
[belagrf.github.io/GymBuddie](https://belagrf.github.io/GymBuddie/) erreichbar.

## Hinweis zur Entwicklung

Teile dieses Projekts wurden mit KI-Unterstützung erstellt. Die Codebasis wird durch statische
Prüfungen, automatisierte Unit- und Browser-Tests sowie einen reproduzierbaren CI-Build
abgesichert.
