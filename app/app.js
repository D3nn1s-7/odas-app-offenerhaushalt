/*
 * Diese Funktion ist für die Inhalte der Startseite
 * zuständig.
 *
 * Der umschließende HTML code ist:
 *      <body>
 *      <div class="container mt-4" id="main-content">
 *          ...
 *      </div>
 *      </body>
 * Als CSS Framework wird Bootstrap 5.3 verwendet.
 *
 * ConfigData JSON enthält:
 * {
 *   "apiurls": [                      // URL(s) zur JSON- oder CSV-Ressource
 *     { "name": "haushalt", "label": "...", "url": "https://..." }
 *   ],
 *   "titel": "Offener Haushalt",      // optional
 *   "haushaltsjahr": "2024"           // optional – Filter auf ein Jahr
 * }
 *
 * Unterstützte Datenformate (auto-detect):
 *  - CKAN Datastore API JSON: { result: { records: [...] } }
 *  - Direktes JSON-Array:     [ { ... }, ... ]
 *  - CSV (text/csv):          Produktbereich;Produktgruppe;...
 *
 * Spaltenbezeichnungen werden flexibel per Alias-Matching erkannt.
 */
let ohInstanzZaehler = 0;

// Laufzeit-Cleanups pro App-Instanz, je DOM-Container registriert. onPageLeave
// iteriert alle registrierten Cleanups (try/catch) und leert die Registry
// anschliessend — die app/app-base.js ruft onPageLeave beim Seitenwechsel auf.
const ohCleanups = new Map();

function onPageLeave() {
  ohCleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch (_err) {
      // Ein einzelner Cleanup darf den Seitenwechsel nicht blockieren.
    }
  });
  ohCleanups.clear();
}

function isOdasProxyEnabled(configdata = {}) {
  return String(configdata.proxyAktiv || "").trim().toLowerCase() === "ja";
}

function extractPathFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname + parsedUrl.search;
  } catch (_error) {
    return String(url || "");
  }
}

function getOdasAppBasePath(pathname) {
  let appPath =
    pathname === undefined
      ? typeof window !== "undefined"
        ? window.location.pathname
        : "/"
      : String(pathname || "/");

  if (!appPath.endsWith("/")) {
    const lastSlashIndex = appPath.lastIndexOf("/");
    const lastSegment = appPath.substring(lastSlashIndex + 1);
    if (lastSegment.includes(".")) {
      appPath = appPath.substring(0, lastSlashIndex + 1);
    }
  }

  return appPath.replace(/\/+$/, "");
}

function getOdasProxyEndpoint(targetUrl, pathname) {
  const appPath = getOdasAppBasePath(pathname);
  return `${appPath}/odp-data?path=${encodeURIComponent(targetUrl)}`;
}

async function fetchViaOdasProxy(targetUrl, options = {}) {
  if (typeof isKeineDatenquelleKonfiguriert === "function" && isKeineDatenquelleKonfiguriert(targetUrl)) {
    throw new Error("Keine Datenquelle konfiguriert.");
  } else if (typeof isKeineDatenquelleKonfiguriert !== "function") {
    const v = String(targetUrl || "").trim();
    if (!v || /^\{\{.*\}\}$/.test(v) || /^<.*>$/.test(v)) throw new Error("Keine Datenquelle konfiguriert.");
  }

  const response = await fetch(getOdasProxyEndpoint(targetUrl), {
    method: "POST",
    signal: options && options.signal ? options.signal : undefined,
  });

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch (_e) {}
    const originHint = /origin not allowed/i.test(body) ? " – URL origin not allowed" : "";
    throw new Error(`ODAS-Proxy-Fehler: HTTP ${response.status}${originHint}`);
  }

  const proxyData = await response.json();
  if (!proxyData || typeof proxyData.content !== "string") {
    throw new Error("ODAS-Proxy-Antwort enthält keinen content-String.");
  }

  return proxyData.content;
}

async function fetchOdasResource(targetUrl, configdata = {}) {
  if (isOdasProxyEnabled(configdata)) {
    return fetchViaOdasProxy(targetUrl);
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    throw new Error(
      `Direkter Datenabruf fehlgeschlagen (${error.message}). Bitte prüfen Sie die Daten-URL und die CORS-Freigabe der Datenquelle.`,
    );
  }
}

/**
 * Löst eine benannte Datenressource aus configdata.apiurls auf.
 * Neue apiurls-Form (typ: "array"); das frühere skalare apiurl wird nicht mehr gelesen.
 * @returns {string} getrimmte URL, oder "" für den Zustand "keine Quelle konfiguriert"
 */
function getOdasApiUrl(configdata, name) {
  const liste = Array.isArray(configdata && configdata.apiurls) ? configdata.apiurls : [];
  const treffer = liste.find((eintrag) => eintrag && eintrag.name === name);
  return String((treffer && treffer.url) || "").trim();
}

async function fetchOdasJson(targetUrl, configdata = {}) {
  const rawContent = await fetchOdasResource(targetUrl, configdata);
  try {
    return JSON.parse(rawContent);
  } catch (_error) {
    throw new Error(
      `Die konfigurierte Daten-URL liefert kein JSON, sondern ${describeNonJsonPayload(rawContent)}. ` +
        "Bitte in der Instanzkonfiguration den API-Endpunkt der Datenquelle eintragen, " +
        "nicht den Datensatz- oder Download-Link.",
    );
  }
}

// OH-B3: JSON.parse direkt auf Fetch-Ergebnisse wirft bei HTML-Fehlerseiten
// einen rohen SyntaxError (F-66-Klasse) — stattdessen freundlich melden.
function ohParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_e) {
    throw new Error(
      `Die konfigurierte Daten-URL liefert kein JSON, sondern ${describeNonJsonPayload(text)}. ` +
        "Bitte in der Instanzkonfiguration den API-Endpunkt der Datenquelle eintragen, " +
        "nicht den Datensatz- oder Download-Link.",
    );
  }
}

function describeNonJsonPayload(rawContent) {
  const text = String(rawContent == null ? "" : rawContent).trim();
  if (!text) return "eine leere Antwort";
  if (text.startsWith("<")) return "eine HTML-Seite";
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (/[,;]/.test(firstLine)) return "eine CSV- oder Textdatei";
  return "unlesbaren Inhalt";
}

function isKeineDatenquelleKonfiguriert(targetUrl) {
  const quelle = String(targetUrl || "").trim();
  return !quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle);
}


const TYP_BEZEICHNUNG = {
  "ckan-dkan-ds": "Tabellen-API mit Daten-ID",
  "ckan-ps": "Datensatz-API",
  "ckan-dl": "Datei-Download",
  "ods21": "Open-Data-Suche (API v2.1)",
  "wfs": "Kartendienst (WFS)",
  "sparql": "Wissensdatenbank (SPARQL)",
  "csv-zip": "Statische Datei"
};

