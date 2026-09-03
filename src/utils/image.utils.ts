import { Page } from 'playwright';

/**
 * Atributos onde uma imagem pode estar. A ordem importa: `src` primeiro,
 * depois variantes de lazy-load (comuns em WordPress) e por fim `content`,
 * usado pelas meta tags og:image / twitter:image.
 */
const IMAGE_ATTRIBUTES = [
  'src',
  'data-src',
  'data-lazy-src',
  'data-original',
  'srcset',
  'data-srcset',
  'data-lazy-srcset',
  'content',
] as const;

/** Imagens que nunca servem como capa da publicacao. */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^data:/i,
  /placeholder/i,
  /\bblank\b/i,
  /\bspacer\b/i,
  /loading\.(gif|svg|png)/i,
  /\/1x1\./i,
  /prefeitura_h\.svg/i,
];

/** Ex.: "foto-300x200.jpg 300w, foto-768x512.jpg 768w" */
const SRCSET_PATTERN = /\s\d+(\.\d+)?[wx]\s*(,|$)/;

export const isUsableImageUrl = (url: string): boolean => {
  if (!url.trim()) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(url));
};

/** Escolhe a maior variante de um srcset (maior descritor `w` ou `x`). */
export const pickLargestFromSrcset = (srcset: string): string => {
  const candidates = srcset
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, descriptor = ''] = part.split(/\s+/);
      const width = Number(descriptor.replace(/[wx]$/i, '')) || 0;
      return { url, width };
    })
    .filter((candidate) => !!candidate.url);

  if (candidates.length === 0) return '';

  return candidates.sort((a, b) => b.width - a.width)[0].url;
};

const BACKGROUND_URL_PATTERN = /url\((['"]?)(.*?)\1\)/i;

/** Extrai a URL de um `style="background-image: url(...)"` inline. */
export const extractCssBackgroundUrl = (style: string): string => {
  const match = style.match(BACKGROUND_URL_PATTERN);
  return match ? match[2].trim() : '';
};

export const toAbsoluteUrl = (src: string, baseUrl: string): string | null => {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
};

/**
 * Recebe valores brutos de atributos (src, srcset, content...) na ordem de
 * preferencia e devolve a primeira URL absoluta utilizavel.
 */
export const normalizeImageCandidates = (
  candidates: readonly string[],
  baseUrl: string,
): string | null => {
  for (const candidate of candidates) {
    const value = candidate.trim();
    if (!value) continue;

    const raw = SRCSET_PATTERN.test(value) ? pickLargestFromSrcset(value) : value;
    if (!isUsableImageUrl(raw)) continue;

    const absolute = toAbsoluteUrl(raw, baseUrl);
    if (absolute) return absolute;
  }

  return null;
};

const readImageCandidates = async (
  page: Page,
  selectors: readonly string[],
): Promise<string[]> =>
  page.evaluate(
    ({ selectors: sels, attributes }) => {
      const found: string[] = [];

      for (const selector of sels) {
        const elements = Array.from(document.querySelectorAll(selector));

        for (const element of elements) {
          for (const attribute of attributes) {
            const value = element.getAttribute(attribute);
            if (value && value.trim()) found.push(value.trim());
          }
        }
      }

      return found;
    },
    { selectors: [...selectors], attributes: [...IMAGE_ATTRIBUTES] },
  );

/**
 * Percorre os seletores na ordem informada e devolve a primeira imagem
 * utilizavel da pagina atual. `baseUrl` resolve caminhos relativos.
 */
export const extractImageUrl = async (
  page: Page,
  selectors: readonly string[],
  baseUrl: string,
): Promise<string | null> => {
  try {
    const candidates = await readImageCandidates(page, selectors);
    return normalizeImageCandidates(candidates, baseUrl);
  } catch {
    return null;
  }
};

/** Seletores de meta tags — fallback universal quando o HTML nao ajuda. */
export const META_IMAGE_SELECTORS = [
  'meta[property="og:image"]',
  'meta[name="og:image"]',
  'meta[name="twitter:image"]',
  'meta[property="twitter:image"]',
] as const;
