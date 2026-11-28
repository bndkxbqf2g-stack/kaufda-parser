import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessOffer,
  assignOcrLinesToRegions,
  assertSafeOutputTarget,
  buildBrowserContextOptions,
  buildOffersDocument,
  classifyFood,
  dedupeOffers,
  extractPriceText,
  isLikelyFood,
  kaufdaPageFailure,
  marketCollectionStatus,
  mergeConfig,
  matchVisibleLocation,
  normalizeProspectProductName,
  normalizeOffer,
  PUBLISHED_OFFER_FIELDS,
  parseDate,
  parseOfferCount,
  parsePackSize,
  parsePrice,
  parsePriceDetails,
  parseUnitPrice,
  parseValidity,
  scoreKaufdaMarketResult,
  validateConfig,
  validateOutputDocument
} from '../src/index.mjs';
import { fetchTrustedImage, matchImageProductName, originalImageUrl } from '../src/image-ocr.mjs';

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'kaufda-visible-cards.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const market = {
  key: 'Lidl-Zellingen',
  label: 'Lidl Zellingen',
  store: 'Lidl',
  url: 'https://www.kaufda.de/search?query=Lidl&city=Zellingen&zip=97225'
};

test('Playwright-Lauf bleibt im einheitlichen KaufDA-Kartenlayout', () => {
  const defaults = buildBrowserContextOptions(mergeConfig());
  assert.deepEqual(defaults.viewport, { width: 870, height: 675 });
  assert.equal(defaults.isMobile, false);
  assert.equal(defaults.hasTouch, false);
  assert.equal(defaults.deviceScaleFactor, 1);

  const overridden = buildBrowserContextOptions(mergeConfig(), {
    browser: { viewport: { width: 412, height: 915 }, hasTouch: false }
  });
  assert.deepEqual(overridden.viewport, { width: 412, height: 915 });
  assert.equal(overridden.isMobile, false);
  assert.equal(overridden.hasTouch, false);
});

test('Kaufland verwendet Prospektseiten; Netto bleibt im Kachelmodus', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const kaufland = config.markets.find((candidate) => candidate.key === 'Kaufland-Wuerzburg');
  const netto = config.markets.find((candidate) => candidate.key === 'Netto-Thuengersheim');
  assert.equal(kaufland.collectionMode, 'prospect');
  assert.equal(kaufland.interpretationProfile, 'kaufland-v1');
  assert.equal(netto.collectionMode ?? 'tiles', 'tiles');
  assert.equal(validateConfig(config).valid, true);
  const invalidNettoProfile = validateConfig({ ...config, markets: config.markets.map((candidate) => candidate.key === netto.key ? { ...candidate, collectionMode: 'prospect', interpretationProfile: 'kaufland-v1' } : candidate) });
  assert.equal(invalidNettoProfile.valid, false);

  const assigned = assignOcrLinesToRegions([
    { text: 'MELITTA', box: { x: 20, y: 20, width: 30, height: 10 } },
    { text: '4,99 €', box: { x: 105, y: 40, width: 25, height: 12 } }
  ], [
    { id: 'card-a', name: 'Coffee', x: 0, y: 0, width: 80, height: 80 },
    { id: 'card-b', name: 'Melitta', x: 80, y: 0, width: 80, height: 80 }
  ]);
  assert.equal(assigned[0].text, 'MELITTA');
  assert.equal(assigned[1].text, '4,99 €');
  assert.deepEqual(parsePriceDetails('Gratis für mindestens 10 Euro Einkauf'), {
    currentPrice: null, previousPrice: null, discountAmount: null, type: 'missing', text: 'Gratis'
  });
});

test('Prospekt-OCR behält Zeilenkonfidenz und trennt Angebotsdaten vom Linklabel', () => {
  const lines = [
    { text: 'KINDER RIEGEL', confidence: 72, box: { x: 20, y: 20, width: 55, height: 12 } },
    { text: '2,22 €', confidence: 98, box: { x: 20, y: 40, width: 38, height: 12 } },
    { text: '182–210 g', confidence: 97, box: { x: 20, y: 60, width: 50, height: 12 } },
    { text: '10,58–12,20 €/kg', confidence: 99, box: { x: 20, y: 80, width: 75, height: 12 } }
  ];
  const [region] = assignOcrLinesToRegions(lines, [
    { id: 'kinder-riegel', name: 'Riegel – Link', x: 0, y: 0, width: 100, height: 110 }
  ]);

  assert.equal(region.text, 'KINDER RIEGEL\n2,22 €\n182–210 g\n10,58–12,20 €/kg');
  assert.deepEqual(region.ocrLines.map((line) => line.confidence), [72, 98, 97, 99]);

  const imageMatch = matchImageProductName({
    cardName: region.name,
    ocrLines: region.ocrLines,
    minConfidence: 20
  });
  assert.equal(imageMatch.status, 'verified');
  assert.equal(imageMatch.matchedText, 'KINDER RIEGEL');
  assert.equal(imageMatch.confidence, 72);
  const productName = normalizeProspectProductName(region.name, imageMatch);
  assert.equal(productName, 'KINDER RIEGEL');

  const kaufland = { key: 'Kaufland-Wuerzburg', label: 'Kaufland Würzburg', store: 'Kaufland', collectionMode: 'prospect' };
  const result = assessOffer({
    name: productName,
    text: region.text,
    priceText: region.text,
    packSizeText: '182–210 g',
    imageProductName: productName,
    imageProductStatus: imageMatch.status,
    imageOcrConfidence: imageMatch.confidence,
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/kinder-riegel'
  }, kaufland, mergeConfig({ imageOcr: { enabled: true, required: true, blockPlanning: false } }), '2026-11-27T08:00:00Z');

  assert.equal(result.state, 'accepted');
  assert.equal(result.offer.product, 'KINDER RIEGEL');
  assert.equal(result.offer.price, 2.22);
  assert.equal(result.offer.fieldStatus.imageProduct, 'verified');
  assert.equal(result.offer.planningStatus, 'needs-review');
});

