const DEFAULT_MIN_CONFIDENCE = 20;
const IGNORED_TOKENS = new Set([
  'ab', 'angebot', 'aktion', 'auch', 'aus', 'je', 'kg', 'l', 'liter', 'ml',
  'packung', 'packungen', 'kasten', 'pfand', 'preis', 'sorten', 'verschiedene',
  'versch', 'x', 'zum'
]);

function normalize(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fold(value) {
  return normalize(value)
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(value) {
  return fold(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !IGNORED_TOKENS.has(token));
}

function looksLikeNoise(line) {
  return !line
    || line.length < 2
    || line.length > 90
    || /€|%|\b(?:kg|g|l|ml|cl|liter|kasten|pfand)\b|\d{1,3}[,.]\d{1,2}/i.test(line)
    || /^(?:angebot|aktion|preis|gültig|verschiedene sorten|versch\. sorten)$/i.test(line);
}

export function originalImageUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    // KaufDA's grid policy returns a small preview. The path without the
    // policy query is the public original image used for OCR.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch (_) {
    return null;
  }
}

export function matchImageProductName({ cardName = '', ocrText = '', confidence = null, minConfidence = DEFAULT_MIN_CONFIDENCE } = {}) {
  const visibleName = normalize(cardName);
  const visibleTokens = tokens(visibleName);
  const lines = String(ocrText ?? '')
    .split(/\r?\n+/)
    .map(normalize)
    .filter((line) => !looksLikeNoise(line));
  const confidenceValue = Number(confidence);
  const confidenceOkay = !Number.isFinite(confidenceValue) || confidenceValue >= minConfidence;

  let best = null;
  for (const line of lines) {
    const lineTokens = tokens(line);
    if (!lineTokens.length) continue;
    const overlap = visibleTokens.length
      ? visibleTokens.filter((token) => lineTokens.some((candidate) => candidate === token || candidate.startsWith(token) || token.startsWith(candidate))).length / visibleTokens.length
      : 0;
    const score = overlap + Math.min(0.2, 1 / Math.max(1, lineTokens.length));
    if (!best || score > best.score) best = { line, overlap, score };
  }

  if (best && confidenceOkay && ((visibleTokens.length > 0 && best.overlap >= 0.5) || (!visibleTokens.length && best.line.length >= 3))) {
    return {
      status: 'verified',
      imageProductName: visibleName || best.line,
      matchedText: best.line,
      confidence: Number.isFinite(confidenceValue) ? confidenceValue : null
    };
  }

  return {
    status: 'unverified',
    imageProductName: visibleName || null,
    matchedText: best?.line ?? null,
    confidence: Number.isFinite(confidenceValue) ? confidenceValue : null
  };
}

export async function enrichCardsWithImageOcr(cards = [], options = {}) {
  const candidates = cards.map((card) => ({
    card,
    imageUrl: originalImageUrl(card.imageUrl)
  }));
  const updates = new Map();
  const attempted = candidates.filter((candidate) => candidate.imageUrl).length;
  let failed = 0;
  let verified = 0;

  if (!attempted) {
    return {
      cards: cards.map((card) => ({ ...card, imageProductStatus: 'missing' })),
      attempted: 0,
      failed: 0,
      verified: 0
    };
  }

  const { createWorker } = await import('tesseract.js');
  const language = options.language ?? 'deu+eng';
  const workerCount = Math.min(Math.max(1, Number(options.concurrency) || 1), attempted);
  let cursor = 0;

  const runWorker = async () => {
    const worker = await createWorker(language, 1, { logger: () => {} });
    try {
      while (true) {
        const index = cursor++;
        if (index >= candidates.length) break;
        const candidate = candidates[index];
        if (!candidate.imageUrl) {
          updates.set(candidate.card.cardKey, { imageProductStatus: 'missing' });
          continue;
        }
        try {
          const result = await worker.recognize(candidate.imageUrl);
          const match = matchImageProductName({
            cardName: candidate.card.name,
            ocrText: result.data.text,
            confidence: result.data.confidence,
            minConfidence: options.minConfidence
          });
          if (match.status === 'verified') verified += 1;
          updates.set(candidate.card.cardKey, {
            imageUrl: candidate.imageUrl,
            imageOcrText: result.data.text,
            imageOcrConfidence: match.confidence,
            imageProductName: match.imageProductName,
            imageProductStatus: match.status,
            imageProductOcrMatch: match.matchedText
          });
        } catch (_) {
          failed += 1;
          updates.set(candidate.card.cardKey, {
            imageUrl: candidate.imageUrl,
            imageProductName: candidate.card.name ?? null,
            imageProductStatus: 'failed'
          });
        }
      }
    } finally {
      await worker.terminate();
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return {
    cards: cards.map((card) => ({
      ...card,
      ...(updates.get(card.cardKey) ?? { imageProductStatus: 'missing' })
    })),
    attempted,
    failed,
    verified
  };
}
