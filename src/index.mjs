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
      return { validFrom: null, validUntil: reference.toISOString().slice(0, 10), status: 'relative', text };
    }
  }
  if (/(?:gültig|endet|noch\s+\d+\s+tage)/i.test(text)) {
    return { validFrom: null, validUntil: null, status: 'partial', text };
  }
  return { validFrom: null, validUntil: null, status: 'unknown', text: text || null };
}

export function parsePackSize(value) {
  const normalized = normalizeText(value);
  if (!normalized) return { text: null, value: null, unit: null, count: null, itemValue: null, itemUnit: null, ambiguous: false, variants: [] };

  const range = normalized.match(PACK_RANGE_RE);
  if (range) {
    const unit = range[1].match(/(kg|g|l|ml|cl|stück|stk\.?|pack(?:ung)?|portion(?:en)?)(?:\s*[- ]?(?:packg?\.?|packung))?$/i)?.[1]?.replace('.', '').toLocaleLowerCase('de-DE') ?? null;
    const variants = [...range[1].matchAll(/(\d+(?:[,.]\d+)?)/g)]
      .map((match) => parseGermanNumber(match[1]))
      .filter((number) => number != null);
    return {
      text: range[1],
      value: null,
      unit,
      count: null,
      itemValue: null,
      itemUnit: unit,
      ambiguous: true,
      variants
    };
  }

  const multiplier = normalized.match(/\b(\d+)\s*[x×]\s*(\d+(?:[,.]\d+)?)\s*[- ]?(kg|g|l|ml|cl|stück|stk\.?|pack(?:ung)?|portion(?:en)?)/i);
  if (multiplier) {
    const count = Number(multiplier[1]);
    const itemValue = parseGermanNumber(multiplier[2]);
    const itemUnit = multiplier[3].replace('.', '').toLocaleLowerCase('de-DE');
    return {
      text: multiplier[0],
      value: itemValue == null ? null : Math.round(itemValue * count * 100) / 100,
      unit: itemUnit,
      count,
      itemValue,
      itemUnit,
      ambiguous: false,
      variants: []
    };
  }

  // Einige KaufDA-Karten nennen die Multipack-Menge in der Preiszeile
  // (z. B. „12 Packungen für insgesamt 9,99 €“) und die Einzelpackung separat
  // (z. B. „1-l-Packung“). Die Zahl der Einheiten ist dann keine Größe.
  const packCountMatch = normalized.match(/\b(\d+)\s*(?:packungen?|flaschen?|becher|dosen|gläser)\b/i);
  if (packCountMatch) {
    const item = normalized.match(/(\d+(?:[,.]\d+)?)\s*[- ]?\s*(kg|g|l|ml|cl|stück|stk\.?)\s*(?:-?\s*(?:packung|flasche|becher|dose|glas))?/i);
    if (item) {
      const count = Number(packCountMatch[1]);
      const itemValue = parseGermanNumber(item[1]);
      const itemUnit = item[2].replace('.', '').toLocaleLowerCase('de-DE');
      if (Number.isInteger(count) && count > 0 && itemValue != null) {
        return {
          text: `${count} × ${item[1]} ${itemUnit}`,
          value: Math.round(itemValue * count * 100) / 100,
          unit: itemUnit,
          count,
          itemValue,
          itemUnit,
          ambiguous: false,
          variants: []
        };
      }
    }
    return {
      text: packCountMatch[0], value: null, unit: null, count: Number(packCountMatch[1]),
      itemValue: null, itemUnit: null, ambiguous: true, variants: []
    };
  }

  const text = normalized.match(PACK_RE)?.[0] ?? null;
  if (!text) return { text: null, value: null, unit: null, count: null, itemValue: null, itemUnit: null, ambiguous: false, variants: [] };
  const match = text.match(/(\d+(?:[,.]\d+)?)\s*[- ]?(kg|g|l|ml|cl|stück|stk\.?|pack(?:ung)?|portion(?:en)?)/i);
  const itemValue = match ? parseGermanNumber(match[1]) : null;
  const itemUnit = match ? match[2].replace('.', '').toLocaleLowerCase('de-DE') : null;
  return {
    text,
    value: itemValue,
    unit: itemUnit,
    count: null,
    itemValue,
    itemUnit,
    ambiguous: false,
    variants: []
  };
}

export function parseUnitPrice(value) {
  const text = normalizeText(value);
  const perHundred = text.match(/(?:je|pro)\s+100\s*(g|ml)\s*(?:=|:)??\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€/i);
  if (perHundred) return { amount: parseGermanNumber(perHundred[2]), unit: `100 ${perHundred[1].toLocaleLowerCase('de-DE')}`, text };
  const match = text.match(UNIT_PRICE_RE);
  if (match) {
    const unit = (match[1] ?? match[4]).replace('.', '').replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
    const amount = parseGermanNumber(match[2] ?? match[3]);
    return { amount, unit: unit === 'liter' ? 'l' : unit, text };
  }
  const labelled = text.match(/\b(kg|g|l|ml|cl|stück|stk\.?)\s*[- ]?preis\s*:?\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)/i);
  if (!labelled) return { amount: null, unit: null, text: text || null };
  return { amount: parseGermanNumber(labelled[2]), unit: labelled[1].replace('.', '').toLocaleLowerCase('de-DE'), text };
}

export function classifyFood(name, context = '', configInput = {}) {
  const config = configInput.classification ? configInput : mergeConfig(configInput);
  const text = `${normalizeText(name)} ${normalizeText(context)}`.trim();
  if (!config.foodOnly) return { label: 'food', confidence: 'unverified', reasons: ['foodOnly deaktiviert'], matches: [] };

  const foodMatches = termsFound(text, config.classification.foodTerms);
  const nonFoodMatches = termsFound(text, [...config.excludeTerms, ...config.classification.nonFoodTerms]);
  const uncertainMatches = termsFound(text, config.classification.uncertainTerms);
  const includeTerms = config.includeTerms ?? [];
  const includeMatches = termsFound(text, includeTerms);

  if (includeTerms.length && !includeMatches.length) {
    return { label: 'uncertain', confidence: 'low', reasons: ['includeTerms nicht sichtbar'], matches: [] };
  }
  if (nonFoodMatches.length && foodMatches.length) {
    return { label: 'uncertain', confidence: 'low', reasons: ['Lebensmittel- und Nichtlebensmittelmerkmale widersprechen sich'], matches: [...new Set([...foodMatches, ...nonFoodMatches])] };
  }
  if (nonFoodMatches.length) {
    return { label: 'nonfood', confidence: 'high', reasons: [`Nichtlebensmittelmerkmal: ${nonFoodMatches[0]}`], matches: nonFoodMatches };
  }
  if (uncertainMatches.length && !foodMatches.length) {
    return { label: 'uncertain', confidence: 'low', reasons: [`Unklare Produktbezeichnung: ${uncertainMatches[0]}`], matches: uncertainMatches };
  }
  if (foodMatches.length) {
    return { label: 'food', confidence: 'high', reasons: [`Lebensmittelmerkmal: ${foodMatches[0]}`], matches: foodMatches };
  }
  return { label: 'uncertain', confidence: 'low', reasons: ['Kein ausreichendes Lebensmittelmerkmal sichtbar'], matches: [] };
}

