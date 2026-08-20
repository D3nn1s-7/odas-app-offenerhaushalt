# Changelog


## 1.20.0 - 2026-08-20
- FIX: Eigener CSV-Parser brach nachweislich bei eingebetteten Zeilenumbrüchen in Anführungszeichen und doppelten Escape-Quotes; durch vendorte PapaParse ersetzt (F-72)
- FIX: Strukturell ungültige CSV-Zeilen werden jetzt gezählt und als Hinweis angezeigt statt kommentarlos verworfen (F-73)

## 1.19.0 - 2026-08-17
- `fetchOdasJson()` wirft jetzt bei nicht-JSON-Antworten (CSV, HTML, leerer Body) eine sprechende Konfigurationsfehlermeldung statt der rohen `JSON.parse`-Parserfehlermeldung (F-66)

## 1.18.0 - 2026-08-17
- **CHG:** `instanz-config`-`category`-Vokabular auf Deutsch umgestellt (`allgemein`, `beschreibung`, `datenherkunft`, `kontakt-rechtliches`, `sonstiges`); die entfallenen Kategorien `metrics` und `advanced` wurden auf `beschreibung` bzw. `sonstiges` verteilt

## 1.17.0 - 2026-08-13
- FIX: Lifecycle-Ressourcen sauber abgeräumt (F-57): Bereichs- und Gruppen-Chart hängen nun an einem per-Instanz-`runtime`-Objekt; eine `onPageLeave`-Map-Registry zerstört beide Charts, räumt den gehaltenen Render-Timeout ab und schützt verspätete Fetch-Erfolge/-Fehler nach dem Seitenwechsel via `disposed`-Guard (kein DOM-Überschreiben, keine Fehlanzeige nach Leave)

## 1.16.0 - 2026-08-12
- FIX: `app/index.html` auf den Template-Stand (F-47): Datei byte-gleich aus `oda-generic` übernommen — gültiges HTML, deutsche ARIA-Labels, Footer im Body; Titel und Fußzeile bleiben Platzhalter und werden zur Laufzeit aus der Instanz-Config überschrieben

## 1.15.0 - 2026-08-11
- FIX: Laufzeitzustand pro App-Instanz isoliert (F-42): alle `oh-`-IDs instanzeindeutig mit UID (`oh-jahr-select-<uid>`, `oh-ansicht-*-<uid>`, `oh-search-<uid>`, `oh-chart-bereich-<uid>`, `oh-chart-gruppe-<uid>`, KPIs, Drilldown, Tabelle, Ladeanzeige); Radiogruppen-`name="oh-ansicht-<uid>"` — mehrere Instanzen auf einer Seite koppeln ihre Ansichts-Gruppen nicht mehr; Selektoren bleiben container-gescopt (`root.querySelector`)

## 1.14.0 - 2026-08-11
- FIX: XSS- und URL-Vertrag geschlossen (F-35)

## 1.13.0 - 2026-08-07
- FIX: Bootstrap-Ziele instanzeindeutig machen (F-32)

## 1.12.0 - 2026-08-06
- CHG: DOM-Zugriffe auf den App-Container gescopt (F-25): alle Elemente der App werden über den App-Container (container.querySelector) angesprochen statt über document — KPI-Kacheln, Diagramm-Canvas, Drill-Down, Tabelle, Jahr-Auswahl, Ansicht-Radio, Suche und Schließen-Button

## 1.11.0 - 2026-08-06
- FIX: Datenschutzangabe beschreibt den tatsaechlichen Stand nach dem Vendoring (Welle G)

## 1.10.0 - 2026-08-06
- FIX: Base auf Template oda-generic 1.6.0 vereinheitlicht (Hook renderPageOverride)

## 1.9.0 - 2026-08-04
- FIX: Datenschutzhinweis "Beim Aufruf kontaktierte Drittanbieter" an das Vendoring angepasst — jetzt lokal ausgelieferte Bibliotheken (Bootstrap/Leaflet/Chart.js) sind aus der Liste entfernt, weiterhin extern geladene Dienste (Kartenkacheln, Zusatzbibliotheken) bleiben genannt

## 1.8.0 - 2026-08-04
- FIX: Bootstrap, Chart.js vendored in `app/vendor/` statt von CDN geladen (F-07 Teil 2) — Standalone-Betrieb laedt diese Bibliotheken nicht mehr extern

## 1.7.0 - 2026-08-04
- FIX: Chart.js-Version vereinheitlicht auf 4.4.9 (vorher uneinheitlich gepinnt oder ganz ungepinnt, laedt bei jedem Aufruf die neueste Version) — Voraussetzung fuer das geplante Vendoring (F-07 Teil 2)

