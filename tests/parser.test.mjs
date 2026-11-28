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
  extractKauflandGridCards,
  extractPriceText,
  isLikelyFood,
  kaufdaPageFailure,
  marketCollectionStatus,
  mergeConfig,
  matchVisibleLocation,
  mergeMarketDocuments,
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
  selectNettoMarketResult,
  scaleOcrLinesToViewport,
  validateConfig,
  validateFullOutputDocument,
  validateOutputDocument
} from '../src/index.mjs';
import { extractTesseractLines, fetchTrustedImage, matchImageProductName, originalImageUrl } from '../src/image-ocr.mjs';
import { parseCliArgs } from '../src/cli-args.mjs';

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'kaufda-visible-cards.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const kauflandGridFixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'kaufda-kaufland-offer-grid.json');
const kauflandGridFixture = JSON.parse(readFileSync(kauflandGridFixturePath, 'utf8'));
const market = {
  key: 'Lidl-Zellingen',
  label: 'Lidl Zellingen',
  store: 'Lidl',
  url: 'https://www.kaufda.de/search?query=Lidl&city=Zellingen&zip=97225'
};

test('CLI erkennt ein alleinstehendes Flag am Argumentende', () => {
  assert.deepEqual(parseCliArgs(['parse', '--market', 'Kaufland-Wuerzburg', '--debug-prospect']), {
    _: ['parse'],
    market: 'Kaufland-Wuerzburg',
    'debug-prospect': true
  });
  assert.deepEqual(parseCliArgs(['--scope=kaufland', '--headed', '--output', 'offers.json']), {
    _: [],
    scope: 'kaufland',
    headed: true,
    output: 'offers.json'
  });
  assert.deepEqual(parseCliArgs(['parse', '--debug-spread', '41']), {
    _: ['parse'],
    'debug-spread': '41'
  });
});

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

test('Kaufland und Netto verwenden sichtbare Angebotskacheln; Prospektdiagnose bleibt zulässig', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const kaufland = config.markets.find((candidate) => candidate.key === 'Kaufland-Wuerzburg');
  const netto = config.markets.find((candidate) => candidate.key === 'Netto-Thuengersheim');
  const aldi = config.markets.find((candidate) => candidate.key === 'Aldi-Sued-Zellingen');
  assert.equal(kaufland.collectionMode, 'tiles');
  assert.equal(kaufland.interpretationProfile, 'kaufland-v1');
  assert.equal(kaufland.browser, undefined);
  assert.deepEqual(buildBrowserContextOptions(config, kaufland).viewport, { width: 870, height: 675 });
  assert.equal(kaufland.requirePackForPlanning, true);
  assert.equal(kaufland.requireFoodConfidenceForPlanning, true);
  assert.equal(netto.collectionMode ?? 'tiles', 'tiles');
  assert.equal(aldi.interpretationProfile, 'aldi-sued-v1');
  assert.equal(validateConfig(config).valid, true);
  const prospectDiagnostic = validateConfig({ ...config, markets: config.markets.map((candidate) => candidate.key === kaufland.key ? { ...candidate, collectionMode: 'prospect' } : candidate) });
  assert.equal(prospectDiagnostic.valid, true);
  const invalidNettoProfile = validateConfig({ ...config, markets: config.markets.map((candidate) => candidate.key === netto.key ? { ...candidate, collectionMode: 'prospect', interpretationProfile: 'kaufland-v1' } : candidate) });
  assert.equal(invalidNettoProfile.valid, false);
  const invalidAldiProfile = validateConfig({ ...config, markets: config.markets.map((candidate) => candidate.key === 'Lidl-Zellingen' ? { ...candidate, interpretationProfile: 'aldi-sued-v1' } : candidate) });
  assert.equal(invalidAldiProfile.valid, false);

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

test('Kaufland erfasst eindeutige Direktlinks aus dem Angebotsraster statt Navigation und Nachbarcontainer', () => {
  const nutellaRecord = kauflandGridFixture.records[1];
  const duplicateNutella = {
    ...nutellaRecord,
    text: `${nutellaRecord.text}\n0,10 € sparen!\n5,00 € Nachbarprodukt 500-g-Packung`
  };
  const cards = extractKauflandGridCards([...kauflandGridFixture.records, duplicateNutella]);

  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map((card) => card.cardId), [
    '1098a84f-8ce9-4172-9b3c-65743b9c5799',
    '2f5e2010-1e0f-467e-ae97-1fd864f2f18d',
    '8f231b07-9f19-41be-8550-6f569ae0abcf',
    '9cbd6ba9-d653-4deb-9b7e-6026bb53692e'
  ]);
  assert.equal(cards[0].name, 'Bueno Original');
  assert.equal(cards[0].priceText, 'ab 0,55 € 1,35 €');
  assert.equal(cards[0].unitPriceText, '(1 l = 0.37)');
  assert.equal(cards[0].packSizeText, '');
  assert.equal(cards[1].sourceUrl, nutellaRecord.sourceUrl);
  assert.equal(cards[1].priceText, '1,50 € sparen! ab 1,99 € 3,99 €');
  assert.equal(cards[1].unitPriceText, '(1 kg = 3.98)');
  assert.equal(cards[1].packSizeText, '');
  assert.doesNotMatch(cards[1].priceText, /2,49/);
  assert.equal(cards[2].priceText, '0,80 € sparen! ab 0,99 € 1,99 €');
  assert.equal(cards[2].packSizeText, '');
  assert.doesNotMatch(cards[2].priceText, /1,19/);
  assert.equal(cards[3].name, '20% Rabatt');
  assert.equal(cards[3].text, '20% Rabatt');
  assert.equal(cards[3].priceText, '');
  assert.equal(cards[3].packSizeText, '');
  assert.ok(cards.every((card) => card.cardKey === card.cardId));
  assert.ok(!cards.some((card) => /Nächster Prospekt|Ähnliches Angebot|Nachbarprodukt/.test(card.text)));
  assert.ok(!cards.some((card) => /notProvided|96c4796d/.test(card.sourceUrl)));
});

test('Prospekt-OCR normalisiert Screenshot-Skalierung und ordnet überlappende Zeilen zu', () => {
  const screenshot = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(screenshot, 0);
  screenshot.writeUInt32BE(200, 16);
  screenshot.writeUInt32BE(100, 20);
  const [line] = scaleOcrLinesToViewport([
    { text: '2,22 €', confidence: 92, box: { x: 170, y: 20, width: 100, height: 20 } }
  ], screenshot, { width: 100, height: 50 });

  assert.deepEqual(line.box, { x: 85, y: 10, width: 50, height: 10 });
  const [region] = assignOcrLinesToRegions([line], [
    { id: 'page-region', name: 'Kinder Riegel – Link', x: 0, y: 0, width: 100, height: 50 }
  ]);
  assert.equal(region.text, '2,22 €');
});

