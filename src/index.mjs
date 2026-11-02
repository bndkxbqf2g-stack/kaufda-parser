import fs from 'node:fs/promises';
import path from 'node:path';

export const VERSION = '0.1.0';

export const DEFAULT_EXCLUDE_TERMS = [
  'apotheke', 'arznei', 'schmerzmittel', 'vitamin', 'shampoo', 'dusche',
  'kosmetik', 'zahnbürste', 'zahnpasta', 'waschmittel', 'weichspüler',
  'spülmittel', 'reiniger', 'toilettenpapier', 'küchenrolle', 'taschentücher',
  'serviette', 'tierfutter', 'katzen', 'hundefutter', 'pflanze', 'blume',
  'werkzeug', 'klemmbaustein', 'spielzeug', 'textil', 'bekleidung', 'schuh',
  'batterie', 'led-', 'papierlicht', 'deko', 'möbel', 'wein', 'sekt', 'bier',
  'spirituose', 'tabak'
];

export const DEFAULT_CONFIG = {
  version: 1,
  locale: 'de-DE',
  location: { city: '', zip: '', lat: null, lng: null },
  markets: [],
  foodOnly: true,
  excludeTerms: DEFAULT_EXCLUDE_TERMS,
  maxPrice: null,
  scroll: {
    delayMs: 1100,
    stepPx: 520,
    maxPasses: 420,
    stablePassesAtEnd: 5
  },
  output: { directory: 'generated', file: 'offers.json' }
};

const PRICE_RE = /(?:ab\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i;
const DATE_RE = /(?:gültig|gültigkeit)(?:\s+bis)?\s*[:\-]?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i;

export function mergeConfig(input = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...input,
    location: { ...DEFAULT_CONFIG.location, ...(input.location ?? {}) },
    scroll: { ...DEFAULT_CONFIG.scroll, ...(input.scroll ?? {}) },
    output: { ...DEFAULT_CONFIG.output, ...(input.output ?? {}) },
    excludeTerms: Array.isArray(input.excludeTerms) ? input.excludeTerms : DEFAULT_EXCLUDE_TERMS,
    markets: Array.isArray(input.markets) ? input.markets : []
  };
}

export async function loadConfig(filePath = 'kaufda-parser.config.json') {
  const raw = await fs.readFile(filePath, 'utf8');
  return mergeConfig(JSON.parse(raw));
}

export function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