test('KaufDA wählt den aktuellen NEU-Prospekt statt einer Online-Nebenbroschüre', () => {
  const online = 'Netto Marken-Discount\n1 Woche gültig';
  const current = 'Netto Marken-Discount\n6 Tage gültig\n• NEU';
  const upcoming = 'Netto Marken-Discount\n1 Woche gültig\n• DEMNÄCHST GÜLTIG';
  assert.ok(scoreKaufdaMarketResult(current) > scoreKaufdaMarketResult(online));
  assert.ok(scoreKaufdaMarketResult(online) > scoreKaufdaMarketResult(upcoming));
});

test('KaufDA-Fehlweiterleitungen werden als Quellenfehler erkannt', () => {
  assert.match(kaufdaPageFailure('https://www.kaufda.de/einkaufshelfer?city=Zellingen'), /Einkaufshelfer umgeleitet/);
  assert.match(kaufdaPageFailure('https://www.kaufda.de/anmelden'), /Anmeldeseite/);
  assert.equal(kaufdaPageFailure('https://www.kaufda.de/contentViewer/static/example'), null);
});

test('Bild-OCR muss den Produktnamen global bestätigen', () => {
  const verified = matchImageProductName({
    cardName: 'Hackfleisch gemischt',
    ocrText: 'Hackfleisch gemischt\nSchwein und Rind\n100g',
    confidence: 72
  });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.imageProductName, 'Hackfleisch gemischt');

  const unverified = matchImageProductName({
    cardName: 'Paprika rot',
    ocrText: 'Krombacher Bier\n24 x 0,33 l',
    confidence: 72
  });
  assert.equal(unverified.status, 'unverified');
  const extractedFromImageWithoutAltText = matchImageProductName({
    cardName: '',
    ocrText: 'MUTTI\nPassierte Tomaten\n25 % Rabatt',
    confidence: 72
  });
  assert.equal(extractedFromImageWithoutAltText.status, 'verified');
  assert.equal(extractedFromImageWithoutAltText.imageProductName, 'Passierte Tomaten');
  assert.equal(originalImageUrl('https://content-media.bonial.biz/id/main.jpg?impolicy=preview'), 'https://content-media.bonial.biz/id/main.jpg');
  assert.equal(originalImageUrl('http://content-media.bonial.biz/id/main.jpg'), null);
  assert.equal(originalImageUrl('https://content-media.bonial.biz.attacker.test/id/main.jpg'), null);
  assert.equal(originalImageUrl('https://content-media.bonial.biz:8443/id/main.jpg'), null);
  assert.equal(originalImageUrl('https://user@content-media.bonial.biz/id/main.jpg'), null);
});

test('OCR-Bildabruf begrenzt Weiterleitungen, Inhaltstyp und Größe', async () => {
  const requestedUrls = [];
  const image = await fetchTrustedImage('https://content-media.bonial.biz/id/main.jpg?impolicy=preview', {
    fetchImpl: async (url, options) => {
      requestedUrls.push({ url: url.href, redirect: options.redirect });
      if (requestedUrls.length === 1) return new Response(null, { status: 302, headers: { location: '/id/original.jpg' } });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg', 'content-length': '3' } });
    }
  });
  assert.deepEqual(Array.from(image), [1, 2, 3]);
  assert.deepEqual(requestedUrls, [
    { url: 'https://content-media.bonial.biz/id/main.jpg', redirect: 'manual' },
    { url: 'https://content-media.bonial.biz/id/original.jpg', redirect: 'manual' }
  ]);

  await assert.rejects(fetchTrustedImage('https://content-media.bonial.biz/id/main.jpg', {
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })
  }), /nicht freigegebenen Host/);
  let redirectCount = 0;
  await assert.rejects(fetchTrustedImage('https://content-media.bonial.biz/id/main.jpg', {
    fetchImpl: async () => {
      redirectCount += 1;
      return new Response(null, { status: 302, headers: { location: `/id/redirect-${redirectCount}.jpg` } });
    }
  }), /zu viele Weiterleitungen/);
  assert.equal(redirectCount, 4);
  await assert.rejects(fetchTrustedImage('https://content-media.bonial.biz/id/main.jpg', {
    maxBytes: 2,
    fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
  }), /erlaubte Größe/);
  await assert.rejects(fetchTrustedImage('https://content-media.bonial.biz/id/main.jpg', {
    fetchImpl: async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } })
  }), /kein unterstütztes Rasterbild/);
});

