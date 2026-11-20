# kaufda-parser

Konfigurierbarer Browser-Parser für sichtbare, öffentliche Lebensmittelangebote auf KaufDA. Der Parser verwendet Playwright ausschließlich für die konfigurierten KaufDA-Webseiten. Er nutzt keine KaufDA-Logins, keine undokumentierten Endpunkte, keine Zugriffsschutz-Umgehung und keine Bring!-API.

Das Repository veröffentlicht täglich einen maschinenlesbaren Angebotsfeed unter `generated/offers.json`. Der Feed ist für eine lokale PWA wie Vorratskompass gedacht: Angebote bleiben Vorschläge und Prüfobjekte. Sie werden nie automatisch als gekauft, als Vorrat, als Rezeptfreigabe oder als Bring!-Eintrag behandelt.

Die vorhandene Datei im Ausgangsstand kann noch eine historische Ausgabe des alten Parsers enthalten. Die dortige Angebotszahl ist bis zum ersten erfolgreichen v2-Workflow-Lauf ausdrücklich kein aktueller Live-Nachweis.

## Schnellstart

Voraussetzung: Node.js 20 oder neuer.

```powershell
git clone https://github.com/bndkxbqf2g-stack/kaufda-parser.git
cd kaufda-parser
npm install
npx playwright install chromium
node src/cli.mjs validate --config kaufda-parser.config.json
node src/cli.mjs parse --config kaufda-parser.config.json --output generated/offers.json
node src/cli.mjs verify --config kaufda-parser.config.json --input generated/offers.json
```

Für die sichtbare Fehlersuche kann `--headed` ergänzt werden. Ein einzelner Markt lässt sich mit `--market <key>` prüfen, ohne alle Märkte erneut zu starten.

## Konfigurierte Bezugsquellen

Die Konfiguration enthält die gewünschten öffentlichen Suchseiten für:

- Lidl Zellingen
- ALDI SÜD Zellingen
- EDEKA Zellingen
- Netto Thüngersheim
- Kaufland Würzburg als Bezugsquelle im Würzburger Raum

Die tatsächliche KaufDA-Quelle, der sichtbare Standort, die Entfernung und die Filialadresse werden pro Lauf im Marktstatus gespeichert. Eine konfigurierte Suchseite ist deshalb kein Beweis, dass in jedem Lauf eine passende Filiale oder ein vollständiger Prospekt geladen wurde. Das Ergebnis bleibt bei fehlendem Standortbezug unvollständig und wird nicht als vollständig ausgegeben.

## Angebotsvertrag für Vorratskompass

Das aktuelle Format ist `kaufda-offers/v2` mit `contractVersion: vorratskompass-offers/v1`.

Jedes übernommene Lebensmittelangebot enthält weiterhin flache, leicht importierbare Felder (`product`, `market`, `pack`, `price`, `basePrice`, `validFrom`, `validTo`, `sourceUrl`) und zusätzlich nachvollziehbare Qualitätsdaten:

- `fieldStatus`: getrennt sichtbare oder fehlende Werte für Produkt, Preis, Packung, Grundpreis, Gültigkeit und Quelle;
- `classification`: `food`, `nonfood` oder `uncertain` mit Gründen und Merkmalen;
- `status`/`reviewStatus`: `verified` nur bei vollständigen, sichtbaren Pflichtfeldern, sonst `needs-review`;
- `rawText`: begrenzter Rohtext der sichtbaren Karte, damit Korrekturen möglich bleiben;
- `capturedAt`, `fetchedAt`, Markt, Quelle und Gültigkeitszeitraum;
- `marketLocationStatus` sowie der Marktstatus mit sichtbarer Adresse, damit falsch aufgelöste KaufDA-Orte nicht in den PWA-Feed gelangen;
- stabile IDs, die Markt, Quelle, Produkt, Preis, Packungsgröße und Gültigkeit berücksichtigen.
- Preiszeilen werden semantisch getrennt: `price` ist der aktuelle Angebotspreis, `discountAmount` ein sichtbarer „sparen!“-Betrag und `basePrice`/`previousPrice` der durchgestrichene Regelpreis. Sternchen und Darstellungshinweise werden ignoriert.
- `priceType` und `priceEvidence` dokumentieren, ob ein Regelpreis oder Rabatt sichtbar war. Relative Hinweise wie „Endet morgen“ werden anhand von `capturedAt` in ein absolutes `validUntil` überführt, damit abgelaufene Angebote aus der aktiven Planung fallen können.

Nichtlebensmittel und unklare Karten werden nicht als Lebensmittelangebote ausgegeben. Sie erscheinen stattdessen in `reviewItems` und in den Markt-Zählungen. Die Zusammenfassung unterscheidet ausdrücklich:

- geladene KaufDA-Karten;
- erkannte Karten mit Produkt und Preis;
- übernommene Lebensmittelangebote;
- unsichere, verworfene und nicht erkennbare Einträge;
- Fehler, Warnungen und `completenessStatus`.

`targetReached` wird nur gesetzt, wenn die sichtbare KaufDA-Zielzahl vorhanden ist und die erfassten Karten diese Zielzahl tatsächlich erreichen. Eine Kartenanzahl ist nicht automatisch eine Zahl gültiger Lebensmittelangebote.