test('Prospekt-OCR weist zusammengeführte zeilenbreite OCR-Boxen keiner Produktkachel zu', () => {
  const [region] = assignOcrLinesToRegions([
    { text: '2,22 €', confidence: 92, box: { x: 85, y: 40, width: 50, height: 12 } },
    { text: 'Werbekopf 15€ mehrere Angebote', confidence: 28, box: { x: -280, y: 20, width: 650, height: 24 } }
  ], [
    { id: 'kinder-riegel', name: 'Kinder Riegel', x: 0, y: 0, width: 100, height: 80 }
  ]);

  assert.equal(region.text, '2,22 €');
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

test('Netto-Auswahl priorisiert gültige aktuelle Kachel und lehnt Online- und Nebenprospekte ab', () => {
  const candidates = [
    { text: 'Netto Marken-Discount\nFolgen\n\n3 Tage gültig\n\n• ENDET BALD', imageLabels: [{ alt: 'netto-online.de - Exklusive Angebote', title: 'netto-online.de - Exklusive Angebote' }] },
    { text: 'Netto Marken-Discount\nFolgen\n\nIn 2 Tagen gültig\n\n• DEMNÄCHST GÜLTIG', imageLabels: [{ alt: 'Aktuelle Angebote', title: 'Aktuelle Angebote' }] },
    { text: 'Netto Marken-Discount\nFolgen\n\nNur noch heute gültig\n\n• ENDET BALD', imageLabels: [{ alt: 'Aktuelle Angebote', title: 'Aktuelle Angebote' }] }
  ];
  const selected = selectNettoMarketResult(candidates, { referenceDate: '2026-11-28T08:44:50Z' });
  assert.equal(selected.index, 2);
  assert.equal(selected.candidates[0].onlineExclusive, true);
  assert.equal(selected.candidates[0].currentOffersLabel, false);
  assert.equal(selected.candidates[2].currentOffersLabel, true);
  assert.equal(selected.candidates[0].validity, 'active');
  assert.equal(selected.candidates[1].validity, 'upcoming');
  assert.equal(selected.candidates[2].validity, 'active');
});

test('Netto-Auswahl lehnt Gleichstand und fehlende Angebotsbelege ab', () => {
  const options = { referenceDate: '2026-11-28T08:44:50Z' };
  const tie = selectNettoMarketResult([
    { text: 'Netto Marken-Discount\n1 Woche gültig', imageLabels: [{ alt: 'Aktuelle Angebote', title: 'Aktuelle Angebote' }] },
    { text: 'Netto Marken-Discount\n1 Woche gültig', imageLabels: [{ alt: 'Aktuelle Angebote', title: 'Aktuelle Angebote' }] }
  ], options);
  assert.equal(tie.index, null);
  assert.equal(tie.reason, 'ambiguous-current-offer-evidence');
  const noEvidence = selectNettoMarketResult([
    { text: 'Netto Marken-Discount\n3 Tage gültig', imageLabels: [{ alt: 'netto-online.de - Exklusive Angebote', title: 'netto-online.de - Exklusive Angebote' }] },
    { text: 'Netto Marken-Discount\nDemnächst gültig', imageLabels: [{ alt: 'Aktuelle Angebote', title: 'Aktuelle Angebote' }] }
  ], options);
  assert.equal(noEvidence.index, null);
  assert.equal(noEvidence.reason, 'no-current-offer-evidence');
});

test('Netto-Auswahl erkennt Gültig ab trotz weiterer Datumsangabe', () => {
  const result = selectNettoMarketResult([
    { text: 'Netto Marken-Discount\nGültig ab 30.11.\nZusätzliche Aktion gültig bis 06.12.2026', imageLabels: [{ alt: 'Aktuelle Angebote', title: 'Aktuelle Angebote' }] },
    { text: 'Netto Marken-Discount\nNur noch heute gültig', imageLabels: [{ alt: 'Aktuelle Angebote', title: 'Aktuelle Angebote' }] }
  ], { referenceDate: '2026-11-28T08:44:50Z' });
  assert.equal(result.index, 1);
  assert.equal(result.candidates[0].validity, 'upcoming');
  assert.equal(result.candidates[1].validity, 'active');
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

test('Tesseract-OCR liest Zeilen aus der verschachtelten Blockausgabe', () => {
  const line = { text: 'KINDER RIEGEL', confidence: 91, bbox: { x0: 10, y0: 20, x1: 90, y1: 34 } };
  assert.deepEqual(extractTesseractLines({
    blocks: [{ paragraphs: [{ lines: [line] }] }]
  }), [line]);
  assert.deepEqual(extractTesseractLines({ lines: [line] }), [line]);
  assert.deepEqual(extractTesseractLines({ text: 'KINDER RIEGEL' }), []);
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

test('ALDI SÜD gibt variable oder fehlende Packungsgrößen nicht planungsbereit frei', () => {
  const aldi = {
    key: 'Aldi-Sued-Zellingen',
    label: 'ALDI SÜD Zellingen',
    store: 'ALDI SÜD',
    interpretationProfile: 'aldi-sued-v1',
    url: 'https://www.kaufda.de/search?query=ALDI+SÜD'
  };
  const config = mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all', imageOcr: { enabled: false, required: false } });
  const looseProduceResult = assessOffer({
    name: 'Ananas, lose',
    text: 'Ananas, lose\nCosta Rica Klasse: I, kg-Preis\n1,29 €',
    priceText: '1,29 €',
    sourceUrl: aldi.url
  }, aldi, config);
  const looseProduce = looseProduceResult.offer;
  assert.equal(looseProduceResult.recognized, true);
  assert.equal(looseProduce.pack, null);
  assert.equal(looseProduce.planningStatus, 'needs-review');
  assert.equal(looseProduce.priceBasis, 'weight-based-unit-unknown');
  assert.equal(looseProduce.fieldStatus.price, 'needs-review');

  const variablePack = assessOffer({
    name: 'Pesto Genovese',
    text: 'Pesto Genovese\n190- bzw. 200-g-Glas\n1,69 €',
    priceText: '1,69 €',
    packSizeText: '190- bzw. 200-g-Glas',
    sourceUrl: aldi.url
  }, aldi, config).offer;
  assert.equal(variablePack.packSizeValue, null);
  assert.equal(variablePack.fieldStatus.packSize, 'ambiguous');
  assert.equal(variablePack.planningStatus, 'needs-review');

  const measuredPack = assessOffer({
    name: 'Bio-Dinkelmehl',
    text: 'Bio-Dinkelmehl\n500-g-Packung\n1,25 €',
    priceText: '1,25 €',
    packSizeText: '500-g-Packung',
    sourceUrl: aldi.url
  }, aldi, config).offer;
  assert.equal(measuredPack.packSizeValue, 500);
  assert.equal(measuredPack.planningStatus, 'ready');

  const repeatedVariantPack = assessOffer({
    name: 'Flammkuchen',
    productDescription: 'Versch. Sorten 300-g-Packung 320-g-Packung',
    text: 'Flammkuchen\nVersch. Sorten 300-g-Packung 320-g-Packung\n1,79 €',
    priceText: '1,79 €',
    packSizeText: 'Versch. Sorten 300-g-Packung 320-g-Packung',
    unitPriceText: '5.97/kg bzw. 5.59/kg',
    sourceUrl: aldi.url
  }, aldi, config, '2026-11-28T12:00:00Z').offer;
  assert.equal(repeatedVariantPack.pack, '300 g / 320 g');
  assert.equal(repeatedVariantPack.packSizeValue, null);
  assert.equal(repeatedVariantPack.fieldStatus.packSize, 'ambiguous');
  assert.equal(repeatedVariantPack.unitPrice, null);
  assert.equal(repeatedVariantPack.fieldStatus.unitPrice, 'ambiguous');

  const packedCoffee = assessOffer({
    name: 'Crema',
    text: 'Crema 8 x 1-kg-Packung 17,98 € sparen! 53,94 € 71,92 € Preis pro Einheit: 6.74',
    priceText: '17,98 € sparen! 53,94 € 71,92 €',
    unitPriceText: 'Preis pro Einheit: 6.74',
    packSizeText: '8 x 1-kg-Packung',
    sourceUrl: aldi.url
  }, aldi, config, '2026-11-28T12:00:00Z').offer;
  assert.equal(packedCoffee.unitPrice, 6.74);
  assert.equal(packedCoffee.unitPriceUnit, 'kg');
  assert.equal(packedCoffee.fieldStatus.unitPrice, 'inferred');
  assert.equal(packedCoffee.evidence.price.inferenceSource, 'visible-offer-price-divided-by-visible-pack-size');

  const twoVariantResult = assessOffer({
    name: 'Milch Mäuse / Weihnachtsmaus',
    productDescription: 'Milch Mäuse: 130-g-Packung | Weihnachtsmaus: 95-g-Figur',
    text: 'Milch Mäuse / Weihnachtsmaus\nMilch Mäuse: 130-g-Packung | Weihnachtsmaus: 95-g-Figur\nMilch Mäuse: 1,99 € | Weihnachtsmaus: 1,69 €',
    priceText: 'Milch Mäuse: 1,99 € | Weihnachtsmaus: 1,69 €',
    packSizeText: 'Milch Mäuse: 130-g-Packung | Weihnachtsmaus: 95-g-Figur',
    sourceUrl: aldi.url
  }, aldi, config, '2026-11-28T12:00:00Z');
  assert.equal(twoVariantResult.offer.previousPrice, null);
  assert.equal(twoVariantResult.offer.basePrice, null);
  assert.equal(twoVariantResult.offer.price, 1.99);
  assert.equal(twoVariantResult.offer.fieldStatus.price, 'needs-review');
  assert.equal(twoVariantResult.offer.planningStatus, 'needs-review');
});

test('ALDI SÜD blockiert belegte Wein- und Spirituosenangebote lokal', () => {
  const configPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json');
  const repositoryConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const aldi = repositoryConfig.markets.find((candidate) => candidate.key === 'Aldi-Sued-Zellingen');
  const categoryConfig = mergeConfig({
    categoryScopeActive: true,
    offerCategoryMode: 'include-all',
    imageOcr: { enabled: false, required: false }
  });
  const alcoholicBeverages = [
    {
      name: 'Spirituosen',
      text: 'Spirituosen\n0,7-l-Flasche\n37,5 % vol.\n14,99 €',
      packSizeText: '0,7-l-Flasche',
      priceText: '14,99 €'
    },
    {
      name: 'Champagner brut',
      text: 'Champagner brut\nFrankreich, 0,375-l-Flasche\n9,99 €',
      packSizeText: '0,375-l-Flasche',
      priceText: '9,99 €'
    },
    {
      name: '2023 Rioja Crianza DOCa',
      text: '2023 Rioja Crianza DOCa\nSpanien, trocken, 0,75-l-Flasche\n3,99 €',
      packSizeText: '0,75-l-Flasche',
      priceText: '3,99 €'
    }
  ];
  for (const item of alcoholicBeverages) {
    const result = assessOffer({
      ...item,
      sourceUrl: 'https://www.kaufda.de/contentViewer/static/aldi-alcohol'
    }, aldi, categoryConfig);
    assert.equal(result.state, 'rejected', item.name);
    assert.equal(result.reviewItem.classification.label, 'nonfood', item.name);
    assert.equal(result.offer, undefined, item.name);
  }

  const alcoholicDessert = assessOffer({
    name: 'Dessert',
    text: 'Dessert\nEnthält Alkohol\n60-g-Gläschen\n0,89 €',
    packSizeText: '60-g-Gläschen',
    priceText: '0,89 €',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/aldi-dessert'
  }, aldi, categoryConfig);
  assert.equal(alcoholicDessert.state, 'accepted');
  assert.notEqual(alcoholicDessert.offer.classification.label, 'nonfood');
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
  assert.equal(marketCollectionStatus({ loadedCardCount: 129, locationStatus: 'unknown', scrollExhausted: true }), 'incomplete');
  assert.equal(marketCollectionStatus({ loadedCardCount: 129, locationStatus: 'mismatch', scrollExhausted: true }), 'failed');
  assert.equal(marketCollectionStatus({ loadedCardCount: 0, locationStatus: 'matched', scrollExhausted: true }), 'failed');
});

test('Packungsgröße, Grundpreis und Gültigkeit bleiben getrennt', () => {
  assert.deepEqual(parsePackSize('versch. Sorten 500-g-Packg.'), { text: '500-g-Packg', value: 500, unit: 'g', count: null, itemValue: 500, itemUnit: 'g', ambiguous: false, variants: [] });
  assert.deepEqual(parsePackSize('10 x 20 g = 200-g-Packung, Kühlung'), { text: '10 x 20 g', value: 200, unit: 'g', count: 10, itemValue: 20, itemUnit: 'g', ambiguous: false, variants: [] });
  assert.deepEqual(parsePackSize('1-l-Packung\n12 Packungen für insgesamt 9,99 €'), { text: '12 × 1 l', value: 12, unit: 'l', count: 12, itemValue: 1, itemUnit: 'l', ambiguous: false, variants: [] });
  assert.deepEqual(parsePackSize('Wintertee; Versch. Sorten; je 40-, 45- bzw. 55-g-Packung 20 Beutel'), { text: '40-, 45- bzw. 55-g-Packung', value: null, unit: 'g', count: null, itemValue: null, itemUnit: 'g', ambiguous: true, variants: [40, 45, 55] });
  assert.deepEqual(parsePackSize('Versch. Sorten 300-g-Packung 320-g-Packung'), {
    text: '300 g / 320 g', value: null, unit: 'g', count: null, itemValue: null, itemUnit: 'g', ambiguous: true, variants: [300, 320]
  });
  assert.deepEqual(parsePackSize('Versch. Sorten 300-g-Packung 320-g-Packung\n300-g-Packung 320-g-Packung'), {
    text: '300 g / 320 g', value: null, unit: 'g', count: null, itemValue: null, itemUnit: 'g', ambiguous: true, variants: [300, 320]
  });
  assert.deepEqual(parsePackSize('Vom Schwein; versch. Gewichte, z. B. 1000 g'), {
    text: 'versch. Gewichte; z. B. 1000 g', value: null, unit: 'g', count: null, itemValue: null, itemUnit: 'g', ambiguous: true, variants: []
  });
  assert.deepEqual(parseUnitPrice('Preis pro Einheit: 1 kg = 8,88 €'), { amount: 8.88, unit: 'kg', text: 'Preis pro Einheit: 1 kg = 8,88 €' });
  assert.deepEqual(parseUnitPrice('Preis pro Einheit: 1 kg = 5.35/6.60'), {
    amount: null, unit: 'kg', text: 'Preis pro Einheit: 1 kg = 5.35/6.60', ambiguous: true
  });
  assert.deepEqual(parseUnitPrice('Preis pro Einheit: 5.97/kg bzw. 5.59/kg'), {
    amount: null, unit: 'kg', text: 'Preis pro Einheit: 5.97/kg bzw. 5.59/kg', ambiguous: true
  });
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

test('Kaufland-Kachelangebote mit mehrdeutiger Packung oder unsicherer Warengruppe bleiben prüfpflichtig', () => {
  const kaufland = {
    key: 'Kaufland-Wuerzburg',
    store: 'Kaufland',
    interpretationProfile: 'kaufland-v1',
    requirePackForPlanning: true,
    requireFoodConfidenceForPlanning: true
  };
  const config = mergeConfig({
    categoryScopeActive: true,
    offerCategoryMode: 'include-all',
    imageOcr: { enabled: true, required: true, blockPlanning: false }
  });

  // Die historische Kaufland-Karte führte 0,37 €/l aus einer Nachbarbeschreibung
  // an eine Bueno-Packung in Gramm. Die Einheitenkollision verwirft den Preis.
  const bueno = assessOffer({
    cardId: 'kaufland-bueno-ambiguous-pack',
    name: 'Bueno Original',
    text: 'Bueno Original\n0,55 €\nMineralwasser\n0,37 €/l\n117 - 129-g-Packg.',
    productDescription: 'Mineralwasser',
    priceText: '0,55 €',
    packSizeText: '117 - 129-g-Packg.',
    unitPriceText: '0,37 €/l',
    sourceUrl: 'https://www.kaufda.de/angebote/kaufland-bueno'
  }, kaufland, config, fixture.capturedAt);
  assert.equal(bueno.recognized, false);
  assert.equal(bueno.reviewItem.price, null);
  assert.equal(bueno.reviewItem.fieldStatus.price, 'needs-review');
  assert.match(bueno.reviewItem.reasons.join(' '), /Packungseinheit widersprechen sich/);

  const pork = assessOffer({
    cardId: 'kaufland-schweinebauch-unclassified',
    name: 'Schweinebauch',
    text: 'Schweinebauch\n5,99 €\n500 g',
    priceText: '5,99 €',
    packSizeText: '500 g',
    sourceUrl: 'https://www.kaufda.de/angebote/kaufland-schweinebauch'
  }, kaufland, config, fixture.capturedAt);
  assert.equal(pork.offer.fieldStatus.packSize, 'visible');
  assert.equal(pork.offer.classification.label, 'uncertain');
  assert.equal(pork.offer.planningStatus, 'needs-review');
});

test('Kaufland-Prospekt übernimmt keinen Preis aus einem Seitenkopf ohne Kachelpreis', () => {
  const result = assessOffer({
    cardId: 'kaufland-empty-price-tile',
    name: 'Pommersche Gutsleberwurst',
    text: 'Pommersche Gutsleberwurst - Link\nKaufland NIVEA 15€',
    priceText: '',
    validityText: 'Kaufland NIVEA 15€',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/kaufland-empty-price-tile'
  }, { ...market, key: 'Kaufland-Wuerzburg', store: 'Kaufland', collectionMode: 'prospect' }, mergeConfig(), fixture.capturedAt);

  assert.equal(result.recognized, false);
  assert.equal(result.price, null);
  assert.equal(result.reviewItem.evidence.price.currentPrice, null);
});

test('Kaufland-Seite 41–42 ordnet Seitenkopfpreis keiner Kachel zu und erkennt den Rabatt-Link nicht als Angebot', () => {
  // Read-only Rohspur aus dem veröffentlichten Kaufland-Lauf (Job 140938998316).
  // Die 22 Rechtecke sind die DOM-Linkregionen des Spreads 41–42.
  const regions = [
    ['Cabernet Sauvignon - Link', 11.4375, -131.921875, 147.5625, 172.65625],
    ['Frizzante Bianco - Link', 319.578125, -131.921875, 129.1875, 172.65625],
    ['Mouton Cadet Bordeaux AOC - Link', 159.015625, -131.921875, 141.421875, 172.65625],
    ['London Dry Gin - Link', 471, -131.921875, 149.84375, 176.421875],
    ['Craft Rum Flavour Spirit - Link', 620.859375, -131.921875, 145.265625, 176.421875],
    ['Spiced Gold - Link', 787.515625, -131.921875, 120.03125, 176.421875],
    ['Men Expert Hydra Energy Kühlendes Gel Anti-Glanz - Link', 298.203125, 132.75, 147.5625, 200.171875],
    ['Deo-Spray - Link', 298.203125, 332.9375, 147.5625, 239.84375],
    ['Sport Gel Fresh - Link', 298.203125, 572.78125, 147.5625, 230.71875],
    ['Elvital Shampoo - Link', 6.125, 451.3125, 147.5625, 352.1875],
    ['Elektrische Zahnbürste Vitality Pro - Link', 153.703125, 502.5, 144.484375, 300.984375],
    ['Wäscheparfüm - Link', 615.5, 572.03125, 150.625, 229.96875],
    ['Weichspüler XXL - Link', 467.9375, 572.03125, 147.5625, 229.96875],
    ['Pure Chicken Bones - Link', 467.9375, 356.609375, 147.5625, 215.40625],
    ['Taschentücher - Link', 615.5, 378.015625, 150.625, 194],
    ['Toilettenpapier Soft - Link', 766.140625, 356.609375, 142.984375, 215.40625],
    ['3€ SOFORT-RABATT - Link', 766.140625, 572.03125, 142.984375, 229.96875],
    ['Bio-Fruchtchips - Link', 689.65625, 135.828125, 219.421875, 190.984375],
    ['Kinder-Kostüm - Link', 150.625, 868.8125, 298.203125, 271.953125],
    ['Singende Puppe Rumi - Link', 471.78125, 877.9375, 146.046875, 203.953125],
    ['Mini-Figur - Link', 617.78125, 897.078125, 147.5625, 184.875],
    ['Fun Snaps - Link', 765.359375, 897.078125, 143.765625, 184.875]
  ].map(([name, x, y, width, height], id) => ({ id: String(id), name, x, y, width, height }));
  const assigned = assignOcrLinesToRegions([
    { text: '15€', confidence: 96, box: { x: 1096, y: 115, width: 50, height: 20 } },
    { text: '3€ SOFORT-RABATT', confidence: 83, box: { x: 775, y: 584, width: 123, height: 9 } }
  ], regions);

  assert.equal(assigned.length, 22);
  assert.equal(assigned.filter((region) => region.ocrLines.some((line) => line.text === '15€')).length, 0);
  assert.deepEqual(assigned.filter((region) => region.ocrLines.some((line) => line.text === '3€ SOFORT-RABATT')).map((region) => region.name), [
    '3€ SOFORT-RABATT - Link'
  ]);

  const promoRegion = assigned.find((region) => region.name === '3€ SOFORT-RABATT - Link');
  const promoName = normalizeProspectProductName(promoRegion.name, { status: 'unverified' });
  const result = assessOffer({
    name: promoName,
    text: promoRegion.text,
    priceText: promoRegion.text,
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/kaufland-spread-41-42'
  }, { ...market, key: 'Kaufland-Wuerzburg', store: 'Kaufland', collectionMode: 'prospect' }, mergeConfig(), fixture.capturedAt);
  assert.equal(result.recognized, false);
  assert.equal(result.offer, undefined);
  assert.equal(result.reviewItem.evidence.price.currentPrice, 3);
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

test('Kaufland trennt XTRA, Angebotspreis und regulären Preis nach sichtbaren Preisblöcken', () => {
  const config = mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const kaufland = { key: 'Kaufland-Wuerzburg', store: 'Kaufland', collectionMode: 'tiles', requirePackForPlanning: true };
  const nut = assessOffer({
    name: 'Nuss-Nugat-Creme',
    text: '1,50 € sparen! ab 1,99 € Nuss-Nugat-Creme 3,99 € cremig-nussiger Brotaufstrich je 500-g-Glas',
    priceText: '1,50 € sparen! 1,99 € 2,49 € 3,99 €',
    packSizeText: '500-g-Glas',
    priceBlocks: [
      { amountText: '1,99 €', label: 'Sonderpreis', conditions: 'Limitiert max. 3 Stück 50% Preis pro Einheit: (1 kg = 3.98) zum Kaufland Card-Xtra Preis', unitPriceText: 'Preis pro Einheit: (1 kg = 3.98)' },
      { amountText: '2,49 €', label: 'Angebotspreis', conditions: 'Preis pro Einheit: (1 kg = 4.98)', unitPriceText: 'Preis pro Einheit: (1 kg = 4.98)' },
      { amountText: '3,99 €', label: 'Regulärer Preis', conditions: '', unitPriceText: '' }
    ],
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/be566747-bcb2-4d8c-9da8-4873f6d738bd?page=59&productId=2f5e2010-1e0f-467e-ae97-1fd864f2f18d'
  }, kaufland, config, fixture.capturedAt).offer;
  assert.equal(nut.price, 2.49);
  assert.equal(nut.loyaltyPrice, 1.99);
  assert.equal(nut.previousPrice, 3.99);
  assert.equal(nut.discountAmount, 1.5);
  assert.equal(nut.unitPrice, 4.98);
  assert.equal(nut.discountPercent, null);
  assert.equal(nut.purchaseLimitText, 'XTRA: max. 3 Stück');
  assert.equal(nut.planningStatus, 'ready');

  const drink = assessOffer({
    name: 'Pfanner',
    text: '0,80 € sparen! ab 0,99 € Pfanner Saft-Getränk, versch. Sorten 1-l-Packg.',
    priceText: '0,80 € sparen! 0,99 € 1,19 € 1,99 €',
    packSizeText: '1-l-Packg.',
    priceBlocks: [
      { amountText: '0,99 €', label: 'Sonderpreis', conditions: '50% XTRA' },
      { amountText: '1,19 €', label: 'Angebotspreis', conditions: 'Je' },
      { amountText: '1,99 €', label: 'Regulärer Preis', conditions: '' }
    ],
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/be566747-bcb2-4d8c-9da8-4873f6d738bd?page=5&productId=8f231b07-9f19-41be-8550-6f569ae0abcf'
  }, kaufland, config, fixture.capturedAt).offer;
  assert.equal(drink.price, 1.19);
  assert.equal(drink.loyaltyPrice, 0.99);
  assert.equal(drink.previousPrice, 1.99);
  assert.equal(drink.discountAmount, 0.8);
  assert.equal(drink.unitPrice, null);
});

test('Ein App-Preis darf für dieselbe Packung nicht gleich hoch oder höher sein', () => {
  const config = mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const kaufland = { key: 'Kaufland-Wuerzburg', store: 'Kaufland' };
  for (const appPrice of ['1,99', '2,49']) {
    const raw = {
      name: 'Nuss-Nugat-Creme',
      text: `Angebotspreis 1,99 €\nKaufland Card XTRA ${appPrice} €\n500 g`,
      packSizeText: '500 g',
      sourceUrl: 'https://www.kaufda.de/contentViewer/static/nuss-nugat-creme'
    };
    const offer = assessOffer(raw, kaufland, config, fixture.capturedAt).offer;
    assert.equal(offer.price, 1.99);
    assert.equal(offer.loyaltyPrice, null);
    assert.equal(offer.planningStatus, 'needs-review');
  }

  const offer = assessOffer(fixture.cards[0], market, config, fixture.capturedAt).offer;
  const document = buildOffersDocument({
    config,
    results: [{ marketKey: market.key, categoryScoped: true, completenessStatus: 'complete', errors: [] }],
    offers: [{ ...offer, marketLocationStatus: 'matched', loyaltyPrice: 1.19, loyaltyProgram: 'Lidl Plus' }],
    fetchedAt: fixture.capturedAt
  });
  assert.match(validateOutputDocument(document).errors.join(' '), /App-Preis muss niedriger/);
  document.offers[0].loyaltyPrice = 0.79;
  assert.equal(validateOutputDocument(document).valid, true);
});

test('relative KaufDA-Gültigkeit wird anhand des Abrufzeitpunkts datiert', () => {
  assert.deepEqual(parseValidity('Endet morgen', '2026-11-20T07:00:00Z'), {
    validFrom: null, validUntil: '2026-11-21', status: 'relative', text: 'Endet morgen'
  });
  assert.equal(parseValidity('Endet heute', '2026-11-20T23:30:00Z').validUntil, '2026-11-21');
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

test('Lidl ergänzt bekannte Lebensmittelbegriffe nur marktspezifisch', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const lidl = config.markets.find((candidate) => candidate.key === 'Lidl-Zellingen');
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const raw = { name: 'Nutella', text: 'Nutella\n1,99 €\n450 g', priceText: '1,99 €', packSizeText: '450 g', sourceUrl: lidl.url };
  const lidlResult = assessOffer(raw, lidl, mergeConfig());
  const edekaResult = assessOffer(raw, edeka, mergeConfig());
  const gulasch = assessOffer({
    name: 'Frisches Gulasch, gemischt',
    text: 'Frisches Gulasch, gemischt\nVom Schwein und Rind. Je 800 g\n7,49 €',
    productDescription: 'Vom Schwein und Rind. Je 800 g',
    priceText: '7,49 €',
    sourceUrl: lidl.url
  }, lidl, mergeConfig());
  assert.equal(lidlResult.classification.label, 'food');
  assert.equal(edekaResult.classification.label, 'uncertain');
  assert.equal(gulasch.classification.label, 'food');
});

test('Lidl leitet fehlende Packungseinheit nur mit explizitem Einheitspreis ab', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const lidl = config.markets.find((candidate) => candidate.key === 'Lidl-Zellingen');
  const raw = {
    name: 'Naturelle',
    text: 'Naturelle\nJe 1,5 zzgl. 0.25 Pfand\n0,79 €',
    productDescription: 'Je 1,5 zzgl. 0.25 Pfand',
    priceText: '0,79 €',
    unitPriceText: 'Preis pro Einheit: 1 l = 0,53 €',
    sourceUrl: lidl.url
  };
  const configWithCategory = { ...mergeConfig(), categoryScopeActive: true };
  const lidlResult = assessOffer(raw, lidl, configWithCategory, '2026-11-20T07:00:00Z');
  const otherResult = assessOffer(raw, { ...lidl, key: 'Other-Market', inferPackUnitFromUnitPrice: false }, configWithCategory, '2026-11-20T07:00:00Z');
  assert.equal(lidlResult.offer.pack, '1,5 l');
  assert.equal(lidlResult.offer.packSizeValue, 1.5);
  assert.equal(lidlResult.offer.fieldStatus.packSize, 'inferred');
  assert.deepEqual(lidlResult.offer.evidence.packaging.inferenceSource, {
    type: 'unit-price', visibleText: 'Preis pro Einheit: 1 l = 0,53 €', unit: 'l'
  });
  assert.equal(otherResult.offer.pack, null);
  assert.equal(otherResult.offer.evidence.packaging.inferenceSource, null);
});

test('Lidl-Kategorieangebote ohne eindeutige Packung bleiben sichtbar, aber review-only', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const lidl = config.markets.find((candidate) => candidate.key === 'Lidl-Zellingen');
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = { ...mergeConfig(), categoryScopeActive: true };
  const bareHirsch = assessOffer({
    name: 'Hirschbraten', text: 'Hirschbraten\n2,99 €', priceText: '2,99 €', sourceUrl: lidl.url
  }, lidl, categoryConfig);
  const packedHirsch = assessOffer({
    name: 'Hirschbraten',
    text: 'Hirschbraten\nTiefgefroren. Je 600 g\n13,99 €',
    productDescription: 'Tiefgefroren. Je 600 g',
    priceText: '13,99 €',
    sourceUrl: lidl.url
  }, lidl, categoryConfig);
  const cucumber = assessOffer({
    name: 'Bio Gurken',
    text: 'Bio Gurken\nUrsprung: Spanien Klasse I Je Stück\n0,89 €',
    productDescription: 'Ursprung: Spanien Klasse I Je Stück',
    priceText: '0,89 €',
    sourceUrl: lidl.url
  }, lidl, categoryConfig);
  const looseZucchini = assessOffer({
    name: 'Zucchini, lose',
    text: 'Zucchini, lose\nUrsprung: Spanien/Italien, Klasse I\n1,19 €',
    productDescription: 'Ursprung: Spanien/Italien, Klasse I',
    priceText: '1,19 €',
    sourceUrl: lidl.url
  }, lidl, categoryConfig);
  const ambiguousPiece = assessOffer({
    name: 'Romana Salat',
    text: 'Romana Salat\nSpanien Klasse I Stück\n1,29 €',
    productDescription: 'Spanien Klasse I Stück',
    priceText: '1,29 €',
    sourceUrl: lidl.url
  }, lidl, categoryConfig);
  const otherMarket = assessOffer({
    name: 'Hirschbraten', text: 'Hirschbraten\n2,99 €', priceText: '2,99 €', sourceUrl: edeka.url
  }, edeka, categoryConfig);

  assert.equal(bareHirsch.state, 'accepted');
  assert.equal(bareHirsch.offer.pack, null);
  assert.equal(bareHirsch.offer.planningStatus, 'needs-review');
  assert.equal(packedHirsch.offer.pack, '600 g');
  assert.equal(packedHirsch.offer.planningStatus, 'ready');
  assert.equal(cucumber.offer.pack, '1 Stück');
  assert.equal(cucumber.offer.fieldStatus.packSize, 'inferred');
  assert.deepEqual(cucumber.offer.evidence.packaging.inferenceSource, {
    type: 'visible-unit', visibleText: 'Je Stück', unit: 'stück'
  });
  assert.equal(cucumber.offer.planningStatus, 'ready');
  assert.equal(looseZucchini.offer.pack, null);
  assert.equal(looseZucchini.offer.planningStatus, 'needs-review');
  assert.equal(ambiguousPiece.offer.pack, null);
  assert.equal(ambiguousPiece.offer.planningStatus, 'needs-review');
  assert.equal(otherMarket.offer.planningStatus, 'needs-review');
});

test('Lidl-Alternativgrößen 200/300 g und 185/195 g bleiben review-only', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const lidl = config.markets.find((candidate) => candidate.key === 'Lidl-Zellingen');
  const categoryConfig = { ...mergeConfig(), categoryScopeActive: true };
  const cases = [
    {
      raw: {
        name: 'Weichkäse',
        text: '3,33 € Weichkäse 1 kg = 11.10 Gekühlt. Standardpackung: 200 g 300 g 3,33 € Preis pro Einheit: 1 kg = 11.10 Gültig bis 28.11',
        productDescription: 'Gekühlt. Standardpackung: 200 g 300 g',
        priceText: '3,33 €',
        unitPriceText: 'Preis pro Einheit: 1 kg = 11.10',
        sourceUrl: 'https://www.kaufda.de/contentViewer/static/2959ec64-33b1-4d40-b18e-0276cf306d28?adPlacement=ad_placement__bv_premium_panel&lat=49.9016992&lng=9.812895&pageType=SEARCH_RESULT_PAGE&sourceType=PORTAL_STARTPAGE&zip=97225&page=33&locality=Zellingen&productId=9f3657de-b7e9-45f9-a8d9-ac4d1cabf9c8',
        sourceId: '9f3657de-b7e9-45f9-a8d9-ac4d1cabf9c8'
      },
      visibleDescription: 'Gekühlt. Standardpackung: 200 g 300 g',
      pack: '200/300 g'
    },
    {
      raw: {
        name: 'Thunfisch Filets in eigenem Saft',
        text: '0,30 € sparen! 0,99 € Thunfisch Filets in eigenem Saft 1,29 € 1 kg = 5.35/6.60 Versch. Sorten, Je 185/195 g. Abtropfgewicht (Sorte Thunfisch-filets im eigenen Saft): 150 g 0,30 € sparen! 0,99 € 1,29 € Preis pro Einheit: 1 kg = 5.35/6.60 Gültig bis 28.11',
        productDescription: 'Versch. Sorten, Je 185/195 g. Abtropfgewicht (Sorte Thunfisch-filets im eigenen Saft): 150 g',
        priceText: '0,30 € sparen! 0,99 € 1,29 €',
        unitPrice: 5.35,
        unitPriceUnit: 'kg',
        unitPriceText: 'Preis pro Einheit: 1 kg = 5.35/6.60',
        sourceUrl: 'https://www.kaufda.de/contentViewer/static/2959ec64-33b1-4d40-b18e-0276cf306d28?adPlacement=ad_placement__bv_premium_panel&lat=49.9016992&lng=9.812895&pageType=SEARCH_RESULT_PAGE&sourceType=PORTAL_STARTPAGE&zip=97225&page=33&locality=Zellingen&productId=89a79e9b-c583-4e50-9e29-741a9676a78c',
        sourceId: '89a79e9b-c583-4e50-9e29-741a9676a78c'
      },
      visibleDescription: 'Versch. Sorten, Je 185/195 g. Abtropfgewicht (Sorte Thunfisch-filets im eigenen Saft): 150 g',
      pack: '185/195 g'
    }
  ];

  for (const { raw, visibleDescription, pack: expectedPack } of cases) {
    const result = assessOffer(raw, lidl, categoryConfig, '2026-11-28T11:22:24.147Z');
    assert.equal(result.state, 'accepted');
    assert.equal(result.offer.pack, expectedPack, raw.name);
    assert.equal(result.offer.packSizeValue, null, raw.name);
    assert.equal(result.offer.packSizeUnit, 'g', raw.name);
    assert.equal(result.offer.fieldStatus.packSize, 'ambiguous', raw.name);
    assert.equal(result.offer.evidence.packaging.visibleText, visibleDescription, raw.name);
    if (raw.name === 'Thunfisch Filets in eigenem Saft') {
      assert.equal(result.offer.unitPrice, null);
      assert.equal(result.offer.unitPriceText, 'Preis pro Einheit: 1 kg = 5.35/6.60');
      assert.equal(result.offer.fieldStatus.unitPrice, 'ambiguous');
    }
    assert.equal(result.offer.planningStatus, 'needs-review', raw.name);
    assert.equal(result.offer.status, 'needs-review', raw.name);
  }

  const slashVariant = assessOffer({
    ...cases[0].raw,
    unitPrice: 11.1,
    unitPriceUnit: 'kg',
    unitPriceText: 'Preis pro Einheit: 1 kg = 11.10/8.70'
  }, lidl, categoryConfig, '2026-11-28T11:22:24.147Z');
  assert.equal(slashVariant.offer.unitPrice, null);
  assert.equal(slashVariant.offer.fieldStatus.unitPrice, 'ambiguous');

  const nonLidl = assessOffer(cases[1].raw, { ...lidl, key: 'Other-Market', store: 'Other' }, categoryConfig, '2026-11-28T11:22:24.147Z');
  assert.equal(nonLidl.offer.pack, '195 g');
  assert.equal(nonLidl.offer.planningStatus, 'ready');

  for (const description of ['Standardpackung: 200 g 200 g', 'Je 200/200 g']) {
    const repeatedSize = assessOffer({
      name: 'Weichkäse', text: `Weichkäse\n${description}\n3,33 €`,
      productDescription: description, priceText: '3,33 €', sourceUrl: lidl.url
    }, lidl, categoryConfig);
    assert.equal(repeatedSize.offer.pack, '200 g');
    assert.equal(repeatedSize.offer.fieldStatus.packSize, 'visible');
    assert.equal(repeatedSize.offer.planningStatus, 'ready');
  }

  const laterDescriptionSize = assessOffer({
    name: 'Weichkäse', text: 'Weichkäse\nStandardpackung: 200 g. Hinweis: 300 g gibt es in einer anderen Variante.\n3,33 €',
    productDescription: 'Standardpackung: 200 g. Hinweis: 300 g gibt es in einer anderen Variante.',
    priceText: '3,33 €', sourceUrl: lidl.url
  }, lidl, categoryConfig);
  assert.equal(laterDescriptionSize.offer.pack, '200 g');
  assert.equal(laterDescriptionSize.offer.fieldStatus.packSize, 'visible');
  assert.equal(laterDescriptionSize.offer.planningStatus, 'ready');
});

test('Lidl übernimmt vertauschte Detailpreise nur bei eindeutig passendem Kartenbeleg', () => {
  const config = mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const raw = {
    name: 'Smoothie',
    text: '0,60 € sparen! ab 2,29 € Smoothie 2,89 € 1 l = 9.16 Versch. Sorten, Gekühlt. Je 250 ml 0,60 € sparen! 2,89 € 2,29 € Preis pro Einheit: 1 l = 9.16 Gültig bis 28.11',
    priceText: '0,60 € sparen! 2,89 € 2,29 €',
    cardPriceText: '0,60 € sparen! ab 2,29 € 2,89 €',
    priceBlocks: [
      { amountText: '2,89 €', label: 'Sonderpreis', conditions: 'Mit Lidl Plus' },
      { amountText: '2,29 €', label: 'Angebotspreis', conditions: 'ohne App' },
      { amountText: '2,89 €', label: 'Regulärer Preis', conditions: '' }
    ],
    unitPriceText: 'Preis pro Einheit: 1 l = 9.16',
    packSizeText: 'Je 250 ml',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/2959ec64-33b1-4d40-b18e-0276cf306d28?page=34&productId=d3a592ba-5a31-4c9d-a6b0-cd590f512531'
  };
  const capturedAt = '2026-11-28T11:24:09.861Z';
  const confirmed = assessOffer(raw, market, config, capturedAt).offer;
  assert.equal(confirmed.price, 2.29);
  assert.equal(confirmed.previousPrice, 2.89);
  assert.equal(confirmed.discountAmount, 0.6);
  assert.equal(confirmed.priceLabel, 'Angebotspreis');
  assert.equal(confirmed.unitPrice, 9.16);
  assert.equal(confirmed.evidence.price.visibleText, raw.cardPriceText);
  assert.equal(confirmed.planningStatus, 'ready');

  const unconfirmed = assessOffer({ ...raw, cardPriceText: '0,60 € sparen! 2,29 € 3,89 €' }, market, config, capturedAt).offer;
  assert.equal(unconfirmed.previousPrice, null);
  assert.equal(unconfirmed.fieldStatus.price, 'needs-review');
  assert.equal(unconfirmed.planningStatus, 'needs-review');
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
  assert.equal(classifyFood('BBQ Spare Ribs vom Schwein').label, 'food');
  assert.equal(isLikelyFood('BBQ Spare Ribs vom Schwein', mergeConfig()), true);
  assert.equal(classifyFood('Schwein').label, 'uncertain');
  assert.equal(classifyFood('Rotwein').label, 'nonfood');
  assert.equal(classifyFood('Schweinefleisch').label, 'food');
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

test('Beispielgewicht wird nicht als feste Packung oder sicherer Stückpreis ausgegeben', () => {
  const result = assessOffer({
    name: 'BBQ Spare Ribs',
    productDescription: 'Vom Schwein; mariniert; vorgegart; versch. Gewichte, z. B. 1000 g',
    price: 8.99,
    priceText: '8,99 €',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/spare-ribs'
  }, { key: 'Aldi-Sued-Zellingen', store: 'ALDI SÜD', interpretationProfile: 'aldi-sued-v1' }, mergeConfig(), '2026-11-28T12:00:00Z');
  assert.equal(result.state, 'accepted');
  assert.equal(result.classification.label, 'food');
  assert.equal(result.offer.packSizeValue, null);
  assert.equal(result.offer.fieldStatus.packSize, 'ambiguous');
  assert.equal(result.offer.priceBasis, 'weight-based-unit-unknown');
  assert.equal(result.offer.planningStatus, 'needs-review');
});

test('EDEKA-Angebote trennen Schweineschnitzel von Küchentüchern im Kategorie-Feed', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const schnitzel = assessOffer({
    cardId: 'f9f1b84e-83cc-428a-b41b-10439fd18281',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/c61bf301-f782-4a05-be51-ef4c2c19c78d?adPlacement=ad_placement__bv_premium_panel&page=14&productId=f9f1b84e-83cc-428a-b41b-10439fd18281',
    name: 'Schnitzel',
    text: '4,29 € Schnitzel 4,89 € 1 kg = 12,26\naus der Oberschale, vom Schwein 350 g SB-Packung',
    priceText: '4,29 € statt 4,89 €',
    productDescription: 'aus der Oberschale, vom Schwein 350 g SB-Packung',
    packSizeText: '350 g SB-Packung',
    unitPriceText: '1 kg = 12,26'
  }, edeka, categoryConfig, '2026-11-28T08:44:50.213Z');

  assert.notEqual(schnitzel.classification.label, 'nonfood');
  assert.equal(schnitzel.state, 'accepted');
  assert.equal(schnitzel.offer.price, 4.29);
  assert.equal(schnitzel.offer.packSizeValue, 350);
  assert.equal(schnitzel.offer.planningStatus, 'ready');
});

test('EDEKA-Kategorie-Guard blockiert Küchentücher als Markt-Nichtlebensmittel', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const towels = assessOffer({
    cardId: '13e9a022-cb1e-4eff-9237-c639f6c01cda',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/c61bf301-f782-4a05-be51-ef4c2c19c78d?adPlacement=ad_placement__bv_premium_panel&page=24&productId=13e9a022-cb1e-4eff-9237-c639f6c01cda',
    name: 'Sooo stark klassik',
    text: '1,20 € sparen! 3,99 € Sooo stark klassik 5,19 €\nKüchentücher, Limited design edition, 3-lagig 8 Rollen, 8 x 64 Blatt XXL Packung',
    priceText: '1,20 € sparen! 3,99 € statt 5,19 €',
    productDescription: 'Küchentücher, Limited design edition, 3-lagig 8 Rollen, 8 x 64 Blatt XXL Packung',
    packSizeText: '8 x 64 Blatt XXL Packung'
  }, edeka, categoryConfig, '2026-11-28T08:44:50.213Z');

  assert.equal(towels.classification.label, 'nonfood');
  assert.equal(towels.state, 'rejected');
  assert.equal(towels.offer, undefined);
  assert.equal(towels.reviewItem.classification.label, 'nonfood');
});

test('EDEKA blockiert klare Weinangebote trotz Speiseempfehlungen im Beschreibungstext', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const rotling = assessOffer({
    name: 'Rotling',
    text: '6,99 € Rotling\nFrischer, feinherber Rotling mit fruchtigem Weingenuss. Vielseitiger Begleiter zu Fisch, Salaten, Pasta und hellem Fleisch. 0,75 l Flasche',
    priceText: '6,99 €',
    productDescription: 'Frischer, feinherber Rotling mit fruchtigem Weingenuss. Vielseitiger Begleiter zu Fisch, Salaten, Pasta und hellem Fleisch. 0,75 l Flasche',
    sourceUrl: edeka.url
  }, edeka, categoryConfig, '2026-11-28T10:12:35.263Z');

  assert.equal(rotling.classification.label, 'nonfood');
  assert.equal(rotling.state, 'rejected');
  assert.equal(rotling.offer, undefined);
});

test('EDEKA blockiert Volumenprozent plus Verkaufsgebinde auch bei irreführendem Lebensmittel-Titel', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const cases = [
    {
      name: 'Gorbatschow',
      productDescription: 'verschiedene Sorten, 10 % Vol. 0,25/0,33 Liter Dose + 0,25 Pfand'
    },
    {
      name: 'Lebkuchen',
      productDescription: 'Irland Irish Cream Likör, verschiedene Sorten, 15,7/17 % Vol. 0,5/0,7 Liter Flasche'
    }
  ];

  for (const item of cases) {
    const result = assessOffer({
      name: item.name,
      text: `9,99 € ${item.name}\n${item.productDescription}`,
      productDescription: item.productDescription,
      priceText: '9,99 €',
      sourceUrl: edeka.url
    }, edeka, categoryConfig, '2026-11-28T10:12:35.263Z');
    assert.equal(result.classification.label, 'nonfood', item.name);
    assert.equal(result.state, 'rejected', item.name);
  }
});

test('EDEKA lässt Likör als Dessertzutat ohne Alkoholstärkeangabe zu', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const dessert = assessOffer({
    name: 'Lebkuchen',
    text: '2,99 € Lebkuchen\nIrish Cream Likör als Zutat, Herzen und Sterne, 500 g Packung',
    productDescription: 'Irish Cream Likör als Zutat, Herzen und Sterne, 500 g Packung',
    priceText: '2,99 €',
    sourceUrl: edeka.url
  }, edeka, categoryConfig, '2026-11-28T10:12:35.263Z');

  assert.equal(dessert.classification.label, 'food');
  assert.equal(dessert.offer.planningStatus, 'ready');
});

test('EDEKA-Wein- und Bierbegriffe blockieren keine Lebensmittelkomposita', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });

  for (const name of ['Weingummi', 'Bierwurst']) {
    const result = assessOffer({
      name,
      text: `1,99 € ${name}\n200 g Packung`,
      productDescription: '200 g Packung',
      priceText: '1,99 €',
      sourceUrl: edeka.url
    }, edeka, categoryConfig, '2026-11-28T10:12:35.263Z');
    assert.equal(result.classification.label, 'food', name);
    assert.equal(result.offer.planningStatus, 'ready', name);
  }
});

test('EDEKA blockiert klare Wein- und Bierangebote aus dem Prospekttext', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const cases = [
    { name: 'Ortswein', productDescription: 'verschiedene Rebsorten, deutscher Qualitätswein, Franken 0,75 Liter Bocksbeutel' },
    { name: 'Frankenseele Rotwein', productDescription: 'deutscher Qualitätswein Franken, trocken 0,75 Liter Flasche' },
    { name: 'Winzer Glühwein rot', productDescription: '0,25 Liter Flasche' },
    { name: 'Premium Pils', productDescription: '20 x 0,5 Liter Kasten + 3,10 Pfand' },
    { name: 'Mönchshof', productDescription: 'verschiedene Sorten, ausgenommen Bockbier, 20 x 0,5 Liter Kasten' },
    { name: 'Pure Malt Lager Beer', productDescription: '20 x 0,4 Liter Kasten + 3,10 Pfand' }
  ];

  for (const item of cases) {
    const result = assessOffer({
      name: item.name,
      text: `9,99 € ${item.name}\n${item.productDescription}`,
      productDescription: item.productDescription,
      priceText: '9,99 €',
      sourceUrl: edeka.url
    }, edeka, categoryConfig, '2026-11-28T10:12:35.263Z');
    assert.equal(result.classification.label, 'nonfood', item.name);
    assert.equal(result.state, 'rejected', item.name);
  }
});

test('EDEKA benötigt ein eindeutiges Packmaß und erkennt klar ausgewiesene Stückware', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const literBottle = assessOffer({
    name: 'Alkoholfreier Traubensaft',
    text: '2,99 € Alkoholfreier Traubensaft\n0,75 Liter Flasche',
    productDescription: '0,75 Liter Flasche',
    priceText: '2,99 €',
    sourceUrl: edeka.url
  }, edeka, categoryConfig, '2026-11-28T10:12:35.263Z');
  const looseBread = assessOffer({
    name: 'Kartoffelbrötchen dunkel',
    text: '0,35 € Kartoffelbrötchen dunkel\nAbbildung ähnlich',
    productDescription: 'Abbildung ähnlich',
    priceText: '0,35 €',
    sourceUrl: edeka.url
  }, edeka, categoryConfig, '2026-11-28T10:12:35.263Z');
  const pineapple = assessOffer({
    name: 'Ananas',
    text: '1,99 € Ananas\nCosta Rica Kl. I, Stück',
    productDescription: 'Costa Rica Kl. I, Stück',
    priceText: '1,99 €',
    sourceUrl: edeka.url
  }, edeka, categoryConfig, '2026-11-28T10:12:35.263Z');

  assert.equal(literBottle.offer.pack, '0,75 l');
  assert.equal(literBottle.offer.packSizeValue, 0.75);
  assert.equal(literBottle.offer.planningStatus, 'ready');
  assert.equal(looseBread.offer.planningStatus, 'needs-review');
  assert.equal(pineapple.offer.pack, '1 Stück');
  assert.equal(pineapple.offer.packSizeValue, 1);
  assert.equal(pineapple.offer.evidence.packaging.status, 'inferred');
  assert.equal(pineapple.offer.planningStatus, 'ready');
});

