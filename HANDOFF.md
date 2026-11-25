# Übergabeprotokoll: kaufDA-Parser / Vorratskompass

Stand: 25.11.2026  
Lokaler Pfad: `/workspace/kaufda-parser`  
GitHub: `https://github.com/bndkxbqf2g-stack/kaufda-parser`  
Branch: `main`  
Status: Remote-`main` enthält PR #2 und PR #3; lokale Workspace-Kopie kann noch auf `f606788` stehen und Änderungen als uncommitted anzeigen. Vor weiteren Änderungen zuerst den Stand abgleichen und lokale Diffs bewahren.

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
7. Historischer Feed-Stand: `generated/offers.json` kann eine alte Ausgabe enthalten und ist erst nach erfolgreicher Verifikation ein aktueller Feed-Nachweis.
8. Angebotsausgabe auf eine feste Feld-Whitelist begrenzt: sichtbare Produktbeschreibung, aktuelle/alte Preiswerte, Rabatt, Packung, Grundpreis, Gültigkeit sowie Markt-/Quellen- und Sicherheitsstatus; `rawText`, `imageUrl`, `category`, `priceEvidence` und internes `validity` werden nicht veröffentlicht.
9. Mengen normalisiert: `10 x 20 g` wird als `200 g` mit `packCount: 10` ausgegeben; Varianten wie `40/45/55 g` bleiben `needs-review`.
10. KaufDA-Weiterleitungen, fehlende Händlerergebnisse und fehlgeschlagene Marktaktionen werden als Fehler behandelt; Teilfeeds mit einem ausgefallenen Markt werden nicht geschrieben.
11. Einzelmarktläufe dürfen `generated/offers.json` nicht überschreiben.
12. OCR-Bilder werden nur über HTTPS vom freigegebenen Bonial-Bildhost geladen; Weiterleitungen, Antworttyp, Laufzeit und Größe sind begrenzt.
13. Feed-Läufe starten über Zeitplan oder manuell, nicht durch Code-Pushes; Test-CI nutzt feste Action-SHAs und `npm ci`.

## Verifikation

Stand 25.11.2026:

- `npm test`: erfolgreich; gezielte Regressionstests ebenfalls erfolgreich.
- GitHub-Testworkflow für PR #3: erfolgreich.
- Konfigurationsprüfung: erfolgreich, fünf Märkte.
- Feed-Verifikation: **nicht erfolgreich**, weil `generated/offers.json` weiterhin den fehlgeschlagenen Markt `Kaufland Würzburg` enthält. Die Datei wurde in diesem Arbeitslauf nicht geändert; aktueller Blob-SHA: `89206af7ce2e7b98e7c2a8e74817e5e6bb51a596`.
- Workflow #45525048828 wurde am 25.11. um 01:44 UTC abgebrochen; der Feed blieb unverändert.
- Ein vorheriger Feature-Branch-Lauf konnte fünf Märkte parsen und den Feed verifizieren, aber der anschließende Push scheiterte mit `fetch first`; das erzeugte Ergebnis wurde nicht veröffentlicht.
- `npm audit --include=dev` konnte wegen einer vom Netzwerkproxy abgewiesenen Anfrage an `registry.npmjs.org` (403 `Domain forbidden`) nicht abgeschlossen werden. Es gibt daher keinen aktuellen Audit-Nachweis.

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

## Empfohlene nächste Schritte

1. Lokale Workspace-Kopie mit Remote-Branch `main` abgleichen; lokale Änderungen bewahren.
2. Die nächste reguläre Angebotsausführung beobachten. Ein manueller Lauf, der `generated/offers.json` ersetzt, braucht eine ausdrückliche Freigabe.
3. Feed nur akzeptieren, wenn `node src/cli.mjs verify --config kaufda-parser.config.json --input generated/offers.json` erfolgreich ist.
4. Abhängigkeitsaudit erneut ausführen, sobald `registry.npmjs.org` aus der Umgebung erreichbar ist.
5. Für ein PWA-Audit das separate Vorratskompass-PWA-Repository verbinden.

## Lokale Prüfkommandos

```sh
cd /workspace/kaufda-parser
npm ci
npm test
node src/cli.mjs validate --config kaufda-parser.config.json
node src/cli.mjs verify --config kaufda-parser.config.json --input generated/offers.json
```
