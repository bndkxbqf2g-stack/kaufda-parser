import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOffersDocument,
  isLikelyFood,
  mergeConfig,
  normalizeOffer,
  parseDate,
  parseOfferCount,
  parsePrice,
  validateConfig
} from '../src/index.mjs';

test('parsePrice liest deutsche Angebotspreise', () => {
  assert.equal(parsePrice('ab 2,29 €'), 2.29);
  assert.equal(parsePrice('1,49 € UVP 1,99 €'), 1.49);
  assert.equal(parsePrice('kein Preis'), null);
});

test('KaufDA-Kartenzahl wird auch mit Tausenderpunkt erkannt', () => {
  assert.equal(parseOfferCount('Angebote(410)'), 410);
  assert.equal(parseOfferCount('Angebote 410'), 410);
  assert.equal(parseOfferCount('Angebote (1.234)'), 1234);
});

test('Datum wird in ISO-Format überführt', () => {
  assert.equal(parseDate('gültig bis 07.11.2026'), '2026-11-07');
});

test('Nichtlebensmittel werden herausgefiltert', () => {
  assert.equal(isLikelyFood('Salami', mergeConfig()), true);
  assert.equal(isLikelyFood('LED-Papierlicht', mergeConfig()), false);
  assert.equal(isLikelyFood('Klemmbausteine-Set', mergeConfig({ excludeTerms: ['Wein'] })), false);
  assert.equal(isLikelyFood('LED-Papierlicht', { foodOnly: false }), true);
});

test('Angebot wird standardisiert und behält Quelle/Bild', () => {
  const offer = normalizeOffer({
    text: '1,49 €\nALDI SÜD\nSalami\ngültig bis 07.11.2026',
    imageUrl: 'https://example.test/salami.jpg'
  }, { key: 'Aldi-Sued', store: 'ALDI SÜD', url: 'https://www.kaufda.de/filiale' }, mergeConfig());
  assert.deepEqual({ name: offer.name, price: offer.price, validUntil: offer.validUntil }, {
    name: 'Salami', price: 1.49, validUntil: '2026-11-07'
  });
  assert.equal(offer.imageUrl, 'https://example.test/salami.jpg');
});

test('Dokument enthält Markt- und Angebotszusammenfassung', () => {
  const config = mergeConfig({ location: { city: 'Zellingen' } });
  const result = { market: 'Aldi-Sued', expectedCardCount: 410, loadedCardCount: 410, targetReached: true, offers: [] };
  const document = buildOffersDocument({ config, results: [result], offers: [] });
  assert.equal(document.schemaVersion, 'kaufda-offers/v1');
  assert.equal(document.summary.targetCardCount, 410);
  assert.equal(document.summary.targetReachedCount, 1);
});

test('Konfiguration wird verständlich validiert', () => {
  const invalid = validateConfig({ location: { city: 'Zellingen' }, markets: [{ key: 'Aldi' }] });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(' '), /url fehlt/);
});

