import type { NextApiRequest, NextApiResponse } from "next";
import { type Event, verifyEvent } from "nostr-tools";
import { applyRateLimit } from "@/utils/rate-limit";
import { parseZapsnagNote } from "@/utils/parsers/zapsnag-parser";
import { zapsnagPriceToSats } from "@/utils/payments/zapsnag-amount";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const HEX_32_BYTE = /^[0-9a-f]{64}$/;
const MAX_CONTENT_LENGTH = 20_000;

// Flash sales are kind-1 notes the product cache does not hold, so the buyer
// sends the signed note. The signature proves the seller wrote the price.
function isZapsnagNote(value: unknown): value is Event {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<Event>;
  return (
    event.kind === 1 &&
    typeof event.id === "string" &&
    HEX_32_BYTE.test(event.id) &&
    typeof event.pubkey === "string" &&
    HEX_32_BYTE.test(event.pubkey) &&
    typeof event.created_at === "number" &&
    typeof event.content === "string" &&
    event.content.length <= MAX_CONTENT_LENGTH &&
    typeof event.sig === "string" &&
    Array.isArray(event.tags) &&
    event.tags.some(
      (tag) =>
        Array.isArray(tag) &&
        tag[0] === "t" &&
        (tag[1] === "zapsnag" || tag[1] === "shopstr-zapsnag")
    )
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "listing-zapsnag-quote", RATE_LIMIT)) {
    return;
  }

  const productEvent = (req.body as { productEvent?: unknown } | undefined)
    ?.productEvent;
  if (!isZapsnagNote(productEvent) || !verifyEvent(productEvent)) {
    return res.status(400).json({ error: "Invalid flash sale note" });
  }

  const { price, currency } = parseZapsnagNote(productEvent);
  if (price === undefined || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: "Flash sale has no valid price" });
  }

  try {
    const amountSats = await zapsnagPriceToSats(price, currency);
    return res.status(200).json({ amountSats, price, currency });
  } catch (error) {
    console.error("Failed to convert flash sale price:", error);
    return res
      .status(502)
      .json({ error: "Could not get the current exchange rate" });
  }
}
