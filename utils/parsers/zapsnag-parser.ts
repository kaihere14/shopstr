import { NostrEvent } from "@/utils/types/types";
import { ProductData } from "./product-parser-functions";
import { normalizeProductImageUrl } from "@/utils/images";
import currencySelection from "@/public/currencySelection.json";

const SAT_CURRENCY_WORDS = ["sat", "sats", "satoshi", "satoshis"];

export const isSatsCurrency = (currency: string | undefined): boolean =>
  currency !== undefined && SAT_CURRENCY_WORDS.includes(currency.toLowerCase());

// Every currency the listing form offers, so "Price: 20 GBP" is read as GBP
// and not as 20 sats. Longer words first so "sats" wins over "sat".
const CURRENCY_WORDS = [
  ...new Set([...SAT_CURRENCY_WORDS, ...Object.keys(currencySelection)]),
].sort((a, b) => b.length - a.length);

const priceRegex = new RegExp(
  `(?:price|cost|⚡)\\s*[:=-]?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${CURRENCY_WORDS.join("|")})?\\b`,
  "i"
);

export const parseZapsnagNote = (event: NostrEvent): ProductData => {
  const content = event.content;

  const match = content.match(priceRegex);

  let price = 0;
  let currency = "sats";

  if (match && match[1]) {
    price = parseFloat(match[1].replace(/,/g, ""));
    if (match[2] && !isSatsCurrency(match[2])) {
      currency = match[2].toUpperCase();
    }
  }

  const imageRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/i;
  const imageMatch = content.match(imageRegex);
  let image = imageMatch ? imageMatch[0] : `https://robohash.org/${event.id}`;

  if (!image.startsWith("http")) {
    image = `https://robohash.org/${event.id}`;
  }

  const cleanContent = content
    .replace(priceRegex, "")
    .replace(/#zapsnag/gi, "")
    .replace(imageRegex, "")
    .trim();

  const title =
    cleanContent.length > 0
      ? cleanContent.length > 50
        ? cleanContent.substring(0, 50) + "..."
        : cleanContent
      : "Flash Sale Item";

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    title: title,
    summary: content,
    publishedAt: String(event.created_at),
    images: [normalizeProductImageUrl(image)],
    categories: ["zapsnag"],
    location: "Global",
    price: price,
    priceStatus: "known",
    currency: currency,
    totalCost: price,
    shippingType: "Free",
    d: "zapsnag",
    status: "active",
    rawEvent: event,
  };
};
