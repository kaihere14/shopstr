import { getSatoshiValue } from "@getalby/lightning-tools";
import { toCashuMintAmountSats } from "@/utils/cashu/payment-amount";
import { isSatsCurrency } from "@/utils/parsers/zapsnag-parser";

/**
 * Converts a flash sale price to the whole number of sats to zap. Sat prices
 * are used as they are. Fiat prices are converted at the current exchange
 * rate, so the result changes over time.
 */
export async function zapsnagPriceToSats(
  price: number,
  currency: string
): Promise<number> {
  if (isSatsCurrency(currency)) {
    return toCashuMintAmountSats(price);
  }
  const sats = await getSatoshiValue({ amount: price, currency });
  return toCashuMintAmountSats(sats);
}

/**
 * The browser and the server convert a fiat price a moment apart, so the
 * rate can move a little. Same band the checkout uses: max(2 sats, 1%).
 */
export function zapsnagAmountsAgree(
  shownAmountSats: number,
  serverAmountSats: number
): boolean {
  const tolerance = Math.max(2, Math.ceil(serverAmountSats * 0.01));
  return Math.abs(shownAmountSats - serverAmountSats) <= tolerance;
}

/**
 * A fiat flash sale was paid at the rate on the day it sold, so a past sale
 * can be worth fewer sats than the price today. Inventory still counts it as
 * a sale if it paid at least this share of today's price.
 */
export const FIAT_SALE_MIN_SHARE = 0.75;

/**
 * The smallest zap that counts as a sale when counting sold stock. Sat prices
 * need the full price. Fiat prices allow the exchange rate to have moved.
 */
export function minimumSaleAmountSats(
  priceSats: number,
  currency: string
): number {
  if (isSatsCurrency(currency)) return priceSats;
  return Math.max(1, Math.floor(priceSats * FIAT_SALE_MIN_SHARE));
}
