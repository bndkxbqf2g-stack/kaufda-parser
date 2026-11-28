Warning: truncated output (original token count: 25985)
Total output lines: 2029

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const VERSION = '0.2.0';
export const SCHEMA_VERSION = 'kaufda-offers/v2';
export const PWA_CONTRACT_VERSION = 'vorratskompass-offers/v1';

// Diese Liste ist die Veröffentlichungsgrenze. Rohtext, Bilder, Kategorien und
// andere DOM-Daten dürfen intern zur Erkennung dienen, werden aber nicht als
// Angebotsfelder veröffentlicht.
export const PUBLISHED_OFFER_FIELDS = Object.freeze([
  'id', 'product', 'productDescription',
  'market', 'marketKey', 'store', 'marketLocationStatus',
  'price', 'priceLabel', 'currency', 'discountAmount', 'discountPercent', 'basePrice', 'previousPrice', 'priceType',
  'priceBasis', 'activationRequired', 'pack', 'packSize', 'packSizeValue', 'packSizeUnit', 'packCount',
  'loyaltyPrice', 'loyaltyProgram', 'loyaltyActivationRequired', 'loyaltyPointsRequired', 'minimumPurchaseAmount', 'purchaseLimitText',
  'unitPrice', 'unitPriceUnit', 'unitPriceText',
  'validFrom', 'validUntil', 'validTo',
  'sourceUrl', 'sourcePage', 'source', 'sourceId', 'capturedAt', 'fetchedAt', 'evidence',
  'classification', 'fieldStatus',
  'status', 'reviewStatus', 'planningStatus'
]);

export const DEFAULT_EXCLUDE_TERMS = [
  'apotheke', 'arznei', 'schmerzmittel', 'vitamin', 'shampoo', 'dusche',
  'kosmetik', 'zahnbürste', 'zahnpasta', 'waschmittel', 'weichspüler',
  'spülmittel', 'reiniger', 'toilettenpapier', 'küchenrolle', 'taschentücher',
  'serviette', 'tierfutter', 'katzen', 'hundefutter', 'pflanze', 'blume',
  'werkzeug', 'klemmbaustein', 'spielzeug', 'textil', 'bekleidung', 'schuh',
  'batterie', 'led-', 'papierlicht', 'deko', 'möbel', 'wein', 'sekt', 'bier',
  'spirituose', 'tabak', 'duftkerze', 'kerze', 'geschirr', 'porzellan',
  'tischleuchte', 'pullover', 'streichhölzer', 'akku', 'kerzen', 'kasserolle',
  'gusseisen', 'brotbacktopf', 'topf', 'besteck', 'badematte', 'pyjama',
  'pantoffeln', 'decke', 'kissen', 'keksdose', 'bausatz', 'soundbox',
  'toaster', 'wasserkocher', 'kaffeemaschine', 'kaffeevollautomat',
  'kaffeepadmaschine', 'kapselmaschine', 'espressoautomat', 'standmixer'
];

export const DEFAULT_FOOD_TERMS = [
  'salami', 'wurst', 'schinken', 'fleisch', 'hackfleisch', 'hähnchen', 'pute',
  'fisch', 'lachs', 'thunfisch', 'tofu', 'käse', 'milch', 'joghurt', 'quark',
  'butter', 'margarine', 'ei', 'eier', 'brot', 'brötchen', 'toast', 'mehl',
  'zucker', 'reis', 'nudel', 'pasta', 'müsli', 'hafer', 'haferdrink', 'cornflakes',
  'kartoffel', 'tomate', 'gurke', 'paprika', 'möhre', 'karotte', 'brokkoli',
  'salat', 'gemüse', 'obst', 'apfel', 'banane', 'orange', 'beere', 'pizza',
  'suppe', 'soße', 'sauce', 'konfitüre', 'marmelade', 'honig', 'schokolade',
  'schoko', 'keks', 'kuchen', 'eis', 'chips', 'snack', 'kaffee', 'tee', 'saft', 'wasser',
  'limonade', 'cola', 'energy', 'nuss', 'mandel', 'gewürz', 'hefe', 'zitronat',
  'bio-kokos', 'drink', 'lebensmittel', 'riegel', 'knoppers', 'chunks'
];

export const DEFAULT_NON_FOOD_TERMS = [
  'duftkerze', 'kerze', 'geschirr', 'porzellan', 'serviergeschirr',
  'kindergeschirr', 'tischleuchte', 'akku-push', 'pullover', 'streichhölzer',
  'pflanz', 'spielzeug', 'werkzeug', 'kosmetik', 'waschmittel', 'tierfutter'
];

export const DEFAULT_UNCERTAIN_TERMS = [
  'herzerwärmer', 'geschenk', 'sortiment', 'verschiedene sorten', 'versch. sorten'
];

const DEFAULT_CLASSIFICATION = {
  foodTerms: DEFAULT_FOOD_TERMS,
  nonFoodTerms: DEFAULT_NON_FOOD_TERMS,
  uncertainTerms: DEFAULT_UNCERTAIN_TERMS
};

