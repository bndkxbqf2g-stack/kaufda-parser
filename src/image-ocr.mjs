const DEFAULT_MIN_CONFIDENCE = 20;
const ALLOWED_IMAGE_HOSTS = new Set(['content-media.bonial.biz']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_REDIRECTS = 3;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
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

function trustedImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:'
      || !ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase())
      || url.username
      || url.password
      || (url.port && url.port !== '443')) return null;
    return url;
  } catch (_) {
    return null;
  }
}

export function originalImageUrl(value) {
  const url = trustedImageUrl(value);
  if (!url) return null;
  // KaufDA's grid policy returns a small preview. The path without the
  // policy query is the public original image used for OCR.
  url.search = '';
  url.hash = '';
  return url.href;
}

export async function createImageTextReader(options = {}) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(options.language ?? 'deu+eng', 1, { logger: () => {} });
  return {
    async recognize(image) {
      const result = await worker.recognize(image);
      return (result.data.lines ?? []).map((line) => ({
        text: normalize(line.text),
        confidence: Number.isFinite(Number(line.confidence)) ? Number(line.confidence) : null,
        box: line.bbox ? {
          x: line.bbox.x0,
          y: line.bbox.y0,
          width: line.bbox.x1 - line.bbox.x0,
          height: line.bbox.y1 - line.bbox.y0
        } : null
      })).filter((line) => line.text && line.box);
    },
    async close() {
      await worker.terminate();
    }
  };
}
export async function fetchTrustedImage(value, { fetchImpl = globalThis.fetch, maxBytes = MAX_IMAGE_BYTES } = {}) {
  let url = trustedImageUrl(originalImageUrl(value));
  if (!url) throw new Error('OCR-Bildadresse ist nicht freigegeben.');

  for (let redirects = 0; redirects <= MAX_IMAGE_REDIRECTS; redirects += 1) {
    const response = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === MAX_IMAGE_REDIRECTS) throw new Error('OCR-Bild hat zu viele Weiterleitungen.');
      const location = response.headers.get('location');
      const nextUrl = location ? trustedImageUrl(new URL(location, url).href) : null;
      if (!nextUrl) throw new Error('OCR-Bild wurde auf einen nicht freigegebenen Host umgeleitet.');
      url = nextUrl;
      continue;
    }
    if (!response.ok) throw new Error(`OCR-Bildabruf fehlgeschlagen: HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (!['image/avif', 'image/bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp'].includes(contentType)) {
      throw new Error('OCR-Antwort ist kein unterstütztes Rasterbild.');
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('OCR-Bild überschreitet die erlaubte Größe.');
    if (!response.body) throw new Error('OCR-Bildantwort enthält keine Daten.');

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('OCR-Bild überschreitet die erlaubte Größe.');
      }
      chunks.push(Buffer.from(chunk));
    }
    if (!totalBytes) throw new Error('OCR-Bildantwort ist leer.');
    return Buffer.concat(chunks, totalBytes);
  }
  throw new Error('OCR-Bildabruf konnte nicht abgeschlossen werden.');
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
    const score = overlap + (visibleTokens.length
      ? Math.min(0.2, 1 / Math.max(1, lineTokens.length))
      : Math.min(0.6, lineTokens.length / 5));
    if (!best || score > best.score) best = { line, overlap, score };
  }

  if (best && confidenceOkay && ((visibleTokens.length > 0 && best.overlap >= 0.5) || (!visibleTokens.length && tokens(best.line).length >= 2))) {
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
          const image = await fetchTrustedImage(candidate.imageUrl);
          const result = await worker.recognize(image);
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