test('EDEKA lässt gemischte alkoholfreie Markenangebote nur zur Prüfung zu', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const krombacher = assessOffer({
    name: 'Krombacher',
    text: '9,99 € Krombacher\nverschiedene Sorten, auch alkoholfrei, 24x0,33/20x0,5 Liter Kasten',
    productDescription: 'verschiedene Sorten, auch alkoholfrei, 24x0,33/20x0,5 Liter Kasten',
    priceText: '9,99 €',
    sourceUrl: edeka.url
  }, edeka, categoryConfig, '2026-11-28T10:12:35.263Z');

  assert.equal(krombacher.classification.label, 'uncertain');
  assert.equal(krombacher.offer.planningStatus, 'needs-review');
});

test('EDEKA setzt widersprüchliche Sparbeträge nicht als sicheren Vorpreis ein', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const cases = [
    {
      name: 'Franken Brunnen',
      productDescription: 'Mineralwasser, verschiedene Sorten 12 x 1 Liter Kasten zzgl. 3,30 Pfand',
      text: '3,00 € sparen! ab 4,99 € Franken Brunnen 7,99 € 1 l = 0,42 Mineralwasser, verschiedene Sorten 12 x 1 Liter Kasten zzgl. 3,30 Pfand',
      priceText: '3,00 € sparen! 4,99 € 5,99 € 7,99 €',
      expectedCurrent: 4.99,
      expectedParsedPrevious: 5.99,
      expectedSaving: 3,
      packSizeText: 'Mineralwasser, verschiedene Sorten 12 x 1 Liter Kasten zzgl. 3,30 Pfand',
      sourceUrl: 'https://www.kaufda.de/contentViewer/static/c61bf301-f782-4a05-be51-ef4c2c19c78d?adPlacement=ad_placement__bv_premium_panel&lat=49.9016992&lng=9.812895&pageType=SEARCH_RESULT_PAGE&sourceType=PORTAL_STARTPAGE&zip=97225&page=5&locality=Zellingen&productId=373640df-ddc5-4eea-82f2-e6f57ce3d71e'
    },
    {
      name: 'Salami',
      productDescription: 'verschiedene Sorten, Ausgenommen Bio Salami 80 g. 50/80 g Packung',
      text: '0,60 € sparen! ab 1,29 € Salami 2,29 € 1 kg = 16,13-25,80 verschiedene Sorten, Ausgenommen Bio Salami 80 g. 50/80 g Packung',
      priceText: '0,60 € sparen! 1,29 € 1,69 € 2,29 €',
      expectedCurrent: 1.29,
      expectedParsedPrevious: 1.69,
      expectedSaving: 0.6,
      packSizeText: 'verschiedene Sorten, Ausgenommen Bio Salami 80 g. 50/80 g Packung',
      sourceUrl: 'https://www.kaufda.de/contentViewer/static/c61bf301-f782-4a05-be51-ef4c2c19c78d?adPlacement=ad_placement__bv_premium_panel&lat=49.9016992&lng=9.812895&pageType=SEARCH_RESULT_PAGE&sourceType=PORTAL_STARTPAGE&zip=97225&page=19&locality=Zellingen&productId=4148e5fc-1cc4-4fc0-9546-926b435e5f54'
    }
  ];

  for (const item of cases) {
    const parsed = parsePriceDetails(item.priceText);
    assert.equal(parsed.currentPrice, item.expectedCurrent, item.name);
    assert.equal(parsed.previousPrice, item.expectedParsedPrevious, item.name);
    assert.equal(parsed.discountAmount, item.expectedSaving, item.name);
    assert.notEqual(
      Math.round((parsed.previousPrice - parsed.currentPrice) * 100),
      Math.round(parsed.discountAmount * 100),
      `${item.name} must have a visible arithmetic conflict`
    );

    const result = assessOffer({
      cardId: item.sourceUrl.match(/productId=([^&]+)/)?.[1],
      name: item.name,
      text: item.text,
      productDescription: item.productDescription,
      priceText: item.priceText,
      packSizeText: item.packSizeText,
      sourceUrl: item.sourceUrl
    }, edeka, categoryConfig, '2026-11-28T10:51:54.082Z');

    assert.equal(result.offer.price, item.expectedCurrent, item.name);
    assert.equal(result.offer.previousPrice, null, item.name);
    assert.equal(result.offer.basePrice, null, item.name);
    assert.equal(result.offer.discountAmount, item.expectedSaving, item.name);
    assert.equal(result.offer.priceType, 'discount-with-current', item.name);
    assert.equal(result.offer.fieldStatus.price, 'needs-review', item.name);
    assert.equal(result.offer.evidence.price.reconciliationStatus, 'needs-review', item.name);
    assert.match(result.offer.evidence.price.reviewReason, /Sparbetrag/);
    assert.equal(result.offer.planningStatus, 'needs-review', item.name);
  }

  const consistentDiscount = assessOffer({
    name: 'Salami',
    text: '0,30 € sparen! 1,19 € 1,49 € Salami 80 g Packung',
    productDescription: '80 g Packung',
    priceText: '0,30 € sparen! 1,19 € 1,49 €',
    sourceUrl: edeka.url
  }, edeka, categoryConfig, '2026-11-28T10:51:54.082Z');
  assert.equal(consistentDiscount.offer.previousPrice, 1.49);
  assert.equal(consistentDiscount.offer.basePrice, 1.49);
  assert.equal(consistentDiscount.offer.planningStatus, 'ready');
});

