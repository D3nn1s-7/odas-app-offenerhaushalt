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
 *   "apiurl": "https://...",          // URL zur JSON oder CSV Ressource
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

function app(configdata = {}, enclosingHtmlDivElement) {
  // ──────────────────────────────────────────────
  // 0. Ladeanimation anzeigen
  // ──────────────────────────────────────────────
  enclosingHtmlDivElement.innerHTML = `
    <div class="d-flex justify-content-center align-items-center" style="min-height:200px;">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Lade Haushaltsdaten…</span>
      </div>
      <span class="ms-3 fs-5 text-muted">Lade Haushaltsdaten…</span>
    </div>`;

  const apiUrl = configdata.apiurl || configdata.apiUrl || "";
  const appTitel = configdata.titel || "Offener Haushalt";
  const filterJahr = configdata.haushaltsjahr
    ? String(configdata.haushaltsjahr)
    : null;

  if (!apiUrl) {
    enclosingHtmlDivElement.innerHTML = `
      <div class="alert alert-warning mt-4">
        <strong>Konfigurationsfehler:</strong> Keine API-URL angegeben
        (de>apiurl</code> fehlt in der config.json).
      </div>`;
    return null;
  }

  // ──────────────────────────────────────────────
  // 1. Daten laden
  // ──────────────────────────────────────────────
  fetch(apiUrl)
    .then((response) => {
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const ct = response.headers.get("content-type") || "";
      if (ct.includes("csv") || apiUrl.toLowerCase().endsWith(".csv")) {
        return response.text().then((text) => parseCsv(text));
      }
      return response.json().then((json) => parseJson(json));
    })
    .then((records) => {
      if (!records || records.length === 0)
        throw new Error("Keine Datensätze gefunden.");
      renderApp(records, enclosingHtmlDivElement, appTitel, filterJahr);
    })
    .catch((err) => {
      enclosingHtmlDivElement.innerHTML = `
        <div class="alert alert-danger mt-4">
          <strong>Fehler beim Laden der Daten:</strong> ${escapeHtml(err.message)}
          <hr>
          <small>URL: de>${escapeHtml(apiUrl)}</code></small>
        </div>`;
    });

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

function parseCsv(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV enthält zu wenig Zeilen.");

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0]
    .split(sep)
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i], sep);
    if (vals.length < 2) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (vals[idx] || "").trim().replace(/^"|"$/g, "");
    });
    records.push(obj);
  }

  return normalizeRecords(records);
}

function splitCsvLine(line, sep) {
  const result = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
    } else if (c === sep && !inQuote) {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
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
        const v = String(records[0][k] || "").replace(/[.,\s]/g, "");
        return /^\d+$/.test(v);
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
  return parseFloat(s.replace(",", ".")) || 0;
}

// ══════════════════════════════════════════════════════════════
// RENDERING
// ══════════════════════════════════════════════════════════════