function validateUrlTypErwartung(url, erwarteterTyp) {
  const u = String(url || "");
  if (!erwarteterTyp || isKeineDatenquelleKonfiguriert(u)) return null;
  const checks = {
    "ckan-dkan-ds": /\/api\/3\/action\/datastore_search\?resource_id=/i,
    "ckan-ps": /\/api\/3\/action\/package_show\?id=/i,
    "ckan-dl": /\/dataset\/.*\/resource\/.*\/download\//i,
    "ods21": /\/api\/explore\/v2\.1\//i,
    "wfs": /service=WFS/i,
    "sparql": /\/api\/ts\/v1\/kg\/sparql/i,
    "csv-zip": /\.(csv|json|zip)(\?|$)/i
  };
  const re = checks[erwarteterTyp];
  if (!re) return null;
  if (!re.test(u)) {
    const soll = TYP_BEZEICHNUNG[erwarteterTyp] || erwarteterTyp;
    return `Typ passt nicht: erwartet „${soll}", erhalten „${u.slice(0, 60)}…". Prüfen Sie den Hilfe-Tooltip bei „URLs zu Datenressourcen".`;
  }
  return null;
}

function classifyOdasFehler(error, kontext = {}) {
  const msg = String((error && error.message) || error || "");
  const url = String(kontext.url || "");
  const label = String(kontext.label || "Datenressource");
  const typLabel = String(kontext.typLabel || TYP_BEZEICHNUNG[kontext.erwarteterTyp] || "Datenquelle");
  if (/Keine Datenquelle konfiguriert/i.test(msg) || isKeineDatenquelleKonfiguriert(url)) {
    return {
      kind: "KEINE_QUELLE",
      titel: "Es ist keine Datenquelle konfiguriert.",
      hinweis: `Prüfen Sie unter „URLs zu Datenressourcen → ${label}" ob eine gültige ${typLabel}-URL eingetragen ist (Hilfe-Tooltip beachten).`,
      detail: msg,
      alertClass: "alert-info"
    };
  }
  if (/Typ passt nicht: erwartet/i.test(msg)) {
    return {
      kind: "TYP_MISMATCH",
      titel: msg,
      hinweis: `Diese App erwartet ${typLabel}. Korrigieren Sie die URL gemäß Hilfe-Tooltip (Beispiel dort).`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/URL origin not allowed/i.test(msg)) {
    return {
      kind: "PROXY_ORIGIN",
      titel: "ODAS-Proxy blockiert: Ziel-Origin nicht freigegeben.",
      hinweis: "Tragen Sie die Ziel-Origin als eigenen Eintrag unter „URLs zu Datenressourcen“ ein oder prüfen Sie proxyAktiv.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/ODAS-Proxy-Fehler/i.test(msg) || /kein content-String/i.test(msg)) {
    return {
      kind: "PROXY_HTTP",
      titel: msg,
      hinweis: "Prüfen Sie proxyAktiv und Erreichbarkeit im ODAS-Live-System (lokal 404 ist normal).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/Direkter Datenabruf fehlgeschlagen/i.test(msg) || /Failed to fetch/i.test(msg)) {
    const corsHint = /Failed to fetch/i.test(msg) ? " – vermutlich CORS blockiert → im ODAS-Live proxyAktiv=ja." : "";
    return {
      kind: "DIREKT_CORS_HTTP",
      titel: msg,
      hinweis: `Prüfen Sie URL und CORS der Quelle${corsHint}`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/liefert kein JSON/i.test(msg) || /HTML-Seite|CSV-|leere Antwort|unlesbaren/i.test(msg)) {
    return {
      kind: "PAYLOAD_TYP",
      titel: msg,
      hinweis: "Tragen Sie den passenden Endpunkt ein – nicht die Datensatzseite (/dataset/…) – Hilfe-Tooltip beachten.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/CKAN.*Fehler|success:false/i.test(msg)) {
    return {
      kind: "CKAN_API",
      titel: msg,
      hinweis: "Prüfen Sie Daten-ID / Datensatz-ID (existiert die Tabelle/Datei noch auf dem Portal?).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/404|Nicht gefunden/i.test(msg)) {
    return {
      kind: "HTTP_404",
      titel: msg,
      hinweis: "Ressource/Datensatz auf dem Portal nicht gefunden (404).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  return {
    kind: "UNBEKANNT",
    titel: msg || "Unbekannter Fehler beim Laden.",
    hinweis: "Prüfen Sie Konfiguration und Erreichbarkeit der Quelle.",
    detail: msg,
    alertClass: "alert-danger"
  };
}

function renderOdasFehler(container, error, kontext = {}) {
  if (!container) return;
  // Mehrere akzeptierte URL-Typen (z. B. ODS-Suche, CKAN-Tabelle oder
  // statische Datei): erst warnen, wenn kein einziger passt.
  const typen = Array.isArray(kontext.erwarteteTypen) && kontext.erwarteteTypen.length
    ? kontext.erwarteteTypen
    : [kontext.erwarteterTyp];
  let typWarn = null;
  for (const t of typen) {
    typWarn = validateUrlTypErwartung(kontext.url, t);
    if (!typWarn) break;
  }
  if (typWarn && !/Typ passt nicht/i.test(String(error && error.message))) {
    error = new Error(typWarn);
  }
  const info = classifyOdasFehler(error, kontext);
  const url = String(kontext.url || "");
  const urlZeile = url ? `<p class="mb-1 small text-muted">Konfigurierte URL: <code>${escapeHtml(url.length > 80 ? url.slice(0, 80) + "…" : url)}</code></p>` : "";
  const titel = kontext.leer ? "Keine Datensätze gefunden." : info.titel;
  const alertClass = kontext.leer ? "alert-info" : info.alertClass;
  container.innerHTML = `<div class="alert ${alertClass}" role="alert"><strong>${escapeHtml(titel)}</strong><p class="mb-1">${escapeHtml(info.hinweis)}</p>${urlZeile}<details class="small"><summary>Details</summary><code>${escapeHtml(info.detail || String(error))}</code></details></div>`;
}

// PapaParse (CSV-Parsing) dynamisch aus app/vendor laden; Promise-basiert.
// F-72: ersetzt den vormals selbstgeschriebenen CSV-Parser, der bei
// eingebetteten Zeilenumbrüchen in Anführungszeichen und doppelten
// Escape-Quotes ("") nachweislich Datensätze verstümmelte.
function ensurePapaparse() {
  return new Promise((resolve, reject) => {
    if (window.Papa) {
      resolve();
      return;
    }
    const vorhanden = document.getElementById("papaparse-script");
    if (vorhanden) {
      vorhanden.addEventListener("load", () => resolve());
      vorhanden.addEventListener("error", () =>
        reject(new Error("PapaParse konnte nicht geladen werden.")),
      );
      return;
    }
    const script = document.createElement("script");
    script.id = "papaparse-script";
    script.src = "vendor/papaparse/papaparse.min.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("PapaParse konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
}

function app(configdata = {}, enclosingHtmlDivElement) {
  const ohUid = "i" + ++ohInstanzZaehler;
  const apiUrl = getOdasApiUrl(configdata, "haushalt");
  const appTitel = configdata.titel || "Offener Haushalt";
  const filterJahr = configdata.haushaltsjahr
    ? String(configdata.haushaltsjahr)
    : null;

  // Per-Instanz-Laufzeitzustand: wird synchron vor jeglicher Loader-DOM- und
  // Async-Arbeit angelegt und je Container in ohCleanups registriert. Alle
  // abzusichernden Ressourcen (Render-Timeout, beide Charts) haengen an diesem
  // Objekt, damit der Cleanup beim Seitenwechsel genau diese Referenzen
  // abraeumen kann — unabhaengig davon, in welcher Reihenfolge Promise-
  // Fortsetzungen noch eintreffen.
  const runtime = {
    disposed: false,
    renderTimeout: null,
    bereichChart: null,
    gruppeChart: null,
    verlaufChart: null,
  };
  // OH-B1: vorherigen Cleanup desselben Containers zuerst laufen lassen —
  // sonst leakt bei Same-Page-Re-Render die alte Chart-Instanz.
  const ohVorherigerCleanup = ohCleanups.get(enclosingHtmlDivElement);
  if (ohVorherigerCleanup) {
    try {
      ohVorherigerCleanup();
    } catch (_e) {}
  }
  ohCleanups.set(enclosingHtmlDivElement, () => {
    runtime.disposed = true;
    if (runtime.renderTimeout !== null) {
      clearTimeout(runtime.renderTimeout);
      runtime.renderTimeout = null;
    }
    if (runtime.bereichChart) {
      runtime.bereichChart.destroy();
      runtime.bereichChart = null;
    }
    if (runtime.gruppeChart) {
      runtime.gruppeChart.destroy();
      runtime.gruppeChart = null;
    }
    if (runtime.verlaufChart) {
      runtime.verlaufChart.destroy();
      runtime.verlaufChart = null;
    }
  });

  // Variante A (F-92): Typ- und Quellenpruefung vor dem ersten Fetch.
  // OH-B2: neben der ODS-Suche sind CKAN-Tabellen und statische Dateien
  // zulässig — ladeDaten/parseJson/parseCsv können sie längst.
  const ohKontext = {
    url: apiUrl,
    label: "Haushalts-API",
    typLabel: "Open-Data-Suche (API v2.1)",
    erwarteteTypen: ["ods21", "ckan-dkan-ds", "csv-zip"],
  };
  if (isKeineDatenquelleKonfiguriert(apiUrl)) {
    renderOdasFehler(enclosingHtmlDivElement, new Error("Keine Datenquelle konfiguriert."), ohKontext);
    return null;
  }
  const ohOdsWarn = validateUrlTypErwartung(apiUrl, "ods21");
  const ohCkanWarn = ohOdsWarn ? validateUrlTypErwartung(apiUrl, "ckan-dkan-ds") : null;
  const ohTypWarn = ohCkanWarn && validateUrlTypErwartung(apiUrl, "csv-zip") ? ohOdsWarn : null;
  if (ohTypWarn) {
    renderOdasFehler(enclosingHtmlDivElement, new Error(ohTypWarn), ohKontext);
    return null;
  }

  // ──────────────────────────────────────────────
  // 0. Ladeanimation mit Fortschrittsbalken
  // ──────────────────────────────────────────────
  const _loadFilename = (() => {
    try {
      const u = new URL(apiUrl);
      const segments = u.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1] || "";
      // Direkte Datei mit bekannter Endung
      if (/\.(json|csv|xlsx?|xml)$/i.test(last)) return last;
      // CKAN: resource_id im Query-Parameter
      const resourceId = u.searchParams.get("resource_id");
      if (resourceId) return `Datensatz ${resourceId.slice(0, 8)}\u2026`;
      // ODS / andere APIs: letzten zwei Pfadsegmente, ohne generische Endpunktnamen
      const meaningful = segments.filter(
        (s) =>
          !/^(api|v\d+|action|datastore_search|records|json|csv)$/i.test(s),
      );
      if (meaningful.length) return meaningful.slice(-2).join("/");
      // Fallback: Hostname
      return u.hostname;
    } catch {
      return apiUrl;
    }
  })();
  enclosingHtmlDivElement.innerHTML = `
    <div class="d-flex flex-column align-items-center justify-content-center py-5"
         style="min-height:240px;">
      <div style="width:100%; max-width:480px; padding:0 1rem;">
        <div class="mb-2 text-muted small text-truncate" title="${escapeHtml(apiUrl)}">
          Lade: <span class="fw-semibold text-body">${escapeHtml(_loadFilename)}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span id="oh-load-msg-${ohUid}" class="text-muted small">Verbinde mit Server\u2026</span>
          <span id="oh-load-pct-${ohUid}" class="text-muted small fw-semibold">0\u202f%</span>
        </div>
        <div class="progress" style="height:10px; border-radius:6px;">
          <div id="oh-load-bar-${ohUid}"
               class="progress-bar progress-bar-striped progress-bar-animated bg-primary"
               role="progressbar"
               style="width:0%; transition:width 0.35s ease;"
               aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <div id="oh-load-detail-${ohUid}" class="text-center text-muted mt-2"
             style="font-size:0.78rem; min-height:1.4em;"></div>
      </div>
    </div>`;

  /** Aktualisiert Fortschrittsbalken, Beschriftung und Detailzeile */
  function setProgress(pct, msg, detail) {
    const bar = enclosingHtmlDivElement.querySelector("#oh-load-bar-" + ohUid);
    const msgEl = enclosingHtmlDivElement.querySelector("#oh-load-msg-" + ohUid);
    const pctEl = enclosingHtmlDivElement.querySelector("#oh-load-pct-" + ohUid);
    const detEl = enclosingHtmlDivElement.querySelector("#oh-load-detail-" + ohUid);
    if (bar) {
      bar.style.width = pct + "%";
      bar.setAttribute("aria-valuenow", pct);
    }
    if (msgEl && msg !== undefined) msgEl.textContent = msg;
    if (pctEl) pctEl.textContent = Math.round(pct) + "\u202f%";
    if (detEl && detail !== undefined) detEl.textContent = detail;
  }

  // ──────────────────────────────────────────────
  // 1. Daten laden
  // ──────────────────────────────────────────────
  setProgress(10, "Verbinde mit Server\u2026", "");

  ladeDaten()
    .then((ladeErgebnis) => {
      if (runtime.disposed) return;
      const records = ladeErgebnis ? ladeErgebnis.records : null;
      const verworfen = ladeErgebnis ? ladeErgebnis.verworfen : 0;
      if (!records || records.length === 0) {
        enclosingHtmlDivElement.innerHTML = `
          <div class="alert alert-info mt-4" role="alert">
            Keine Datensätze in der Datenquelle gefunden.
          </div>`;
        return;
      }
      setProgress(90, "Erstelle Visualisierungen\u2026", "");
      // Kurzer Timeout, damit der 90%-Balken sichtbar wird. Der Timeout-Handle
      // haengt am runtime, damit ihn onPageLeave beim Seitenwechsel abraeumen
      // kann (kein Render nach dem Leave); der Callback versichert sich erneut
      // ueber disposed, bevor er renderApp aufruft.
      runtime.renderTimeout = setTimeout(() => {
        runtime.renderTimeout = null;
        if (runtime.disposed) return;
        renderApp(
          records,
          enclosingHtmlDivElement,
          appTitel,
          filterJahr,
          configdata,
          ohUid,
          runtime,
          verworfen,
        );
      }, 80);
    })
    .catch((err) => {
      if (runtime.disposed) return;
      renderOdasFehler(enclosingHtmlDivElement, err, ohKontext);
    });

  // Daten laden: direkt mit Fortschrittsanzeige, ueber den ODAS-Proxy ohne.
  async function ladeDaten() {
    const istCsv = () =>
      apiUrl.toLowerCase().endsWith(".csv");

    if (isOdasProxyEnabled(configdata)) {
      const text = await fetchViaOdasProxy(apiUrl);
      if (runtime.disposed) return null;
      setProgress(70, "Verarbeite Daten\u2026", "");
      if (istCsv()) {
        await ensurePapaparse();
        if (runtime.disposed) return null;
        return parseCsv(text);
      }
      return { records: parseJson(ohParseJson(text)), verworfen: 0 };
    }

    const response = await fetch(apiUrl);
    if (runtime.disposed) return null;
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    setProgress(25, "Verbunden \u2013 lade Daten\u2026", "");

    const ct = response.headers.get("content-type") || "";
    const isCSV = ct.includes("csv") || istCsv();
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
    );

    const text = await ladeBody(response, contentLength, (progress) => {
      const detail = contentLength
        ? `${formatBytes(Math.round(progress * contentLength))} von ${formatBytes(contentLength)}`
        : "";
      if (!runtime.disposed)
        setProgress(25 + Math.round(progress * 45), "Lade Daten\u2026", detail);
    });
    if (runtime.disposed) return null;
    setProgress(70, "Verarbeite Daten\u2026", "");
    if (isCSV) {
      await ensurePapaparse();
      if (runtime.disposed) return null;
      return parseCsv(text);
    }
    return { records: parseJson(ohParseJson(text)), verworfen: 0 };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// DATEN-PARSER
// ══════════════════════════════════════════════════════════════

function parseJson(json) {
  let records = [];

  if (json && json.result && Array.isArray(json.result.records)) {
    // CKAN Datastore API
    records = json.result.records;
  } else if (json && Array.isArray(json.records) && json.records[0]?.fields) {
    // OpenDataSoft API v1
    records = json.records.map((r) => r.fields);
  } else if (json && Array.isArray(json.results)) {
    // OpenDataSoft API v2
    records = json.results;
  } else if (Array.isArray(json)) {
    records = json;
  } else if (json && Array.isArray(json.data)) {
    records = json.data;
  } else if (json && Array.isArray(json.items)) {
    records = json.items;
  } else {
    throw new Error(
      "Unbekanntes JSON-Format. Erwartet: Array oder CKAN/OpenDataSoft-Struktur.",
    );
  }

  return normalizeRecords(records);
}

// F-72: CSV wird ueber die vendorte PapaParse geparst statt ueber einen
// eigenen, naiven "text.split('\n')"-Parser. Der frühere Eigenbau zerlegte
// Datensätze mit eingebetteten Zeilenumbrüchen in Anführungszeichen bereits
// vor der Quote-Erkennung falsch und verstand keine doppelten
// Escape-Quotes (""); PapaParse (RFC 4180) behandelt beide Fälle korrekt.
//
// F-73: strukturell unvollständige Zeilen (zu wenige Felder) werden nicht
// mehr kommentarlos verworfen, sondern gezählt und als "verworfen"
// zurückgegeben, damit der Aufrufer sie dem Nutzer anzeigen kann.
function parseCsv(text) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  if (!result.meta || !result.meta.fields || !result.meta.fields.length) {
    throw new Error("CSV enthält zu wenig Zeilen.");
  }

  // PapaParse meldet Zeilen mit zu wenigen Feldern (gegenüber der
  // Kopfzeile) als "TooFewFields"-Fehler statt sie stillschweigend zu
  // uebernehmen oder zu verwerfen.
  const unvollstaendigeZeilen = new Set(
    (result.errors || [])
      .filter((err) => err.code === "TooFewFields")
      .map((err) => err.row),
  );

  const records = result.data.filter((_, idx) => !unvollstaendigeZeilen.has(idx));

  return {
    records: normalizeRecords(records),
    verworfen: unvollstaendigeZeilen.size,
  };
}

function normalizeRecords(records) {
  if (!records.length) return [];

  const sample = records[0];
  const keys = Object.keys(sample);
  const clean = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[\s_\-\/]/g, "");

  const findKey = (...aliases) => {
    for (const alias of aliases) {
      const found = keys.find((k) => clean(k).includes(alias));
      if (found) return found;
    }
    return null;
  };

  const colBereichNr =
    findKey("produktbereich", "bereich", "hauptgruppe") || keys[0];
  const colBereichName = findKey(
    "produktbereichbezeichnung",
    "bereichbezeichnung",
    "bereichname",
  );
  const colGruppeNr = findKey("produktgruppe", "gruppe", "untergruppe");
  const colGruppeName = findKey(
    "produktgruppebezeichnung",
    "gruppebezeichnung",
    "gruppename",
    "bezeichnung",
  );
  const colJahr = findKey("haushaltsjahr", "jahr", "year", "geschaeftsjahr");
  const colTyp = findKey(
    "ertragaufwand",
    "richtung",
    "typ",
    "art",
    "einnahmenausgaben",
    "ertrag",
    "aufwand",
  );
  const colBetrag =
    findKey("betrag", "wert", "summe", "plan", "ansatz", "a,!", "betrage") ||
    keys
      .slice()
      .reverse()
      .find((k) => {
        // Erste bis zu 10 Zeilen prüfen — Zeile 0 allein kann leer sein.
        for (let i = 0; i < Math.min(records.length, 10); i++) {
          const v = String(records[i][k] ?? "").replace(/[.,\s]/g, "");
          if (/^\d+$/.test(v)) return true;
        }
        return false;
      });

  return records.map((r) => ({
    bereichNr: String(r[colBereichNr] || "").trim(),
    bereichName: String(r[colBereichName] || r[colBereichNr] || "").trim(),
    gruppeNr: String(r[colGruppeNr] || "").trim(),
    gruppeName: String(r[colGruppeName] || r[colGruppeNr] || "").trim(),
    jahr: String(r[colJahr] || "").trim(),
    typ: String(r[colTyp] || "")
      .trim()
      .toUpperCase(),
    betrag: parseBetrag(r[colBetrag] || 0),
  }));
}

function parseBetrag(val) {
  if (typeof val === "number") return val;
  const s = String(val).replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})*,\d+$/.test(s)) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  // Englisches Tausenderformat (1,234.56) — sonst wären es 1.234 statt 1234.56.
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    return parseFloat(s.replace(/,/g, "")) || 0;
  }
  return parseFloat(s.replace(",", ".")) || 0;
}

// Typ-Klassifikation an genau einer Stelle (vorher 3× identische Listen).
const OH_TYP_AUSGABE = ["A", "AUFWAND", "AUFWENDUNG", "AUSGABE", "AUSGABEN"];
const OH_TYP_ERTRAG = ["E", "ERTRAG", "ERTRAGE", "EINNAHME", "EINNAHMEN"];
function ohIstAusgabe(typ) {
  return OH_TYP_AUSGABE.includes(typ);
}
function ohIstErtrag(typ) {
  return OH_TYP_ERTRAG.includes(typ);
}

// Suche entprellen: jeder Tastenschlag baut sonst beide Charts neu auf.
function ohEntprellt(fn, millis) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, millis);
  };
}