export function isLikelyFood(name, options = {}, context = '') {
  return classifyFood(name, context, options).label === 'food';
}

function chooseName(lines, explicitName = '') {
  const ignored = /€|kg-preis|l-preis|uvp|gültig|angebot|produktbeschreibung|preisdetails|preis\s+pro\s+einheit|kaufda|mehr zu den|sortieren|^(aldi|edeka|lidl|penny|netto|kaufland|marktkauf)\b|^(aktuelle angebote|gutes für alle|wir lieben lebensmittel|lidl lohnt sich)$/i;
  if (explicitName && explicitName.length >= 2 && !ignored.test(explicitName)) return normalizeText(explicitName);
  const candidates = lines
    .map(normalizeText)
    .filter((line) => line.length >= 2 && line.length <= 120 && !ignored.test(line));
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

function findLine(lines, pattern) {
  return lines.find((line) => pattern.test(line)) ?? '';
}

function findPackSizeText(value = '') {
  return String(value)
    .split(/\r?\n+/)
    .map(normalizeText)
    .find((line) => PACK_RE.test(line) && !UNIT_PRICE_LINE_RE.test(line)) ?? '';
}

function findProductDescriptionText(value = '') {
  const lines = String(value)
    .split(/\r?\n+/)
    .map(normalizeText)
    .filter(Boolean);
  const start = lines.findIndex((line) => PACK_RE.test(line) && !UNIT_PRICE_LINE_RE.test(line));
  if (start < 0) return '';
  const description = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (/[€]/.test(line) || UNIT_PRICE_LINE_RE.test(line) || /(?:gültig|endet|noch\s+\d+\s+tage)/i.test(line)) break;
    if (/^(?:produktbeschreibung|preisdetails|angebotspreis|preis\s+pro\s+einheit)$/i.test(line)) break;
    description.push(line);
  }
  return normalizeText(description.join(' '));
}

function findPriceLabel(lines = []) {
  return lines.find((line) => /^(?:angebotspreis|aktionspreis|sonderpreis|ab\s+\d)/i.test(normalizeText(line))) ?? null;
}

function assessmentId(raw, market, name, price, packSize, validUntil) {
  const sourceIdentity = raw.cardId ?? raw.productId ?? raw.sourceId ?? raw.sourceUrl ?? '';
  return `${slug(market.key ?? market.label ?? market.store ?? 'markt')}:${stableHash(`${sourceIdentity}|${name}|${price}|${packSize ?? ''}|${validUntil ?? ''}`)}`;
}

function marketLabel(market) {
  return market.label ?? market.name ?? market.store ?? market.key ?? 'Unbekannter Markt';
}

