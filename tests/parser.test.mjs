import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessOffer,
  buildOffersDocument,
  classifyFood,
  dedupeOffers,
  isLikelyFood,
  mergeConfig,
  matchVisibleLocation,
  normalizeOffer,
  parseDate,
  parseOfferCount,
  parsePackSize,
  parsePrice,
  parsePriceDetails,
  parseUnitPrice,
  parseValidity,
  validateConfig,
  validateOutputDocument
} from '../src/index.mjs';

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'kaufda-visible-cards.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const market = {
  key: 'Lidl-Zellingen',
  label: 'Lidl Zellingen',
  store: 'Lidl',
  url: 'https://www.kaufda.de/search?query=Lidl&city=Zellingen&zip=97225'
};

test('parsePrice liest deutsche Angebotspreise inklusive Tausenderpunkt', () => {
  assert.equal(parsePrice('ab 2,29 €'), 2.29);
  assert.equal(parsePrice('1,49 € UVP 1,99 €'), 1.49);
  assert.equal(parsePrice('1.234,56 €'), 1234.56);
  assert.equal(parsePrice('kein Preis'), null);
});

test('KaufDA-Preiszeilen trennen Rabatt, Angebotspreis und Regelpreis', () => {
  assert.deepEqual(parsePriceDetails('0,30 € sparen! 1,19 € 1,49 €'), {
    currentPrice: 1.19,
    previousPrice: 1.49,
    discountAmount: 0.3,
    type: 'discount-with-previous',
    text: '0,30 € sparen! 1,19 € 1,49 €'
  });
  assert.deepEqual(parsePriceDetails('0,89 € * 1,29 €'), {
    currentPrice: 0.89,
    previousPrice: 1.29,
    discountAmount: null,
    type: 'offer-with-previous',
    text: '0,89 € * 1,29 €'
  });
  assert.equal(parsePrice('0,30 € sparen! 1,19 €'), 1.19);
});

test('KaufDA-Kartenzahl wird auch mit Tausenderpunkt erkannt', () => {
  assert.equal(parseOfferCount('Angebote(410)'), 410);
  assert.equal(parseOfferCount('Angebote 410'), 410);
  assert.equal(parseOfferCount('Angebote (1.234)'), 1234);
  assert.equal(parseOfferCount('Angebote 1 / 37'), 37);
});

test('Packungsgröße, Grundpreis und Gültigkeit bleiben getrennt', () => {
  assert.deepEqual(parsePackSize('versch. Sorten 500-g-Packg.'), { text: '500-g-Packg', value: 500, unit: 'g', count: null });
  assert.deepEqual(parseUnitPrice('Preis pro Einheit: 1 kg = 8,88 €'), { amount: 8.88, unit: 'kg', text: 'Preis pro Einheit: 1 kg = 8,88 €' });
  assert.deepEqual(parseUnitPrice('kg-Preis 19.80'), { amount: 19.8, unit: 'kg', text: 'kg-Preis 19.80' });
  assert.deepEqual(parseValidity('Gültig vom 16.11.2026 bis 21.11.2026'), {
    validFrom: '2026-11-16', validUntil: '2026-11-21', status: 'complete', text: 'Gültig vom 16.11.2026 bis 21.11.2026'
  });
  assert.equal(parseDate('gültig bis 07.11.2026'), '2026-11-07');
  assert.equal(parseValidity('Gültig bis 21.11.').status, 'partial');
  const card = assessOffer({
    name: 'Kaffee Prodomo',
    text: 'Kaffee Prodomo\n9,99 €\n1 kg = 19,98 €'
  }, market, mergeConfig());
  assert.equal(card.state, 'accepted');
  assert.equal(card.offer.packSize, null);
  assert.equal(card.offer.unitPrice, 19.98);
});

test('relative KaufDA-Gültigkeit wird anhand des Abrufzeitpunkts datiert', () => {
  assert.deepEqual(parseValidity('Endet morgen', '2026-11-20T07:00:00Z'), {
    validFrom: null, validUntil: '2026-11-21', status: 'relative', text: 'Endet morgen'
  });
  const offer = assessOffer({ name: 'Bio-Mandeldrink', priceText: '1,35 €', validityText: 'Endet morgen', packSizeText: '1 l' }, market, mergeConfig(), '2026-11-20T07:00:00Z');
  assert.equal(offer.offer.validUntil, '2026-11-21');
});

test('sichtbare Regelpreise und Packungsbeschreibung werden übernommen', () => {
  const offer = assessOffer({ name: 'Brauner Rohrzucker', text: 'Brauner Rohrzucker\n0,89 € * 1,29 €\nversch. Sorten; je 500-g-Packung\nkg-Preis 1.78\nEndet morgen' }, market, mergeConfig(), '2026-11-20T07:00:00Z');
  assert.equal(offer.offer.price, 0.89);
  assert.equal(offer.offer.basePrice, 1.29);
  assert.equal(offer.offer.packSize, '500-g-Packung');
  assert.equal(offer.offer.unitPrice, 1.78);
  assert.equal(offer.offer.validUntil, '2026-11-21');
});

