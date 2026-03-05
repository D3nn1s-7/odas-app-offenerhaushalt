# Offener Haushalt – App für den Open Data App-Store (ODAS)

Interaktive Visualisierung des kommunalen Ergebnishaushalts für den [Open Data App Store](https://open-data-app-store.de/). Entspricht der [Open Data App-Spezifikation](https://open-data-apps.github.io/open-data-app-docs/open-data-app-spezifikation/). Mehr unter https://github.com/open-data-apps

---

## Funktionen

![Desktop Screenshot](/assets/Desktop_Screenshot.png)

![Desktop Screenshot 2](/assets/Desktop_Screenshot_2.png)

Single Page Application mit Logo, Menü, Impressum/Datenschutz/Kontakt-Seiten und Fußzeile. Die Konfiguration wird vom ODAS geladen. Inhalte:

- **Balkendiagramm** – Einnahmen und Ausgaben nach Produktbereichen
- **Drill-Down** – Klick auf einen Produktbereich zeigt die enthaltenen Produktgruppen
- **KPI-Kacheln** – Gesamterträge, Gesamtaufwand, Saldo, Anzahl Produktbereiche
- **Detailtabelle** – Alle Produktgruppen mit Einnahmen, Ausgaben und Saldo
- **Filter** – nach Haushaltsjahr, Ansicht (Einnahmen / Ausgaben / beide) und Freitextsuche

---

## Datenformat

Unterstützt **JSON** und **CSV** mit automatischer Formaterkennung:

| Format                     | Beispiel                               |
| -------------------------- | -------------------------------------- |
| CKAN Datastore API JSON    | `{ "result": { "records": [...] } }`   |
| OpenDataSoft API v1        | `{ "records": [{ "fields": {...} }] }` |
| OpenDataSoft API v2        | `{ "results": [...] }`                 |
| Direktes JSON-Array        | `[ { ... }, ... ]`                     |
| CSV (Semikolon oder Komma) | `Produktbereich;Produktgruppe;...`     |

---

## Kompatible Datensätze

Haushaltsdatensätze mit folgenden Kernfeldern (Feldnamen werden automatisch per Alias-Matching erkannt, Groß-/Kleinschreibung egal):

| Schema-Feld      | Erkannte Aliase                                                |
| ---------------- | -------------------------------------------------------------- |
| `produktbereich` | `produktbereich`, `bereich`, `hauptgruppe`                     |
| `produktgruppe`  | `produktgruppe`, `gruppe`, `untergruppe`                       |
| `haushaltsjahr`  | `haushaltsjahr`, `jahr`, `year`, `geschaeftsjahr`              |
| `ertragaufwand`  | `ertragaufwand`, `richtung`, `typ`, `art`, `einnahmenausgaben` |
| `betrag`         | `betrag`, `wert`, `summe`, `plan`, `ansatz`                    |

Beträge können als Zahl oder String (mit Punkt/Komma als Dezimaltrennzeichen) vorliegen.

### Beispiel JSON

```json
{
  "produktbereich": "01",
  "produktbereichbezeichnung": "Allgemeine Verwaltung",
  "produktgruppe": "0101",
  "produktgruppebezeichnung": "Zentrale Verwaltung",
  "haushaltsjahr": "2024",
  "ertragaufwand": "E",
  "betrag": 123456.78
}
```

### Beispiel CSV

```
Produktbereich;Produktbereichbezeichnung;Produktgruppe;Produktgruppebezeichnung;Haushaltsjahr;ErtragAufwand;Betrag
01;Allgemeine Verwaltung;0101;Zentrale Verwaltung;2024;E;123456.78
```

---

## Entwicklung

**Voraussetzungen:** Docker / Docker Compose, Make

```bash
make build up
```

App läuft auf http://localhost:8089 (Konfiguration wird lokal aus `odas-config/config.json` geladen).

### Live Server (ohne Docker)

1. In `app/app-base.js` den Localhost-Block einkommentieren:
   ```js
   if (["127.0.0.1", "localhost"].includes(url.hostname)) {
     configUrl = "../odas-config/config.json";
   }
   ```
2. In `odas-config/config.json` die gewünschte `apiurl` eintragen.
3. `app/index.html` mit VS Code Live Server öffnen: `http://127.0.0.1:5500/app/index.html`

### Wichtige Dateien

| Datei                      | Beschreibung                                            |
| -------------------------- | ------------------------------------------------------- |
| `app/app.js`               | Hauptlogik: Datenladen, Parsing, Rendering, Charts      |
| `app/app-base.js`          | Framework: Config laden, Routing, Menü, Branding        |
| `app/index.html`           | HTML-Skelett                                            |
| `app/app.css`              | App-spezifische Styles                                  |
| `app/app-base.css`         | Framework-Styles                                        |
| `app-package.json`         | App-Metadaten und Instanz-Konfigurationsfelder für ODAS |
| `odas-config/config.json`  | Lokale Konfiguration für die Entwicklung                |
| `assets/odas-app-icon.svg` | App-Icon                                                |
| `assets/branding.css`      | Anbieter-Branding (wird per Config eingebunden)         |

---

## Konfiguration (Instanz)

| Parameter       | Beschreibung                                                         | Pflicht |
| --------------- | -------------------------------------------------------------------- | ------- |
| `apiurl`        | Direkte URL zur Datenressource (JSON oder CSV)                       | ja      |
| `urlDaten`      | URL zur Katalog-Seite des Datensatzes im ODP                         | ja      |
| `titel`         | Anzeigetitel der App                                                 | ja      |
| `seitentitel`   | Browser-Tab-Titel                                                    | ja      |
| `haushaltsjahr` | Optional: nur dieses Jahr anzeigen (z. B. `2024`); leer = alle Jahre | nein    |
| `beschreibung`  | Text für den Menüpunkt „Über diese App" (Markdown)                   | ja      |
| `kontakt`       | Text für den Menüpunkt „Kontakt" (Markdown)                          | ja      |
| `impressum`     | Text für den Menüpunkt „Impressum" (Markdown)                        | ja      |
| `datenschutz`   | Text für den Menüpunkt „Datenschutz" (Markdown)                      | ja      |
| `fusszeile`     | Text der Fußzeile                                                    | ja      |
| `icon`          | Logo-URL, das links oben angezeigt wird                              | ja      |

---

## Vor der Einreichung in den ODAS

- [ ] Localhost-Block in `app/app-base.js` wieder **auskommentieren**
- [ ] `odas-config/config.json`: `apiurl` leeren, Testdaten entfernen
- [ ] `app-package.json`: Name, Beschreibung, Tags und `instanz-config` prüfen
- [ ] Screenshots aktualisieren (`assets/Desktop_Screenshot.png`, `assets/Mobile_Screenshot.png`)

Weitere Hinweise: [Open Data App-Spezifikation](https://open-data-apps.github.io/open-data-app-docs/)

---

## Autor

© 2026, Ondics GmbH
