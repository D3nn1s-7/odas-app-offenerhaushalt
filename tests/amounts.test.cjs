const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const app = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8"), app);

for (const [input, expected] of [
  [-1234.56, -1234.56], ["-1.234,56", -1234.56], ["-1,234.56", -1234.56],
  ["−1.234,56", -1234.56], ["+1.234,56", 1234.56],
  ["1.234,56", 1234.56], ["1234,56", 1234.56], ["1,234.56", 1234.56],
  ["-1234.56", -1234.56], ["-0,50", -0.5], ["0", 0], [0, 0], ["", 0],
]) {
  test("F-147 Betrag " + JSON.stringify(input) + " bleibt exakt erhalten", () => {
    assert.equal(app.parseBetrag(input), expected);
  });
}
for (const invalid of ["-1.234,56x", "12,34,56", "1.2.3", "unbekannt", Infinity]) {
  test("F-147 ungültiger Betrag wird nicht als Präfixsumme übernommen: " + invalid, () => {
    assert.throws(() => app.parseBetrag(invalid), /Betrag/);
  });
}
test("F-147 Normalisierung erhält den Korrekturbetrag für KPI und Export", () => {
  const [row] = app.normalizeRecords([{
    produktbereich: "01", produktbereichbezeichnung: "Verwaltung",
    haushaltsjahr: "2026", ertragaufwand: "A", betrag: "-1.234,56",
  }]);
  assert.equal(row.betrag, -1234.56);
  assert.equal(row.typ, "A");
});
for (const [input, expected] of [
  ["-", 0], ["–", 0], ["1.234.567", 1234567], ["-1.234.567", -1234567],
  ["1.234,56 €", 1234.56], ["1.234,56 EUR", 1234.56], ["€ 99", 99],
]) {
  test("F-147 übliche deutsche Haushaltszelle " + JSON.stringify(input) + " bleibt lesbar", () => {
    assert.equal(app.parseBetrag(input), expected);
  });
}
test("F-147 unlesbarer Betrag nennt den Wert in der Fehlermeldung", () => {
  assert.throws(() => app.parseBetrag("k.A."), /„k\.A\.“/);
});
test("Kurzform für Handy-Tabellen: Mrd./Mio./T€, Vorzeichen bleibt, kleine Beträge voll", () => {
  const z = (v) => app.euroZelle(v).split("</span>")[1].replace(/<[^>]+>/g, "");
  assert.equal(z(7_500_000_000), "7,5 Mrd. €");
  assert.equal(z(-43_700_000), "-43,7 Mio. €");
  assert.equal(z(592_000), "592 T€");
  assert.equal(z(999.5), app.formatEuro(999.5));
});
