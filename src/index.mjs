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
  'price', 'priceLabel', 'currency', 'discountAmount', 'basePrice', 'previousPrice', 'priceType',
  'pack', 'packSize', 'packSizeValue', 'packSizeUnit', 'packCount',
  'unitPrice', 'unitPriceUnit', 'unitPriceText',
  'validFrom', 'validUntil', 'validTo',
  'sourceUrl', 'source', 'sourceId', 'capturedAt', 'fetchedAt',
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
const DATE_TOKEN = '(\\d{1,2}\\.\\d{1,2}(?:\\.\\d{2,4})?)';
const DATE_RE = new RegExp(`(?:gültig|gültigkeit)(?:\\s+bis)?\\s*[:\\-]?\\s*${DATE_TOKEN}`, 'i');
const RANGE_RE = new RegExp(`${DATE_TOKEN}\\s*(?:-|–|bis)\\s*${DATE_TOKEN}`, 'i');
const PACK_RE = /\b(?:\d+\s*[x×]\s*)?\d+(?:[,.]\d+)?\s*[- ]?(?:kg|g|l|ml|cl|stück|stk\.?|pack(?:ung)?|portion(?:en)?)(?:\s*[- ]?(?:packg?\.?|packung))?\b/i;
const PACK_RANGE_RE = /((?:\d+(?:[,.]\d+)?\s*[-–]\s*,?\s*(?:bzw\.?\s*)?)+\d+(?:[,.]\d+)?\s*[- ]?(?:kg|g|l|ml|cl|stück|stk\.?|packung|packg\.?|portion(?:en)?)(?:\s*[- ]?(?:packung|packg\.?))?)/i;
const UNIT_PRICE_RE = /(?:1\s*)?(kg|g|l|ml|cl|stück|stk\.?)\s*=\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*€?/i;
const UNIT_PRICE_LINE_RE = /(?:pro\s+einheit|(?:kg|g|l|ml|cl|stück|stk\.?)\s*(?:=|[- ]?preis)|\/\s*(?:kg|g|l|ml|cl|stück|stk\.?))/i;

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
      || ((candidate.length > 3 || candidate === 'tee') && token.length - candidate.length >= 2
        && (token.startsWith(candidate) || token.endsWith(candidate))));
  });
}