Wenn KaufDA nur eine Anzeige wie `1 / 37` liefert, wird sie als `targetPageCount` mit `expectedCountKind: prospect-pages` gespeichert. Prospektseiten werden niemals als Angebotskarten gezählt.

## Belegter Live-Test

Ein begrenzter Live-Lauf der sichtbaren öffentlichen Seiten wurde am `2026-11-19T04:55:41Z` ausgeführt. Alle fünf Quellen lieferten ohne Browser- oder Netzwerkfehler einen sichtbaren Standort. Die Zahlen sind der Testlauf und nicht die historische Datei `generated/offers.json`.

| Markt | sichtbarer Standort | Karten geladen / erkannt | Lebensmittel | unsicher | verworfen | Prospektseiten |
|---|---|---:|---:|---:|---:|---:|
| Lidl Zellingen | Am Güßgraben 2, 97225 Zellingen-Retzbach | 172 / 172 | 95 | 66 | 11 | 42 |
| ALDI SÜD Zellingen | Würzburger Straße 74, 97225 Zellingen-Gemarkung Zellingen | 200 / 199 | 63 | 103 | 33 | 37 |
| EDEKA Zellingen | Würzburger Straße 100, 97225 Zellingen | 183 / 183 | 54 | 121 | 8 | 42 |
| Netto Thüngersheim | Am Straßacker 1, 97291 Thüngersheim | 192 / 192 | 54 | 123 | 15 | 72 |
| Kaufland Würzburg | Nürnberger Straße 12, 97076 Würzburg-Grombühl | 118 / 118 | 4 | 104 | 10 | 28 |

Gesamt: 865 geladene Karten, 864 mit Produkt und Preis erkannt, 270 Lebensmittelangebote übernommen, 517 unsichere und 77 verworfene Karten. Kein Markt erreichte eine belastbare Kartenzielzahl; der Lauf bleibt deshalb `incomplete`. Packungsgröße und Gültigkeit waren in den sichtbaren Angebotskarten häufig nicht vorhanden und wurden als `null` belassen. Die 204 Angebote der alten ALDI-SÜD-Datei sind weiterhin nur historische Parserausgabe.

## Täglicher kostenloser Workflow

`.github/workflows/kaufda-offers.yml` läuft täglich um 05:15 UTC und kann zusätzlich manuell über **Actions → KaufDA-Angebote aktualisieren → Run workflow** gestartet werden.

Der Workflow:

1. installiert die Abhängigkeiten und führt die Unit-Tests aus;
2. installiert Chromium für Playwright;
3. schreibt zunächst nach `generated/offers.next.json`;
4. prüft, ob mindestens ein Lebensmittelangebot und ein gültiges Dokument vorhanden sind;
5. veröffentlicht die geprüfte Datei erst danach als `generated/offers.json`;
6. lässt unvollständige Läufe sichtbar, behauptet aber keine Vollständigkeit;
7. überschreibt die bestehende Datei bei einem vollständig fehlgeschlagenen Lauf nicht.

Die PWA kann den öffentlichen Rohfeed später ohne eigenen Server beziehen:

```text
https://raw.githubusercontent.com/bndkxbqf2g-stack/kaufda-parser/main/generated/offers.json
```

Beim Import sollte die PWA nur `offers` lesen, `status` und `completenessStatus` anzeigen und Angebote als `needs-review` behandeln, wenn Pflichtfelder fehlen. Der Feed darf keine bestätigten Vorräte, Einkaufslisten oder Rezeptfreigaben verändern.

Der Parser-Feed ist damit für einen späteren, klar begrenzten PWA-Import vorbereitet. In diesem Entwicklungsschritt wurden keine Vorratskompass-Dateien geändert; die App-Integration bleibt nach Review des Feed-Vertrags ein eigener Schritt.

## Tests

```powershell
npm test
node src/cli.mjs validate --config kaufda-parser.config.json
node src/cli.mjs verify --input generated/offers.json
```

Die Tests verwenden lokale JSON-Fixtures mit sichtbaren Beispielen für Lebensmittel, Nichtlebensmittel und unklare Karten. Ein Live-Lauf ist nicht Bestandteil der normalen Unit-Tests. Falls Playwright, Chromium, Netzwerk oder die KaufDA-Seitenstruktur nicht verfügbar sind, muss der Workflow den konkreten Fehler ausgeben; Fixture-Ergebnisse dürfen nicht als Live-Ergebnisse ausgegeben werden.

Die im Ausgangsstand eingecheckte v1-Datei kann beim direkten `verify` absichtlich als nicht veröffentlichbar erscheinen, weil ihr noch die v2-Zusammenfassung fehlt. Nach `parse` in eine neue Datei und erfolgreicher Prüfung ersetzt der Workflow sie erst sicher durch die v2-Ausgabe.

## Kosten, Sicherheit und Datenschutz

Der Parser erzeugt keine OpenAI-Aufrufe und speichert keine Secrets. Die GitHub-Action benötigt nur die Schreibberechtigung, um die öffentliche Ergebnisdatei im Repository zu aktualisieren. Es gibt keine automatische Bestellung, Zahlung oder Bring!-Synchronisierung.