test('Ausgewählte KaufDA-Kategorie schließt unsichere Wortlisten nicht aus', () => {
  const result = assessOffer({
    cardId: 'category-card-1',
    name: 'Superprodukt Alpha',
    priceText: '2,49 €',
    packSizeText: '500 g',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/category-card-1'
  }, market, mergeConfig({
    categoryScopeActive: true,
    offerCategoryMode: 'include-all',
    imageOcr: { enabled: false, required: false }
  }), '2026-11-22T19:32:52Z');
  assert.equal(result.state, 'accepted');
  assert.equal(result.offer.classification.label, 'uncertain');
  assert.equal(result.offer.planningStatus, 'ready');
});

test('Kategorieangebote bleiben trotz OCR-Warnung und fehlender Menge planungsrelevant', () => {
  const result = assessOffer({
    cardId: 'category-warning-card',
    name: 'Superprodukt Alpha',
    priceText: '2,49 €',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/category-warning-card',
    imageProductStatus: 'unverified'
  }, market, mergeConfig({
    categoryScopeActive: true,
    offerCategoryMode: 'include-all',
    imageOcr: { enabled: true, required: true, blockPlanning: false }
  }), '2026-11-22T19:32:52Z');
  assert.equal(result.offer.fieldStatus.packSize, 'missing');
  assert.equal(result.offer.fieldStatus.imageProduct, 'unverified');
  assert.equal(result.offer.status, 'verified');
  assert.equal(result.offer.planningStatus, 'ready');
});

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
  assert.deepEqual(parsePriceDetails('1,99 € * 2,99 €'), {
    currentPrice: 1.99,
    previousPrice: 2.99,
    discountAmount: null,
    type: 'offer-with-previous',
    text: '1,99 € * 2,99 €'
  });
  assert.deepEqual(parsePriceDetails('12 Packungen für insgesamt 9,99 €\n0,84 €/l'), {
    currentPrice: 9.99,
    previousPrice: null,
    discountAmount: null,
    type: 'offer-price',
    text: '12 Packungen für insgesamt 9,99 €'
  });
  assert.deepEqual(parsePriceDetails('1,99 € statt 2,49 € · 0,84 €/l'), {
    currentPrice: 1.99,
    previousPrice: 2.49,
    discountAmount: null,
    type: 'offer-with-previous',
    text: '1,99 € statt 2,49 € ·'
  });
  assert.deepEqual(parseUnitPrice('entspricht etwa 0,84 €/l'), {
    amount: 0.84,
    unit: 'l',
    text: 'entspricht etwa 0,84 €/l'
  });
});

test('Getrennte Preiszeilen ignorieren den Rabattbetrag als Angebotspreis', () => {
  assert.equal(extractPriceText(['0,50 € sparen!', '1,79 €', '1 kg = 7,16 €', '2,29 €']), '0,50 € sparen! 1,79 € 2,29 €');
  assert.deepEqual(parsePriceDetails(extractPriceText(['0,50 € sparen!', '1,79 €', '2,29 €'])), {
    currentPrice: 1.79,
    previousPrice: 2.29,
    discountAmount: 0.5,
    type: 'discount-with-previous',
    text: '0,50 € sparen! 1,79 € 2,29 €'
  });
  assert.deepEqual(parsePriceDetails('0,50 € sparen!'), {
    currentPrice: null,
    previousPrice: null,
    discountAmount: 0.5,
    type: 'discount-only',
    text: '0,50 € sparen!'
  });
});

test('KaufDA-Kartenzahl wird auch mit Tausenderpunkt erkannt', () => {
  assert.equal(parseOfferCount('Angebote(410)'), 410);
  assert.equal(parseOfferCount('Angebote 410'), 410);
  assert.equal(parseOfferCount('Angebote (1.234)'), 1234);
  assert.equal(parseOfferCount('Angebote 1 / 37'), 37);
});

test('Prospektseitenzahl ist kein Kachelziel; Scroll-Ende bestimmt die Kachelabdeckung', () => {
  assert.equal(marketCollectionStatus({ loadedCardCount: 129, locationStatus: 'matched', targetReached: false, scrollExhausted: true }), 'complete');
  assert.equal(marketCollectionStatus({ loadedCardCount: 129, locationStatus: 'matched', targetReached: false, scrollExhausted: false }), 'incomplete');
  assert.equal(marketCollectionStatus({ loadedCardCount: 129, locationStatus: 'matched', targetReached: false, scrollExhausted: true, expectedCountKind: 'cards' }), 'incomplete');
  assert.equal(marketCollectionStatus({ loadedCardCount: 129, locationStatus: 'matched', targetReached: true, scrollExhausted: false, expectedCountKind: 'cards' }), 'complete');
  assert.equal(marketCollectionStatus({ loadedCardCount: 129, locationStatus: 'matched', targetReached: false, scrollExhausted: true, expectedCountKind: 'prospect-pages' }), 'complete');
  assert.equal(marketCollectionStatus({ loadedCardCount: 129, locationStatus: 'mismatch', scrollExhausted: true }), 'failed');
  assert.equal(marketCollectionStatus({ loadedCardCount: 0, locationStatus: 'matched', scrollExhausted: true }), 'failed');
});