export function mergeConfig(input = {}) {
  const classification = input.classification ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...input,
    location: { ...DEFAULT_CONFIG.location, ...(input.location ?? {}) },
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

export async function loadConfig(filePath = 'kaufda-parser.config.json') {
  const raw = await fs.readFile(filePath, 'utf8');
  return mergeConfig(JSON.parse(raw));
}

export function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
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
  const text = normalizeText(value);
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

export function parseDate(value, referenceDate = new Date()) {
  const match = normalizeText(value).match(DATE_RE);
  if (!match) return null;
  const [day, month, rawYear] = match[1].split('.').map(Number);
  const reference = new Date(referenceDate);
  const year = rawYear == null ? reference.getUTCFullYear() : rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
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
  const match = text.match(UNIT_PRICE_RE);
  if (match) return { amount: parseGermanNumber(match[2]), unit: match[1].replace('.', '').toLocaleLowerCase('de-DE'), text };
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
  const text = normalizeText(raw.text ?? [raw.name, raw.productDescription, raw.priceText, raw.packSizeText, raw.unitPriceText, raw.validityText].filter(Boolean).join('\n'));
  const lines = String(raw.text ?? text).split(/\r?\n/).map(normalizeText).filter(Boolean);
  const name = chooseName(lines, raw.name);
  const priceDetails = raw.priceDetails ?? parsePriceDetails(raw.priceText || text);
  const reportedPrice = raw.price == null ? null : Number(raw.price);
  const price = Number.isFinite(priceDetails.currentPrice) ? priceDetails.currentPrice : reportedPrice;
  const productDescription = normalizeText(raw.productDescription || findProductDescriptionText(raw.text ?? text)) || null;
  const pack = parsePackSize(raw.packSizeText || productDescription || findPackSizeText(raw.text ?? text));
  const unit = raw.unitPrice == null ? parseUnitPrice(raw.unitPriceText || findLine(lines, /pro Einheit|kg\s*=|l\s*=|kg[- ]?Preis|l[- ]?Preis|\/kg|\/l/i)) : { amount: Number(raw.unitPrice), unit: raw.unitPriceUnit ?? null, text: raw.unitPriceText ?? null };
  const validity = raw.validity ?? parseValidity(raw.validityText || text, fetchedAt);
  const validFrom = raw.validFrom ?? validity.validFrom ?? null;
  const validUntil = raw.validUntil ?? raw.validTo ?? validity.validUntil ?? null;
  const sourceUrl = raw.sourceUrl ?? market.url ?? null;
  const classification = classifyFood(name ?? '', text, { ...config, includeTerms: market.includeTerms ?? config.includeTerms ?? [] });
  const recognized = Boolean(name && Number.isFinite(price));
  const fieldStatus = {
    product: name ? 'visible' : 'missing',
    productDescription: productDescription ? 'visible' : 'missing',
    price: Number.isFinite(price) ? 'visible' : 'missing',
    packSize: pack.ambiguous ? 'ambiguous' : pack.text && pack.value != null ? 'visible' : 'missing',
    unitPrice: Number.isFinite(unit.amount) ? 'visible' : 'missing',
    validity: validity.status,
    source: validUrl(sourceUrl) ? 'visible' : 'missing'
  };
  const reasons = [];
  let state = 'unrecognized';
  if (!name) reasons.push('Produktname fehlt.');
  if (!Number.isFinite(price)) reasons.push('Angebotspreis fehlt oder ist ungültig.');
  if (pack.ambiguous) reasons.push('Mehrere Packungsgrößen sichtbar; Mengenangabe muss geprüft werden.');
  if (recognized && classification.label === 'nonfood') {
    state = 'rejected';
    reasons.push(...classification.reasons);
  } else if (recognized && classification.label === 'uncertain') {
    state = 'uncertain';
    reasons.push(...classification.reasons);
  } else if (recognized && Number.isFinite(config.maxPrice) && price > config.maxPrice) {
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
        state,
        reasons,
      }
    };
  }

  // Für die Rezept- und Einkaufsplanung sind Produkt, aktueller Angebotspreis
  // und Packungs-/Mengenangabe die Pflichtangaben. Grundpreis und Gültigkeit
  // bleiben Zusatzdaten und schließen ein nutzbares Angebot nicht aus.
  const planningReady = Boolean(
    name && Number.isFinite(price) && pack.text && pack.value != null && !pack.ambiguous && validUrl(sourceUrl)
    && classification.label === 'food' && classification.confidence === 'high'
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
    priceType: priceDetails.type,
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
    source: 'kaufda-visible-public-page',
    sourceId: raw.cardId ?? raw.productId ?? raw.sourceId ?? null,
    capturedAt: fetchedAt,
    fetchedAt,
    validFrom,
    validUntil,
    validTo: validUntil,
    classification,
    fieldStatus,
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
    const visibleUnitPriceLineRe = /(?:pro\s+einheit|(?:kg|g|l|ml|cl|stück|stk\.?)\s*(?:=|[- ]?preis)|\/\s*(?:kg|g|l|ml|cl|stück|stk\.?))/i;
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
        return alt.length >= 2 && !/(logo|einkaufsliste|hinzufügen|placeholder|fallback)/i.test(alt);
      });
      const image = productImages[0];
      if (!image || !/€/.test(text) || text.length < 8 || text.length > 1600) return;
      if (productImages.length > 3 || (text.match(/€/g) ?? []).length > 6 || text.length > 700) return;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      candidates.push({ element, text, image });
    };
    for (const selector of selectors) for (const element of document.querySelectorAll(selector)) add(element);
    if (candidates.length < 3) {
      for (const element of document.querySelectorAll('div')) add(element);
    }

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
    for (const card of snapshot.cards) rawCards.set(rawCardKey(card), card);
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
    if (stableAtEnd >= scroll.stablePassesAtEnd) break;
    pass += 1;
  }

  addSnapshot(await readKaufdaSnapshot(page));
  const fetchedAt = new Date().toISOString();
  const visibleLocation = lastSnapshot.locationText ?? null;
  const expectedLocation = market.location ?? config.location;
  const locationStatus = matchVisibleLocation(visibleLocation, expectedLocation);
  const detailScan = locationStatus === 'mismatch'
    ? { cards: [...rawCards.values()], attempted: 0, failed: 0 }
    : await enrichCardsFromDetails(page, [...rawCards.values()], market, config, fetchedAt);
  const assessments = detailScan.cards.map((raw) => assessOffer(raw, market, config, fetchedAt));
  const scannedOffers = dedupeOffers(assessments.map((item) => item.offer).filter(Boolean));
  const offers = locationStatus === 'mismatch' ? [] : scannedOffers.map((offer) => locationStatus === 'matched'
    ? { ...offer, marketLocationStatus: 'matched' }
    : { ...offer, marketLocationStatus: 'unknown', planningStatus: 'needs-review', status: 'needs-review', reviewStatus: 'needs-review' });
  const reviewItems = assessments.map((item) => item.reviewItem).filter(Boolean).slice(0, config.maxReviewItems);
  const recognizedOfferCount = assessments.filter((item) => item.recognized).length;
  const uncertainCount = assessments.filter((item) => item.state === 'uncertain').length;
  const rejectedCount = assessments.filter((item) => item.state === 'rejected').length;
  const unrecognizedCount = assessments.filter((item) => item.state === 'unrecognized').length;
  const loadedCardCount = rawCards.size;
  const targetReached = Boolean(expectedCountKind !== 'prospect-pages' && expectedCount != null && expectedCount > 0 && loadedCardCount >= expectedCount && lastSnapshot.cards.length > 0);
  const warnings = [];
  const errors = [];
  if (!lastSnapshot.cards.length) warnings.push('Keine sichtbaren Angebotskarten erkannt; KaufDA-Struktur möglicherweise geändert.');
  if (detailScan.failed) warnings.push(`${detailScan.failed} Detailansichten konnten nicht gelesen werden; betroffene Felder bleiben prüfpflichtig.`);
  if (expectedCount == null) warnings.push('KaufDA-Zielzahl der Angebote war nicht sichtbar; Vollständigkeit ist nicht messbar.');
  if (expectedCountKind === 'prospect-pages') warnings.push(`KaufDA zeigt ${expectedCount} Prospektseiten; Seitenzahl und Kartenanzahl sind nicht vergleichbar.`);
  else if (expectedCount != null && !targetReached) warnings.push(`Zielzahl nicht erreicht: ${loadedCardCount}/${expectedCount} Karten.`);
  if (uncertainCount) warnings.push(`${uncertainCount} erkannte Karten bleiben wegen unsicherer Lebensmittelklassifikation in der Prüfung.`);
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
    loadedCardCount,
    recognizedOfferCount,
    foodOfferCount: offers.length,
    uncertainCount,
    rejectedCount,
    unrecognizedCount,
    passes: pass + 1,
    targetReached,
    completenessStatus: !lastSnapshot.cards.length || locationStatus === 'mismatch' ? 'failed' : targetReached ? 'complete' : 'incomplete',
    errors: !lastSnapshot.cards.length
      ? ['Keine sichtbaren Angebotskarten erkannt; KaufDA-Struktur oder Einstiegsseite möglicherweise geändert.', ...errors]
      : errors,
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
    fetchedAt: startedAt,
    startedAt,
    finishedAt: null,
    expectedCardCount: null,
    expectedPageCount: null,
    expectedCountKind: null,
    loadedCardCount: 0,
    recognizedOfferCount: 0,
    foodOfferCount: 0,
    uncertainCount: 0,
    rejectedCount: 0,
    unrecognizedCount: 0,
    passes: 0,
    targetReached: false,
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