export function slug(value = '') {
  return normalizeText(value)
    .toLocaleLowerCase('de-DE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parsePrice(value) {
  const match = normalizeText(value).match(PRICE_RE);
  if (!match) return null;
  const price = Number(match[1].replace('.', '').replace(',', '.'));
  return Number.isFinite(price) ? Math.round(price * 100) / 100 : null;
}

export function parseOfferCount(value) {
  const match = normalizeText(value).match(/(?:angebote|offer(?:s)?)\s*(?:\(\s*)?([\d.]+)\s*\)?/i);
  if (!match) return null;
  const count = Number(match[1].replace(/\./g, ''));
  return Number.isFinite(count) ? count : null;
}

export function parseDate(value) {
  const match = normalizeText(value).match(DATE_RE);
  if (!match) return null;
  const [day, month, yearPart] = match[1].split('.').map(Number);
  const year = yearPart < 100 ? 2000 + yearPart : yearPart;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function isLikelyFood(name, { foodOnly = true, excludeTerms = DEFAULT_EXCLUDE_TERMS, includeTerms = [] } = {}, context = '') {
  if (!foodOnly) return true;
  const text = `${name} ${context}`.toLocaleLowerCase('de-DE');
  if (excludeTerms.some(term => text.includes(String(term).toLocaleLowerCase('de-DE')))) return false;
  return !includeTerms.length || includeTerms.some(term => text.includes(String(term).toLocaleLowerCase('de-DE')));
}

function extractPackSize(text) {
  const match = normalizeText(text).match(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|l|ml|cl|stück|stk\.?|pack(?:ung)?|portion(?:en)?)\b/i);
  return match ? match[0] : null;
}

function chooseName(lines, explicitName = '') {
  if (explicitName && explicitName.length >= 2) return normalizeText(explicitName);
  const ignored = /€|kg-preis|l-preis|uvp|gültig|angebot|kaufda|mehr zu den|sortieren|^(aldi|edeka|lidl|penny|netto|kaufland|marktkauf)\b|^\d+[,.]?\d*\s*$/i;
  const candidates = lines
    .map(normalizeText)
    .filter(line => line.length >= 2 && line.length <= 90 && !ignored.test(line));
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function normalizeOffer(raw, market, config = {}) {
  const text = normalizeText(raw.text ?? '');
  const lines = String(raw.text ?? '').split(/\r?\n/).map(normalizeText).filter(Boolean);
  const price = raw.price ?? parsePrice(raw.priceText ?? text);
  const name = chooseName(lines, raw.name);
  if (!name || price == null) return null;
  const filterConfig = { ...config, includeTerms: market.includeTerms ?? config.includeTerms ?? [] };
  if (!isLikelyFood(name, filterConfig, text)) return null;
  if (Number.isFinite(config.maxPrice) && price > config.maxPrice) return null;

  const imageUrl = raw.imageUrl ?? raw.image ?? null;
  const sourceUrl = raw.sourceUrl ?? market.url ?? null;
  const validUntil = raw.validUntil ?? parseDate(text);
  return {
    id: `${slug(market.key ?? market.store ?? 'markt')}:${slug(name)}:${price}`,
    market: market.key ?? market.store ?? 'Unbekannter Markt',
    store: market.store ?? market.key ?? 'Unbekannter Markt',
    name,
    price,
    currency: 'EUR',
    packSize: raw.packSize ?? extractPackSize(text),
    unitPrice: raw.unitPrice ?? null,
    imageUrl,
    sourceUrl,
    validUntil,
    category: raw.category ?? null,
    fetchedAt: raw.fetchedAt ?? new Date().toISOString()
  };
}

function dedupeOffers(offers) {
  const seen = new Set();
  return offers.filter(offer => {
    const key = `${slug(offer.market)}|${slug(offer.name)}|${offer.price}|${offer.packSize ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readKaufdaSnapshot(page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText ?? '';
    const selectors = [
      '[data-testid*="offer"]', '[data-testid*="Offer"]',
      '[class*="offer-card"]', '[class*="OfferCard"]',
      'article', 'li'
    ];
    const selected = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = (element.innerText ?? '').trim();
        const image = element.querySelector('img');
        if (!image || !/€/.test(text) || text.length < 8 || text.length > 1200) continue;
        selected.push({ element, text, image });
      }
      if (selected.length >= 3) break;
    }

    if (selected.length < 3) {
      for (const element of document.querySelectorAll('div')) {
        const text = (element.innerText ?? '').trim();
        const productImage = [...element.querySelectorAll('img')].find(image => {
          const alt = (image.alt ?? '').trim();
          return alt.length >= 2 && !/(logo|einkaufsliste|hinzufügen|placeholder|fallback)/i.test(alt);
        });
        if (!productImage || !/€/.test(text) || text.length < 8 || text.length > 420) continue;
        selected.push({ element, text, image: productImage });
      }
    }

    const unique = [];
    const seen = new Set();
    for (const item of selected) {
      const candidateImageUrl = item.image.currentSrc || item.image.src || item.image.getAttribute('data-src') || null;
      const imageUrl = candidateImageUrl && !/(kaufda|logo|placeholder|fallback)/i.test(candidateImageUrl)
        ? candidateImageUrl
        : null;
      const key = `${item.text}|${imageUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lines = item.text.split(/\n+/).map(line => line.trim()).filter(Boolean);
      const explicitName = item.element.querySelector(
        '[data-testid*="name"], [data-testid*="title"], [class*="offer-name"], [class*="product-name"], h2, h3, h4'
      )?.textContent?.trim() || item.image.alt?.trim() || null;
      const priceText = lines.find(line => /€/.test(line)) || '';
      unique.push({
        text: item.text,
        name: explicitName,
        priceText,
        imageUrl,
        category: item.element.getAttribute('data-category') || null
      });
    }
    return { bodyText, cards: unique };
  });
}

export async function collectOffersFromPage(page, market, config = {}) {
  const scroll = { ...DEFAULT_CONFIG.scroll, ...(config.scroll ?? {}) };
  let expectedCount = null;
  let loadedCardCount = 0;
  let pass = 0;
  let stableAtEnd = 0;
  let previousCardCount = -1;
  const rawCards = [];

  while (pass < scroll.maxPasses) {
    const snapshot = await readKaufdaSnapshot(page);
    expectedCount ??= parseOfferCount(snapshot.bodyText);
    loadedCardCount = Math.max(loadedCardCount, snapshot.cards.length);
    rawCards.push(...snapshot.cards);

    if (expectedCount != null && loadedCardCount >= expectedCount) break;
    const progress = await page.evaluate(({ stepPx }) => {
      const scroller = document.scrollingElement || document.documentElement;
      const before = scroller.scrollTop;
      const max = Math.max(0, scroller.scrollHeight - window.innerHeight);
      scroller.scrollBy(0, stepPx);
      return { before, after: scroller.scrollTop, max };
    }, { stepPx: scroll.stepPx });
    await page.waitForTimeout(scroll.delayMs);

    if (loadedCardCount <= previousCardCount && progress.after >= progress.max - 4) stableAtEnd += 1;
    else stableAtEnd = 0;
    previousCardCount = loadedCardCount;
    if (stableAtEnd >= scroll.stablePassesAtEnd) break;
    pass += 1;
  }

  const finalSnapshot = await readKaufdaSnapshot(page);
  expectedCount ??= parseOfferCount(finalSnapshot.bodyText);
  loadedCardCount = Math.max(loadedCardCount, finalSnapshot.cards.length);
  rawCards.push(...finalSnapshot.cards);

  const normalized = dedupeOffers(rawCards.map(raw => normalizeOffer(raw, market, config)).filter(Boolean));
  return {
    offers: normalized,
    expectedCount,
    loadedCardCount,
    passes: pass + 1,
    targetReached: expectedCount != null && loadedCardCount >= expectedCount
  };
}

export async function runParser(configInput, { outputPath = null, marketKey = null, headed = false } = {}) {
  const config = mergeConfig(configInput);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: !headed });
  const results = [];
  try {
    for (const market of config.markets) {
      if (marketKey && market.key !== marketKey) continue;
      if (!market.url) {
        results.push({ market: market.key ?? market.store, error: 'Keine KaufDA-URL konfiguriert.', offers: [] });
        continue;
      }
      const page = await browser.newPage({ locale: config.locale });
      const startedAt = new Date().toISOString();
      try {
        await page.goto(market.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(market.initialWaitMs ?? 3500);
        const offersTab = page.getByRole('button', { name: /^Angebote\s*(?:\(|\d)/i }).first();
        if (await offersTab.count()) {
          await offersTab.click().catch(() => {});
          await page.waitForTimeout(market.afterOffersTabWaitMs ?? 2500);
        }
        const scan = await collectOffersFromPage(page, market, config);
        results.push({
          market: market.key ?? market.store,
          store: market.store ?? market.key,
          sourceUrl: market.url,
          fetchedAt: startedAt,
          expectedCardCount: scan.expectedCount,
          loadedCardCount: scan.loadedCardCount,
          passes: scan.passes,
          targetReached: scan.targetReached,
          recognizedCount: scan.offers.length,
          offers: scan.offers
        });
      } catch (error) {
        results.push({
          market: market.key ?? market.store,
          store: market.store ?? market.key,
          sourceUrl: market.url,
          fetchedAt: startedAt,
          error: error instanceof Error ? error.message : String(error),
          offers: []
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  const offers = results.flatMap(result => result.offers ?? []);
  const document = buildOffersDocument({ config, results, offers });
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }
  return document;
}

export function buildOffersDocument({ config, results, offers, fetchedAt = new Date().toISOString() }) {
  return {
    schemaVersion: 'kaufda-offers/v1',
    parser: { name: 'kaufda-parser', version: VERSION },
    fetchedAt,
    location: config.location,
    summary: {
      marketCount: results.length,
      recognizedOfferCount: offers.length,
      targetCardCount: results.reduce((sum, result) => sum + (result.expectedCardCount ?? 0), 0),
      loadedCardCount: results.reduce((sum, result) => sum + (result.loadedCardCount ?? 0), 0),
      targetReachedCount: results.filter(result => result.targetReached).length,
      errorCount: results.filter(result => result.error).length
    },
    markets: results.map(({ offers: _offers, ...result }) => result),
    offers
  };
}

export function validateConfig(configInput) {
  const config = mergeConfig(configInput);
  const errors = [];
  if (!config.location.city && !config.location.zip) errors.push('location.city oder location.zip fehlt');
  if (!config.markets.length) errors.push('Mindestens ein Markt fehlt');
  config.markets.forEach((market, index) => {
    if (!market.key && !market.store) errors.push(`markets[${index}].key oder store fehlt`);
    if (!market.url) errors.push(`markets[${index}].url fehlt`);
  });
  return { valid: errors.length === 0, errors, config };
}