test('Packungsgröße, Grundpreis und Gültigkeit bleiben getrennt', () => {
  assert.deepEqual(parsePackSize('versch. Sorten 500-g-Packg.'), { text: '500-g-Packg', value: 500, unit: 'g', count: null, itemValue: 500, itemUnit: 'g', ambiguous: false, variants: [] });
  assert.deepEqual(parsePackSize('10 x 20 g = 200-g-Packung, Kühlung'), { text: '10 x 20 g', value: 200, unit: 'g', count: 10, itemValue: 20, itemUnit: 'g', ambiguous: false, variants: [] });
  assert.deepEqual(parsePackSize('1-l-Packung\n12 Packungen für insgesamt 9,99 €'), { text: '12 × 1 l', value: 12, unit: 'l', count: 12, itemValue: 1, itemUnit: 'l', ambiguous: false, variants: [] });
  assert.deepEqual(parsePackSize('Wintertee; Versch. Sorten; je 40-, 45- bzw. 55-g-Packung 20 Beutel'), { text: '40-, 45- bzw. 55-g-Packung', value: null, unit: 'g', count: null, itemValue: null, itemUnit: 'g', ambiguous: true, variants: [40, 45, 55] });
  assert.deepEqual(parseUnitPrice('Preis pro Einheit: 1 kg = 8,88 €'), { amount: 8.88, unit: 'kg', text: 'Preis pro Einheit: 1 kg = 8,88 €' });
  assert.deepEqual(parseUnitPrice('kg-Preis 19.80'), { amount: 19.8, unit: 'kg', text: 'kg-Preis 19.80' });
  assert.deepEqual(parseValidity('Gültig vom 16.11.2026 bis 21.11.2026'), {
    validFrom: '2026-11-16', validUntil: '2026-11-21', status: 'complete', text: 'Gültig vom 16.11.2026 bis 21.11.2026'
  });
  assert.equal(parseDate('gültig bis 07.11.2026'), '2026-11-07');
  assert.equal(parseDate('gültig bis 31.02.2026'), null);
  assert.equal(parseDate('gültig bis 00.11.2026'), null);
  assert.equal(parseValidity('Gültig bis 21.11.').status, 'partial');
  const card = assessOffer({
    name: 'Kaffee Prodomo',
    text: 'Kaffee Prodomo\n9,99 €\n1 kg = 19,98 €'
  }, market, mergeConfig());
  assert.equal(card.state, 'accepted');
  assert.equal(card.offer.packSize, null);
  assert.equal(card.offer.unitPrice, 19.98);
});

test('Kaufland-Screenshotbelege erhalten Preis, Multipack und getrennte Evidenz', () => {
  const kaufland = {
    key: 'Kaufland-Wuerzburg',
    label: 'Kaufland Würzburg',
    store: 'Kaufland',
    url: 'https://www.kaufda.de/search?query=Kaufland'
  };
  const config = mergeConfig({
    categoryScopeActive: true,
    offerCategoryMode: 'include-all',
    imageOcr: { enabled: true, required: true, blockPlanning: false }
  });
  const examples = [
    {
      cardId: 'screenshot-grapes',
      name: 'Ital./peruan. Tafeltrauben',
      text: 'Ital./peruan. Tafeltrauben, hell, kernlos\n1,99 € statt 2,49 € (−20 %)\n500-g-Packung\nGültig 23.11.–28.11.2026',
      priceText: '1,99 € statt 2,49 € (−20 %)',
      packSizeText: '500-g-Packung',
      validityText: 'Gültig 23.11.–28.11.2026',
      sourceUrl: 'https://www.kaufda.de/contentViewer/static/grapes?productId=grapes',
      sourcePage: 'https://www.kaufda.de/contentViewer/static/brochure?page=12',
      imageProductStatus: 'unverified'
    },
    {
      cardId: 'screenshot-melitta',
      name: 'MELITTA Kaffee',
      text: 'MELITTA Kaffee, gemahlen, verschiedene Sorten\n4,99 € statt 8,49 € (−41 %)\n500-g-Packung\nGültig 23.11.–28.11.2026',
      priceText: '4,99 € statt 8,49 € (−41 %)',
      packSizeText: '500-g-Packung',
      validityText: 'Gültig 23.11.–28.11.2026',
      sourceUrl: 'https://www.kaufda.de/contentViewer/static/melitta?productId=melitta',
      sourcePage: 'https://www.kaufda.de/contentViewer/static/brochure?page=8',
      imageProductStatus: 'unverified'
    }
  ];
  const parsed = examples.map((raw) => assessOffer(raw, kaufland, config, '2026-11-26T15:33:32.128Z').offer);
  assert.deepEqual(parsed.map((offer) => [offer.product, offer.price, offer.previousPrice, offer.packSizeValue, offer.packSizeUnit]), [
    ['Ital./peruan. Tafeltrauben', 1.99, 2.49, 500, 'g'],
    ['MELITTA Kaffee', 4.99, 8.49, 500, 'g']
  ]);
  assert.equal(parsed[0].evidence.imageProduct.status, 'unverified');
  assert.equal(parsed[0].evidence.sourcePage, examples[0].sourcePage);

  const milk = assessOffer({
    cardId: 'screenshot-landliebe-multipack',
    name: 'LANDLIEBE haltbare Landmilch',
    text: 'LANDLIEBE haltbare Landmilch\n1,5 % oder 3,5 %\n1-l-Packung\n12 Packungen für insgesamt 9,99 €\nentspricht etwa 0,84 €/l\nGültig 23.11.–28.11.2026',
    priceText: '12 Packungen für insgesamt 9,99 €',
    packSizeText: '1-l-Packung',
    unitPriceText: 'entspricht etwa 0,84 €/l',
    validityText: 'Gültig 23.11.–28.11.2026',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/milk?productId=milk',
    sourcePage: 'https://www.kaufda.de/contentViewer/static/brochure?page=4',
    imageProductStatus: 'verified',
    imageProductName: 'LANDLIEBE haltbare Landmilch',
    imageOcrConfidence: 84
  }, kaufland, config, '2026-11-26T15:33:32.128Z').offer;
  assert.equal(milk.price, 9.99);
  assert.equal(milk.priceBasis, 'multipack-total');
  assert.equal(milk.packCount, 12);
  assert.equal(milk.packSizeValue, 12);
  assert.equal(milk.packSizeUnit, 'l');
  assert.equal(milk.pack, '12 × 1 l');
  assert.equal(milk.unitPrice, 0.84);
  assert.equal(milk.unitPriceUnit, 'l');
  assert.equal(milk.basePrice, null);
  assert.equal(milk.evidence.imageProduct.status, 'verified');
  assert.equal(milk.evidence.packaging.count, 12);
  assert.equal(milk.evidence.validity.status, 'complete');
  assert.equal(milk.evidence.market.key, 'Kaufland-Wuerzburg');
  assert.equal(milk.evidence.sourcePage, 'https://www.kaufda.de/contentViewer/static/brochure?page=4');
});