export async function runParser(configInput, { outputPath = null, marketKey = null, headed = false } = {}) {
  const config = mergeConfig(configInput);
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
      const context = await browser.newContext({ locale: config.locale });
      const page = await context.newPage();
      try {
        await page.goto(market.url, { waitUntil: 'domcontentloaded', timeout: market.navigationTimeoutMs ?? 90000 });
        await page.waitForTimeout(market.initialWaitMs ?? 3500);
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
          await tab.click().catch(() => {});
          await page.waitForTimeout(market.afterOffersTabWaitMs ?? 2500);
          return true;
        };
        if (/\/search(?:[/?]|$)/i.test(page.url())) {
          const marketResult = page.getByRole('listitem').filter({ hasText: market.store ?? market.label ?? market.key }).first();
          if (await marketResult.count()) {
            await marketResult.click().catch(() => {});
            await page.waitForTimeout(market.afterMarketClickWaitMs ?? 5000);
          }
        }
        await activateOffersTab();
        const scan = await collectOffersFromPage(page, market, config, expectedCountHint, expectedCountKindHint);
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
    planningCompletenessStatus: normalizedOffers.length && normalizedOffers.every((offer) => offer.planningStatus === 'ready') ? 'complete' : normalizedOffers.length ? 'partial' : 'empty'
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
  });
  if (!Number.isInteger(config.scroll.maxPasses) || config.scroll.maxPasses < 1) errors.push('scroll.maxPasses muss positiv sein');
  if (!Number.isInteger(config.scroll.stablePassesAtEnd) || config.scroll.stablePassesAtEnd < 1) errors.push('scroll.stablePassesAtEnd muss positiv sein');
  return { valid: errors.length === 0, errors, config };
}