export const DEFAULT_CONFIG = {
  version: 2,
  locale: 'de-DE',
  location: { city: '', zip: '', lat: null, lng: null },
  markets: [],
  // KaufDA liefert auf der reproduzierbaren Browserbreite ein einheitliches
  // Kartenraster mit gut lesbaren Angebotskacheln. Mobile Breiten bleiben pro
  // Markt überschreibbar, sind aber nicht die Produktionsvoreinstellung.
  browser: {
    viewport: { width: 870, height: 675 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1
  },
  offerCategory: 'Lebensmittel und Getränke',
  // Nach erfolgreicher Auswahl des KaufDA-Kategoriechips ist die Kategorie
  // der Umfangsfilter. Der Wortlisten-Klassifikator bleibt Qualitätsmetadatum
  // und darf die sichtbaren Karten nicht nochmals aus dem Feed entfernen.
  offerCategoryMode: 'include-all',
  imageOcr: {
    enabled: false,
    required: false,
    blockPlanning: true,
    language: 'deu+eng',
    concurrency: 2,
    minConfidence: 20
  },
  foodOnly: true,
  excludeTerms: DEFAULT_EXCLUDE_TERMS,
  classification: DEFAULT_CLASSIFICATION,
  maxPrice: null,
  maxReviewItems: 25,
  scroll: {
    delayMs: 1100,
    stepPx: 520,
    maxPasses: 420,
    stablePassesAtEnd: 5
  },
  detail: {
    enabled: true,
    concurrency: 4,
    waitMs: 250,
    fieldTimeoutMs: 4000,
    navigationTimeoutMs: 15000
  },
  output: { directory: 'generated', file: 'offers.json' }
};

const PRICE_RE = /(?:ab\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€/i;
const DATE_TOKEN = '(\\d{1,2}\\.\\d{1,2}(?:\\.\\d{2,4})?\\.?)';
const DATE_RE = new RegExp(`(?:gültig|gültigkeit)(?:\\s+bis)?\\s*[:\\-]?\\s*${DATE_TOKEN}`, 'i');
const RANGE_RE = new RegExp(`${DATE_TOKEN}\\s*(?:-|–|bis)\\s*${DATE_TOKEN}`, 'i');
const PACK_RE = /\b(?:\d+\s*[x×]\s*)?\d+(?:[,.]\d+)?\s*[- ]?(?:kg|g|l|ml|cl|stück|stk\.?|pack(?:ung(?:en)?)?|portion(?:en)?)(?:\s*[- ]?(?:packg?\.?|packung))?\b/i;
const PACK_RANGE_RE = /((?:\d+(?:[,.]\d+)?\s*[-–]\s*,?\s*(?:bzw\.?\s*)?)+\d+(?:[,.]\d+)?\s*[- ]?(?:kg|g|l|ml|cl|stück|stk\.?|packung|packg\.?|portion(?:en)?)(?:\s*[- ]?(?:packung|packg\.?))?)/i;
const UNIT_PRICE_RE = /(?:1\s*)?(kg|g|l|ml|cl|stück|stk\.?)\s*=\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€?|((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€\s*\/\s*(100\s*(?:g|ml)|kg|g|l|ml|cl|stück|stk\.?|liter)/i;
const UNIT_PRICE_LINE_RE = /(?:pro\s+einheit|(?:kg|g|l|ml|cl|stück|stk\.?)\s*(?:=|[- ]?preis)|\/\s*(?:100\s*(?:g|ml)|kg|g|l|ml|cl|stück|stk\.?|liter)|€\s*\/\s*(?:100\s*(?:g|ml)|kg|g|l|ml|cl|stück|stk\.?|liter)|je\s+(?:100\s*(?:g|ml)|kg|g|l|ml|cl|liter|stück))/i;

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function parseGermanNumber(value) {
  const text = String(value ?? '').replace(/\s/g, '');
  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/\.(?=\d{3}(?:$|\D))/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function validUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch (_) {
    return false;
  }
}

function isKaufdaSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['kaufda.de', 'www.kaufda.de'].includes(url.hostname.toLocaleLowerCase('de-DE'));
  } catch (_) {
    return false;
  }
}

function isValidTimestamp(value) {
  return typeof value === 'string' && value.includes('T') && Number.isFinite(new Date(value).getTime());
}

function isValidDateOnly(value) {
  if (value == null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

function termsFound(text, terms = []) {
  const lowered = normalizeText(text).toLocaleLowerCase('de-DE');
  const tokens = lowered.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return uniqueStrings(terms).filter((term) => {
    const candidate = term.toLocaleLowerCase('de-DE');
    if (candidate.includes(' ') || candidate.includes('-')) return lowered.includes(candidate);
    return tokens.some((token) => token === candidate
      || ((candidate.length > 3 || candidate === 'tee') && token.length - candidate.length >= 3
        && (token.startsWith(candidate) || (token.endsWith(candidate) && !(candidate === 'wein' && token === 'schwein')))));
  });
}

function exactTermsFound(text, terms = []) {
  const normalized = normalizeText(text).toLocaleLowerCase('de-DE');
  const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return uniqueStrings(terms).filter((term) => {
    const candidate = term.toLocaleLowerCase('de-DE');
    if (/[^\p{L}\p{N}]/u.test(candidate)) return normalized.includes(candidate);
    return tokens.includes(candidate);
  });
}

export function mergeConfig(input = {}) {
  const classification = input.classification ?? {};
  const browser = input.browser ?? {};
  const imageOcr = input.imageOcr ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...input,
    location: { ...DEFAULT_CONFIG.location, ...(input.location ?? {}) },
    browser: {
      ...DEFAULT_CONFIG.browser,
      ...browser,
      viewport: { ...DEFAULT_CONFIG.browser.viewport, ...(browser.viewport ?? {}) }
    },
    imageOcr: { ...DEFAULT_CONFIG.imageOcr, ...imageOcr },
    scroll: { ...DEFAULT_CONFIG.scroll, ...(input.scroll ?? {}) },
    detail: { ...DEFAULT_CONFIG.detail, ...(input.detail ?? {}) },
    output: { ...DEFAULT_CONFIG.output, ...(input.output ?? {}) },
    classification: {
      foodTerms: uniqueStrings([...DEFAULT_CLASSIFICATION.foodTerms, ...(classification.foodTerms ?? [])]),
      nonFoodTerms: uniqueStrings([...DEFAULT_CLASSIFICATION.nonFoodTerms, ...(classification.nonFoodTerms ?? [])]),
      uncertainTerms: uniqueStrings([...DEFAULT_CLASSIFICATION.uncertainTerms, ...(classification.uncertainTerms ?? [])])
    },
    excludeTerms: uniqueStrings([...DEFAULT_EXCLUDE_TERMS, ...(Array.isArray(input.excludeTerms) ? input.excludeTerms : [])]),
    markets: Array.isArray(input.markets) ? input.markets : []
  };
}

export function buildBrowserContextOptions(configInput = {}, market = {}) {
  const config = mergeConfig(configInput);
  const marketBrowser = market.browser ?? {};
  const browser = {
    ...config.browser,
    ...marketBrowser,
    viewport: { ...config.browser.viewport, ...(marketBrowser.viewport ?? {}) }
  };
  const options = {
    locale: config.locale,
    viewport: browser.viewport
  };
  for (const key of ['userAgent', 'isMobile', 'hasTouch', 'deviceScaleFactor', 'colorScheme', 'timezoneId']) {
    if (browser[key] != null) options[key] = browser[key];
  }
  return options;
}

export async function loadConfig(filePath = 'kaufda-parser.config.json') {
  const raw = await fs.readFile(filePath, 'utf8');
  return mergeConfig(JSON.parse(raw));
}

export function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

// KaufDA kann für einen Händler mehrere Treffer liefern: zum Beispiel den
// aktuellen Prospekt und eine separate Online-/Nebenbroschüre. Die aktuelle
// Kachelansicht ist in der Regel als „NEU“ und mit einer kurzen Gültigkeit
// markiert. Der Parser darf deshalb nicht blind den ersten Treffer öffnen.
export function scoreKaufdaMarketResult(value = '') {
  const text = normalizeText(value).toLocaleLowerCase('de-DE');
  let score = 0;
  if (/\bneu\b/u.test(text)) score += 1000;
  if (/demnächst\s+gültig/u.test(text)) score -= 1000;
  if (/\b\d+\s+tage\s+gültig/u.test(text)) score += 100;
  if (/\b\d+\s+woche(?:n)?\s+gültig/u.test(text)) score -= 10;
  if (/online|exklusive\s+angebote/u.test(text)) score -= 200;
  return score;
}

export function kaufdaPageFailure(url = '') {
  try {
    const pathname = new URL(url).pathname.toLocaleLowerCase('de-DE');
    if (/\/einkaufshelfer\/?$/.test(pathname)) return 'KaufDA hat die Suchanfrage auf den Einkaufshelfer umgeleitet; Angebotsdaten sind dort nicht verfügbar.';
    if (/\/login|\/anmelden/.test(pathname)) return 'KaufDA hat auf eine Anmeldeseite umgeleitet; der öffentliche Angebotslauf wurde abgebrochen.';
    return null;
  } catch (_) {
    return 'KaufDA hat eine ungültige Zieladresse geliefert.';
  }
}

function normalizeLocationText(value = '') {
  if (value == null) return '';
  return normalizeText(value)
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function matchVisibleLocation(visibleLocation, expectedLocation = {}) {
  const visible = normalizeLocationText(visibleLocation);
  const city = normalizeLocationText(expectedLocation.city);
  const zip = normalizeText(expectedLocation.zip);
  if (!visible || (!city && !zip)) return 'unknown';
  if (city && zip) return visible.includes(city) && visible.includes(zip) ? 'matched' : 'mismatch';
  return (city && visible.includes(city)) || (zip && visible.includes(zip)) ? 'matched' : 'mismatch';
}

export function slug(value = '') {
  return normalizeText(value)
    .toLocaleLowerCase('de-DE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parsePrice(value) {
  return parsePriceDetails(value).currentPrice;
}

export function parsePriceCandidates(value) {
  return [...normalizeText(value).matchAll(/((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€/gi)]
    .map((match) => parseGermanNumber(match[1]))
    .filter((price) => price != null);
}

export function extractPriceText(lines = []) {
  return lines
    .map(normalizeText)
    .filter((line) => /€/.test(line) && !UNIT_PRICE_LINE_RE.test(line))
    .join(' ');
}

export function parsePriceDetails(value) {
  const text = normalizeText(String(value)
    .replace(/(?:für\s+mind(?:estens)?\.?|mindesteinkaufs?(?:wert)?\s*:?)\s*(?:ab\s*)?\d{1,3}(?:[,.]\d{1,2})?\s*(?:€|euro)(?:\s*(?:einkauf|einkaufswert))?/gi, ' ')
    .split(/\r?\n+/).map((line) => {
    if (UNIT_PRICE_LINE_RE.test(line) && /(?:€\s*\/|\/\s*100\s*(?:g|ml)|\b(?:kg|l)\s*=)/i.test(line)) {
      return line
        .replace(/(?:1\s*)?(?:kg|g|l|ml|cl|stück|stk\.?)\s*=\s*(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?\s*€?/gi, '')
        .replace(/(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?\s*€\s*\/\s*(?:100\s*(?:g|ml)|kg|g|l|ml|cl|stück|stk\.?|liter)\b/gi, '');
    }
    return UNIT_PRICE_LINE_RE.test(line) ? '' : line;
  }).filter(Boolean).join(' '));
  const candidates = [...text.matchAll(/((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€/gi)]
    .map((match) => ({ value: parseGermanNumber(match[1]), index: match.index ?? 0 }))
    .filter((entry) => entry.value != null);
  if (!candidates.length) return { currentPrice: null, previousPrice: null, discountAmount: null, type: 'missing', text: text || null };
  const saving = text.match(/((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€?\s*sparen\s*!?/i);
  if (saving) {
    const discountAmount = parseGermanNumber(saving[1]);
    const savingIndex = saving.index ?? 0;
    const following = candidates.filter((candidate) => candidate.index >= savingIndex + saving[0].length);
    if (!following.length) {
      return {
        currentPrice: null,
        previousPrice: null,
        discountAmount,
        type: 'discount-only',
        text: text || null
      };
    }
    return {
      currentPrice: following[0]?.value ?? candidates[0].value,
      previousPrice: following[1]?.value ?? null,
      discountAmount,
      type: following[1] ? 'discount-with-previous' : 'discount-with-current',
      text: text || null
    };
  }
  const currentPrice = candidates[0].value;
  const previousPrice = candidates[1]?.value ?? null;
  return {
    currentPrice,
    previousPrice,
    discountAmount: null,
    type: /\bab\s*[\d,.]+\s*€/i.test(text) ? 'from-price' : previousPrice != null ? 'offer-with-previous' : 'offer-price',
    text: text || null
  };
}

function isKauflandMarket(market = {}) {
  return market.interpretationProfile === 'kaufland-v1'
    || /kaufland/i.test(`${market.key ?? ''} ${market.store ?? ''} ${market.label ?? ''}`);
}

function parseKauflandConditions(value = '') {
  const text = normalizeText(value);
  const xtraPricePatterns = [
    /\bxtra\b[^\d€]{0,24}((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€/i,
    /((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€[^\d€]{0,24}\bxtra\b/i
  ];
  let loyaltyPrice = null;
  let loyaltyPriceText = null;
  for (const pattern of xtraPricePatterns) {
    const match = text.match(pattern);
    if (match) {
      loyaltyPrice = parseGermanNumber(match[1]);
      loyaltyPriceText = match[0];
      break;
    }
  }
  const points = text.match(/\b(\d+)\s*(?:xtra[- ]?)?(?:punkte|münzen)\b/i);
  const percent = text.match(/(?:−|–|-)?\s*(\d{1,2})\s*(?:%|prozent)/i);
  const minimum = text.match(/(?:für\s+mind(?:estens)?\.?|mindesteinkaufs?(?:wert)?\s*:?)\s*(\d{1,3}(?:[,.]\d{1,2})?)\s*(?:€|euro)(?:\s*(?:einkauf|einkaufswert))?/i);
  const limit = text.match(/\b(?:max(?:imal)?\.?\s*)(\d+)\s*(kartons?|packungen?|flaschen?|stück|stk\.?|gläser?|dosen?)\b(?:\s*(?:pro|je)\s*(?:kunde|endverbraucher))?/i);
  const loyaltyActivationRequired = Boolean(
    /\b(?:xtra|kaufland\s*card)\b/i.test(text)
      && /(?:coupon|gutschein).{0,50}aktivier|aktivier.{0,50}(?:coupon|gutschein)|aktivier.{0,50}\b(?:xtra|punkte|münzen)\b/i.test(text)
  );
  return {
    loyaltyPrice,
    loyaltyPriceText,
    loyaltyProgram: loyaltyPrice != null && /\bxtra\b/i.test(text) ? 'Kaufland Card XTRA' : null,
    loyaltyActivationRequired,
    loyaltyPointsRequired: points ? Number(points[1]) : null,
    minimumPurchaseAmount: minimum ? parseGermanNumber(minimum[1]) : null,
    purchaseLimitText: limit ? normalizeText(limit[0]) : null,
    discountPercent: percent ? Number(percent[1]) : null
  };
}

function parseOfferCountDetails(value) {
  const normalized = normalizeText(value);
  const carouselMatch = normalized.match(/(?:angebote|offer(?:s)?)\s*(?:\(\s*)?[\d.]+\s*\/\s*([\d.]+)/i);
  if (carouselMatch) {
    const carouselCount = Number(carouselMatch[1].replace(/\./g, ''));
    return { count: Number.isFinite(carouselCount) ? carouselCount : null, kind: 'prospect-pages' };
  }
  const match = normalized.match(/(?:angebote|offer(?:s)?)\s*(?:\(\s*)?([\d.]+)\s*\)?/i);
  if (!match) return { count: null, kind: null };
  const count = Number(match[1].replace(/\./g, ''));
  return { count: Number.isFinite(count) ? count : null, kind: 'cards' };
}

export function parseOfferCount(value) {
  return parseOfferCountDetails(value).count;
}

export function marketCollectionStatus({ loadedCardCount = 0, locationStatus = 'unknown', targetReached = false, scrollExhausted = false, expectedCountKind = null } = {}) {
  if (!loadedCardCount || locationStatus === 'mismatch') return 'failed';
  const scrollCanConfirmCoverage = expectedCountKind !== 'cards';
  return targetReached || (scrollCanConfirmCoverage && scrollExhausted) ? 'complete' : 'incomplete';
}

export function scaleOcrLinesToViewport(lines = [], screenshot = null, viewport = null) {
  // Normalize raster coordinates before comparing them with CSS-pixel DOM bounds.
  if (!Buffer.isBuffer(screenshot) || screenshot.length < 24 || !viewport?.width || !viewport?.height) return lines;
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!screenshot.subarray(0, 8).equals(pngSignature)) return lines;
  const screenshotWidth = screenshot.readUInt32BE(16);
  const screenshotHeight = screenshot.readUInt32BE(20);
  if (!screenshotWidth || !screenshotHeight
    || (screenshotWidth === viewport.width && screenshotHeight === viewport.height)) return lines;
  const scaleX = viewport.width / screenshotWidth;
  const scaleY = viewport.height / screenshotHeight;
  return lines.map((line) => line.box ? {
    ...line,
    box: {
      ...line.box,
      x: line.box.x * scaleX,
      y: line.box.y * scaleY,
      width: line.box.width * scaleX,
      height: line.box.height * scaleY
    }
  } : line);
}

export function assignOcrLinesToRegions(lines = [], regions = [], tolerance = 8) {
  const grouped = regions.map((region) => ({ ...region, ocrLines: [] }));
  for (const line of lines) {
    if (!line.box) continue;
    const x = line.box.x + line.box.width / 2;
    const y = line.box.y + line.box.height / 2;
    // OCR line boxes can cross an overlay edge even when their text belongs to it.
    const candidates = grouped.map((region, index) => {
      const left = Math.max(line.box.x, region.x);
      const top = Math.max(line.box.y, region.y);
      const right = Math.min(line.box.x + line.box.width, region.x + region.width);
      const bottom = Math.min(line.box.y + line.box.height, region.y + region.height);
      const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
      const lineArea = Math.max(1, line.box.width * line.box.height);
      const overlap = intersection / lineArea;
      const lineFitsRegion = line.box.width <= Math.max(region.width * 1.75, tolerance * 2);
      const centerInside = x >= region.x - tolerance && x <= region.x + region.width + tolerance
        && y >= region.y - tolerance && y <= region.y + region.height + tolerance;
      return { region, index, overlap, centerInside, lineFitsRegion, area: region.width * region.height };
    }).filter((candidate) => candidate.lineFitsRegion && (candidate.centerInside || candidate.overlap >= 0.2))
      .sort((left, right) => right.overlap - left.overlap || left.area - right.area || left.index - right.index);
    const confidence = line.confidence == null || line.confidence === '' ? null : Number(line.confidence);
    candidates[0]?.region.ocrLines.push({
      text: line.text,
      confidence: Number.isFinite(confidence) ? confidence : null,
      box: { ...line.box }
    });
  }
  return grouped.map((region) => ({
    ...region,
    text: region.ocrLines.map((line) => normalizeText(line.text)).filter(Boolean).join('\n')
  }));
}

export function normalizeProspectProductName(linkLabel = '', imageMatch = {}) {
  const visibleLabel = normalizeText(linkLabel).replace(/\s*(?:[-–—:]\s*)?link\s*$/i, '').trim();
  const matchedText = normalizeText(imageMatch.matchedText ?? '');
  const tokenCount = (value) => value.split(/\s+/).filter(Boolean).length;
  if (imageMatch.status === 'verified' && matchedText && tokenCount(matchedText) > tokenCount(visibleLabel)) {
    return matchedText;
  }
  return visibleLabel || (imageMatch.status === 'verified' ? matchedText : null);
}

export function parseDate(value, referenceDate = new Date()) {
  const match = normalizeText(value).match(DATE_RE);
  if (!match) return null;
  const [day, month, rawYear] = match[1].replace(/\.$/, '').split('.').map(Number);
  const reference = new Date(referenceDate);
  const year = rawYear == null ? reference.getUTCFullYear() : rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function parseValidity(value, referenceDate = new Date()) {
  const text = normalizeText(value);
  const range = text.match(RANGE_RE);
  if (range) {
    return {
      validFrom: parseDate(`gültig bis ${range[1]}`, referenceDate),
      validUntil: parseDate(`gültig bis ${range[2]}`, referenceDate),
      status: 'complete',
      text
    };
  }
  const validUntil = parseDate(text, referenceDate);
  if (validUntil) return { validFrom: null, validUntil, status: 'partial', text };
  const relative = text.match(/(?:endet|noch)\s+(heute|morgen|in\s+(\d+)\s+tagen?)/i);
  if (relative) {
    const reference = new Date(referenceDate);
    const word = relative[1].toLocaleLowerCase('de-DE');
    const days = word === 'heute' ? 0 : word === 'morgen' ? 1 : Number(relative[2]);
    if (Number.isFinite(reference.getTime()) && Number.isFinite(days)) {
      reference.setUTCDate(reference.getUTCDate() + days);
      return { validFrom: null, validUntil: reference.toISOString().slice(0, …13985 tokens truncated…unt += 2;
      } catch (error) {
        failedPageCount += 2;
        warnings.push(`Prospektseite ${pageNumber}–${Math.min(expectedPageCount, pageNumber + 1)} konnte nicht sicher ausgewertet werden: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await reader.close();
  }
  const offers = dedupeOffers(collected.filter((item) => item.id).map((item) => item));
  const reviewItems = collected.filter((item) => item.reviewItem).map((item) => item.reviewItem).slice(0, config.maxReviewItems);
  const recognizedOfferCount = offers.length;
  const unrecognizedCount = reviewItems.length + pageWithNoProductLinks;
  if (pageWithNoProductLinks) warnings.push(`${pageWithNoProductLinks} Prospekt-Doppelseiten enthielten keine sicher zuordenbaren Produktlinks.`);
  warnings.push('Der Prospekt wurde seitenweise besucht. Die Angebotsvollständigkeit ist nicht aus einer Kachel-Zielzahl ableitbar; fehlende Artikel bleiben unbekannt.');
  const pageTraversalStatus = failedPageCount === 0 && visitedPageCount >= expectedPageCount ? 'complete' : 'incomplete';
  return {
    offers,
    reviewItems,
    expectedPageCount,
    expectedCountKind: 'prospect-pages',
    loadedCardCount: collected.length,
    recognizedOfferCount,
    foodOfferCount: offers.length,
    uncertainCount: reviewItems.filter((item) => item.classification?.label === 'uncertain').length,
    rejectedCount: reviewItems.filter((item) => item.classification?.label === 'nonfood').length,
    unrecognizedCount,
    imageOcrAttempted: visitedPageCount / 2,
    imageOcrVerified: offers.filter((offer) => offer.fieldStatus?.imageProduct === 'verified').length,
    imageOcrFailed: failedPageCount / 2,
    ocrDiagnostics,
    passes: visitedPageCount / 2,
    targetReached: false,
    scrollExhausted: pageTraversalStatus === 'complete',
    pageTraversalStatus,
    visibleLocation,
    locationStatus,
    categoryScoped: false,
    categoryOfferCount: offers.length,
    completenessStatus: locationStatus === 'mismatch' ? 'failed' : 'incomplete',
    errors,
    warnings
  };
}

function buildMarketResult(market, config, startedAt) {
  return {
    market: marketLabel(market),
    marketKey: market.key ?? null,
    store: market.store ?? marketLabel(market),
    location: market.location ?? config.location,
    sourceUrl: market.url ?? null,
    offerCategory: market.offerCategory ?? config.offerCategory ?? null,
    collectionMode: market.collectionMode ?? 'tiles',
    offerCategoryStatus: 'not-attempted',
    categoryScoped: false,
    categoryOfferCount: 0,
    fetchedAt: startedAt,
    startedAt,
    finishedAt: null,
    expectedCardCount: null,
    expectedPageCount: null,
    expectedCountKind: null,
    loadedCardCount: 0,
    imageOcrAttempted: 0,
    imageOcrVerified: 0,
    imageOcrFailed: 0,
    recognizedOfferCount: 0,
    foodOfferCount: 0,
    uncertainCount: 0,
    rejectedCount: 0,
    unrecognizedCount: 0,
    passes: 0,
    targetReached: false,
    scrollExhausted: false,
    pageUrl: null,
    visibleLocation: null,
    expectedLocation: market.location ?? config.location,
    locationStatus: 'unknown',
    completenessStatus: 'failed',
    warnings: [],
    errors: [],
    offers: [],
    reviewItems: []
  };
}

export function assertSafeOutputTarget(configInput, outputPath, marketKey = null) {
  if (!marketKey || !outputPath) return;
  const config = mergeConfig(configInput);
  if (!config.markets.some((market) => market.key === marketKey)) {
    throw new Error(`Unbekannter Markt für Einzelmarktlauf: ${marketKey}`);
  }
  const configuredFeedPath = path.resolve(config.output.directory, config.output.file);
  if (path.resolve(outputPath) === configuredFeedPath) {
    throw new Error('Ein Einzelmarktlauf darf den konfigurierten Gesamtfeed nicht überschreiben. Für einen Test bitte einen abweichenden --output-Pfad angeben.');
  }
}

export async function runParser(configInput, { outputPath = null, marketKey = null, headed = false, debugProspect = false } = {}) {
  const config = mergeConfig(configInput);
  assertSafeOutputTarget(config, outputPath, marketKey);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: !headed });
  const results = [];
  try {
    for (const market of config.markets) {
      if (marketKey && market.key !== marketKey) continue;
      const startedAt = new Date().toISOString();
      const result = buildMarketResult(market, config, startedAt);
      if (!market.url) {
        result.errors.push('Keine KaufDA-URL konfiguriert.');
        result.finishedAt = new Date().toISOString();
        results.push(result);
        continue;
      }
      const context = await browser.newContext(buildBrowserContextOptions(config, market));
      const page = await context.newPage();
      try {
        await page.goto(market.url, { waitUntil: 'domcontentloaded', timeout: market.navigationTimeoutMs ?? 90000 });
        await page.waitForTimeout(market.initialWaitMs ?? 3500);
        const initialPageFailure = kaufdaPageFailure(page.url());
        if (initialPageFailure) throw new Error(initialPageFailure);
        let expectedCountHint = null;
        let expectedCountKindHint = null;
        const rememberExpectedCount = async () => {
          const bodyText = await page.locator('body').innerText().catch(() => '');
          const measurement = parseOfferCountDetails(bodyText);
          if (measurement.kind === 'prospect-pages') {
            expectedCountHint = measurement.count;
            expectedCountKindHint = measurement.kind;
          } else {
            expectedCountHint ??= measurement.count;
            expectedCountKindHint ??= measurement.kind;
          }
        };
        const activateOffersTab = async () => {
          await rememberExpectedCount();
          const offersTab = page.getByRole('tab', { name: /^Angebote$/i }).first();
          const fallbackTab = page.getByRole('button', { name: /^Angebote\s*(?:\(|\d|$)/i }).first();
          const tab = (await offersTab.count()) ? offersTab : fallbackTab;
          if (!await tab.count()) return false;
          await tab.click();
          await page.waitForTimeout(market.afterOffersTabWaitMs ?? 2500);
          return true;
        };
        const activateProspectTab = async () => {
          const tab = page.getByRole('tab', { name: /^Prospekt$/i }).first();
          const fallback = page.getByRole('button', { name: /^Prospekt(?:\s|$)/i }).first();
          const selected = (await tab.count()) ? tab : fallback;
          if (!await selected.count()) return false;
          await selected.click();
          await page.waitForTimeout(market.afterProspectTabWaitMs ?? 2000);
          return true;
        };
        if (/\/search(?:[/?]|$)/i.test(page.url())) {
          const marketResults = page.getByRole('listitem').filter({ hasText: market.store ?? market.label ?? market.key });
          const marketResultCount = await marketResults.count();
          if (!marketResultCount) throw new Error(`Kein KaufDA-Suchergebnis für „${market.store ?? market.label ?? market.key}“ gefunden; aktuelle Seite: ${page.url()}`);
          let selectedIndex = 0;
          let selectedScore = Number.NEGATIVE_INFINITY;
          for (let index = 0; index < marketResultCount; index += 1) {
            const candidateText = await marketResults.nth(index).innerText().catch(() => '');
            const candidateScore = scoreKaufdaMarketResult(candidateText);
            if (candidateScore > selectedScore) {
              selectedIndex = index;
              selectedScore = candidateScore;
            }
          }
          await marketResults.nth(selectedIndex).click();
          await page.waitForTimeout(market.afterMarketClickWaitMs ?? 5000);
        }
        const selectedPageFailure = kaufdaPageFailure(page.url());
        if (selectedPageFailure) throw new Error(selectedPageFailure);
        let scan;
        if (market.collectionMode === 'prospect') {
          if (!await activateProspectTab()) throw new Error('Kaufland-Prospektansicht war im ausgewählten Markt nicht sichtbar.');
          scan = await collectProspectOffersFromPage(page, market, config, { debugProspect });
          scan.offerCategory = null;
          scan.offerCategoryStatus = 'not-attempted';
          scan.collectionMode = 'prospect';
        } else {
          await activateOffersTab();
          const categoryScan = await activateOfferCategory(page, market, config);
          const pageConfig = {
            ...config,
            categoryScopeActive: categoryScan.status === 'selected'
          };
          scan = await collectOffersFromPage(page, market, pageConfig, expectedCountHint, expectedCountKindHint);
          scan.offerCategory = categoryScan.label;
          scan.offerCategoryStatus = categoryScan.status;
          scan.categoryScoped = pageConfig.categoryScopeActive;
          scan.collectionMode = 'tiles';
          if (categoryScan.status === 'unavailable') {
            scan.warnings.push(`KaufDA-Kategorie „${categoryScan.label}“ war in dieser Ansicht nicht verfügbar; die Lebensmittelklassifikation bleibt als Sicherheitsfilter aktiv.`);
          } else if (categoryScan.status === 'failed') {
            scan.warnings.push(`KaufDA-Kategorie „${categoryScan.label}“ konnte nicht ausgewählt werden: ${categoryScan.error}`);
          }
        }
        Object.assign(result, scan);
        result.finishedAt = new Date().toISOString();
        results.push(result);
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
        result.finishedAt = new Date().toISOString();
        results.push(result);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const offers = dedupeOffers(results.flatMap((result) => result.offers ?? []));
  const document = buildOffersDocument({ config, results, offers });
  if (outputPath) {
    const validation = validateOutputDocument(document, { allowEmptyOffers: Boolean(marketKey) });
    if (!validation.valid) throw new Error(`Angebotsdatei wird wegen fehlgeschlagener Markt-/Feed-Prüfung nicht geschrieben: ${validation.errors.join('; ')}`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }
  return document;
}

export function buildOffersDocument({ config: configInput, results = [], offers = [], fetchedAt = new Date().toISOString() }) {
  const config = mergeConfig(configInput);
  const normalizedOffers = dedupeOffers(offers).map(selectPublishedOffer);
  const marketCount = results.length;
  const errorCount = results.filter((result) => (result.errors?.length ?? (result.error ? 1 : 0)) > 0).length;
  const incompleteMarketCount = results.filter((result) => result.completenessStatus !== 'complete').length;
  const summary = {
    marketCount,
    marketSuccessCount: results.filter((result) => !(result.errors?.length ?? (result.error ? 1 : 0)) && result.completenessStatus !== 'failed').length,
    recognizedOfferCount: results.reduce((sum, result) => sum + (result.recognizedOfferCount ?? result.recognizedCount ?? 0), 0),
    foodOfferCount: normalizedOffers.length,
    categoryOfferCount: normalizedOffers.length,
    offerScope: results.some((result) => result.categoryScoped === true) ? 'selected-category' : 'food-classification',
    uncertainCount: results.reduce((sum, result) => sum + (result.uncertainCount ?? 0), 0),
    rejectedCount: results.reduce((sum, result) => sum + (result.rejectedCount ?? 0), 0),
    unrecognizedCount: results.reduce((sum, result) => sum + (result.unrecognizedCount ?? 0), 0),
    targetCardCount: results.reduce((sum, result) => sum + (result.expectedCardCount ?? (result.expectedCountKind === 'cards' ? result.expectedCount ?? 0 : 0)), 0),
    targetPageCount: results.reduce((sum, result) => sum + (result.expectedPageCount ?? 0), 0),
    loadedCardCount: results.reduce((sum, result) => sum + (result.loadedCardCount ?? 0), 0),
    targetReachedCount: results.filter((result) => result.targetReached === true).length,
    incompleteMarketCount,
    errorCount,
    completenessStatus: errorCount === marketCount || !marketCount ? 'failed' : incompleteMarketCount ? 'incomplete' : 'complete',
    planningReadyOfferCount: normalizedOffers.filter((offer) => offer.planningStatus === 'ready').length,
    planningReviewOfferCount: normalizedOffers.filter((offer) => offer.planningStatus !== 'ready').length,
    planningCompletenessStatus: incompleteMarketCount > 0
      ? 'partial'
      : normalizedOffers.length
        ? normalizedOffers.every((offer) => offer.planningStatus === 'ready') ? 'complete' : 'partial'
        : 'empty'
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    contractVersion: PWA_CONTRACT_VERSION,
    parser: { name: 'kaufda-parser', version: VERSION },
    fetchedAt,
    location: config.location,
    summary,
    markets: results.map(({ offers: _offers, reviewItems: _reviewItems, ...result }) => result),
    reviewItems: results.flatMap((result) => result.reviewItems ?? []).slice(0, config.maxReviewItems),
    offers: normalizedOffers
  };
}

export function mergeMarketDocuments(configInput, documents = []) {
  const config = mergeConfig(configInput);
  if (documents.length !== config.markets.length) {
    throw new Error(`Erwartet wurden ${config.markets.length} Marktdateien, erhalten wurden ${documents.length}.`);
  }
  const configuredKeys = new Set(config.markets.map((market) => market.key));
  const documentsByMarket = new Map();
  documents.forEach((document, index) => {
    const validation = validateOutputDocument(document, { allowEmptyOffers: true });
    if (!validation.valid) {
      throw new Error(`Marktdatei ${index + 1} ist ungültig: ${validation.errors.join('; ')}`);
    }
    if (document.markets.length !== 1) {
      throw new Error(`Marktdatei ${index + 1} muss genau einen Markt enthalten.`);
    }
    const marketKey = document.markets[0].marketKey;
    if (!configuredKeys.has(marketKey)) throw new Error(`Unbekannter Markt in Marktdatei ${index + 1}: ${marketKey ?? 'ohne Schlüssel'}.`);
    if (documentsByMarket.has(marketKey)) throw new Error(`Doppelte Marktdatei für ${marketKey}.`);
    documentsByMarket.set(marketKey, document);
  });

  const missing = config.markets.map((market) => market.key).filter((key) => !documentsByMarket.has(key));
  if (missing.length) throw new Error(`Marktdateien fehlen für: ${missing.join(', ')}.`);

  const results = config.markets.map((configuredMarket) => {
    const document = documentsByMarket.get(configuredMarket.key);
    return {
      ...document.markets[0],
      offers: document.offers,
      reviewItems: document.reviewItems ?? []
    };
  });
  const merged = buildOffersDocument({
    config,
    results,
    offers: results.flatMap((result) => result.offers),
    fetchedAt: new Date().toISOString()
  });
  const validation = validateOutputDocument(merged);
  if (!validation.valid) throw new Error(`Zusammengeführter Gesamtfeed ist ungültig: ${validation.errors.join('; ')}`);
  return merged;
}

export function validateConfig(configInput) {
  const config = mergeConfig(configInput);
  const errors = [];
  if (!config.location.city && !config.location.zip) errors.push('location.city oder location.zip fehlt');
  if (!config.markets.length) errors.push('Mindestens ein Markt fehlt');
  const seenKeys = new Set();
  config.markets.forEach((market, index) => {
    if (!market.key && !market.store) errors.push(`markets[${index}].key oder store fehlt`);
    if (!market.url) errors.push(`markets[${index}].url fehlt`);
    else if (!/^https:\/\/(?:www\.)?kaufda\.de\//i.test(market.url)) errors.push(`markets[${index}].url muss auf eine öffentliche KaufDA-Seite zeigen`);
    if (market.key && seenKeys.has(market.key)) errors.push(`markets[${index}].key ist doppelt: ${market.key}`);
    if (market.key) seenKeys.add(market.key);
    const collectionMode = market.collectionMode ?? 'tiles';
    const isKaufland = /kaufland/i.test(`${market.key ?? ''} ${market.store ?? ''} ${market.label ?? ''}`);
    if (!['tiles', 'prospect'].includes(collectionMode)) errors.push(`markets[${index}].collectionMode muss tiles oder prospect sein`);
    if (collectionMode === 'prospect' && !isKaufland) errors.push(`markets[${index}].collectionMode=prospect ist derzeit nur für Kaufland freigegeben`);
    const isAldiSued = market.key === 'Aldi-Sued-Zellingen';
    const profileAllowed = (market.interpretationProfile === 'kaufland-v1' && isKaufland)
      || (market.interpretationProfile === 'aldi-sued-v1' && isAldiSued);
    if (market.interpretationProfile && !profileAllowed) errors.push(`markets[${index}].interpretationProfile ist für diesen Markt nicht zulässig`);
  });
  if (!Number.isInteger(config.scroll.maxPasses) || config.scroll.maxPasses < 1) errors.push('scroll.maxPasses muss positiv sein');
  if (!Number.isInteger(config.scroll.stablePassesAtEnd) || config.scroll.stablePassesAtEnd < 1) errors.push('scroll.stablePassesAtEnd muss positiv sein');
  return { valid: errors.length === 0, errors, config };
}

export function validateOutputDocument(document, { allowEmptyOffers = false } = {}) {
  const summary = document?.summary ?? {};
  const errors = [];
  const offers = Array.isArray(document?.offers) ? document.offers : [];
  const markets = Array.isArray(document?.markets) ? document.markets : [];
  if (!document || !Array.isArray(document.offers) || !Array.isArray(document.markets)) errors.push('Angebotsdokument ist unvollständig.');
  if (document?.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion muss ${SCHEMA_VERSION} sein.`);
  if (document?.contractVersion !== PWA_CONTRACT_VERSION) errors.push(`contractVersion muss ${PWA_CONTRACT_VERSION} sein.`);
  if (!isValidTimestamp(document?.fetchedAt)) errors.push('fetchedAt muss ein gültiger ISO-Zeitstempel sein.');
  if (!Number.isInteger(summary.marketCount) || summary.marketCount !== markets.length) errors.push('summary.marketCount stimmt nicht mit markets überein.');
  if (!Number.isInteger(summary.foodOfferCount) || summary.foodOfferCount !== offers.length) errors.push('summary.foodOfferCount stimmt nicht mit offers überein.');
  if (summary.categoryOfferCount != null && (!Number.isInteger(summary.categoryOfferCount) || summary.categoryOfferCount !== offers.length)) errors.push('summary.categoryOfferCount stimmt nicht mit offers überein.');
  if (!allowEmptyOffers && summary.foodOfferCount < 1) errors.push('Keine Lebensmittelangebote erkannt.');
  const readyCount = offers.filter((offer) => offer?.planningStatus === 'ready').length;
  const reviewCount = offers.filter((offer) => offer?.planningStatus !== 'ready').length;
  if (!Number.isInteger(summary.planningReadyOfferCount) || summary.planningReadyOfferCount !== readyCount) errors.push('summary.planningReadyOfferCount stimmt nicht mit offers überein.');
  if (!Number.isInteger(summary.planningReviewOfferCount) || summary.planningReviewOfferCount !== reviewCount) errors.push('summary.planningReviewOfferCount stimmt nicht mit offers überein.');
  if (!['complete', 'incomplete', 'failed'].includes(summary.completenessStatus)) errors.push('summary.completenessStatus ist ungültig.');
  const expectedPlanningStatus = summary.completenessStatus !== 'complete'
    ? markets.length ? 'partial' : 'empty'
    : !offers.length ? 'empty' : readyCount === offers.length ? 'complete' : 'partial';
  if (summary.planningCompletenessStatus !== expectedPlanningStatus) errors.push('summary.planningCompletenessStatus stimmt nicht mit offers überein.');
  if (summary.completenessStatus === 'failed') errors.push('Alle Märkte sind fehlgeschlagen.');
  markets.forEach((market, index) => {
    if (market?.completenessStatus === 'failed' || (Array.isArray(market?.errors) && market.errors.length > 0)) {
      errors.push(`markets[${index}] (${market.market ?? market.marketKey ?? 'unbekannt'}) ist fehlgeschlagen; ein Teilfeed darf nicht veröffentlicht werden.`);
    }
  });
  const marketByKey = new Map(markets.map((market) => [market?.marketKey, market]));
  offers.forEach((offer, index) => {
    const prefix = `offers[${index}]`;
    if (!offer || typeof offer !== 'object') {
      errors.push(`${prefix} ist kein Objekt.`);
      return;
    }
    if (!offer.id || !offer.product) errors.push(`${prefix} benötigt id und product.`);
    if (!Number.isFinite(offer.price) || offer.price < 0) errors.push(`${prefix}.price ist ungültig.`);
    if (!['verified', 'needs-review'].includes(offer.status)) errors.push(`${prefix}.status ist ungültig.`);
    if (!['ready', 'needs-review'].includes(offer.planningStatus)) errors.push(`${prefix}.planningStatus ist ungültig.`);
    if (offer.activationRequired === true && offer.planningStatus === 'ready') errors.push(`${prefix} darf mit aktivierungspflichtigem Rabatt nicht planningStatus=ready tragen.`);
    if (offer.priceBasis === 'multipack-total' && (!Number.isInteger(offer.packCount) || offer.packCount < 2)) errors.push(`${prefix} kennzeichnet einen Multipack-Gesamtpreis ohne bestätigte Multipack-Menge.`);
    if (offer.priceBasis === 'weight-based-unit-unknown' && offer.planningStatus === 'ready') errors.push(`${prefix} darf ohne bestätigte Gewichtsbezugsmenge nicht planningStatus=ready tragen.`);
    const categoryScoped = offer.marketKey != null && marketByKey.get(offer.marketKey)?.categoryScoped === true;
    if (!categoryScoped && offer.classification?.label !== 'food') errors.push(`${prefix} ist nicht als food klassifiziert.`);
    if (!['matched', 'unknown'].includes(offer.marketLocationStatus)) errors.push(`${prefix}.marketLocationStatus ist nicht sicher.`);
    if (!isKaufdaSourceUrl(offer.sourceUrl)) errors.push(`${prefix}.sourceUrl muss auf KaufDA zeigen.`);
    if (!isValidTimestamp(offer.capturedAt) || !isValidTimestamp(offer.fetchedAt)) errors.push(`${prefix} benötigt gültige Zeitstempel.`);
    if (!isValidDateOnly(offer.validFrom) || !isValidDateOnly(offer.validUntil)) errors.push(`${prefix} enthält ein ungültiges Gültigkeitsdatum.`);
    const unexpectedFields = Object.keys(offer).filter((field) => !PUBLISHED_OFFER_FIELDS.includes(field));
    if (unexpectedFields.length) errors.push(`${prefix} enthält nicht veröffentlichbare Felder: ${unexpectedFields.join(', ')}.`);
    if (offer.planningStatus === 'ready' && (!categoryScoped && (!offer.pack && !offer.packSize || offer.fieldStatus?.packSize !== 'visible' || (offer.fieldStatus?.imageProduct != null && !['verified', 'not-required'].includes(offer.fieldStatus.imageProduct))) || offer.status !== 'verified' || offer.marketLocationStatus !== 'matched')) {
      errors.push(`${prefix} darf nur mit gültigem Kernstatus und bestätigtem Marktstandort planningStatus=ready tragen; außerhalb des Kategorieumfangs sind Packung und Bildbestätigung zusätzlich Pflicht.`);
    }
    if (offer.planningStatus !== 'ready' && offer.status === 'verified') errors.push(`${prefix} darf mit planningStatus=needs-review nicht verified sein.`);
    if (offer.marketKey && marketByKey.get(offer.marketKey)?.locationStatus === 'mismatch') errors.push(`${prefix} verweist auf einen nicht passenden Marktstandort.`);
  });
  const warnings = [];
  if (summary.completenessStatus === 'incomplete') warnings.push('Marktabdeckung ist unvollständig; planungsbereite Angebote sind nur die erkannten positiven Treffer. Fehlende Produkte sind kein negatives Angebotsergebnis.');
  if (summary.planningCompletenessStatus === 'partial') warnings.push('Ein Teil der Angebote benötigt noch eine Mengen-/Packungsprüfung.');
  if (offers.length && readyCount === 0) warnings.push('Kein Angebot ist aktuell für eine automatische Planung freigegeben.');
  return { valid: errors.length === 0, errors, warnings };
}