// ══════════════════════════════════════════════════════════════
// RENDERING
// ══════════════════════════════════════════════════════════════

function renderApp(allRecords, container, appTitel, filterJahr, configdata, uid, runtime, verworfen = 0) {
  const freshnessHtml = configdata.datenStand
    ? '<div class="text-end mb-2"><small class="text-muted">' +
      escapeHtml(String(configdata.datenStand)) +
      "</small></div>"
    : "";
  // F-73: strukturell unvollständige CSV-Zeilen (zu wenige Felder) werden
  // nicht mehr kommentarlos verworfen, sondern hier sichtbar gemacht.
  const verworfenHtml =
    verworfen > 0
      ? '<div class="alert alert-warning py-2 px-3 mb-3" role="alert">' +
        escapeHtml(
          `${verworfen} von ${allRecords.length + verworfen} Zeilen wurden wegen unvollständiger Daten übersprungen.`,
        ) +
        "</div>"
      : "";
  const jahre = [
    ...new Set(allRecords.map((r) => r.jahr).filter(Boolean)),
  ].sort();
  const aktivesJahr =
    filterJahr && jahre.includes(filterJahr)
      ? filterJahr
      : jahre[jahre.length - 1] || "";

  // ── HTML-Skelett ──────────────────────────────
  container.innerHTML = `
    <h2 class="mb-1">${escapeHtml(appTitel)}</h2>
    <p class="text-muted mb-3">Interaktive Visualisierung kommunaler Einnahmen &amp; Ausgaben</p>

    <!-- Steuerleiste -->
    <div class="row g-2 mb-4 align-items-center">
      <div class="col-auto">
        <label class="form-label fw-semibold mb-0 me-2">Haushaltsjahr:</label>
        <select id="oh-jahr-select-${uid}" class="form-select form-select-sm d-inline-block"
                style="width:auto;">
          ${jahre
            .map(
              (j) =>
                `<option value="${escapeHtml(j)}"${j === aktivesJahr ? " selected" : ""}>${escapeHtml(j)}</option>`,
            )
            .join("")}
        </select>
      </div>
      <div class="col-auto">
        <label class="form-label fw-semibold mb-0 me-2">Ansicht:</label>
        <div class="btn-group btn-group-sm" role="group">
          <input type="radio" class="btn-check" name="oh-ansicht-${uid}"
                 id="oh-ansicht-beide-${uid}" value="beide" checked>
          <label class="btn btn-outline-primary" for="oh-ansicht-beide-${uid}">
            Einnahmen &amp; Ausgaben
          </label>
          <input type="radio" class="btn-check" name="oh-ansicht-${uid}"
                 id="oh-ansicht-e-${uid}" value="E">
          <label class="btn btn-outline-success" for="oh-ansicht-e-${uid}">
            Nur Erträge/Einnahmen
          </label>
          <input type="radio" class="btn-check" name="oh-ansicht-${uid}"
                 id="oh-ansicht-a-${uid}" value="A">
          <label class="btn btn-outline-danger" for="oh-ansicht-a-${uid}">
            Nur Aufwand/Ausgaben
          </label>
        </div>
      </div>
      <div class="col-auto ms-auto">
        <input type="text" id="oh-search-${uid}" class="form-control form-control-sm"
               placeholder="🔍 Produktbereich suchen…" style="width:220px;" aria-label="Produktbereich suchen">
      </div>
      <div class="col-auto">
        <button id="oh-btn-export-${uid}" type="button" class="btn btn-sm btn-outline-secondary">CSV-Export</button>
      </div>
    </div>

    ${freshnessHtml}
    ${verworfenHtml}
    <!-- KPI-Kacheln -->
    <div class="row g-3 mb-4" id="oh-kpis-${uid}"></div>

    <!-- Balkendiagramm Produktbereiche -->
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-semibold">Ausgaben &amp; Einnahmen nach Produktbereich</span>
        <small class="text-muted" id="oh-chart-subtitle-${uid}"></small>
      </div>
      <div class="card-body">
        <canvas id="oh-chart-bereich-${uid}" style="max-height:380px;"></canvas>
      </div>
    </div>

    ${jahre.length >= 2 ? `
    <!-- Saldo-Verlauf über Jahre (nur bei mehreren Jahren sinnvoll) -->
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-semibold">Einnahmen &amp; Ausgaben im Zeitverlauf</span>
        <small class="text-muted">alle Jahre · aktuelle Ansicht/Suche</small>
      </div>
      <div class="card-body">
        <canvas id="oh-chart-verlauf-${uid}" style="max-height:300px;"></canvas>
      </div>
    </div>` : ""}

    <!-- Drill-Down: Produktgruppen einer Auswahl -->
    <div class="card mb-4" id="oh-drilldown-card-${uid}" style="display:none;">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-semibold" id="oh-drilldown-title-${uid}">Produktgruppen</span>
        <button class="btn btn-sm btn-outline-secondary" id="oh-drilldown-close-${uid}">
          ✕ Schließen
        </button>
      </div>
      <div class="card-body">
        <canvas id="oh-chart-gruppe-${uid}" style="max-height:320px;"></canvas>
      </div>
    </div>

    <!-- Detailtabelle -->
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-semibold">Detailtabelle</span>
        <small class="text-muted" id="oh-table-count-${uid}"></small>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive" style="max-height:400px; overflow-y:auto;">
          <table class="table table-sm table-striped table-hover mb-0">
            <thead class="table-dark sticky-top">
              <tr>
                <th scope="col">Produktbereich</th>
                <th scope="col">Produktgruppe</th>
                <th scope="col" class="text-end">Erträge (€)</th>
                <th scope="col" class="text-end">Aufwand (€)</th>
                <th scope="col" class="text-end">Saldo (€)</th>
              </tr>
            </thead>
            <tbody id="oh-table-body-${uid}"></tbody>
          </table>
        </div>
      </div>
    </div>
    ${renderWeitereInfos(configdata)}${renderMethodikbox(configdata, uid)}`;

  // ── State ──────────────────────────────────────
  let currentJahr = aktivesJahr;
  let currentAnsicht = "beide";
  let currentSearch = "";

  // ── Hilfsfunktionen ───────────────────────────

  /** Filtert Records nach Jahr, Ansicht und Suchtext (ohneJahr: Verlauf). */
  function getFiltered(ohneJahr = false) {
    return allRecords.filter((r) => {
      if (!ohneJahr && currentJahr && r.jahr !== currentJahr) return false;
      if (currentAnsicht === "E" && !ohIstErtrag(r.typ)) return false;
      if (currentAnsicht === "A" && !ohIstAusgabe(r.typ)) return false;
      if (currentSearch) {
        const s = currentSearch.toLowerCase();
        if (
          !r.bereichName.toLowerCase().includes(s) &&
          !r.bereichNr.toLowerCase().includes(s) &&
          !r.gruppeName.toLowerCase().includes(s) &&
          !r.gruppeNr.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }

  /** Aggregiert Records zu { label, einnahmen, ausgaben } pro Produktbereich */
  function aggregiereNachBereich(records) {
    const map = new Map();
    records.forEach((r) => {
      const key = r.bereichNr;
      const name = r.bereichName || r.bereichNr || "Unbekannt";
      if (!map.has(key))
        map.set(key, { label: name, einnahmen: 0, ausgaben: 0 });
      const entry = map.get(key);
      const isAusgabe = ohIstAusgabe(r.typ);
      const isErtrag = ohIstErtrag(r.typ);
      if (isAusgabe) entry.ausgaben += r.betrag;
      else if (isErtrag) entry.einnahmen += r.betrag;
      else entry.ausgaben += r.betrag; // Fallback
    });
    return [...map.values()].sort(
      (a, b) => b.ausgaben + b.einnahmen - (a.ausgaben + a.einnahmen),
    );
  }

  /** Aggregiert Records zu { label, einnahmen, ausgaben } pro Produktgruppe */
  function aggregiereNachGruppe(records) {
    const map = new Map();
    records.forEach((r) => {
      const key = r.gruppeNr || r.gruppeName || "Unbekannt";
      const name = r.gruppeName || r.gruppeNr || "Unbekannt";
      const bereich = r.bereichName || r.bereichNr || "";
      if (!map.has(key))
        map.set(key, { bereich: bereich, label: name, einnahmen: 0, ausgaben: 0 });
      const entry = map.get(key);
      const isAusgabe = ohIstAusgabe(r.typ);
      const isErtrag = ohIstErtrag(r.typ);
      if (isAusgabe) entry.ausgaben += r.betrag;
      else if (isErtrag) entry.einnahmen += r.betrag;
      else entry.ausgaben += r.betrag;
    });
    return [...map.values()].sort(
      (a, b) => b.ausgaben + b.einnahmen - (a.ausgaben + a.einnahmen),
    );
  }

  // ── KPI-Kacheln rendern ───────────────────────
  function renderKpis(records) {
    const totalAusgaben = records
      .filter((r) => ohIstAusgabe(r.typ))
      .reduce((s, r) => s + r.betrag, 0);
    const totalEinnahmen = records
      .filter((r) => ohIstErtrag(r.typ))
      .reduce((s, r) => s + r.betrag, 0);
    const saldo = totalEinnahmen - totalAusgaben;
    const anzahlBereiche = new Set(records.map((r) => r.bereichNr)).size;

    const kpiEl = container.querySelector("#oh-kpis-" + uid);
    if (!kpiEl) return;
    kpiEl.innerHTML = `
      <div class="col-6 col-md-3">
        <div class="card border-success h-100">
          <div class="card-body text-center py-3">
            <div class="text-success fw-bold fs-5">${formatEuro(totalEinnahmen)}</div>
            <div class="text-muted small">Gesamte Erträge/Einnahmen</div>\n              ${kpiContext(configdata.kpiKontext1, "1", uid)}
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-danger h-100">
          <div class="card-body text-center py-3">
            <div class="text-danger fw-bold fs-5">${formatEuro(totalAusgaben)}</div>
            <div class="text-muted small">Gesamter Aufwand/Ausgaben</div>\n              ${kpiContext(configdata.kpiKontext2, "2", uid)}
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-${saldo >= 0 ? "primary" : "warning"} h-100">
          <div class="card-body text-center py-3">
            <div class="text-${saldo >= 0 ? "primary" : "warning"} fw-bold fs-5">
              ${saldo >= 0 ? "+" : ""}${formatEuro(saldo)}
            </div>
            <div class="text-muted small">Saldo</div>\n              ${kpiContext(configdata.kpiKontext3, "3", uid)}
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-secondary h-100">
          <div class="card-body text-center py-3">
            <div class="text-secondary fw-bold fs-5">${anzahlBereiche}</div>
            <div class="text-muted small">Produktbereiche</div>\n              ${kpiContext(configdata.kpiKontext4, "4", uid)}
          </div>
        </div>
      </div>`;
  }

  // ── Balkendiagramm Produktbereiche rendern ────
  function renderBereichChart(records) {
    const daten = aggregiereNachBereich(records);
    const labels = daten.map((d) => kuerze(d.label, 28));

    const subtitleEl = container.querySelector("#oh-chart-subtitle-" + uid);
    if (subtitleEl)
      subtitleEl.textContent = `${currentJahr} · ${daten.length} Bereiche`;

    const ctx = container.querySelector("#oh-chart-bereich-" + uid);
    if (!ctx) return;

    if (runtime.bereichChart) runtime.bereichChart.destroy();

    const datasets = [];
    if (currentAnsicht !== "A") {
      datasets.push({
        label: "Erträge/Einnahmen (€)",
        data: daten.map((d) => d.einnahmen),
        backgroundColor: "rgba(25, 135, 84, 0.75)",
        borderColor: "rgba(25, 135, 84, 1)",
        borderWidth: 1,
      });
    }
    if (currentAnsicht !== "E") {
      datasets.push({
        label: "Aufwand/Ausgaben (€)",
        data: daten.map((d) => d.ausgaben),
        backgroundColor: "rgba(220, 53, 69, 0.75)",
        borderColor: "rgba(220, 53, 69, 1)",
        borderWidth: 1,
      });
    }

    runtime.bereichChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            zeigeGruppeDrilldown(daten[idx], records);
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${formatEuro(ctx.parsed.y)}`,
            },
          },
          legend: { position: "top" },
        },
        scales: {
          x: {
            ticks: { maxRotation: 45, minRotation: 20, font: { size: 11 } },
          },
          y: {
            ticks: {
              callback: (val) => formatEuroKurz(val),
            },
          },
        },
      },
    });
  }

  // ── Drill-Down: Produktgruppen eines Bereichs ─
  function zeigeGruppeDrilldown(bereichData, allFiltered) {
    const bereichRecords = allFiltered.filter(
      (r) =>
        r.bereichName === bereichData.label ||
        r.bereichNr === bereichData.label,
    );
    const daten = aggregiereNachGruppe(bereichRecords);
    const labels = daten.map((d) => kuerze(d.label, 32));

    const card = container.querySelector("#oh-drilldown-card-" + uid);
    const titleEl = container.querySelector("#oh-drilldown-title-" + uid);
    if (card) card.style.display = "";
    if (titleEl) titleEl.textContent = `Produktgruppen: ${bereichData.label}`;

    // Zur Karte scrollen
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });

    const ctx = container.querySelector("#oh-chart-gruppe-" + uid);
    if (!ctx) return;
    if (runtime.gruppeChart) runtime.gruppeChart.destroy();

    const datasets = [];
    if (currentAnsicht !== "A") {
      datasets.push({
        label: "Erträge/Einnahmen (€)",
        data: daten.map((d) => d.einnahmen),
        backgroundColor: "rgba(25, 135, 84, 0.75)",
        borderColor: "rgba(25, 135, 84, 1)",
        borderWidth: 1,
      });
    }
    if (currentAnsicht !== "E") {
      datasets.push({
        label: "Aufwand/Ausgaben (€)",
        data: daten.map((d) => d.ausgaben),
        backgroundColor: "rgba(220, 53, 69, 0.75)",
        borderColor: "rgba(220, 53, 69, 1)",
        borderWidth: 1,
      });
    }

    runtime.gruppeChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${formatEuro(ctx.parsed.y)}`,
            },
          },
          legend: { position: "top" },
        },
        scales: {
          x: {
            ticks: { maxRotation: 45, minRotation: 20, font: { size: 11 } },
          },
          y: { ticks: { callback: (val) => formatEuroKurz(val) } },
        },
      },
    });
  }

  /** Aggregiert zu { jahr, einnahmen, ausgaben } für den Zeitverlauf. */
  function aggregiereNachJahr(records) {
    const map = new Map();
    records.forEach((r) => {
      if (!r.jahr) return;
      if (!map.has(r.jahr))
        map.set(r.jahr, { jahr: r.jahr, einnahmen: 0, ausgaben: 0 });
      const entry = map.get(r.jahr);
      if (ohIstAusgabe(r.typ)) entry.ausgaben += r.betrag;
      else if (ohIstErtrag(r.typ)) entry.einnahmen += r.betrag;
      else entry.ausgaben += r.betrag;
    });
    return [...map.values()].sort((a, b) =>
      String(a.jahr).localeCompare(String(b.jahr), "de"),
    );
  }

  // ── Verlaufsdiagramm rendern (Jahresvergleich, jahrunabhängig) ──
  function renderVerlaufChart() {
    const ctx = container.querySelector("#oh-chart-verlauf-" + uid);
    if (!ctx) return;
    const daten = aggregiereNachJahr(getFiltered(true));
    if (runtime.verlaufChart) runtime.verlaufChart.destroy();
    if (daten.length < 2) {
      runtime.verlaufChart = null;
      return;
    }
    runtime.verlaufChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: daten.map((d) => d.jahr),
        datasets: [
          {
            label: "Erträge/Einnahmen (€)",
            data: daten.map((d) => d.einnahmen),
            borderColor: "rgba(25, 135, 84, 1)",
            backgroundColor: "rgba(25, 135, 84, 0.15)",
            tension: 0.15,
          },
          {
            label: "Aufwand/Ausgaben (€)",
            data: daten.map((d) => d.ausgaben),
            borderColor: "rgba(220, 53, 69, 1)",
            backgroundColor: "rgba(220, 53, 69, 0.15)",
            tension: 0.15,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${formatEuro(ctx.parsed.y)}`,
            },
          },
          legend: { position: "top" },
        },
        scales: {
          y: { ticks: { callback: (val) => formatEuroKurz(val) } },
        },
      },
    });
  }

  // ── Detailtabelle rendern ─────────────────────
  function renderTabelle(records) {
    const daten = aggregiereNachGruppe(records);
    const tbody = container.querySelector("#oh-table-body-" + uid);
    const countEl = container.querySelector("#oh-table-count-" + uid);
    if (!tbody) return;

    if (countEl) countEl.textContent = `${daten.length} Produktgruppen`;

    if (daten.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">
        Keine Daten für die aktuelle Auswahl.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = daten
      .map((d) => {
        const saldo = d.einnahmen - d.ausgaben;
        const saldoClass = saldo >= 0 ? "text-success" : "text-danger";
        const drilldownZiel = d.bereich || "";
        return `
        <tr${drilldownZiel ? ` data-oh-bereich="${escapeHtml(drilldownZiel)}" class="oh-clickable-row" title="Produktgruppen anzeigen"` : ""}>
          <td class="text-muted small">${escapeHtml(d.bereich || "")}</td>
          <td>${escapeHtml(d.label)}</td>
          <td class="text-end text-success">${formatEuro(d.einnahmen)}</td>
          <td class="text-end text-danger">${formatEuro(d.ausgaben)}</td>
          <td class="text-end fw-semibold ${saldoClass}">
            ${saldo >= 0 ? "+" : ""}${formatEuro(saldo)}
          </td>
        </tr>`;
      })
      .join("");
  }

  // ── Alles zusammen aktualisieren ──────────────
  function updateAll() {
    // Entprellte Suche kann nach einem Seitenwechsel feuern.
    if (runtime.disposed) return;
    const records = getFiltered();
    renderKpis(records);
    renderBereichChart(records);
    renderVerlaufChart();
    renderTabelle(records);

    // Drill-Down schließen bei Filterwechsel
    const card = container.querySelector("#oh-drilldown-card-" + uid);
    if (card) card.style.display = "none";
    if (runtime.gruppeChart) {
      runtime.gruppeChart.destroy();
      runtime.gruppeChart = null;
    }
  }

  // ── Event-Listener ────────────────────────────
  container.querySelector("#oh-jahr-select-" + uid)?.addEventListener("change", (e) => {
    currentJahr = e.target.value;
    updateAll();
  });

  container.querySelectorAll("input[name='oh-ansicht-" + uid + "']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      currentAnsicht = e.target.value;
      updateAll();
    });
  });

  container.querySelector("#oh-search-" + uid)?.addEventListener("input", ohEntprellt((e) => {
    if (runtime.disposed) return;
    currentSearch = e.target.value.trim();
    updateAll();
  }, 250));

  // Tabellenzeilen-Klick öffnet den Drilldown des zugehörigen Bereichs
  // (Event-Delegation: tbody überlebt Tabellen-Neuzeichnungen).
  container.querySelector("#oh-table-body-" + uid)?.addEventListener("click", (e) => {
    const tr = e.target && e.target.closest ? e.target.closest("tr[data-oh-bereich]") : null;
    if (!tr || runtime.disposed) return;
    const label = tr.getAttribute("data-oh-bereich") || "";
    if (!label) return;
    zeigeGruppeDrilldown({ label }, getFiltered());
  });

  container.querySelector("#oh-btn-export-" + uid)?.addEventListener("click", () => {
    if (runtime.disposed) return;
    const daten = aggregiereNachGruppe(getFiltered());
    const esc = (v) => {
      const s = String(v ?? "");
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const zeilen = ["Produktbereich;Produktgruppe;Erträge (EUR);Aufwand (EUR);Saldo (EUR)"];
    daten.forEach((d) => {
      zeilen.push(
        [d.bereich, d.label, d.einnahmen.toFixed(2), d.ausgaben.toFixed(2), (d.einnahmen - d.ausgaben).toFixed(2)]
          .map(esc)
          .join(";"),
      );
    });
    const blob = new Blob(["\uFEFF" + zeilen.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "haushalt-export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  container
    .querySelector("#oh-drilldown-close-" + uid)
    ?.addEventListener("click", () => {
      const card = container.querySelector("#oh-drilldown-card-" + uid);
      if (card) card.style.display = "none";
      if (runtime.gruppeChart) {
        runtime.gruppeChart.destroy();
        runtime.gruppeChart = null;
      }
    });

  // ── Initiales Rendering ───────────────────────
  updateAll();
}

// ══════════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ══════════════════════════════════════════════════════════════

/** Formatiert einen Eurobetrag mit Tausender-Punkt und 2 Dezimalstellen */
function formatEuro(val) {
  if (isNaN(val) || val === null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

/** Formatiert einen Eurobetrag kurz für Achsenbeschriftungen (z.B. 1,2 Mio.) */
function formatEuroKurz(val) {
  if (Math.abs(val) >= 1_000_000)
    return (val / 1_000_000).toFixed(1).replace(".", ",") + " Mio. €";
  if (Math.abs(val) >= 1_000) return (val / 1_000).toFixed(0) + " T€";
  return val + " €";
}

/** Kürzt einen String auf maxLen Zeichen */
function kuerze(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

/** Escaped HTML-Sonderzeichen zur XSS-Vermeidung */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// F-35-Helfer-Vertrag: safeHttpUrl muss als Top-Level-Funktion vorhanden sein
// (check-xss-url), auch wenn diese App aktuell keine URL-Sinks rendert.
function safeHttpUrl(value) {
  const s = String(value || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

  /* ── Schale 4: KPI Kontext ── */
  function kpiContext(kontext, id, uid) {
    var text = String(kontext || "").trim();
    if (!text) return "";
    var targetId = "oh-kpi-kontext-" + id + "-" + uid;
    return (
      '<button class="oh-kpi-info-toggle collapsed" type="button" ' +
      'data-bs-toggle="collapse" data-bs-target="#' + targetId + '" ' +
      'aria-expanded="false" aria-controls="' + targetId + '" ' +
      'aria-label="Erklärung zu diesem Wert">' +
      '<span class="oh-kpi-info-icon" aria-hidden="true">ⓘ</span>' +
      "</button>" +
      '<div id="' + targetId + '" class="collapse">' +
      '<div class="oh-kpi-kontext">' + escapeHtml(text) + "</div>" +
      "</div>"
    );
  }

  /* ── Schale 4: Methodikbox ── */
  function renderMethodikbox(cfg, uid) {
    var hinweis = ((cfg && cfg.datenquelleHinweis) || "").trim();
    var stand = ((cfg && cfg.datenStand) || "").trim();
    if (!hinweis && !stand) return "";
    var standHtml = stand
      ? '<p class="text-muted small mb-2">' + escapeHtml(stand) + "</p>"
      : "";
    return (
      '<section class="oh-methodik mt-3">' +
      '<button class="oh-methodik-toggle collapsed" type="button" ' +
      'data-bs-toggle="collapse" data-bs-target="#oh-methodik-body-' + uid + '" ' +
      'aria-expanded="false" aria-controls="oh-methodik-body-' + uid + '">' +
      '<h2 class="h5 mb-0">Methodik &amp; Datenquelle</h2>' +
      '<span class="oh-methodik-chevron" aria-hidden="true">&#9662;</span>' +
      "</button>" +
      '<div id="oh-methodik-body-' + uid + '" class="collapse">' +
      '<div class="oh-methodik-content">' +
      standHtml +
      hinweis +
      "</div></div></section>"
    );
  }

function renderWeitereInfos(cfg) {
  const links = String((cfg && cfg.weiterfuehrendeLinks) || "").trim();
  if (!links) return "";
  return (
    '<section class="oh-weitere-infos card mt-4"><div class="card-body">' +
    '<h6 class="card-title fw-semibold">Weitere Informationen</h6>' +
    '<div class="oh-weitere-infos-content">' +
    links +
    "</div></div></section>"
  );
}

// ══════════════════════════════════════════════════════════════
// LADE-HILFSFUNKTIONEN
// ══════════════════════════════════════════════════════════════

/**
 * Liest den Response-Body als Text und meldet den Download-Fortschritt
 * per onProgress(0..1) zurück (nur wenn Content-Length bekannt).
 */
function ladeBody(response, contentLength, onProgress) {
  if (!response.body || !contentLength) {
    onProgress(0.5);
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  function pump() {
    return reader.read().then(({ done, value }) => {
      if (done) return new Blob(chunks).text();
      chunks.push(value);
      received += value.length;
      onProgress(Math.min(received / contentLength, 1));
      return pump();
    });
  }

  return pump();
}

/** Formatiert Bytes lesbar (B / KB / MB) */
function formatBytes(bytes) {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + "\u202fMB";
  if (bytes >= 1_000) return Math.round(bytes / 1_000) + "\u202fKB";
  return bytes + "\u202fB";
}

// ══════════════════════════════════════════════════════════════
// BIBLIOTHEKEN LADEN
// ══════════════════════════════════════════════════════════════

/*
 * Diese Funktion lädt Chart.js (vendored) in den <head> der Seite.
 * Wird automatisch vor app() aufgerufen. Styles leben in app/app.css.
 */
function addToHead() {
  // Chart.js per Script-Element laden und Promise zurückgeben
  return new Promise((resolve, reject) => {
    if (window.Chart) {
      resolve(); // bereits geladen
      return;
    }
    const script = document.createElement("script");
    script.src =
      "vendor/chartjs/chart.umd.min.js";
    script.onload = resolve;
    script.onerror = () =>
      reject(new Error("Chart.js konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
}