export function validateOutputDocument(document) {
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
  if (summary.foodOfferCount < 1) errors.push('Keine Lebensmittelangebote erkannt.');
  const readyCount = offers.filter((offer) => offer?.planningStatus === 'ready').length;
  const reviewCount = offers.filter((offer) => offer?.planningStatus !== 'ready').length;
  if (!Number.isInteger(summary.planningReadyOfferCount) || summary.planningReadyOfferCount !== readyCount) errors.push('summary.planningReadyOfferCount stimmt nicht mit offers überein.');
  if (!Number.isInteger(summary.planningReviewOfferCount) || summary.planningReviewOfferCount !== reviewCount) errors.push('summary.planningReviewOfferCount stimmt nicht mit offers überein.');
  if (!['complete', 'incomplete', 'failed'].includes(summary.completenessStatus)) errors.push('summary.completenessStatus ist ungültig.');
  const expectedPlanningStatus = !offers.length ? 'empty' : readyCount === offers.length ? 'complete' : 'partial';
  if (summary.planningCompletenessStatus !== expectedPlanningStatus) errors.push('summary.planningCompletenessStatus stimmt nicht mit offers überein.');
  if (summary.completenessStatus === 'failed') errors.push('Alle Märkte sind fehlgeschlagen.');
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
    if (offer.classification?.label !== 'food') errors.push(`${prefix} ist nicht als food klassifiziert.`);
    if (!['matched', 'unknown'].includes(offer.marketLocationStatus)) errors.push(`${prefix}.marketLocationStatus ist nicht sicher.`);
    if (!isKaufdaSourceUrl(offer.sourceUrl)) errors.push(`${prefix}.sourceUrl muss auf KaufDA zeigen.`);
    if (!isValidTimestamp(offer.capturedAt) || !isValidTimestamp(offer.fetchedAt)) errors.push(`${prefix} benötigt gültige Zeitstempel.`);
    if (!isValidDateOnly(offer.validFrom) || !isValidDateOnly(offer.validUntil)) errors.push(`${prefix} enthält ein ungültiges Gültigkeitsdatum.`);
    const unexpectedFields = Object.keys(offer).filter((field) => !PUBLISHED_OFFER_FIELDS.includes(field));
    if (unexpectedFields.length) errors.push(`${prefix} enthält nicht veröffentlichbare Felder: ${unexpectedFields.join(', ')}.`);
    if (offer.planningStatus === 'ready' && (!offer.pack && !offer.packSize || offer.fieldStatus?.packSize !== 'visible' || offer.status !== 'verified' || offer.marketLocationStatus !== 'matched')) {
      errors.push(`${prefix} darf nur mit Packung, verifiziertem Status und bestätigtem Marktstandort planningStatus=ready tragen.`);
    }
    if (offer.planningStatus !== 'ready' && offer.status === 'verified') errors.push(`${prefix} darf mit planningStatus=needs-review nicht verified sein.`);
    if (offer.marketKey && marketByKey.get(offer.marketKey)?.locationStatus === 'mismatch') errors.push(`${prefix} verweist auf einen nicht passenden Marktstandort.`);
  });
  const warnings = [];
  if (summary.completenessStatus === 'incomplete') warnings.push('Marktabdeckung ist unvollständig; planungsbereite Angebote bleiben trotzdem nutzbar.');
  if (summary.planningCompletenessStatus === 'partial') warnings.push('Ein Teil der Angebote benötigt noch eine Mengen-/Packungsprüfung.');
  if (offers.length && readyCount === 0) warnings.push('Kein Angebot ist aktuell für eine automatische Planung freigegeben.');
  return { valid: errors.length === 0, errors, warnings };
}