export function assessOffer(raw = {}, market = {}, configInput = {}, fetchedAt = new Date().toISOString()) {
  const config = configInput.classification ? configInput : mergeConfig(configInput);
  const categoryScopeActive = config.categoryScopeActive === true && config.offerCategoryMode === 'include-all';
  const text = normalizeText(raw.text ?? [raw.name, raw.productDescription, raw.priceText, raw.packSizeText, raw.unitPriceText, raw.validityText].filter(Boolean).join('\n'));
  const lines = String(raw.text ?? text).split(/\r?\n/).map(normalizeText).filter(Boolean);
  const imageOcrRequired = config.imageOcr?.enabled === true && config.imageOcr?.required === true;
  const imageOcrBlocksPlanning = (imageOcrRequired && config.imageOcr?.blockPlanning === true)
    || (market.collectionMode === 'prospect' && imageOcrRequired);
  const imageProductStatus = raw.imageProductStatus ?? (imageOcrRequired ? 'missing' : 'not-required');
  const visibleName = chooseName(lines, raw.name);
  const name = visibleName ?? (raw.imageProductStatus === 'verified' ? chooseName([], raw.imageProductName ?? '') : null);
  const reportedPrice = raw.price == null ? null : Number(raw.price);
  const productDescription = normalizeText(raw.productDescription || findProductDescriptionText(raw.text ?? text)) || null;
  const packEvidenceText = [
    raw.packSizeText,
    productDescription,
    ...lines.filter((line) => PACK_RE.test(line) && !UNIT_PRICE_LINE_RE.test(line))
  ].filter(Boolean).join('\n');
  const pack = parsePackSize(packEvidenceText || findPackSizeText(raw.text ?? text));
  const unit = raw.unitPrice == null ? parseUnitPrice(raw.unitPriceText || findLine(lines, UNIT_PRICE_LINE_RE)) : { amount: Number(raw.unitPrice), unit: raw.unitPriceUnit ?? null, text: raw.unitPriceText ?? null };
  const kaufland = isKauflandMarket(market);
  const kauflandConditions = kaufland ? parseKauflandConditions(text) : {
    loyaltyPrice: null,
    loyaltyPriceText: null,
    loyaltyProgram: null,
    loyaltyActivationRequired: false,
    loyaltyPointsRequired: null,
    minimumPurchaseAmount: null,
    purchaseLimitText: null,
    discountPercent: null
  };
  const priceTextForParsing = kaufland && kauflandConditions.loyaltyPriceText
    ? text.replace(kauflandConditions.loyaltyPriceText, ' ')
    : raw.priceText || lines.join('\n');
  const priceDetails = raw.priceDetails ?? parsePriceDetails(priceTextForParsing);
  const explicitActivation = raw.activationRequired ?? (/(?:gutschein|coupon|rabatt)/i.test(text) && /(?:aktivieren|aktivierung erforderlich)/i.test(text));
  // Ein sichtbarer Standardpreis bleibt verwendbar, wenn nur der zusätzliche
  // XTRA-Preis erst nach Coupon-/Punkteeinlösung gilt.
  const activationRequired = Boolean(explicitActivation && !(kauflandConditions.loyaltyPrice != null && Number.isFinite(priceDetails.currentPrice)));
  const counterPrice = /(?:bedienungs[- ]?theke|frischetheke|an der theke|thekenware)/i.test(text);
  const explicitWeightBasis = /(?:je|pro|\/|€\s*\/\s*)\s*100\s*g\b/i.test(`${text} ${unit.text ?? ''}`)
    || unit.unit === '100 g';
  const weightUnitUnknown = counterPrice && !explicitWeightBasis && !Number.isFinite(unit.amount);
  const price = Number.isFinite(priceDetails.currentPrice)
    ? priceDetails.currentPrice
    : Number.isFinite(reportedPrice)
      ? reportedPrice
      : explicitWeightBasis && unit.unit === '100 g'
        ? unit.amount
        : null;
  const priceBasis = activationRequired
    ? 'conditional-coupon'
    : pack.count > 1
      ? 'multipack-total'
      : explicitWeightBasis
        ? 'price-per-100g'
        : weightUnitUnknown
          ? 'weight-based-unit-unknown'
          : 'offer-pack';
  const validity = raw.validity ?? parseValidity(raw.validityText || text, fetchedAt);
  const validFrom = raw.validFrom ?? validity.validFrom ?? null;
  const validUntil = raw.validUntil ?? raw.validTo ?? validity.validUntil ?? null;
  const sourceUrl = raw.sourceUrl ?? market.url ?? null;
  const classification = classifyFood(name ?? '', text, { ...config, includeTerms: market.includeTerms ?? config.includeTerms ?? [] });
  const recognized = Boolean(name && Number.isFinite(price));
  const fieldStatus = {
    product: name ? (imageOcrRequired && imageProductStatus !== 'verified' ? 'image-unverified' : 'visible') : 'missing',
    imageProduct: imageProductStatus,
    productDescription: productDescription ? 'visible' : 'missing',
    price: activationRequired || weightUnitUnknown ? 'needs-review' : Number.isFinite(price) ? 'visible' : 'missing',
    packSize: pack.ambiguous ? 'ambiguous' : pack.text && pack.value != null ? 'visible' : 'missing',
    unitPrice: Number.isFinite(unit.amount) ? 'visible' : 'missing',
    validity: validity.status,
    source: validUrl(sourceUrl) ? 'visible' : 'missing'
  };
  const evidence = {
    visibleText: normalizeText(raw.text ?? text).slice(0, 1200) || null,
    price: {
      visibleText: normalizeText(raw.priceText ?? '').slice(0, 400) || null,
      currentPrice: Number.isFinite(price) ? price : null,
      previousPrice: priceDetails.previousPrice,
      discountPercent: kauflandConditions.discountPercent,
      loyaltyPrice: kauflandConditions.loyaltyPrice,
      loyaltyProgram: kauflandConditions.loyaltyProgram,
      loyaltyActivationRequired: kauflandConditions.loyaltyActivationRequired,
      loyaltyPointsRequired: kauflandConditions.loyaltyPointsRequired,
      minimumPurchaseAmount: kauflandConditions.minimumPurchaseAmount,
      purchaseLimitText: kauflandConditions.purchaseLimitText,
      unitPrice: Number.isFinite(unit.amount) ? unit.amount : null,
      unitPriceUnit: unit.unit ?? null,
      basis: priceBasis,
      activationRequired: Boolean(activationRequired),
      weightUnitUnknown
    },
    packaging: {
      visibleText: normalizeText([raw.packSizeText, productDescription].filter(Boolean).join(' ')).slice(0, 400) || null,
      pack: pack.text,
      count: pack.count,
      itemValue: pack.itemValue,
      itemUnit: pack.itemUnit,
      status: fieldStatus.packSize
    },
    imageProduct: {
      status: imageProductStatus,
      recognizedName: imageProductStatus === 'verified' ? raw.imageProductName ?? name : null,
      confidence: Number.isFinite(Number(raw.imageOcrConfidence)) ? Number(raw.imageOcrConfidence) : null
    },
    market: {
      key: market.key ?? null,
      label: marketLabel(market),
      visibleLocation: raw.visibleLocation ?? null,
      locationStatus: raw.locationStatus ?? 'unknown'
    },
    validity: {
      visibleText: normalizeText(raw.validityText ?? validity.text ?? '').slice(0, 300) || null,
      status: validity.status,
      validFrom,
      validUntil
    },
    sourcePage: raw.sourcePage ?? null
  };
  const reasons = [];
  let state = 'unrecognized';
  if (!name) reasons.push('Produktname fehlt.');
  if (!Number.isFinite(price)) reasons.push('Angebotspreis fehlt oder ist ungültig.');
  if (pack.ambiguous) reasons.push('Mehrere Packungsgrößen sichtbar; Mengenangabe muss geprüft werden.');
  if (activationRequired) reasons.push('Rabatt erfordert eine Aktivierung; der Preis ist nicht ohne Weiteres verfügbar.');
  if (weightUnitUnknown) reasons.push('Gewichtsabhängiger Thekenpreis ohne erkennbare Bezugsmenge.');
  if (recognized && classification.label === 'nonfood') {
    state = 'rejected';
    reasons.push(...classification.reasons);
  } else if (recognized && !categoryScopeActive && classification.label === 'uncertain') {
    state = 'uncertain';
    reasons.push(...classification.reasons);
  } else if (recognized && !categoryScopeActive && Number.isFinite(config.maxPrice) && price > config.maxPrice) {
    state = 'rejected';
    reasons.push(`Preis über konfiguriertem Maximum (${config.maxPrice}).`);
  } else if (recognized) {
    state = 'accepted';
  }

  if (state !== 'accepted') {
    return {
      state,
      recognized,
      name,
      price: Number.isFinite(price) ? price : null,
      basePrice: raw.basePrice == null ? priceDetails.previousPrice : Number(raw.basePrice),
      previousPrice: priceDetails.previousPrice,
      discountAmount: priceDetails.discountAmount,
      discountPercent: kauflandConditions.discountPercent,
      priceType: priceDetails.type,
      priceEvidence: priceDetails,
      packSize: pack.text,
      unitPrice: Number.isFinite(unit.amount) ? unit.amount : null,
      validUntil,
      classification,
      fieldStatus,
      reasons,
      reviewItem: {
        id: assessmentId(raw, market, name ?? 'unbekannt', Number.isFinite(price) ? price : 'none', pack.text, validUntil),
        market: marketLabel(market),
        store: market.store ?? marketLabel(market),
        name,
        productDescription,
        price: Number.isFinite(price) ? price : null,
        packSize: pack.text,
        unitPrice: Number.isFinite(unit.amount) ? unit.amount : null,
        validUntil,
        sourceUrl,
        classification,
        fieldStatus,
        evidence,
        state,
        reasons,
      }
    };
  }

  // Für die Rezept- und Einkaufsplanung sind Produkt, aktueller Angebotspreis
  // und Packungs-/Mengenangabe die Pflichtangaben. Grundpreis und Gültigkeit
  // bleiben Zusatzdaten und schließen ein nutzbares Angebot nicht aus.
  const packBlocksPlanning = !categoryScopeActive && (!pack.text || pack.value == null || pack.ambiguous);
  const planningReady = Boolean(
    name && Number.isFinite(price) && !packBlocksPlanning && validUrl(sourceUrl) && !activationRequired && !weightUnitUnknown && !explicitWeightBasis
    && classification.label !== 'nonfood'
    && (categoryScopeActive || (classification.label === 'food' && classification.confidence === 'high'))
    && (!imageOcrBlocksPlanning || imageProductStatus === 'verified')
  );
  const complete = planningReady;
  const offer = {
    id: assessmentId(raw, market, name, price, pack.text, validUntil),
    market: marketLabel(market),
    marketKey: market.key ?? null,
    store: market.store ?? marketLabel(market),
    product: name,
    productDescription,
    price,
    priceLabel: raw.priceLabel || findPriceLabel(lines),
    basePrice: raw.basePrice == null ? priceDetails.previousPrice : Number(raw.basePrice),
    previousPrice: priceDetails.previousPrice,
    discountAmount: priceDetails.discountAmount,
    discountPercent: kauflandConditions.discountPercent,
    priceType: priceDetails.type,
    priceBasis,
    activationRequired: Boolean(activationRequired),
    loyaltyPrice: kauflandConditions.loyaltyPrice,
    loyaltyProgram: kauflandConditions.loyaltyProgram,
    loyaltyActivationRequired: kauflandConditions.loyaltyActivationRequired,
    loyaltyPointsRequired: kauflandConditions.loyaltyPointsRequired,
    minimumPurchaseAmount: kauflandConditions.minimumPurchaseAmount,
    purchaseLimitText: kauflandConditions.purchaseLimitText,
    planningStatus: planningReady ? 'ready' : 'needs-review',
    currency: raw.currency ?? 'EUR',
    packSize: pack.text,
    pack: pack.text,
    packSizeValue: pack.value,
    packSizeUnit: pack.unit,
    packCount: pack.count,
    unitPrice: Number.isFinite(unit.amount) ? unit.amount : null,
    unitPriceUnit: unit.unit,
    unitPriceText: unit.text,
    sourceUrl,
    sourcePage: raw.sourcePage ?? null,
    source: 'kaufda-visible-public-page',
    sourceId: raw.cardId ?? raw.productId ?? raw.sourceId ?? null,
    capturedAt: fetchedAt,
    fetchedAt,
    validFrom,
    validUntil,
    validTo: validUntil,
    classification,
    fieldStatus,
    evidence,
    reviewStatus: complete ? 'ready' : 'needs-review',
    status: complete ? 'verified' : 'needs-review',
  };
  return { state, recognized, offer, classification, fieldStatus, reasons, reviewItem: null };
}

