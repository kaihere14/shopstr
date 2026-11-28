import { ProductData } from "./product-parser-functions";

export const DEFAULT_RELATED_PRODUCTS_LIMIT = 8;

// Relative weight of each signal. Titles are the strongest hint that two
// listings are the same kind of thing; descriptions are noisy, so each shared
// word counts for little and the total is capped.
const SAME_SELLER_SCORE = 2;
const SHARED_CATEGORY_SCORE = 3;
const SHARED_TITLE_TOKEN_SCORE = 4;
const SHARED_SUMMARY_TOKEN_SCORE = 1;
const MAX_SUMMARY_SCORE = 5;

const MIN_TOKEN_LENGTH = 3;

// Words that show up in many listings without saying what the product is.
// English and Spanish, since both are common on the marketplace.
const STOP_WORDS = new Set([
  // English
  "and",
  "the",
  "for",
  "with",
  "from",
  "this",
  "that",
  "you",
  "your",
  "are",
  "can",
  "not",
  "all",
  "any",
  "our",
  "has",
  "have",
  "will",
  "but",
  "its",
  "was",
  "one",
  "per",
  "more",
  "very",
  "also",
  "only",
  "into",
  "out",
  "new",
  "used",
  "sale",
  "free",
  "shipping",
  "price",
  "item",
  "items",
  "product",
  "products",
  "available",
  "please",
  "contact",
  "order",
  "buy",
  "sats",
  "bitcoin",
  "btc",
  // Spanish
  "con",
  "para",
  "por",
  "los",
  "las",
  "del",
  "una",
  "uno",
  "que",
  "sus",
  "como",
  "mas",
  "muy",
  "sin",
  "este",
  "esta",
  "nuevo",
  "nueva",
  "envio",
  "precio",
  "producto",
]);

/**
 * Splits free text into a set of lowercase, accent-free words, dropping short
 * words and stop words so only words that describe the product remain.
 */
export const tokenizeForRelatedProducts = (
  text: string | undefined
): Set<string> => {
  const tokens = new Set<string>();
  if (!text) return tokens;

  const normalized = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

  for (const token of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (token.length < MIN_TOKEN_LENGTH) continue;
    if (STOP_WORDS.has(token)) continue;
    tokens.add(token);
  }

  return tokens;
};

const countShared = (a: Set<string>, b: Set<string>): number => {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const value of smaller) {
    if (larger.has(value)) count += 1;
  }
  return count;
};

const normalizeCategories = (categories: string[] | undefined) =>
  new Set(
    (categories || [])
      .map((category) => category.trim().toLowerCase())
      .filter(Boolean)
  );

const isSameListing = (a: ProductData, b: ProductData): boolean => {
  if (a.id === b.id) return true;
  // Older revisions of the same addressable listing share pubkey + d tag.
  return Boolean(a.d) && a.d === b.d && a.pubkey === b.pubkey;
};

/**
 * Whether a listing is fit to be shown as a recommendation at all,
 * independent of what the shopper is currently looking at.
 */
export const isRecommendableProduct = (
  product: ProductData,
  nowSeconds: number = Date.now() / 1000
): boolean => {
  if (!product.title) return false;
  if (!product.currency) return false;
  if (!product.images || product.images.length === 0) return false;
  if (product.contentWarning) return false;
  if (product.status === "sold") return false;
  if (product.expiration && product.expiration < nowSeconds) return false;
  return true;
};

export type RelatedProductOptions = {
  limit?: number;
  nowSeconds?: number;
};

/**
 * Ranks candidate listings by how related they are to `current`, using shared
 * categories, shared title words, shared description words and whether they
 * come from the same seller. Listings with no signal at all are left out.
 */
export const getRelatedProducts = (
  current: ProductData,
  candidates: ProductData[],
  {
    limit = DEFAULT_RELATED_PRODUCTS_LIMIT,
    nowSeconds = Date.now() / 1000,
  }: RelatedProductOptions = {}
): ProductData[] => {
  if (limit <= 0) return [];

  const currentCategories = normalizeCategories(current.categories);
  const currentTitleTokens = tokenizeForRelatedProducts(current.title);
  const currentTextTokens = new Set([
    ...currentTitleTokens,
    ...tokenizeForRelatedProducts(current.summary),
  ]);

  // Keep only the newest revision of each listing.
  const newestByKey = new Map<string, ProductData>();
  for (const candidate of candidates) {
    if (isSameListing(candidate, current)) continue;
    if (!isRecommendableProduct(candidate, nowSeconds)) continue;

    const key = candidate.d
      ? `${candidate.pubkey}:${candidate.d}`
      : candidate.id;
    const existing = newestByKey.get(key);
    if (!existing || candidate.createdAt > existing.createdAt) {
      newestByKey.set(key, candidate);
    }
  }

  const scored: { product: ProductData; score: number }[] = [];
  for (const candidate of newestByKey.values()) {
    let score = 0;

    if (candidate.pubkey === current.pubkey) {
      score += SAME_SELLER_SCORE;
    }

    score +=
      countShared(
        currentCategories,
        normalizeCategories(candidate.categories)
      ) * SHARED_CATEGORY_SCORE;

    const candidateTitleTokens = tokenizeForRelatedProducts(candidate.title);
    score +=
      countShared(currentTitleTokens, candidateTitleTokens) *
      SHARED_TITLE_TOKEN_SCORE;

    const candidateSummaryTokens = tokenizeForRelatedProducts(
      candidate.summary
    );
    score += Math.min(
      countShared(currentTextTokens, candidateSummaryTokens) *
        SHARED_SUMMARY_TOKEN_SCORE,
      MAX_SUMMARY_SCORE
    );

    if (score > 0) {
      scored.push({ product: candidate, score });
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.product.createdAt - a.product.createdAt ||
      a.product.id.localeCompare(b.product.id)
  );

  return scored.slice(0, limit).map(({ product }) => product);
};