## 1.6.0 - 2026-08-04
- FIX: Drittanbieter (CDN, Kartendienste) in `datenschutz`-Default und README dokumentiert (F-07 Teil 1)
- FIX: Bootstrap CSS/JS auf einheitlich 5.3.8 gezogen (vorher gemischt 5.3.0/5.3.1 bzw. 5.3.0/5.3.0) (F-31)
- FIX: lokale `odas-config/config.json`: leeres Pflichtfeld `urlDaten` auf den Datensatz-Link gesetzt

## 1.5.0 - 2026-07-31
- CHG: toter Konfigurationsschlüssel lizenz entfernt (F-17)
- CHG: brandingCSS und brandingCSSFile als Base-Abhängigkeiten deklariert und lokal gespiegelt (F-17)
- CHG: Groß-/Kleinschreibung der Config-Schlüssel vereinheitlicht, Fallback-Ketten entfernt (F-17)
- CHG: haushaltsjahr in die lokale Konfiguration gespiegelt (F-17)
- CHG: dropdown-Default auf Feldebene verschoben statt in format (F-18)
- FIX: defekte Icon- und Screenshot-Referenzen korrigiert (F-19)
- CHG: daten.schema auf assets/schema.json gesetzt (F-20)
- CHG: assets/schema.json auf ein flaches Frictionless Table Schema gebracht (F-20)

## 1.4.0 - 2026-07-30

- **FIX:** Laufzeitfehler nach dem Laden der Konfiguration werden jetzt sichtbar gemeldet; `handleRouting()` wird `await`et und besitzt einen Fehlerpfad. Bisher blieb die Seite bei einem Fehler im Seitenaufbau stumm leer
- **FIX:** `getConfigUrl()` schneidet bei einer URL ohne abschliessenden Schraegstrich nicht mehr das letzte Verzeichnis ab; die Konfiguration wird auch unter `.../app` gefunden
- **FIX:** Klick auf einen Hash-Link, der bereits die aktive Seite bezeichnet, rendert die Seite neu (`setupSamePageLinks()`) - das Logo fuehrt damit aus Unteransichten zurueck zur Startseite
- **ENH:** `app/app-base.js` ist wieder byte-identisch zum Template `oda-generic` 1.4.0; app-spezifisches Aufraeumen laeuft ueber den neuen Hook `onPageLeave(page)` in `app/app.js`

## 1.3.0 - 2026-07-24

- **FIX:** Laufzeit-Fehlermeldung wird vor der Anzeige HTML-maskiert (`escapeHtmlForBase`); ein Fehlertext kann kein Markup mehr in die Seite einschleusen (XSS)
- **FIX:** Startseiten-Renderer wird nun `await`et; bei asynchronen Apps erscheint kein kurzzeitiges `[object Promise]` in `#main-content`

## 1.2.0 - 2026-07-23

- **ENH:** Datenabruf auf den Schalter `proxyAktiv` umgestellt; direkte Abrufe sind der Standard, der ODAS-Proxy wird nur noch bei `ja` verwendet
- **ENH:** Einfachen Standalone-Betrieb hinter Traefik mit derselben `odas-config/config.json` wie in der Entwicklung ergänzt
- **ENH:** Traefik-Anbindung auf das externe Netzwerk `proxynet`, den EntryPoint `websecure` und den Zertifikatsresolver `letsencrypt` festgelegt
- **FIX:** Proxy-Basispfad funktioniert jetzt auch bei URLs mit `index.html`; der Ziel-Pfad wird URL-kodiert
- **DOC:** Start über `STANDALONE=true make up` dokumentiert

## ToDo

- Frictionless Schema hinzufügen

## 03.07.2026 (Version 1.1.0)

- ENH: Abschnitt „Für wen ist diese App?" in Beschreibung ergänzt (Schale 4)
- ENH: Konfigurierbarer Abschnitt „Weitere Informationen" mit weiterführenden Links (neues Feld `weiterfuehrendeLinks`, leer = ausgeblendet)
- ENH: Datenstand-Anzeige im KPI-Bereich (neues Feld `datenStand`, leer = ausgeblendet)
- ENH: XSS-Schutz durch `escapeHtml()` an allen dynamischen Ausgabestellen

## 21.02.2025

- ENH: app-package mit Multiline Strings
- ENH: Feldtypen von HTML auf Markdown umgestellt

## 17.02.2025

- FIX: Loadpage Funktion optimiert

## 12.2.2025 (Version 1.0.0)

- ENH: Anzeige config.json
- ENH: Config-File mit Multiline-String (als Array)
- FIX: Code-Teilung in app-base und app
- FIX: Docker korrigiert, läuft wieder