test('Aktivierungspflicht und unklarer Thekenpreis bleiben prüfpflichtig', () => {
  const config = mergeConfig({
    categoryScopeActive: true,
    offerCategoryMode: 'include-all',
    imageOcr: { enabled: true, required: true, blockPlanning: false }
  });
  const kaufland = { key: 'Kaufland-Wuerzburg', label: 'Kaufland Würzburg', store: 'Kaufland' };
  const coupon = assessOffer({
    name: 'Mutti passierte Tomaten',
    text: 'Mutti passierte Tomaten\n25 % Rabatt\nGutschein in der Kaufland-App aktivieren',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/mutti',
    imageProductStatus: 'unverified'
  }, kaufland, config);
  assert.equal(coupon.reviewItem.evidence.price.activationRequired, true);
  assert.equal(coupon.reviewItem.evidence.price.basis, 'conditional-coupon');

  const counter = assessOffer({
    name: 'Schinken',
    text: 'Schinken an der Theke\n0,99 €',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/schinken'
  }, kaufland, mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all' }));
  assert.equal(counter.offer.price, 0.99);
  assert.equal(counter.offer.priceBasis, 'weight-based-unit-unknown');
  assert.equal(counter.offer.planningStatus, 'needs-review');
  assert.match(counter.reasons.join(' '), /ohne erkennbare Bezugsmenge/);
  assert.deepEqual(parseUnitPrice('je 100 g 0,99 €'), { amount: 0.99, unit: '100 g', text: 'je 100 g 0,99 €' });
  assert.deepEqual(parseUnitPrice('0,99 €/100 g'), { amount: 0.99, unit: '100 g', text: '0,99 €/100 g' });

  const explicitCounter = assessOffer({
    name: 'Schinken',
    text: 'Schinken an der Theke\n0,99 €/100 g',
    priceText: '0,99 €/100 g',
    unitPriceText: '0,99 €/100 g',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/schinken'
  }, kaufland, mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all' }));
  assert.equal(explicitCounter.offer.price, 0.99);
  assert.equal(explicitCounter.offer.priceBasis, 'price-per-100g');
  assert.equal(explicitCounter.offer.planningStatus, 'needs-review');
});

test('Kaufland-XTRA, Punkte, Mindestkauf, Kauflimit und Prozentaktionen bleiben getrennt', () => {
  const kaufland = { key: 'Kaufland-Wuerzburg', label: 'Kaufland Würzburg', store: 'Kaufland', interpretationProfile: 'kaufland-v1' };
  const config = mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all', imageOcr: { enabled: false, required: false } });
  const butter = assessOffer({
    name: 'Weihenstephan Butter',
    text: 'Weihenstephan Butter oder Die Streichzarte\n250 g\nAktionspreis 1,29 € statt 2,99 €\nKaufland Card XTRA 1,15 €\nmaximal 4 Stück pro Kunde',
    priceText: 'Aktionspreis 1,29 € statt 2,99 € Kaufland Card XTRA 1,15 €',
    packSizeText: '250 g',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/butter'
  }, kaufland, config, '2026-11-27T08:00:00Z').offer;
  assert.equal(butter.price, 1.29);
  assert.equal(butter.previousPrice, 2.99);
  assert.equal(butter.loyaltyPrice, 1.15);
  assert.equal(butter.loyaltyProgram, 'Kaufland Card XTRA');
  assert.equal(butter.loyaltyActivationRequired, false);
  assert.equal(butter.activationRequired, false);
  assert.match(butter.purchaseLimitText, /maximal 4 Stück pro Kunde/i);

  const oil = assessOffer({
    name: 'Thomy Sonnenblumenöl',
    text: 'Thomy Sonnenblumenöl 750 ml\nAktionspreis 2,49 €\nKaufland Card XTRA 1,99 €\nXTRA-Coupon aktivieren und 60 XTRA-Punkte einlösen',
    priceText: 'Aktionspreis 2,49 € Kaufland Card XTRA 1,99 €',
    packSizeText: '750 ml',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/oil'
  }, kaufland, config, '2026-11-27T08:00:00Z').offer;
  assert.equal(oil.price, 2.49);
  assert.equal(oil.loyaltyPrice, 1.99);
  assert.equal(oil.loyaltyActivationRequired, true);
  assert.equal(oil.loyaltyPointsRequired, 60);
  assert.equal(oil.activationRequired, false);
  assert.equal(oil.planningStatus, 'ready');

  const free = assessOffer({
    name: 'K-Classic Kaffeeweißer',
    text: 'K-Classic Kaffeeweißer 250-g-Dose GRATIS\nFür mindestens 10 € Einkauf\n180 XTRA-Punkte aktivieren',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/freebie'
  }, kaufland, config, '2026-11-27T08:00:00Z');
  assert.equal(free.offer, undefined);
  assert.equal(free.reviewItem.evidence.price.minimumPurchaseAmount, 10);
  assert.equal(free.reviewItem.evidence.price.loyaltyPointsRequired, 180);

  const brandDiscount = assessOffer({
    name: 'Popp Feinkost',
    text: 'Popp Feinkost: 25 % Rabatt auf alle Artikel',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/popp'
  }, kaufland, config, '2026-11-27T08:00:00Z');
  assert.equal(brandDiscount.offer, undefined);
  assert.equal(brandDiscount.reviewItem.price, null);
  assert.equal(brandDiscount.reviewItem.evidence.price.discountPercent, 25);

  const netto = assessOffer({
    name: 'Butter',
    text: 'Butter 250 g\nAktionspreis 1,29 €\nKaufland Card XTRA 1,15 €',
    priceText: 'Aktionspreis 1,29 € Kaufland Card XTRA 1,15 €',
    packSizeText: '250 g',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/netto-butter'
  }, { key: 'Netto-Thuengersheim', store: 'Netto Marken-Discount' }, config, '2026-11-27T08:00:00Z').offer;
  assert.equal(netto.loyaltyPrice, null);
  assert.equal(netto.discountPercent, null);
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
  assert.equal(offer.offer.planningStatus, 'ready');
});

test('KaufDA-Detailfelder werden vollständig und semantisch getrennt übernommen', () => {
  const babybel = assessOffer({
    name: 'Mini Babybel',
    text: 'Mini Babybel\nProduktbeschreibung\n10 x 20 g = 200-g-Packung, Kühlung\nPreisdetails\n2,89 €\nAngebotspreis\nPreis pro Einheit: kg-Preis 14.45',
    priceText: '2,89 €',
    productDescription: '10 x 20 g = 200-g-Packung, Kühlung',
    priceLabel: 'Angebotspreis',
    unitPriceText: 'Preis pro Einheit: kg-Preis 14.45'
  }, market, mergeConfig({ classification: { foodTerms: ['babybel'] } }), '2026-11-20T07:00:00Z');
  assert.equal(babybel.state, 'accepted');
  assert.equal(babybel.offer.productDescription, '10 x 20 g = 200-g-Packung, Kühlung');
  assert.equal(babybel.offer.price, 2.89);
  assert.equal(babybel.offer.priceLabel, 'Angebotspreis');
  assert.equal(babybel.offer.packSizeValue, 200);
  assert.equal(babybel.offer.packSizeUnit, 'g');
  assert.equal(babybel.offer.packCount, 10);
  assert.equal(babybel.offer.unitPrice, 14.45);
  assert.equal(babybel.offer.unitPriceUnit, 'kg');
  assert.equal(babybel.offer.planningStatus, 'ready');

  const herzerwaermer = assessOffer({
    name: 'Herzerwärmer',
    text: 'Herzerwärmer\nWintertee; Versch. Sorten; je 40-, 45- bzw. 55-g-Packung 20 Beutel\n1,49 €\nkg-Preis 37.25\nEndet morgen'
  }, market, mergeConfig(), '2026-11-20T07:00:00Z');
  assert.equal(herzerwaermer.state, 'accepted');
  assert.equal(herzerwaermer.offer.productDescription, 'Wintertee; Versch. Sorten; je 40-, 45- bzw. 55-g-Packung 20 Beutel');
  assert.equal(herzerwaermer.offer.packSizeValue, null);
  assert.equal(herzerwaermer.offer.fieldStatus.packSize, 'ambiguous');
  assert.equal(herzerwaermer.offer.planningStatus, 'needs-review');
  assert.equal(herzerwaermer.offer.status, 'needs-review');
});

test('Packung und Angebotspreis reichen für die Rezeptplanung ohne Grundpreis oder Gültigkeit', () => {
  const offer = assessOffer({
    name: 'Bio-Mandeldrink',
    text: 'Bio-Mandeldrink\n1,35 €\n1 l'
  }, market, mergeConfig(), '2026-11-20T07:00:00Z');
  assert.equal(offer.state, 'accepted');
  assert.equal(offer.offer.status, 'verified');
  assert.equal(offer.offer.planningStatus, 'ready');
  assert.equal(offer.offer.unitPrice, null);
  assert.equal(offer.offer.validUntil, null);
});

test('Lebensmittelklassifikation unterscheidet sicher, unsicher und Nichtlebensmittel', () => {
  assert.equal(classifyFood('Salami').label, 'food');
  assert.equal(classifyFood('Premium Sojasauce', 'kg-Preis 19.80').matches.includes('reis'), false);
  assert.equal(classifyFood('Premium Sojasauce', 'kg-Preis 19.80').matches.includes('eis'), false);
  assert.equal(classifyFood('Duftkerze Scandinavian Forest').label, 'nonfood');
  assert.equal(classifyFood('Herzerwärmer').label, 'uncertain');
  assert.equal(isLikelyFood('Salami', mergeConfig()), true);
  assert.equal(isLikelyFood('LED-Papierlicht', mergeConfig()), false);
  assert.equal(isLikelyFood('Klemmbausteine-Set', mergeConfig({ excludeTerms: ['Wein'] })), false);
  assert.equal(isLikelyFood('LED-Papierlicht', { foodOnly: false }), true);
  assert.notEqual(classifyFood('Toaster').label, 'food');
  assert.notEqual(classifyFood('Wasserkocher').label, 'food');
  assert.notEqual(classifyFood('Kaffeevollautomat').label, 'food');
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
  const offer = { ...normalizeOffer(fixture.cards[0], market, mergeConfig()), marketLocationStatus: 'matched' };
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
    locationStatus: 'matched',
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
  assert.equal(document.summary.planningReadyOfferCount, 1);
  assert.equal(document.summary.planningCompletenessStatus, 'complete');
  assert.equal(document.summary.uncertainCount, 1);
  assert.equal(document.summary.targetReachedCount, 1);
  assert.equal(document.summary.completenessStatus, 'complete');
  assert.equal(validateOutputDocument(document).valid, true);
});

test('Inkomplette Erfassung macht Feed-Planungsabdeckung nur teilweise vollständig', () => {
  const offer = { ...normalizeOffer(fixture.cards[0], market, mergeConfig()), marketLocationStatus: 'matched' };
  const document = buildOffersDocument({
    config: mergeConfig(),
    results: [{
      market: 'Kaufland Würzburg',
      marketKey: 'Kaufland-Wuerzburg',
      locationStatus: 'matched',
      completenessStatus: 'incomplete',
      targetReached: false,
      expectedPageCount: 82,
      pageTraversalStatus: 'not-traversed',
      errors: [],
      offers: [offer],
      reviewItems: []
    }],
    offers: [offer],
    fetchedAt: fixture.capturedAt
  });
  assert.equal(document.summary.planningReadyOfferCount, 1);
  assert.equal(document.summary.planningReviewOfferCount, 0);
  assert.equal(document.summary.completenessStatus, 'incomplete');
  assert.equal(document.summary.planningCompletenessStatus, 'partial');
  assert.equal(validateOutputDocument(document).warnings.some((warning) => /kein negatives Angebot/.test(warning)), true);

  const noDetectedOffers = buildOffersDocument({
    config: mergeConfig(),
    results: [{ market: 'Kaufland Würzburg', marketKey: 'Kaufland-Wuerzburg', completenessStatus: 'incomplete', errors: [], offers: [], reviewItems: [] }],
    offers: [],
    fetchedAt: fixture.capturedAt
  });
  assert.equal(noDetectedOffers.summary.planningCompletenessStatus, 'partial');
  assert.equal(noDetectedOffers.summary.completenessStatus, 'incomplete');
  assert.equal(validateOutputDocument(noDetectedOffers).errors.some((error) => /summary\.planningCompletenessStatus/.test(error)), false);
});

test('Prospektseitenzahl blockiert keinen nachweislich ausgeschöpften Kachelfeed', () => {
  const offer = { ...normalizeOffer(fixture.cards[0], market, mergeConfig()), marketLocationStatus: 'matched' };
  const completenessStatus = marketCollectionStatus({ loadedCardCount: 129, locationStatus: 'matched', scrollExhausted: true });
  const document = buildOffersDocument({
    config: mergeConfig(),
    results: [{
      market: 'Kaufland Würzburg',
      marketKey: 'Kaufland-Wuerzburg',
      completenessStatus,
      expectedPageCount: 82,
      expectedCountKind: 'prospect-pages',
      targetReached: false,
      scrollExhausted: true,
      errors: [],
      offers: [offer],
      reviewItems: []
    }],
    offers: [offer],
    fetchedAt: fixture.capturedAt
  });
  assert.equal(document.summary.targetReachedCount, 0);
  assert.equal(document.summary.targetPageCount, 82);
  assert.equal(document.summary.completenessStatus, 'complete');
  assert.equal(document.summary.planningCompletenessStatus, 'complete');
});

test('Kategorieumfang darf klassifikatorisch unsichere Karten veröffentlichen', () => {
  const scoped = assessOffer({
    cardId: 'category-nonfood-looking-card',
    name: 'Duftkerze Scandinavian Forest',
    priceText: '4,99 €',
    packSizeText: '1 Stück',
    sourceUrl: 'https://www.kaufda.de/angebote/category-nonfood-looking-card'
  }, market, mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all' }), fixture.capturedAt);
  const offer = { ...scoped.offer, marketLocationStatus: 'matched' };
  const result = {
    market: 'Lidl Zellingen',
    marketKey: 'Lidl-Zellingen',
    locationStatus: 'matched',
    categoryScoped: true,
    completenessStatus: 'complete',
    errors: [],
    offers: [offer],
    reviewItems: []
  };
  const document = buildOffersDocument({ config: mergeConfig(), results: [result], offers: [offer], fetchedAt: fixture.capturedAt });
  assert.equal(document.summary.offerScope, 'selected-category');
  assert.equal(document.summary.categoryOfferCount, 1);
  assert.equal(validateOutputDocument(document).valid, true);
});

test('Veröffentlichte Angebote enthalten ausschließlich die vereinbarten Felder', () => {
  const offer = { ...normalizeOffer(fixture.cards[0], market, mergeConfig()), marketLocationStatus: 'matched' };
  const document = buildOffersDocument({
    config: mergeConfig(),
    results: [{ market: 'Lidl Zellingen', marketKey: 'Lidl-Zellingen', locationStatus: 'matched', completenessStatus: 'complete', errors: [], offers: [offer], reviewItems: [] }],
    offers: [offer],
    fetchedAt: fixture.capturedAt
  });
  assert.deepEqual(Object.keys(document.offers[0]).sort(), [...PUBLISHED_OFFER_FIELDS].sort());
  assert.equal(Object.hasOwn(document.offers[0], 'rawText'), false);
  assert.equal(Object.hasOwn(document.offers[0], 'imageUrl'), false);
});

test('Ausgabevertrag lehnt falsche Versionen und inkonsistente Summen ab', () => {
  const offer = { ...normalizeOffer(fixture.cards[0], market, mergeConfig()), marketLocationStatus: 'matched' };
  const result = {
    market: 'Lidl Zellingen',
    marketKey: 'Lidl-Zellingen',
    locationStatus: 'matched',
    completenessStatus: 'complete',
    errors: [],
    offers: [offer],
    reviewItems: []
  };
  const document = buildOffersDocument({ config: mergeConfig(), results: [result], offers: [offer], fetchedAt: fixture.capturedAt });
  const invalid = validateOutputDocument({
    ...document,
    schemaVersion: 'kaufda-offers/v1',
    summary: { ...document.summary, foodOfferCount: 99 }
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(' '), /schemaVersion/);
  assert.match(invalid.errors.join(' '), /foodOfferCount/);
});

test('Teilfeed mit komplett ausgefallenem Markt wird nicht veröffentlicht', () => {
  const offer = { ...normalizeOffer(fixture.cards[0], market, mergeConfig()), marketLocationStatus: 'matched' };
  const document = buildOffersDocument({
    config: mergeConfig(),
    results: [
      { market: 'Lidl', marketKey: 'Lidl', locationStatus: 'matched', completenessStatus: 'complete', errors: [], offers: [offer], reviewItems: [] },
      { market: 'Kaufland Würzburg', marketKey: 'Kaufland-Wuerzburg', locationStatus: 'unknown', completenessStatus: 'failed', errors: ['Einkaufshelfer Redirect'], offers: [], reviewItems: [] }
    ],
    offers: [offer],
    fetchedAt: fixture.capturedAt
  });
  const validation = validateOutputDocument(document);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /Kaufland Würzburg.*fehlgeschlagen/);
});

test('Einzelmarktlauf darf den konfigurierten Gesamtfeed nicht überschreiben', () => {
  const config = mergeConfig({
    output: { directory: 'generated', file: 'offers.json' },
    markets: [{ ...market, key: 'Lidl-Zellingen' }]
  });
  assert.throws(
    () => assertSafeOutputTarget(config, path.resolve('generated/offers.json'), 'Lidl-Zellingen'),
    /Einzelmarktlauf darf den konfigurierten Gesamtfeed nicht überschreiben/
  );
  assert.doesNotThrow(() => assertSafeOutputTarget(config, path.resolve('tmp/lidl.json'), 'Lidl-Zellingen'));
  assert.throws(() => assertSafeOutputTarget(config, path.resolve('tmp/lidl.json'), 'missing-market'), /Unbekannter Markt/);
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
