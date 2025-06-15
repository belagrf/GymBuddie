# GymBuddie 🏋️

GymBuddie ist eine einfache und schnelle Progressive Web App (PWA), um deine Trainingsfortschritte im Fitnessstudio zu verfolgen. Die App ist für die mobile Nutzung optimiert und funktioniert auch offline.

## Features

- **Kategorien erstellen:** Organisiere dein Training in Kategorien (z.B. Push, Pull, Beine).
- **Übungen hinzufügen:** Lege spezifische Übungen innerhalb jeder Kategorie an.
- **Fortschritt tracken:** Logge dein Trainingsgewicht, Wiederholungen und Sätze für jede Übung.
- **Historie einsehen:** Verfolge deine Verbesserungen über eine chronologische Liste deiner letzten Einträge.
- **Video-Links:** Füge zu jeder Übung einen Link zu einem Technik-Video hinzu.
- **Offline-fähig:** Als PWA konzipiert, werden alle Daten lokal auf dem Gerät gespeichert und die App funktioniert auch ohne Internetverbindung.

## Tech Stack

- **Framework:** [Vue.js](https://vuejs.org/) 3 (Composition API)
- **Sprache:** [TypeScript](https://www.typescriptlang.org/)
- **State Management:** [Pinia](https://pinia.vuejs.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Build-Tool:** [Vite](https://vitejs.dev/)
- **Deployment:** [GitHub Pages](https://pages.github.com/)

## Setup & Entwicklung

1.  **Abhängigkeiten installieren:**
    ```bash
    npm install
    ```

2.  **Entwicklungsserver starten:**
    ```bash
    npm run dev
    ```
    Die App ist danach unter `http://localhost:5173` (oder einem ähnlichen Port) erreichbar.

3.  **Produktions-Build erstellen:**
    ```bash
    npm run build
    ```
    Erstellt eine optimierte Version der App im `dist`-Ordner.

## Deployment

Dieses Projekt wird über GitHub Pages veröffentlicht. Der folgende Befehl erstellt einen neuen Build und pusht ihn auf den `gh-pages` Branch des Repositories.

```bash
npm run deploy
