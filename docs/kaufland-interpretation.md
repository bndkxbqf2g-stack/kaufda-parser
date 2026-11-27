# Kaufland-Angebotsinterpretation

Dieses Dokument hält die gemeinsam am Prospekt vom 23.–28.11.2026 bestätigten Interpretationsregeln als Parser-Spezifikation fest. Es gilt zunächst ausschließlich für den konfigurierten Markt `Kaufland-Wuerzburg` über `interpretationProfile: kaufland-v1`. Für Netto und andere Märkte wird dieses Profil nicht übernommen, bevor deren Angebotsformate separat geprüft wurden.

Kaufland wird mit `collectionMode: prospect` über KaufDAs Prospektansicht erfasst. Die übrigen Märkte bleiben im vorhandenen Kachelmodus; insbesondere ist Netto von diesem Profil und dieser Quellumstellung ausgenommen. Regeln, die mangels explizitem Text oder eindeutiger OCR-Zuordnung nicht sicher ableitbar sind, bleiben prüfpflichtig.

## Gesicherte Regeln

- Regulärer Angebotspreis, durchgestrichener Vorpreis, prozentuale Ersparnis und XTRA-Preis sind verschiedene Werte. Ein XTRA-Preis überschreibt den regulären Kachelpreis nicht.
- `XTRA` allein bedeutet keine Coupon-Aktivierung. Aktivierung und Punktebedarf werden nur gesetzt, wenn die Kachel ausdrücklich zur Aktivierung bzw. Einlösung auffordert. Die bestätigte Thomy-Aktion benötigt 60 XTRA-Punkte; diese Bedingung gilt nur für das jeweilige Produkt, nicht für alle XTRA-Preise.
- Pauschale Markenrabatte wie „25 % auf alle Artikel“ bleiben Prozentaktionen. Ohne konkreten Artikelpreis wird kein Preis berechnet; das Produkt kann nicht als konkreter Preisvorschlag veröffentlicht werden.
- Mehrpack-Gesamtpreis, Anzahl der Packungen, Größe je Einzelpackung und Grundpreis bleiben getrennt. „12 × 1 l für insgesamt 9,99 €“ ist ein Gesamtpreis von 9,99 €, nicht 9,99 € je Liter.
- Eine Thekenpreis-Bezugsmenge wird nicht vermutet. Nur ausdrücklich ausgewiesene Angaben wie €/100 g oder €/kg dürfen als Grundpreis interpretiert werden.
- Kauflimits für Endverbraucher, Mindesteinkaufswert und Punkteeinlösung sind Angebotsbedingungen, keine Packungsgrößen.
- Gültigkeit wird aus der sichtbaren Angebotskarte bzw. Detailansicht übernommen. Der Prospektkopf und ein Hinweis wie „nur Freitag und Samstag“ dürfen nur dann vererbt werden, wenn Parserdaten eine eindeutige Seiten-/Angebotszuordnung belegen.
- Jede Aussage soll mit sichtbarem Text, OCR-/Bildstatus, Packung, Markt, Zeitraum und Quelle belegbar bleiben. Fehlende Evidenz ist `unknown`/`needs-review`, kein negatives Angebotsergebnis.
- Produktvarianten mit Größenbereichen oder „ab“-Preisen bleiben mehrdeutig, wenn kein eindeutiger Einzelpreis und keine eindeutige Größe erkennbar sind.
- Pfand und Gebindepreis sind getrennt zu behandeln, sofern die sichtbare Karte beide Werte unterscheidet.
- Prospektseiten mit Werbung, Services, Auszeichnungen oder Markeninformation ohne konkrete Ware und Preis erzeugen kein Preisangebot.

## Feed-Kompatibilität

Der Feed bleibt `kaufda-offers/v2` mit `vorratskompass-offers/v1`. Die optionalen Kaufland-Felder `discountPercent`, `loyaltyPrice`, `loyaltyProgram`, `loyaltyActivationRequired`, `loyaltyPointsRequired`, `minimumPurchaseAmount` und `purchaseLimitText` können von bestehenden Feedlesern ignoriert werden. Der Marktstatus benennt zusätzlich `collectionMode`. Die vorhandenen Standardfelder `price`, `previousPrice`, `priceBasis`, `packCount`, `unitPrice`, `validFrom`, `validUntil` und `evidence` behalten ihre Bedeutung.

Wenn künftig eine neue Struktur erforderlich wird, muss sie zunächst optional im Schema ergänzt werden; bestehende Pflichtfelder und Werte werden dabei nicht umgedeutet. Insbesondere wird kein fehlender Preis mit einem berechneten Prozentpreis ersetzt.

## Grenzen

Die Prospektseiten werden als Doppelseiten besucht. Sichtbare Produkt-Overlaybereiche werden mit lokaler OCR ausgewertet und OCR-Zeilen nur dann einem Produkt zugeordnet, wenn ihre Bildkoordinaten in dessen Bereich liegen. Ein Besuch aller Prospektseiten beweist noch keine vollständige Angebotserfassung; der Marktstatus bleibt deshalb `incomplete`, bis eine zuverlässige Angebotszielzahl oder eine anderweitige Vollständigkeitsmessung verfügbar ist. Produktnamen müssen durch die Bild-OCR bestätigt sein, bevor ein Prospektangebot als planungsbereit gilt. Preise, Packungsgrößen, Aktionsbedingungen und Seitenkopf-Gültigkeit benötigen sichtbare Textbelege. Nicht zugeordnete oder mehrdeutige Angaben bleiben prüfpflichtig.
