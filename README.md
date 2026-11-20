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

Jedes übernommene Lebensmittelangebot wird aus einer festen Veröffentlichungs-Whitelist erzeugt. Aus der sichtbaren KaufDA-Karte bzw. Detailansicht werden nur diese Angebotsfelder veröffentlicht:

- `product` und `productDescription`;
- `price`, `priceLabel`, `discountAmount`, `basePrice`, `previousPrice` und `priceType`;
- `pack`, `packSize`, `packSizeValue`, `packSizeUnit` und `packCount`;
- `unitPrice`, `unitPriceUnit` und `unitPriceText`;
- `validFrom`, `validUntil` und `validTo`;
- Markt-/Quellenfelder (`market`, `marketKey`, `store`, `sourceUrl`, `source`, `sourceId`).

Zusätzlich bleiben nur die für den sicheren Vertrag erforderlichen technischen Felder erhalten: `id`, `currency`, `capturedAt`, `fetchedAt`, `classification`, `fieldStatus`, `marketLocationStatus`, `status`, `reviewStatus` und `planningStatus`. Nicht veröffentlicht werden unter anderem `rawText`, `imageUrl`, `category`, `priceEvidence` und das interne `validity`-Objekt.

Die Mengen werden semantisch normalisiert: Bei `10 x 20 g = 200-g-Packung` ist `packSizeValue` `200`, `packSizeUnit` `g` und `packCount` `10`. Bei Varianten wie `40-, 45- bzw. 55-g-Packung` bleibt der Wert `null`, `fieldStatus.packSize` wird `ambiguous` und das Angebot bleibt `planningStatus: needs-review`.

Zusätzliche Qualitätsfelder:

- `fieldStatus`: getrennt sichtbare, fehlende oder mehrdeutige Werte für Produkt, Beschreibung, Preis, Packung, Grundpreis, Gültigkeit und Quelle;
- `classification`: `food`, `nonfood` oder `uncertain` mit Gründen und Merkmalen;
- `status`/`reviewStatus`: `verified` sobald Produkt, aktueller Angebotspreis und eindeutige Packungs-/Mengenangabe für die Planung vorliegen;
- `capturedAt`, `fetchedAt`, Markt, Quelle und Gültigkeitszeitraum;
- `marketLocationStatus` sowie der Marktstatus mit sichtbarer Adresse, damit falsch aufgelöste KaufDA-Orte nicht in den PWA-Feed gelangen;
- stabile IDs, die Markt, Quelle, Produkt, Preis, Packungsgröße und Gültigkeit berücksichtigen.
- Preiszeilen werden semantisch getrennt: `price` ist der aktuelle Angebotspreis, `discountAmount` ein sichtbarer „sparen!“-Betrag und `basePrice`/`previousPrice` der durchgestrichene Regelpreis. Ein allein stehender `sparen!`-Betrag wird niemals als Angebotspreis veröffentlicht.
- Relative Hinweise wie „Endet morgen“ werden anhand von `capturedAt` in ein absolutes `validUntil` überführt. Nach Ablauf fällt der Aktionspreis aus der aktiven Planung; ein gespeicherter durchgestrichener regulärer Preis bleibt als Normalpreis erhalten.

Nichtlebensmittel und unklare Karten werden nicht als Lebensmittelangebote ausgegeben. Sie erscheinen stattdessen in `reviewItems` und in den Markt-Zählungen. Die Zusammenfassung unterscheidet ausdrücklich:

- geladene KaufDA-Karten;
- erkannte Karten mit Produkt und Preis;
- übernommene Lebensmittelangebote;
- unsichere, verworfene und nicht erkennbare Einträge;
- Fehler, Warnungen und `completenessStatus`.

`targetReached` wird nur gesetzt, wenn die sichtbare KaufDA-Zielzahl vorhanden ist und die erfassten Karten diese Zielzahl tatsächlich erreichen. Eine Kartenanzahl ist nicht automatisch eine Zahl gültiger Lebensmittelangebote.

Wenn KaufDA nur eine Anzeige wie `1 / 37` liefert, wird sie als `targetPageCount` mit `expectedCountKind: prospect-pages` gespeichert. Prospektseiten werden niemals als Angebotskarten gezählt.

## Belegter Live-Test

