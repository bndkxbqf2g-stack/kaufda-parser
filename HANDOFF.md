# Übergabeprotokoll: kaufDA-Parser / Vorratskompass

Stand: 20.11.2026  
Lokaler Pfad: `C:\Users\Boool\kaufda-parser-github`  
GitHub: `https://github.com/bndkxbqf2g-stack/kaufda-parser`  
Branch: `main`  
Status: lokale Änderungen vorhanden, noch nicht committed oder gepusht.

## Ziel

Der Parser liest sichtbare öffentliche KaufDA-Angebote für fünf Märkte und veröffentlicht täglich `generated/offers.json` als maschinenlesbaren Vorschlagsfeed für Vorratskompass.

Der Feed-Vertrag lautet:

- `schemaVersion`: `kaufda-offers/v2`
- `contractVersion`: `vorratskompass-offers/v1`

Angebote sind ausschließlich Vorschläge. Sie dürfen nie automatisch als gekauft, eingelagert, als Rezeptfreigabe oder als Bring!-Eintrag behandelt werden.

## Umgesetzte Änderungen

1. Rabattpreise korrigiert. Getrennte DOM-Preiszeilen werden zusammengeführt; ein allein stehender `sparen!`-Betrag wird nicht mehr als Angebotspreis verwendet.
2. Geräte-Fehlklassifikationen reduziert. Begriffe wie Toaster, Wasserkocher und Kaffeemaschinen werden nicht mehr als Lebensmittel veröffentlicht.
3. Feed-Validierung verschärft. Geprüft werden nun Schema-/Vertragsversion, Zeitstempel, Summenkonsistenz, Preis, Status, Marktstandort, KaufDA-Quelle, Datumsfelder und Planungsstatus.
4. JSON-Schema ergänzt: `schemas/vorratskompass-offers-v1.schema.json`.
5. GitHub Actions gehärtet: Actions auf feste Commit-SHAs gepinnt, Konfiguration wird vor dem Live-Lauf validiert und Playwright wird mit `npx --no-install` gestartet.
6. Regressionstests für Rabattzeilen, Geräteklassifikation und Vertragsfehler ergänzt.
7. `generated/offers.json` nach dem Fix live neu erzeugt.
8. Angebotsausgabe auf eine feste Feld-Whitelist begrenzt: sichtbare Produktbeschreibung, aktuelle/alte Preiswerte, Rabatt, Packung, Grundpreis, Gültigkeit sowie Markt-/Quellen- und Sicherheitsstatus; `rawText`, `imageUrl`, `category`, `priceEvidence` und internes `validity` werden nicht veröffentlicht.
9. Mengen normalisiert: `10 x 20 g` wird als `200 g` mit `packCount: 10` ausgegeben; Varianten wie `40/45/55 g` bleiben `needs-review`.

## Verifikation

Alle Prüfungen waren erfolgreich:

- `npm test`: 18/18 Tests bestanden
- `npm audit --include=dev`: 0 bekannte Schwachstellen
- Konfigurationsprüfung: erfolgreich
- Feed-Verifikation: erfolgreich, mit bewusst sichtbaren Qualitätswarnungen
- Live-Lauf: 5 Märkte, 870 Karten, 267 Lebensmittelangebote, 0 Marktfehler
- Rabattangebote mit falschem Rabattpreis: 0
- zuvor gefundene Geräte-Fehlklassifikationen im Food-Feed: 0

Der aktuelle Feed ist absichtlich nicht vollständig:

- `completenessStatus`: `incomplete`
- `targetReachedCount`: `0`
- `planningReadyOfferCount`: `224`
- `planningReviewOfferCount`: `43`

Die verlinkten KaufDA-Detailansichten liefern für einen großen Teil der Angebote verlässliche Packungs-/Mengenangaben. Im aktuellen Feed sind 224 Angebote planungsbereit; 43 bleiben wegen fehlender oder mehrdeutiger Mengenangaben prüfpflichtig und dürfen nicht automatisch geplant werden.

## Vorratskompass-Importregeln

Die PWA soll:

- ausschließlich `offers` als Vorschlagsdaten lesen;
- nur `status: "verified"`, `planningStatus: "ready"` und `marketLocationStatus: "matched"` automatisch als Planungsvorschlag verwenden;
- alle anderen Angebote als `needs-review` anzeigen;
- `summary.completenessStatus`, `summary.planningCompletenessStatus` und `fetchedAt` sichtbar machen;
- den zuletzt validierten Feed offline als last-known-good-Version behalten und veraltete Daten kennzeichnen;
- `product`, `productDescription` und `sourceUrl` als untrusted input behandeln, nicht per `innerHTML` rendern und nur HTTPS-Links öffnen;
- niemals automatisch Bestände, Einkaufslisten oder Rezeptfreigaben verändern.

## Wichtige Dateien

- `src/index.mjs`: Parser, Klassifikation, Feed-Erzeugung und Verifikation
- `src/cli.mjs`: CLI und generiertes Workflow-Template
- `tests/parser.test.mjs`: Unit- und Regressionstests
- `generated/offers.json`: aktueller öffentlicher Feed
- `schemas/vorratskompass-offers-v1.schema.json`: strukturelles Vertragsschema
- `.github/workflows/kaufda-offers.yml`: täglicher Live-Workflow
- `README.md`: Vertrag und PWA-Importdokumentation

## Bekannte Grenze

Die eigentliche Vorratskompass-PWA ist nicht in diesem Repository enthalten. Der öffentliche Auftritt unter `https://vorratskompass.de/` verweist derzeit auf App Store und Google Play. Für ein vollständiges PWA-Audit oder Änderungen an Service Worker, Manifest, Offline-Cache, UI und App-API wird das separate PWA-Repository oder die konkrete App-URL benötigt.

## Empfohlene nächste Schritte im neuen Chat

1. Dieses Protokoll vollständig übernehmen.
2. Das separate Vorratskompass-PWA-Repository oder die App-URL verbinden.
3. Zuerst `git diff`, `npm test` und `node src/cli.mjs verify --input generated/offers.json` ausführen.
4. Die PWA-Importstrecke gegen das JSON-Schema und die oben genannten Sicherheitsregeln prüfen.
5. Nach Review der Änderungen einen Commit erstellen und erst danach nach GitHub pushen.

## Lokale Prüfkommandos

```powershell
cd C:\Users\Boool\kaufda-parser-github
npm ci
npm test
node src/cli.mjs validate --config kaufda-parser.config.json
node src/cli.mjs verify --config kaufda-parser.config.json --input generated/offers.json
```