test('Lebensmittelklassifikation unterscheidet sicher, unsicher und Nichtlebensmittel', () => {
  assert.equal(classifyFood('Salami').label, 'food');
  assert.equal(classifyFood('Premium Sojasauce', 'kg-Preis 19.80').matches.includes('reis'), false);
  assert.equal(classifyFood('Duftkerze Scandinavian Forest').label, 'nonfood');
  assert.equal(classifyFood('Herzerwärmer').label, 'uncertain');
  assert.equal(isLikelyFood('Salami', mergeConfig()), true);
  assert.equal(isLikelyFood('LED-Papierlicht', mergeConfig()), false);
  assert.equal(isLikelyFood('Klemmbausteine-Set', mergeConfig({ excludeTerms: ['Wein'] })), false);
  assert.equal(isLikelyFood('LED-Papierlicht', { foodOnly: false }), true);
});

test('Fixturekarten liefern PWA-kompatible Felder und Status', () => {
  const result = assessOffer(fixture.cards[0], market, mergeConfig(), fixture.capturedAt);
  assert.equal(result.state, 'accepted');
  assert.equal(result.offer.product, 'Salat-Mix');
  assert.equal(result.offer.pack, '125 g');
  assert.equal(result.offer.price, 0.99);
  assert.equal(result.offer.unitPrice, 8.88);
  assert.equal(result.offer.unitPriceUnit, 'kg');
  assert.equal(result.offer.validFrom, '2026-11-16');
  assert.equal(result.offer.validTo, '2026-11-21');
  assert.equal(result.offer.market, 'Lidl Zellingen');
  assert.equal(result.offer.status, 'verified');
});

test('Nichtlebensmittel und unklare Karten werden zur Prüfung vorgelegt', () => {
  const config = mergeConfig();
  const nonFood = assessOffer(fixture.cards[2], market, config, fixture.capturedAt);
  const uncertain = assessOffer(fixture.cards[3], market, config, fixture.capturedAt);
  assert.equal(nonFood.state, 'rejected');
  assert.equal(nonFood.offer, undefined);
  assert.equal(nonFood.reviewItem.classification.label, 'nonfood');
  assert.equal(uncertain.state, 'uncertain');
  assert.equal(uncertain.reviewItem.classification.label, 'uncertain');
});

test('Angebotsduplikate führen unterschiedliche Packungen und Märkte nicht zusammen', () => {
  const first = normalizeOffer(fixture.cards[0], market, mergeConfig());
  const duplicate = normalizeOffer({ ...fixture.cards[0] }, market, mergeConfig());
  const differentPack = normalizeOffer({ ...fixture.cards[0], cardId: 'lidl-salat-mix-250g', name: 'Salat-Mix', packSizeText: '250 g', text: fixture.cards[0].text.replace('125 g', '250 g') }, market, mergeConfig());
  const otherMarket = normalizeOffer(fixture.cards[0], { ...market, key: 'Edeka-Zellingen', label: 'EDEKA Zellingen' }, mergeConfig());
  assert.equal(dedupeOffers([first, duplicate, differentPack, otherMarket]).length, 3);
});

test('Dokument trennt Karten, erkannte Angebote, Lebensmittel und Prüfstatus', () => {
  const offer = normalizeOffer(fixture.cards[0], market, mergeConfig());
  const result = {
    market: 'Lidl Zellingen',
    marketKey: 'Lidl-Zellingen',
    expectedCardCount: 4,
    loadedCardCount: 4,
    recognizedOfferCount: 4,
    foodOfferCount: 1,
    uncertainCount: 1,
    rejectedCount: 1,
    unrecognizedCount: 1,
    targetReached: true,
    completenessStatus: 'complete',
    errors: [],
    offers: [offer],
    reviewItems: [{ state: 'uncertain', name: 'Herzerwärmer' }]
  };
  const document = buildOffersDocument({ config: mergeConfig({ location: { city: 'Zellingen', zip: '97225' } }), results: [result], offers: [offer], fetchedAt: fixture.capturedAt });
  assert.equal(document.schemaVersion, 'kaufda-offers/v2');
  assert.equal(document.contractVersion, 'vorratskompass-offers/v1');
  assert.equal(document.summary.recognizedOfferCount, 4);
  assert.equal(document.summary.foodOfferCount, 1);
  assert.equal(document.summary.uncertainCount, 1);
  assert.equal(document.summary.targetReachedCount, 1);
  assert.equal(document.summary.completenessStatus, 'complete');
  assert.equal(validateOutputDocument(document).valid, true);
});

test('Konfiguration wird verständlich validiert', () => {
  const invalid = validateConfig({ location: { city: 'Zellingen' }, markets: [{ key: 'Aldi' }] });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(' '), /url fehlt/);
  const valid = validateConfig({
    location: { city: 'Zellingen' },
    markets: [{ key: 'Aldi', store: 'ALDI SÜD', url: 'https://www.kaufda.de/filiale' }]
  });
  assert.equal(valid.valid, true);
});

test('Sichtbarer Standort wird gegen den konfigurierten Markt geprüft', () => {
  assert.equal(matchVisibleLocation('0,94 km ● Am Güßgraben 2, 97225 Zellingen-Retzbach', { city: 'Zellingen', zip: '97225' }), 'matched');
  assert.equal(matchVisibleLocation('0,35 km ● Hailerer Straße 17, 63571 Gelnhausen', { city: 'Thüngersheim', zip: '97291' }), 'mismatch');
  assert.equal(matchVisibleLocation(null, { city: 'Würzburg' }), 'unknown');
});
