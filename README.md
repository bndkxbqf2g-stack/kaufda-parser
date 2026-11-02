# kaufda-parser

Wiederverwendbarer Browser-Parser für Lebensmittelangebote auf KaufDA. Das Modul öffnet die konfigurierten KaufDA-Seiten mit Playwright, liest die Karten vollständig durch langsames Nachladen ein, zählt die erwarteten Karten, filtert Nichtlebensmittel und schreibt eine standardisierte `generated/offers.json`.

Das Repository ist öffentlich und kann unabhängig von „Angebotsküche“ verwendet, kopiert oder in eine eigene App eingebunden werden.

## Schnellstart

Voraussetzung: Node.js 20 oder neuer.

```powershell
git clone https://github.com/bndkxbqf2g-stack/kaufda-parser.git
cd kaufda-parser
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npx.cmd" playwright install chromium
node src/cli.mjs init --city Zellingen --zip 97225
```

Danach `kaufda-parser.config.json` öffnen und pro Markt die eigene KaufDA-Filial- oder Such-URL eintragen:

```json
{
  "location": { "city": "Zellingen", "zip": "97225" },
  "markets": [
    {
      "key": "Aldi-Sued",
      "store": "ALDI SÜD",
      "url": "https://www.kaufda.de/search?query=ALDI+SÜD&city=Zellingen&zip=97225",
      "productGroups": ["food"]
    }
  ],
  "foodOnly": true,
  "excludeTerms": ["LED", "Arznei", "Shampoo", "Waschmittel", "Tierfutter", "Spielzeug"]
}
```

Prüfen und lokal ausführen:

```powershell
node src/cli.mjs validate --config kaufda-parser.config.json
node src/cli.mjs parse --config kaufda-parser.config.json --output generated/offers.json
```

Für die sichtbare Fehlersuche kann `--headed` ergänzt werden. Ein einzelner Markt lässt sich mit `--market Aldi-Sued` prüfen, ohne alle Märkte erneut zu starten.

## Was der Parser kontrolliert

- Er liest die KaufDA-Anzahl aus `Angebote (410)` oder ähnlichen Zählern.
- Er scrollt in kleinen Schritten und wartet nach jedem Schritt auf nachgeladene Karten.
- Er beendet den Lauf erst bei erreichter Zielanzahl oder nach mehreren stabilen Durchläufen am Seitenende.
- Er übernimmt nur Karten mit erkanntem Namen und Preis.
- Nichtlebensmittel werden über `excludeTerms` entfernt; die Liste kann pro Projekt angepasst werden.
- Pro Angebot werden Bezeichnung, Preis, Packungsgröße, Bild-URL, Quelle, Markt und Gültigkeitsdatum gespeichert.
- `targetCardCount`, `loadedCardCount`, `targetReached` und `recognizedCount` stehen zusätzlich in der Marktzusammenfassung.

Die Bilder werden nicht kopiert, sondern über die von KaufDA gelieferte Bild-URL referenziert. Falls KaufDA das HTML oder die Kartenstruktur ändert, bleibt der manuelle Import als Fallback in der jeweiligen App sinnvoll; der Parser meldet dann einen unvollständigen Lauf statt falsche Vollständigkeit vorzutäuschen.

## GitHub-Automatisierung

`.github/workflows/kaufda-offers.yml` führt den Parser montags und donnerstags um 05:15 UTC aus und kann zusätzlich unter **Actions → KaufDA-Angebote aktualisieren → Run workflow** manuell gestartet werden. Die erkannten Daten werden nach `generated/offers.json` committed.

Die Workflow-Tage sind nur ein Startwert. Für andere Prospekt-Tage kann der Cron-Ausdruck angepasst werden. Der Parser benötigt keine Supabase-Verbindung und keine Bring!-API.

## Für eine eigene App verwenden

Der Freund kann das Repository als Vorlage kopieren oder forken und nur `kaufda-parser.config.json` ändern. Die App liest danach `generated/offers.json` ein. Das Format ist bewusst unabhängig:

```json
{
  "schemaVersion": "kaufda-offers/v1",
  "summary": { "recognizedOfferCount": 42 },
  "markets": [],
  "offers": [
    {
      "market": "Aldi-Sued",
      "name": "Salami",
      "price": 1.49,
      "currency": "EUR",
      "imageUrl": "https://...",
      "sourceUrl": "https://www.kaufda.de/..."
    }
  ]
}
```

Für eine Einbindung als Node-Modul:

```js
import { loadConfig, runParser } from './src/index.mjs';

const config = await loadConfig('kaufda-parser.config.json');
await runParser(config, { outputPath: 'generated/offers.json' });
```

## Tests

```powershell
& "C:\Program Files\nodejs\npm.cmd" test
```

Der Parser enthält bewusst keinen Login- oder Bring!-Zugriff. Er verwendet nur die konfigurierten KaufDA-Webseiten und ist damit als eigenständiges öffentliches Modul nachvollziehbar und reproduzierbar.