test('EDEKA löst mehrdeutige Kachelpreise anhand gelabelter Detailblöcke auf', () => {
  const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kaufda-parser.config.json'), 'utf8'));
  const edeka = config.markets.find((candidate) => candidate.key === 'Edeka-Zellingen');
  const categoryConfig = mergeConfig({ ...config, categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const raw = {
    name: 'Franken Brunnen Mineralwasser',
    productDescription: 'Mineralwasser, verschiedene Sorten 12 x 1 Liter Kasten zzgl. 3,30 Pfand',
    text: '3,00 € sparen! ab 4,99 € Franken Brunnen 7,99 € 1 l = 0,42 Mineralwasser, verschiedene Sorten 12 x 1 Liter Kasten zzgl. 3,30 Pfand',
    priceText: '3,00 € sparen! 4,99 € 5,99 € 7,99 €',
    cardPriceText: '3,00 € sparen! ab 4,99 € 7,99 €',
    packSizeText: '12 x 1 Liter Kasten',
    priceBlocks: [
      { amountText: '4,99 €', label: 'Angebotspreis', conditions: 'ab 2 Kästen 1 l = 0,42 €', unitPriceText: '1 l = 0,42 €' },
      { amountText: '5,99 €', label: 'Angebotspreis', conditions: '1 l = 0,50 €', unitPriceText: '1 l = 0,50 €' },
      { amountText: '7,99 €', label: 'Regulärer Preis', conditions: '.G. = 7,99' }
    ],
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/c61bf301-f782-4a05-be51-ef4c2c19c78d?adPlacement=ad_placement__bv_premium_panel&lat=49.9016992&lng=9.812895&pageType=SEARCH_RESULT_PAGE&sourceType=PORTAL_STARTPAGE&zip=97225&page=5&locality=Zellingen&productId=373640df-ddc5-4eea-82f2-e6f57ce3d71e'
  };
  const withDetails = assessOffer(raw, edeka, categoryConfig, '2026-11-28T10:51:54.082Z').offer;

  assert.equal(withDetails.price, 4.99);
  assert.equal(withDetails.previousPrice, 7.99);
  assert.equal(withDetails.basePrice, 7.99);
  assert.equal(withDetails.discountAmount, 3);
  assert.equal(withDetails.priceLabel, 'Angebotspreis');
  assert.equal(withDetails.unitPrice, 0.42);
  assert.equal(withDetails.minimumPurchaseQuantity, 2);
  assert.equal(withDetails.minimumPurchaseUnit, 'Kästen');
  assert.equal(withDetails.minimumPurchaseText, 'ab 2 Kästen');
  assert.equal(withDetails.fieldStatus.price, 'visible');
  assert.equal(withDetails.packCount, 12);
  assert.equal(withDetails.packSizeUnit, 'l');
  assert.equal(withDetails.planningStatus, 'needs-review');

  const forcedReady = {
    ...withDetails,
    marketLocationStatus: 'matched',
    planningStatus: 'ready',
    reviewStatus: 'ready',
    status: 'verified'
  };
  const invalidReadyDocument = buildOffersDocument({
    config: categoryConfig,
    results: [{ marketKey: edeka.key, categoryScoped: true, completenessStatus: 'complete', errors: [] }],
    offers: [forcedReady],
    fetchedAt: '2026-11-28T10:51:54.082Z'
  });
  assert.match(validateOutputDocument(invalidReadyDocument).errors.join(' '), /Mindestabnahme/);

  const withoutDetails = assessOffer({ ...raw, priceBlocks: undefined }, edeka, categoryConfig, '2026-11-28T10:51:54.082Z').offer;
  assert.equal(withoutDetails.price, 4.99);
  assert.equal(withoutDetails.previousPrice, null);
  assert.equal(withoutDetails.basePrice, null);
  assert.equal(withoutDetails.fieldStatus.price, 'needs-review');
  assert.equal(withoutDetails.planningStatus, 'needs-review');

  const appDiscount = assessOffer({
    name: 'Arla Kærgården',
    productDescription: 'Ungesalzen, 200 g Becher',
    text: 'ab 0,99 € Arla Kærgården 1,39 € 2,79 € 1 kg = 4,95 verschiedene Sorten 200 g Becher',
    priceText: '0,99 € 1,39 € 2,79 €',
    cardPriceText: '0,99 € 1,39 €',
    packSizeText: '200 g Becher',
    priceBlocks: [
      { amountText: '1,39 €', label: 'Angebotspreis', conditions: '', unitPriceText: '1 kg = 6,95' },
      { amountText: '0,99 €', label: 'Sonderpreis', conditions: 'APP-PREIS² mit der EDEKA App', unitPriceText: '1 kg = 4,95' },
      { amountText: '2,79 €', label: 'Regulärer Preis', conditions: '' }
    ],
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/edeka-app-price'
  }, edeka, categoryConfig, '2026-11-28T12:00:00Z').offer;
  assert.equal(appDiscount.price, 1.39);
  assert.equal(appDiscount.loyaltyPrice, 0.99);
  assert.equal(appDiscount.loyaltyProgram, 'EDEKA App');
  assert.equal(appDiscount.priceLabel, 'Angebotspreis');
  assert.equal(appDiscount.unitPrice, 6.95);
  assert.equal(appDiscount.basePrice, 2.79);

  const appLimitOffer = assessOffer({
    name: 'Clementinen',
    productDescription: '750-g-Netz',
    text: 'ab 1,49 € Clementinen 1,99 € 1 kg = 1,99 Spanien Klasse I 750-g-Netz',
    priceText: '1,49 € 1,99 €',
    cardPriceText: '1,49 € 1,99 €',
    packSizeText: '750-g-Netz',
    priceBlocks: [
      { amountText: '1,99 €', label: 'Angebotspreis', conditions: '', unitPriceText: '1 kg = 2,65' },
      { amountText: '1,49 €', label: 'Sonderpreis', conditions: 'APP-PREIS² Höchstabgabemenge zum App-Preis: 5 Netze', unitPriceText: '1 kg = 1,99' }
    ],
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/edeka-clementinen-app-price'
  }, edeka, categoryConfig, '2026-11-28T12:00:00Z').offer;
  assert.equal(appLimitOffer.price, 1.99);
  assert.equal(appLimitOffer.loyaltyPrice, 1.49);
  assert.equal(appLimitOffer.purchaseLimitText, '5 Netze zum App-Preis');
  assert.equal(appLimitOffer.unitPrice, 2.65);
});

test('Kaufland-Kacheln behalten widersprüchliche Sparpreise zur Prüfung', () => {
  const kaufland = {
    key: 'Kaufland-Wuerzburg',
    label: 'Kaufland Würzburg',
    store: 'Kaufland',
    collectionMode: 'tiles',
    interpretationProfile: 'kaufland-v1',
    requirePackForPlanning: true,
    requireFoodConfidenceForPlanning: true
  };
  const categoryConfig = mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all' });
  const result = assessOffer({
    name: 'Nuss-Nugat-Creme',
    text: '1,50 € sparen! ab 1,99 € Nuss-Nugat-Creme 3,99 € (1 kg = 3.98) cremig-nussiger Brotaufstrich je 500-g-Glas 1,50 € sparen! 1,99 € 2,49 € 3,99 € Preis pro Einheit: (1 kg = 3.98) Gültig bis 28.11',
    priceText: '1,50 € sparen! 1,99 € 2,49 € 3,99 €',
    packSizeText: '500-g-Glas',
    unitPriceText: 'Preis pro Einheit: (1 kg = 3.98)',
    sourceUrl: 'https://www.kaufda.de/contentViewer/static/be566747-bcb2-4d8c-9da8-4873f6d738bd?page=59&productId=2f5e2010-1e0f-467e-ae97-1fd864f2f18d'
  }, kaufland, categoryConfig, '2026-11-28T11:36:06Z');
  assert.equal(result.offer.price, 1.99);
  assert.equal(result.offer.previousPrice, null);
  assert.equal(result.offer.discountAmount, 1.5);
  assert.equal(result.offer.unitPrice, 3.98);
  assert.equal(result.offer.fieldStatus.price, 'needs-review');
  assert.equal(result.offer.planningStatus, 'needs-review');
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
  const offer = { ...assessOffer(fixture.cards[0], market, mergeConfig(), fixture.capturedAt).offer, marketLocationStatus: 'matched' };
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
  const offer = { ...assessOffer(fixture.cards[0], market, mergeConfig(), fixture.capturedAt).offer, marketLocationStatus: 'matched' };
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
  const offer = { ...assessOffer(fixture.cards[0], market, mergeConfig(), fixture.capturedAt).offer, marketLocationStatus: 'matched' };
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

test('Kategorieumfang lässt unsichere Karten zu, blockiert aber klare Nichtlebensmittel', () => {
  const scoped = assessOffer({
    cardId: 'category-nonfood-looking-card',
    name: 'Herzerwärmer',
    priceText: '4,99 €',
    packSizeText: '1 Stück',
    sourceUrl: 'https://www.kaufda.de/angebote/category-nonfood-looking-card'
  }, market, mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all' }), fixture.capturedAt);
  assert.equal(scoped.state, 'accepted');
  assert.equal(scoped.offer.classification.label, 'uncertain');

  const nonfood = assessOffer({
    cardId: 'category-clear-nonfood-card',
    name: 'Duftkerze Scandinavian Forest',
    priceText: '4,99 €',
    packSizeText: '1 Stück',
    sourceUrl: 'https://www.kaufda.de/angebote/category-clear-nonfood-card'
  }, market, mergeConfig({ categoryScopeActive: true, offerCategoryMode: 'include-all' }), fixture.capturedAt);
  assert.equal(nonfood.state, 'rejected');
  assert.equal(nonfood.offer, undefined);
  assert.equal(nonfood.reviewItem.classification.label, 'nonfood');

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
  assert.match(validation.errors.join(' '), /Einkaufshelfer Redirect/);
});

test('Gesamtfeed weist einen Kaufland-Lauf ohne erkannte Produktpreise zurück', () => {
  const config = mergeConfig({
    location: { city: 'Zellingen', zip: '97225', lat: 49.9016992, lng: 9.812895 },
    markets: [
      { ...market, label: 'Lidl Zellingen', location: { city: 'Zellingen', zip: '97225', lat: 49.9016992, lng: 9.812895 } },
      {
        key: 'Kaufland-Wuerzburg',
        label: 'Kaufland Würzburg',
        store: 'Kaufland',
        url: 'https://www.kaufda.de/search?query=Kaufland',
        location: { city: 'Würzburg' },
        collectionMode: 'prospect'
      }
    ]
  });
  const offer = { ...normalizeOffer(fixture.cards[0], config.markets[0], config), marketLocationStatus: 'matched' };
  const lidlDocument = buildOffersDocument({
    config,
    results: [{ market: 'Lidl Zellingen', marketKey: 'Lidl-Zellingen', store: 'Lidl', visibleLocation: 'Am Güßgraben 2, 97225 Zellingen-Retzbach', locationStatus: 'matched', completenessStatus: 'complete', errors: [], recognizedOfferCount: 1, offers: [offer], reviewItems: [] }],
    offers: [offer],
    fetchedAt: fixture.capturedAt
  });
  const kauflandDocument = buildOffersDocument({
    config,
    results: [{ market: 'Kaufland Würzburg', marketKey: 'Kaufland-Wuerzburg', store: 'Kaufland', visibleLocation: 'Nürnberger Straße 12, 97076 Würzburg-Grombühl', locationStatus: 'matched', completenessStatus: 'incomplete', errors: [], recognizedOfferCount: 0, expectedPageCount: 82, expectedCountKind: 'prospect-pages', offers: [], reviewItems: [] }],
    offers: [],
    fetchedAt: fixture.capturedAt
  });

  assert.equal(validateOutputDocument(kauflandDocument).valid, false);
  assert.equal(validateOutputDocument(kauflandDocument, { allowEmptyOffers: true }).valid, true);
  assert.throws(() => mergeMarketDocuments(config, [kauflandDocument, lidlDocument]), /Kaufland-Wuerzburg: Keine sichtbare Karte mit Produkt und Preis erkannt/);
  // Gültiger Sonderfall: Sichtbare Karten wurden erkannt und fachlich
  // verworfen, daher gibt es für diesen Markt keine Lebensmittelangebote.
  kauflandDocument.markets[0].recognizedOfferCount = 2;
  const merged = mergeMarketDocuments(config, [kauflandDocument, lidlDocument]);
  assert.equal(validateOutputDocument(merged).valid, true);
  assert.equal(merged.summary.marketCount, 2);
  assert.equal(merged.summary.foodOfferCount, 1);
  assert.equal(merged.summary.targetPageCount, 82);
  assert.deepEqual(merged.markets.map((item) => item.marketKey), ['Lidl-Zellingen', 'Kaufland-Wuerzburg']);
  assert.throws(() => mergeMarketDocuments(config, [lidlDocument]), /Erwartet wurden 2 Marktdateien/);
});

test('Gesamtprüfung verlangt Markt, Standort, Kartenziel und gültige Planungsangebote', () => {
  const configured = { ...market, location: { city: 'Zellingen', zip: '97225' } };
  const config = mergeConfig({ markets: [configured] });
  const at = new Date('2026-11-21T22:59:59Z');
  const offer = { ...assessOffer(fixture.cards[0], configured, config, at.toISOString()).offer, marketLocationStatus: 'matched' };
  const result = {
    market: configured.label, marketKey: configured.key, store: configured.store,
    visibleLocation: 'Am Güßgraben 2, 97225 Zellingen-Retzbach', locationStatus: 'matched',
    completenessStatus: 'complete', expectedCountKind: 'cards', expectedCardCount: 1,
    loadedCardCount: 1, recognizedOfferCount: 1, targetReached: true, errors: []
  };
  const document = buildOffersDocument({ config, results: [result], offers: [offer], fetchedAt: at.toISOString() });
  assert.equal(offer.planningStatus, 'ready');
  assert.equal(validateFullOutputDocument(document, config, at).valid, true);
  const nextDay = new Date('2026-11-21T23:00:00Z');
  const expiredAssessment = assessOffer(fixture.cards[0], configured, config, nextDay.toISOString());
  assert.equal(expiredAssessment.offer.planningStatus, 'needs-review');
  assert.match(validateFullOutputDocument(document, config, nextDay).errors.join(' '), /außerhalb seiner Gültigkeit/);
  const errorsFor = (markets, offers = document.offers) => validateFullOutputDocument({ ...document, markets, offers }, config, at).errors.join(' ');
  assert.match(errorsFor([]), /Konfigurierter Markt fehlt/);
  assert.match(errorsFor([result, result]), /Doppelter Markt/);
  assert.match(errorsFor([{ ...result, visibleLocation: 'Würzburg' }]), /Marktstandort ist nicht bestätigt/);
  assert.match(errorsFor([{ ...result, loadedCardCount: 0 }]), /Kartenziel/);
  assert.match(errorsFor([{ ...result, expectedCountKind: 'prospect-pages' }]), /targetReached benötigt eine sichtbare Kartenzahl/);
  assert.match(errorsFor([result], [{ ...offer, store: 'Netto' }]), /passt nicht zum zugeordneten Markt/);
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