function renderApp(allRecords, container, appTitel, filterJahr) {
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
        <select id="oh-jahr-select" class="form-select form-select-sm d-inline-block"
                style="width:auto;">
          ${jahre
            .map(
              (j) =>
                `<option value="${j}"${j === aktivesJahr ? " selected" : ""}>${j}</option>`,
            )
            .join("")}
        </select>
      </div>
      <div class="col-auto">
        <label class="form-label fw-semibold mb-0 me-2">Ansicht:</label>
        <div class="btn-group btn-group-sm" role="group">
          <input type="radio" class="btn-check" name="oh-ansicht"
                 id="oh-ansicht-beide" value="beide" checked>
          <label class="btn btn-outline-primary" for="oh-ansicht-beide">
            Einnahmen &amp; Ausgaben
          </label>
          <input type="radio" class="btn-check" name="oh-ansicht"
                 id="oh-ansicht-e" value="E">
          <label class="btn btn-outline-success" for="oh-ansicht-e">
            Nur Erträge/Einnahmen
          </label>
          <input type="radio" class="btn-check" name="oh-ansicht"
                 id="oh-ansicht-a" value="A">
          <label class="btn btn-outline-danger" for="oh-ansicht-a">
            Nur Aufwand/Ausgaben
          </label>
        </div>
      </div>
      <div class="col-auto ms-auto">
        <input type="text" id="oh-search" class="form-control form-control-sm"
               placeholder="🔍 Produktbereich suchen…" style="width:220px;">
      </div>
    </div>

    <!-- KPI-Kacheln -->
    <div class="row g-3 mb-4" id="oh-kpis"></div>

    <!-- Balkendiagramm Produktbereiche -->
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-semibold">Ausgaben &amp; Einnahmen nach Produktbereich</span>
        <small class="text-muted" id="oh-chart-subtitle"></small>
      </div>
      <div class="card-body">
        <canvas id="oh-chart-bereich" style="max-height:380px;"></canvas>
      </div>
    </div>

    <!-- Drill-Down: Produktgruppen einer Auswahl -->
    <div class="card mb-4" id="oh-drilldown-card" style="display:none;">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-semibold" id="oh-drilldown-title">Produktgruppen</span>
        <button class="btn btn-sm btn-outline-secondary" id="oh-drilldown-close">
          ✕ Schließen
        </button>
      </div>
      <div class="card-body">
        <canvas id="oh-chart-gruppe" style="max-height:320px;"></canvas>
      </div>
    </div>

    <!-- Detailtabelle -->
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span class="fw-semibold">Detailtabelle</span>
        <small class="text-muted" id="oh-table-count"></small>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive" style="max-height:400px; overflow-y:auto;">
          <table class="table table-sm table-striped table-hover mb-0">
            <thead class="table-dark sticky-top">
              <tr>
                <th>Produktbereich</th>
                <th>Produktgruppe</th>
                <th class="text-end">Erträge (€)</th>
                <th class="text-end">Aufwand (€)</th>
                <th class="text-end">Saldo (€)</th>
              </tr>
            </thead>
            <tbody id="oh-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  // ── State ──────────────────────────────────────
  let currentJahr = aktivesJahr;
  let currentAnsicht = "beide";
  let currentSearch = "";
  let bereichChart = null;
  let gruppeChart = null;

  // ── Hilfsfunktionen ───────────────────────────

  /** Filtert Records nach Jahr, Ansicht und Suchtext */
  function getFiltered() {
    return allRecords.filter((r) => {
      if (currentJahr && r.jahr !== currentJahr) return false;
      if (currentAnsicht !== "beide") {
        const t = r.typ;
        if (
          currentAnsicht === "E" &&
          !["E", "ERTRAG", "ERTRAGE", "EINNAHME", "EINNAHMEN"].includes(t)
        )
          return false;
        if (
          currentAnsicht === "A" &&
          !["A", "AUFWAND", "AUFWENDUNG", "AUSGABE", "AUSGABEN"].includes(t)
        )
          return false;
      }
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
      const isAusgabe = [
        "A",
        "AUFWAND",
        "AUFWENDUNG",
        "AUSGABE",
        "AUSGABEN",
      ].includes(r.typ);
      const isErtrag = [
        "E",
        "ERTRAG",
        "ERTRAGE",
        "EINNAHME",
        "EINNAHMEN",
      ].includes(r.typ);
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
      const key = r.gruppeNr;
      const name = r.gruppeName || r.gruppeNr || "Unbekannt";
      if (!map.has(key))
        map.set(key, { label: name, einnahmen: 0, ausgaben: 0 });
      const entry = map.get(key);
      const isAusgabe = [
        "A",
        "AUFWAND",
        "AUFWENDUNG",
        "AUSGABE",
        "AUSGABEN",
      ].includes(r.typ);
      const isErtrag = [
        "E",
        "ERTRAG",
        "ERTRAGE",
        "EINNAHME",
        "EINNAHMEN",
      ].includes(r.typ);
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
      .filter((r) =>
        ["A", "AUFWAND", "AUFWENDUNG", "AUSGABE", "AUSGABEN"].includes(r.typ),
      )
      .reduce((s, r) => s + r.betrag, 0);
    const totalEinnahmen = records
      .filter((r) =>
        ["E", "ERTRAG", "ERTRAGE", "EINNAHME", "EINNAHMEN"].includes(r.typ),
      )
      .reduce((s, r) => s + r.betrag, 0);
    const saldo = totalEinnahmen - totalAusgaben;
    const anzahlBereiche = new Set(records.map((r) => r.bereichNr)).size;

    const kpiEl = document.getElementById("oh-kpis");
    if (!kpiEl) return;
    kpiEl.innerHTML = `
      <div class="col-6 col-md-3">
        <div class="card border-success h-100">
          <div class="card-body text-center py-3">
            <div class="text-success fw-bold fs-5">${formatEuro(totalEinnahmen)}</div>
            <div class="text-muted small">Gesamte Erträge/Einnahmen</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-danger h-100">
          <div class="card-body text-center py-3">
            <div class="text-danger fw-bold fs-5">${formatEuro(totalAusgaben)}</div>
            <div class="text-muted small">Gesamter Aufwand/Ausgaben</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-${saldo >= 0 ? "primary" : "warning"} h-100">
          <div class="card-body text-center py-3">
            <div class="text-${saldo >= 0 ? "primary" : "warning"} fw-bold fs-5">
              ${saldo >= 0 ? "+" : ""}${formatEuro(saldo)}
            </div>
            <div class="text-muted small">Saldo</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-secondary h-100">
          <div class="card-body text-center py-3">
            <div class="text-secondary fw-bold fs-5">${anzahlBereiche}</div>
            <div class="text-muted small">Produktbereiche</div>
          </div>
        </div>
      </div>`;
  }

  // ── Balkendiagramm Produktbereiche rendern ────
  function renderBereichChart(records) {
    const daten = aggregiereNachBereich(records);
    const labels = daten.map((d) => kuerze(d.label, 28));

    const subtitleEl = document.getElementById("oh-chart-subtitle");
    if (subtitleEl)
      subtitleEl.textContent = `${currentJahr} · ${daten.length} Bereiche`;

    const ctx = document.getElementById("oh-chart-bereich");
    if (!ctx) return;

    if (bereichChart) bereichChart.destroy();

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

    bereichChart = new Chart(ctx, {
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

    const card = document.getElementById("oh-drilldown-card");
    const titleEl = document.getElementById("oh-drilldown-title");
    if (card) card.style.display = "";
    if (titleEl) titleEl.textContent = `Produktgruppen: ${bereichData.label}`;

    // Zur Karte scrollen
    card.scrollIntoView({ behavior: "smooth", block: "start" });

    const ctx = document.getElementById("oh-chart-gruppe");
    if (!ctx) return;
    if (gruppeChart) gruppeChart.destroy();

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

    gruppeChart = new Chart(ctx, {
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

  // ── Detailtabelle rendern ─────────────────────
  function renderTabelle(records) {
    const daten = aggregiereNachGruppe(records);
    const tbody = document.getElementById("oh-table-body");
    const countEl = document.getElementById("oh-table-count");
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
        return `
        <tr>
          <td class="text-muted small">${escapeHtml(d.label)}</td>
          <td></td>
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
    const records = getFiltered();
    renderKpis(records);
    renderBereichChart(records);
    renderTabelle(records);

    // Drill-Down schließen bei Filterwechsel
    const card = document.getElementById("oh-drilldown-card");
    if (card) card.style.display = "none";
    if (gruppeChart) {
      gruppeChart.destroy();
      gruppeChart = null;
    }
  }

  // ── Event-Listener ────────────────────────────
  document.getElementById("oh-jahr-select")?.addEventListener("change", (e) => {
    currentJahr = e.target.value;
    updateAll();
  });

  document.querySelectorAll("input[name='oh-ansicht']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      currentAnsicht = e.target.value;
      updateAll();
    });
  });

  document.getElementById("oh-search")?.addEventListener("input", (e) => {
    currentSearch = e.target.value.trim();
    updateAll();
  });

  document
    .getElementById("oh-drilldown-close")
    ?.addEventListener("click", () => {
      const card = document.getElementById("oh-drilldown-card");
      if (card) card.style.display = "none";
      if (gruppeChart) {
        gruppeChart.destroy();
        gruppeChart = null;
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

// ══════════════════════════════════════════════════════════════
// BIBLIOTHEKEN LADEN
// ══════════════════════════════════════════════════════════════

/*
 * Diese Funktion lädt Chart.js aus einem CDN in den <head> der Seite.
 * Wird automatisch vor app() aufgerufen.
 */
function addToHead() {
  // CSS-Styles einfügen
  const style = document.createElement("style");
  style.textContent = `
    #oh-chart-bereich,
    #oh-chart-gruppe { cursor: pointer; }

    #oh-kpis .card { transition: box-shadow 0.2s; }
    #oh-kpis .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

    .oh-hint {
      font-size: 0.8rem;
      color: #6c757d;
      margin-top: 4px;
    }
  `;
  document.head.appendChild(style);

  // Chart.js per Script-Element laden und Promise zurückgeben
  return new Promise((resolve, reject) => {
    if (window.Chart) {
      resolve(); // bereits geladen
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js";
    script.onload = resolve;
    script.onerror = () =>
      reject(new Error("Chart.js konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
}
