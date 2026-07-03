# Changelog

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