export function selectPublishedOffer(offer = {}) {
  return Object.fromEntries(PUBLISHED_OFFER_FIELDS.map((field) => [field, offer[field] ?? null]));
}

export function normalizeOffer(raw, market, config = {}) {
  return assessOffer(raw, market, config).offer ?? null;
}

export function dedupeOffers(offers = []) {
  const seen = new Set();
  return offers.filter((offer) => {
    const key = [
      offer.marketKey ?? offer.market,
      offer.sourceId ?? offer.sourceUrl ?? '',
      slug(offer.product ?? offer.name),
      offer.price ?? '',
      offer.pack ?? offer.packSize ?? '',
      offer.validUntil ?? offer.validTo ?? ''
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readKaufdaSnapshot(page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText ?? '';
    const bodyLines = bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const locationText = bodyLines.find((line) => /\bkm\b/i.test(line) && /,/.test(line)) || null;
    const visiblePackRe = /\b(?:\d+\s*[x×]\s*)?\d+(?:[,.]\d+)?\s*[- ]?(?:kg|g|l|ml|cl|stück|stk\.?|pack(?:ung)?|portion(?:en)?)(?:\s*[- ]?(?:packg?\.?|packung))?\b/i;
    const visibleUnitPriceLineRe = /(?:pro\s+einheit|(?:kg|g|l|ml|cl|stück|stk\.?)\s*(?:=|[- ]?preis)|\/\s*(?:100\s*(?:g|ml)|kg|g|l|ml|cl|stück|stk\.?|liter)|€\s*\/\s*(?:100\s*(?:g|ml)|kg|g|l|ml|cl|stück|stk\.?|liter)|je\s+(?:100\s*(?:g|ml)|kg|g|l|ml|cl|liter|stück))/i;
    const findProductDescription = (lines) => {
      const start = lines.findIndex((line) => visiblePackRe.test(line) && !visibleUnitPriceLineRe.test(line));
      if (start < 0) return '';
      const description = [lines[start]];
      for (const line of lines.slice(start + 1)) {
        if (/€/.test(line) || visibleUnitPriceLineRe.test(line) || /(?:gültig|endet|noch\s+\d+\s+tage)/i.test(line)) break;
        if (/^(?:produktbeschreibung|preisdetails|angebotspreis|preis\s+pro\s+einheit)$/i.test(line)) break;
        description.push(line);
      }
      return description.join(' ').replace(/\s+/g, ' ').trim();
    };
    const findPriceLabel = (lines) => lines.find((line) => /^(?:angebotspreis|aktionspreis|sonderpreis|ab\s+\d)/i.test(line.trim())) || null;
    const selectors = [
      '[data-testid*="offer"]', '[data-testid*="Offer"]',
      '[data-testid*="product"]', '[data-testid*="Product"]',
      '[class*="offer-card"]', '[class*="OfferCard"]',
      '[class*="product-card"]', '[class*="ProductCard"]',
      'a[href*="productId"]',
      'article', 'li'
    ];
    const candidates = [];
    const seenElements = new Set();
    const add = (element) => {
      if (seenElements.has(element)) return;
      seenElements.add(element);
      const text = (element.innerText ?? '').trim();
      const productImages = [...element.querySelectorAll('img')].filter((item) => {
        const alt = (item.alt || item.title || '').trim();
        const source = item.currentSrc || item.src || '';
        return Boolean(source) && !/(logo|einkaufsliste|hinzufügen|placeholder|fallback)/i.test(`${alt} ${source}`);
      });
      const image = productImages[0];
      if (!image || !/€/.test(text) || text.length < 8 || text.length > 1600) return;
      if (productImages.length > 3 || (text.match(/€/g) ?? []).length > 6 || text.length > 700) return;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      candidates.push({ element, text, image });
    };
    for (const selector of selectors) for (const element of document.querySelectorAll(selector)) add(element);
    // Kaufland/KaufDA können innerhalb eines gemischten Rasters sowohl
    // semantische Karten als auch generische div-Karten ausliefern. Ein
    // erfolgreicher Treffer mit nur wenigen Kacheln darf den Fallback nicht
    // für alle übrigen div-Karten abschalten.
    for (const element of document.querySelectorAll('div')) add(element);

    const cards = [];
    const seen = new Set();
    for (const item of candidates) {
      const lines = item.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      const explicitName = item.element.querySelector(
        '[data-testid*="name"], [data-testid*="title"], [class*="offer-name"], [class*="product-name"], h2, h3, h4'
      )?.textContent?.trim() || item.image.alt?.trim() || item.image.title?.trim() || null;
      const sourceId = item.element.getAttribute('data-offer-id')
        || item.element.getAttribute('data-product-id')
        || item.element.getAttribute('data-id')
        || null;
      const sourceUrl = item.element.querySelector('a[href]')?.href || (item.element.matches('a[href]') ? item.element.href : location.href);
      let productId = null;
      try { productId = new URL(sourceUrl).searchParams.get('productId'); } catch (_) { /* visible URL may be relative */ }
      const priceText = lines
        .filter((line) => /€/.test(line) && !visibleUnitPriceLineRe.test(line))
        .join(' ');
      const productDescriptionText = findProductDescription(lines);
      const priceLabel = findPriceLabel(lines);
      const unitPriceText = lines.find((line) => /pro Einheit|kg\s*=|l\s*=|kg[- ]?Preis|l[- ]?Preis|\/kg|\/l/i.test(line)) || '';
      const validityText = lines.find((line) => /gültig|endet|noch\s+\d+\s+tage/i.test(line)) || '';
      const packSizeText = productDescriptionText || lines.find((line) => visiblePackRe.test(line) && !visibleUnitPriceLineRe.test(line)) || '';
      const key = `${sourceId ?? ''}|${item.text}|${sourceUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({
        cardId: sourceId || productId,
        sourceUrl,
        imageUrl: item.image.currentSrc || item.image.src || null,
        text: item.text,
        name: explicitName,
        productDescription: productDescriptionText,
        priceText,
        priceLabel,
        packSizeText,
        unitPriceText,
        validityText,
        cardKey: key
      });
    }
    return { bodyText, pageUrl: location.href, locationText, cards };
  });
}

function productIdFromUrl(value) {
  try {
    return new URL(value).searchParams.get('productId');
  } catch (_) {
    return null;
  }
}

async function activateOfferCategory(page, market, config) {
  const label = market.offerCategory ?? config.offerCategory ?? null;
  if (!label) return { label: null, status: 'not-configured' };

  const category = page.getByText(label, { exact: true }).first();
  if (!await category.count()) return { label, status: 'unavailable' };
  try {
    await category.scrollIntoViewIfNeeded().catch(() => {});
    await category.click({ timeout: market.offerCategoryTimeoutMs ?? 10000 });
    await page.waitForTimeout(market.afterOfferCategoryWaitMs ?? 1200);
    return { label, status: 'selected' };
  } catch (error) {
    return {
      label,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readKaufdaDetailSnapshot(page, sourceUrl, detailConfig) {
  if (!isKaufdaSourceUrl(sourceUrl) || !productIdFromUrl(sourceUrl)) return { skipped: true };
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: detailConfig.navigationTimeoutMs });
    await page.waitForTimeout(detailConfig.waitMs);
    const detailReady = await page.waitForFunction(
      () => /Produktbeschreibung|Preisdetails/i.test(document.body?.innerText ?? ''),
      null,
      { timeout: detailConfig.fieldTimeoutMs ?? detailConfig.navigationTimeoutMs }
    ).then(() => true).catch(() => false);
    if (!detailReady) return { skipped: false, error: 'KaufDA-Detailfelder wurden nicht sichtbar.' };
    const fields = await page.evaluate(() => {
      const lines = (document.body?.innerText ?? '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
      const productStart = lines.findIndex((line) => /^produktbeschreibung$/i.test(line));
      const priceStart = lines.findIndex((line) => /^preisdetails$/i.test(line));
      const noteStart = lines.findIndex((line) => /^irrtümer und änderungen vorbehalten/i.test(line));
      const productEnd = productStart >= 0 ? (priceStart > productStart ? priceStart : lines.length) : -1;
      const priceEnd = priceStart >= 0 ? (noteStart > priceStart ? noteStart : lines.length) : lines.length;
      const productDescription = productStart >= 0
        ? lines.slice(productStart + 1, productEnd).join(' ').replace(/\s+/g, ' ').trim()
        : '';
      const priceSection = lines.slice(priceStart >= 0 ? priceStart + 1 : 0, priceEnd);
      const unitPriceLine = /(?:pro\s+einheit|(?:kg|g|l|ml|cl|stück|stk\.?)\s*(?:=|[- ]?preis)|\/\s*(?:kg|g|l|ml|cl|stück|stk\.?))/i;
      const priceLines = priceSection.filter((line) => /€/.test(line) && !unitPriceLine.test(line));
      const discountLines = lines.filter((line) => /€/.test(line) && /sparen/i.test(line));
      const priceText = [...new Set([...discountLines, ...priceLines])].join(' ');
      const unitPriceText = priceSection.find((line) => unitPriceLine.test(line)) || '';
      const priceLabel = priceSection.find((line) => /^(?:angebotspreis|aktionspreis|sonderpreis)$/i.test(line)) || null;
      const validityText = lines.find((line) => /(?:gültig|endet|noch\s+\d+\s+tage)/i.test(line)) || '';
      return { productDescription, priceText, priceLabel, unitPriceText, validityText };
    });
    return { skipped: false, ...fields };
  } catch (error) {
    return { skipped: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function enrichCardsFromImages(cards, config) {
  const imageOcr = config.imageOcr ?? DEFAULT_CONFIG.imageOcr;
  if (imageOcr.enabled !== true) {
    return {
      cards,
      attempted: 0,
      failed: 0,
      verified: 0
    };
  }
  try {
    const { enrichCardsWithImageOcr } = await import('./image-ocr.mjs');
    return await enrichCardsWithImageOcr(cards, imageOcr);
  } catch (error) {
    return {
      cards: cards.map((card) => ({
        ...card,
        imageProductStatus: 'failed',
        imageOcrError: error instanceof Error ? error.message : String(error)
      })),
      attempted: cards.length,
      failed: cards.length,
      verified: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function enrichCardsFromDetails(page, cards, market, config, fetchedAt) {
  const detailConfig = config.detail ?? DEFAULT_CONFIG.detail;
  if (detailConfig.enabled === false) return { cards, attempted: 0, failed: 0 };
  const candidates = cards
    .map((raw) => ({ raw, initial: assessOffer(raw, market, config, fetchedAt) }))
    .filter(({ raw, initial }) => {
      const knownUncertainFoodName = initial.state === 'uncertain'
        && termsFound(raw.name ?? '', config.classification.uncertainTerms).length > 0;
      return initial.recognized && (initial.state === 'accepted' || knownUncertainFoodName) && productIdFromUrl(raw.sourceUrl);
    });
  if (!candidates.length) return { cards, attempted: 0, failed: 0 };

  let cursor = 0;
  let failed = 0;
  const enriched = new Map();
  const worker = async () => {
    const detailPage = await page.context().newPage();
    try {
      while (true) {
        const index = cursor++;
        if (index >= candidates.length) break;
        const { raw } = candidates[index];
        const detail = await readKaufdaDetailSnapshot(detailPage, raw.sourceUrl, detailConfig);
        if (detail.error) {
          failed += 1;
          continue;
        }
        const detailText = [detail.productDescription, detail.priceText, detail.unitPriceText, detail.validityText].filter(Boolean).join('\n');
        enriched.set(rawCardKey(raw), {
          ...raw,
          productDescription: detail.productDescription || raw.productDescription || '',
          priceText: detail.priceText || raw.priceText || '',
          priceLabel: detail.priceLabel ?? raw.priceLabel ?? null,
          unitPriceText: detail.unitPriceText || raw.unitPriceText || '',
          validityText: detail.validityText || raw.validityText || '',
          text: [raw.text, detailText].filter(Boolean).join('\n')
        });
      }
    } finally {
      await detailPage.close();
    }
  };
  const workerCount = Math.min(Math.max(1, Number(detailConfig.concurrency) || 1), candidates.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return {
    cards: cards.map((raw) => enriched.get(rawCardKey(raw)) ?? raw),
    attempted: candidates.length,
    failed
  };
}

function rawCardKey(raw) {
  return raw.cardKey ?? `${raw.cardId ?? ''}|${raw.sourceUrl ?? ''}|${raw.name ?? ''}|${raw.priceText ?? ''}|${raw.packSizeText ?? ''}`;
}

export async function collectOffersFromPage(page, market, configInput = {}, expectedCountHint = null, expectedCountKindHint = null) {
  const config = mergeConfig(configInput);
  const scroll = { ...DEFAULT_CONFIG.scroll, ...(config.scroll ?? {}) };
  let expectedCount = expectedCountHint;
  let expectedCountKind = expectedCountKindHint;
  let pass = 0;
  let stableAtEnd = 0;
  let scrollExhausted = false;
  let previousCardCount = -1;
  const rawCards = new Map();
  let lastSnapshot = { bodyText: '', cards: [] };

  const addSnapshot = (snapshot) => {
    lastSnapshot = snapshot;
    const measurement = parseOfferCountDetails(snapshot.bodyText);
    if (measurement.kind === 'prospect-pages') {
      expectedCount = measurement.count;
      expectedCountKind = measurement.kind;
    } else {
      if (expectedCount == null && measurement.count != null) expectedCount = measurement.count;
      if (!expectedCountKind && measurement.kind) expectedCountKind = measurement.kind;
    }
    for (const card of snapshot.cards) {
      rawCards.set(rawCardKey(card), {
        ...card,
        sourcePage: card.sourcePage ?? snapshot.pageUrl ?? null,
        visibleLocation: card.visibleLocation ?? snapshot.locationText ?? null,
        locationStatus: card.locationStatus ?? matchVisibleLocation(snapshot.locationText, market.location ?? config.location)
      });
    }
  };

  while (pass < scroll.maxPasses) {
    addSnapshot(await readKaufdaSnapshot(page));
    const loadedCardCount = rawCards.size;
    if (expectedCountKind !== 'prospect-pages' && expectedCount != null && expectedCount > 0 && loadedCardCount >= expectedCount) break;
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
    if (stableAtEnd >= scroll.stablePassesAtEnd) {
      scrollExhausted = true;
      break;
    }
    pass += 1;
  }

  addSnapshot(await readKaufdaSnapshot(page));
  const fetchedAt = new Date().toISOString();
  const visibleLocation = lastSnapshot.locationText ?? null;
  const expectedLocation = market.location ?? config.location;
  const locationStatus = matchVisibleLocation(visibleLocation, expectedLocation);
  const imageScan = locationStatus === 'mismatch'
    ? { cards: [...rawCards.values()], attempted: 0, failed: 0, verified: 0 }
    : await enrichCardsFromImages([...rawCards.values()], config);
  const detailScan = locationStatus === 'mismatch'
    ? { cards: imageScan.cards, attempted: 0, failed: 0 }
    : await enrichCardsFromDetails(page, imageScan.cards, market, config, fetchedAt);
  const assessments = detailScan.cards.map((raw) => assessOffer(raw, market, config, fetchedAt));
  const scannedOffers = dedupeOffers(assessments.map((item) => item.offer).filter(Boolean));
  const offers = locationStatus === 'mismatch' ? [] : scannedOffers.map((offer) => locationStatus === 'matched'
    ? { ...offer, marketLocationStatus: 'matched' }
    : { ...offer, marketLocationStatus: 'unknown', planningStatus: 'needs-review', status: 'needs-review', reviewStatus: 'needs-review' });
  const reviewItems = assessments.map((item) => item.reviewItem).filter(Boolean).slice(0, config.maxReviewItems);
  const recognizedOfferCount = assessments.filter((item) => item.recognized).length;
  const categoryScopeActive = config.categoryScopeActive === true && config.offerCategoryMode === 'include-all';
  const uncertainCount = assessments.filter((item) => item.classification?.label === 'uncertain').length;
  const rejectedCount = assessments.filter((item) => item.classification?.label === 'nonfood' || item.state === 'rejected').length;
  const unrecognizedCount = assessments.filter((item) => item.state === 'unrecognized').length;
  const loadedCardCount = rawCards.size;
  const targetReached = Boolean(expectedCountKind !== 'prospect-pages' && expectedCount != null && expectedCount > 0 && loadedCardCount >= expectedCount && lastSnapshot.cards.length > 0);
  const warnings = [];
  const errors = [];
  if (!lastSnapshot.cards.length) warnings.push('Keine sichtbaren Angebotskarten erkannt; KaufDA-Struktur möglicherweise geändert.');
  if (config.imageOcr?.enabled === true && imageScan.failed) warnings.push(`${imageScan.failed} Angebotsbilder konnten nicht per OCR gelesen werden; betroffene Produktnamen bleiben prüfpflichtig.`);
  if (config.imageOcr?.enabled === true && imageScan.attempted && imageScan.verified < imageScan.attempted) warnings.push(`${imageScan.attempted - imageScan.verified} Angebotsbilder konnten den Produktnamen nicht sicher bestätigen.`);
  if (detailScan.failed) warnings.push(`${detailScan.failed} Detailansichten konnten nicht gelesen werden; betroffene Felder bleiben prüfpflichtig.`);
  if (expectedCount == null) warnings.push('KaufDA-Zielzahl der Angebote war nicht sichtbar; Vollständigkeit ist nicht messbar.');
  if (expectedCountKind === 'prospect-pages') warnings.push(`KaufDA zeigt ${expectedCount} Prospektseiten. Diese Zahl ist keine Sollzahl für Angebotskacheln. ${scrollExhausted ? 'Die Kachelliste wurde bis zum stabilen Scroll-Ende erfasst.' : 'Die Kachelliste wurde nicht nachweislich bis zum Ende erfasst.'} Fehlende Produkte sind kein negatives Angebotsergebnis.`);
  else if (expectedCount != null && !targetReached) warnings.push(`Zielzahl nicht erreicht: ${loadedCardCount}/${expectedCount} Karten.`);
  if (!targetReached && !scrollExhausted) warnings.push('Die Kachelliste erreichte kein stabiles Scroll-Ende; die Erfassung ist unvollständig.');
  if (uncertainCount && categoryScopeActive) warnings.push(`${uncertainCount} Karten haben eine unsichere Wortlistenklassifikation; die ausgewählte KaufDA-Kategorie bleibt für den Angebotsumfang maßgeblich.`);
  else if (uncertainCount) warnings.push(`${uncertainCount} erkannte Karten bleiben wegen unsicherer Lebensmittelklassifikation in der Prüfung.`);
  if (locationStatus === 'unknown') warnings.push('Sichtbarer Marktstandort fehlt oder konnte nicht sicher gelesen werden; Angebote bleiben prüfpflichtig.');
  if (locationStatus === 'mismatch') {
    const expectedLabel = [expectedLocation.city, expectedLocation.zip].filter(Boolean).join(' ');
    errors.push(`Sichtbarer KaufDA-Standort passt nicht zur Zielregion ${expectedLabel || '(unbekannt)'}; Angebote dieses Marktes werden nicht veröffentlicht.`);
  }
  return {
    offers,
    reviewItems,
    expectedCardCount: expectedCountKind === 'cards' ? expectedCount : null,
    expectedPageCount: expectedCountKind === 'prospect-pages' ? expectedCount : null,
    expectedCountKind,
    expectedCount,
    pageUrl: lastSnapshot.pageUrl ?? null,
    visibleLocation,
    expectedLocation,
    locationStatus,
    categoryScoped: categoryScopeActive,
    categoryOfferCount: offers.length,
    loadedCardCount,
    imageOcrAttempted: imageScan.attempted,
    imageOcrVerified: imageScan.verified,
    imageOcrFailed: imageScan.failed,
    recognizedOfferCount,
    foodOfferCount: offers.length,
    uncertainCount,
    rejectedCount,
    unrecognizedCount,
    passes: pass + 1,
    targetReached,
    scrollExhausted,
    completenessStatus: marketCollectionStatus({ loadedCardCount, locationStatus, targetReached, scrollExhausted, expectedCountKind }),
    errors: !lastSnapshot.cards.length
      ? ['Keine sichtbaren Angebotskarten erkannt; KaufDA-Struktur oder Einstiegsseite möglicherweise geändert.', ...errors]
      : errors,
    warnings
  };
}

export async function collectProspectOffersFromPage(page, market, configInput = {}, { debugProspect = false } = {}) {
  const config = mergeConfig(configInput);
  const waitMs = Math.max(0, Number(market.prospectPageWaitMs ?? 900));
  const initialText = await page.locator('body').innerText().catch(() => '');
  const viewerCounter = await page.evaluate(() => [...document.querySelectorAll('button')]
    .map((button) => button.innerText || button.getAttribute('aria-label') || '')
    .find((value) => /^\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?\s*\/\s*\d{1,3}\s*$/.test(value)) ?? '');
  const countMatch = viewerCounter.match(/\b\d{1,3}\s*\/\s*(\d{1,3})\b/)
    ?? initialText.match(/\b(?:seite|page)\s+\d+\s+(?:von|of)\s+(\d{1,3})\b/i);
  const expectedPageCount = Number(countMatch?.[1]);
  const visibleLocation = (await page.evaluate(() => document.body?.innerText ?? '')).split(/\n+/)
    .map((line) => line.trim()).find((line) => /\bkm\b/i.test(line) && /,/.test(line)) ?? null;
  const locationStatus = matchVisibleLocation(visibleLocation, market.location ?? config.location);
  const warnings = [];
  const errors = [];
  const ocrDiagnostics = {
    pageSpreads: 0,
    ocrLines: 0,
    productRegions: 0,
    assignedLines: 0,
    regionsWithAssignedLines: 0,
    priceLines: 0,
    assignedPriceLines: 0,
    packLines: 0,
    assignedPackLines: 0,
    verifiedProductRegions: 0,
    pageDetails: [],
    debugPages: []
  };
  if (!Number.isInteger(expectedPageCount) || expectedPageCount < 1) {
    return {
      offers: [], reviewItems: [], expectedPageCount: null, expectedCountKind: 'prospect-pages',
      loadedCardCount: 0, recognizedOfferCount: 0, unrecognizedCount: 0, pageTraversalStatus: 'failed',
      visibleLocation, locationStatus, targetReached: false, scrollExhausted: false,
      completenessStatus: 'failed', warnings, errors: ['Prospekt-Seitenzahl ist im sichtbaren Viewer nicht erkennbar.']
    };
  }
  if (locationStatus === 'mismatch') errors.push('Der sichtbare KaufDA-Standort passt nicht zum konfigurierten Kaufland-Markt.');
  const { createImageTextReader, matchImageProductName } = await import('./image-ocr.mjs');
  const reader = await createImageTextReader({ language: config.imageOcr?.language ?? 'deu+eng' });
  const collected = [];
  let visitedPageCount = 0;
  let failedPageCount = 0;
  let pageWithNoProductLinks = 0;
  try {
    const firstUrl = new URL(page.url());
    for (let pageNumber = 1; pageNumber <= expectedPageCount; pageNumber += 2) {
      const pageUrl = new URL(firstUrl);
      pageUrl.searchParams.set('page', String(pageNumber));
      try {
        await page.goto(pageUrl.href, { waitUntil: 'domcontentloaded', timeout: market.navigationTimeoutMs ?? 30000 });
        await page.waitForTimeout(waitMs);
        const regions = await page.evaluate(() => [...document.querySelectorAll('a[id^="overlay-"], a[aria-description*="Link"]')]
          .map((anchor) => {
            const rect = anchor.getBoundingClientRect();
            const image = anchor.querySelector('img');
            const label = anchor.getAttribute('aria-label')
              || anchor.getAttribute('aria-description')
              || anchor.getAttribute('title')
              || anchor.innerText
              || image?.alt
              || image?.title
              || '';
            return {
              id: anchor.id || anchor.href,
              name: String(label).replace(/\s+/g, ' ').trim(),
              href: anchor.href,
              x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              visible: rect.width > 12 && rect.height > 12 && rect.bottom > 0 && rect.right > 0
                && rect.top < innerHeight && rect.left < innerWidth && rect.right < innerWidth * 0.82
            };
          })
          .filter((region) => region.visible && region.name.length >= 2 && region.width * region.height > 1200));
        const screenshot = await page.screenshot({ type: 'png', scale: 'css' });
        const viewport = page.viewportSize();
        const ocrLines = scaleOcrLinesToViewport(await reader.recognize(screenshot, { tessedit_pageseg_mode: '11' }), screenshot, viewport);
        const grouped = assignOcrLinesToRegions(ocrLines, regions);
        const assignedLines = grouped.flatMap((region) => region.ocrLines);
        const isPriceLine = (line) => /\d+(?:[,.]\d{1,2})?\s*€/.test(line.text) && !UNIT_PRICE_LINE_RE.test(line.text);
        const isPackLine = (line) => (PACK_RE.test(line.text) || PACK_RANGE_RE.test(line.text)) && !UNIT_PRICE_LINE_RE.test(line.text);
        const pageDetails = {
          firstPage: pageNumber,
          lastPage: Math.min(expectedPageCount, pageNumber + 1),
          ocrLineCount: ocrLines.length,
          productRegionCount: grouped.length,
          assignedLineCount: assignedLines.length,
          regionsWithAssignedLines: grouped.filter((region) => region.ocrLines.length).length,
          priceLineCount: ocrLines.filter(isPriceLine).length,
          assignedPriceLineCount: assignedLines.filter(isPriceLine).length,
          packLineCount: ocrLines.filter(isPackLine).length,
          assignedPackLineCount: assignedLines.filter(isPackLine).length,
          verifiedProductRegionCount: 0
        };
        ocrDiagnostics.pageSpreads += 1;
        ocrDiagnostics.ocrLines += pageDetails.ocrLineCount;
        ocrDiagnostics.productRegions += pageDetails.productRegionCount;
        ocrDiagnostics.assignedLines += pageDetails.assignedLineCount;
        ocrDiagnostics.regionsWithAssignedLines += pageDetails.regionsWithAssignedLines;
        ocrDiagnostics.priceLines += pageDetails.priceLineCount;
        ocrDiagnostics.assignedPriceLines += pageDetails.assignedPriceLineCount;
        ocrDiagnostics.packLines += pageDetails.packLineCount;
        ocrDiagnostics.assignedPackLines += pageDetails.assignedPackLineCount;
        if (debugProspect && pageNumber === 3) {
          const lineKey = (line) => `${line.text}|${line.box.x},${line.box.y},${line.box.width},${line.box.height}`;
          const assignedKeys = new Set(assignedLines.map(lineKey));
          ocrDiagnostics.debugPages.push({
            firstPage: pageNumber,
            lastPage: Math.min(expectedPageCount, pageNumber + 1),
            pageSegmentationMode: 'sparse-text',
            ocrLines: ocrLines.map((line) => ({
              text: line.text,
              confidence: line.confidence,
              box: line.box,
              assigned: assignedKeys.has(lineKey(line))
            })),
            regions: grouped.map((region) => ({
              name: region.name,
              box: { x: region.x, y: region.y, width: region.width, height: region.height },
              text: region.text,
              ocrLines: region.ocrLines
            }))
          });
        }
        const medianX = grouped.length ? [...grouped].map((region) => region.x + region.width / 2).sort((a, b) => a - b)[Math.floor(grouped.length / 2)] : (page.viewportSize()?.width ?? 870) / 2;
        const headerBySide = ['left', 'right'].map((side) => {
          const sideRegions = grouped.filter((region) => (region.x + region.width / 2 < medianX) === (side === 'left'));
          const topY = sideRegions.length ? Math.min(...sideRegions.map((region) => region.y)) : 280;
          const headerLines = ocrLines.filter((line) => {
            const centerX = line.box.x + line.box.width / 2;
            const centerY = line.box.y + line.box.height / 2;
            return (centerX < medianX) === (side === 'left') && centerY < Math.max(260, topY + 28);
          }).map((line) => line.text);
          return normalizeText(headerLines.join(' '));
        });
        let pageLinkCount = 0;
        for (const region of grouped) {
          pageLinkCount += 1;
          const side = region.x + region.width / 2 < medianX ? 0 : 1;
          const pageValidityText = headerBySide[side];
          const validityText = /\d{1,2}\.\d{1,2}/.test(region.text) ? region.text : pageValidityText;
          const imageMatch = matchImageProductName({
            cardName: region.name,
            ocrLines: region.ocrLines,
            minConfidence: config.imageOcr?.minConfidence
          });
          if (imageMatch.status === 'verified') pageDetails.verifiedProductRegionCount += 1;
          const productName = normalizeProspectProductName(region.name, imageMatch);
          const sourcePageNumber = Math.min(expectedPageCount, pageNumber + side);
          const sourcePage = new URL(pageUrl);
          sourcePage.searchParams.set('page', String(sourcePageNumber));
          const raw = {
            cardId: `${region.id}:page-${sourcePageNumber}`,
            name: productName,
            text: [region.name, region.text, validityText].filter(Boolean).join('\n'),
            priceText: region.text,
            validityText,
            sourceUrl: region.href && isKaufdaSourceUrl(region.href) ? region.href : pageUrl.href,
            sourcePage: sourcePage.href,
            imageProductName: imageMatch.status === 'verified' ? productName : imageMatch.imageProductName,
            imageProductStatus: imageMatch.status,
            imageOcrConfidence: imageMatch.confidence,
            visibleLocation,
            locationStatus
          };
          const assessment = assessOffer(raw, market, { ...config, categoryScopeActive: false }, new Date().toISOString());
          if (assessment.offer && locationStatus !== 'mismatch') {
            collected.push(locationStatus === 'matched' ? { ...assessment.offer, marketLocationStatus: 'matched' } : {
              ...assessment.offer, marketLocationStatus: 'unknown', planningStatus: 'needs-review', status: 'needs-review', reviewStatus: 'needs-review'
            });
          } else if (assessment.reviewItem) {
            collected.push({ reviewItem: assessment.reviewItem });
          }
        }
        ocrDiagnostics.verifiedProductRegions += pageDetails.verifiedProductRegionCount;
        ocrDiagnostics.pageDetails.push(pageDetails);
        if (!pageLinkCount) pageWithNoProductLinks += 1;
        visitedPageCount += 2;
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
    if (market.interpretationProfile && (!isKaufland || market.interpretationProfile !== 'kaufland-v1')) errors.push(`markets[${index}].interpretationProfile ist nur mit kaufland-v1 auf Kaufland zulässig`);
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