Der verifizierte Live-Lauf der sichtbaren öffentlichen Seiten wurde am `2026-11-20T11:02:05Z` abgeschlossen. Alle fünf Quellen lieferten ohne Marktfehler einen sichtbaren Standort. Für erkannte Lebensmittelkandidaten wurden die verlinkten öffentlichen KaufDA-Detailansichten nachgeladen.

| Markt | sichtbarer Standort | Karten geladen / erkannt | Lebensmittel | unsicher | verworfen | Prospektseiten |
|---|---|---:|---:|---:|---:|---:|
| Lidl Zellingen | Am Güßgraben 2, 97225 Zellingen-Retzbach | 172 / 172 | 94 | 67 | 11 | 42 |
| ALDI SÜD Zellingen | Würzburger Straße 74, 97225 Zellingen-Gemarkung Zellingen | 200 / 199 | 65 | 101 | 33 | 37 |
| EDEKA Zellingen | Würzburger Straße 100, 97225 Zellingen | 183 / 183 | 52 | 123 | 8 | 42 |
| Netto Thüngersheim | Am Straßacker 1, 97291 Thüngersheim | 197 / 197 | 56 | 124 | 17 | 74 |
| Kaufland Würzburg | Nürnberger Straße 12, 97076 Würzburg-Grombühl | 118 / 118 | 0 | 108 | 10 | 28 |

Gesamt: 870 geladene Karten, 869 mit Produkt und Preis erkannt, 267 Lebensmittelangebote übernommen, 523 unsichere und 79 verworfene Karten. Kein Markt erreichte eine belastbare Kartenzielzahl; die Marktabdeckung bleibt deshalb `incomplete`. Davon sind 224 Angebote planungsbereit und 43 prüfpflichtig. Packungsgröße und Gültigkeit können bei anderen Karten `null` bleiben. `Kaufland Würzburg` lieferte in diesem Lauf keine als Lebensmittel bestätigten Angebote.

## Täglicher kostenloser Workflow

`.github/workflows/kaufda-offers.yml` läuft täglich um 05:15 UTC und kann zusätzlich manuell über **Actions → KaufDA-Angebote aktualisieren → Run workflow** gestartet werden.

Der Workflow:

1. installiert die Abhängigkeiten und führt die Unit-Tests aus;
2. installiert Chromium für Playwright;
3. liest die sichtbaren Karten und öffnet für erkannte Lebensmittelkandidaten die verlinkte öffentliche KaufDA-Detailansicht;
4. übernimmt daraus ausschließlich die vereinbarten Produkt-, Beschreibungs-, Preis-, Mengen-, Grundpreis-, Gültigkeits-, Markt- und Quellenfelder;
5. schreibt zunächst nach `generated/offers.next.json`;
6. prüft, ob mindestens ein Lebensmittelangebot und ein gültiges Dokument vorhanden sind;
7. veröffentlicht die geprüfte Datei erst danach als `generated/offers.json`;
8. lässt unvollständige Läufe sichtbar, behauptet aber keine Vollständigkeit;
9. überschreibt die bestehende Datei bei einem vollständig fehlgeschlagenen Lauf nicht.

Die PWA kann den öffentlichen Rohfeed später ohne eigenen Server beziehen:

```text
https://raw.githubusercontent.com/bndkxbqf2g-stack/kaufda-parser/main/generated/offers.json
```

Das strukturelle Vertragsschema liegt unter `schemas/vorratskompass-offers-v1.schema.json`. `node src/cli.mjs verify` prüft zusätzlich die Cross-Field-Invarianten, die ein JSON-Schema allein nicht ausdrücken kann.

Beim Import sollte die PWA:

- nur `offers` lesen und `summary.completenessStatus`, `summary.planningCompletenessStatus` sowie `fetchedAt` sichtbar anzeigen;
- ausschließlich `status: "verified"`, `planningStatus: "ready"` und `marketLocationStatus: "matched"` als automatische Planungsvorschläge verwenden;
- alle anderen Angebote als `needs-review` behandeln und niemals automatisch in bestätigte Vorräte, Einkaufslisten oder Rezeptfreigaben übernehmen;
- `product`, `productDescription` und URLs als untrusted input behandeln, mit Textknoten statt `innerHTML` rendern und nur HTTPS-Links öffnen;
- den zuletzt validierten Feed offline als last-known-good-Version behalten und bei veralteten Daten einen sichtbaren Hinweis anzeigen.

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
