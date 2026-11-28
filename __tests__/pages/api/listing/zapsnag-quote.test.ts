import type { NextApiRequest, NextApiResponse } from "next";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";

const getSatoshiValueMock = jest.fn();

jest.mock("@getalby/lightning-tools", () => ({
  getSatoshiValue: (...args: unknown[]) => getSatoshiValueMock(...args),
}));

import handler from "@/pages/api/listing/zapsnag-quote";
import { __resetRateLimitBuckets } from "@/utils/rate-limit";

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
}

function createRequest(body: unknown, method = "POST"): NextApiRequest {
  return {
    method,
    headers: {},
    socket: { remoteAddress: "8.8.8.8" },
    body,
  } as NextApiRequest;
}

const sellerKey = generateSecretKey();

function signFlashSale(content: string, tags = [["t", "zapsnag"]]) {
  return finalizeEvent(
    { kind: 1, created_at: 1700000000, tags, content },
    sellerKey
  );
}

async function callQuote(body: unknown, method = "POST") {
  const res = createResponse();
  await handler(createRequest(body, method), res as unknown as NextApiResponse);
  return res;
}

describe("/api/listing/zapsnag-quote", () => {
  beforeEach(() => {
    getSatoshiValueMock.mockReset();
    __resetRateLimitBuckets();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("converts a fiat price from the signed note to sats", async () => {
    getSatoshiValueMock.mockResolvedValue(18750.2);
    const productEvent = signFlashSale("Hat\n\nPrice: 12.50 USD\n\n#zapsnag\n");

    const res = await callQuote({ productEvent });

    expect(getSatoshiValueMock).toHaveBeenCalledWith({
      amount: 12.5,
      currency: "USD",
    });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      amountSats: 18751,
      price: 12.5,
      currency: "USD",
    });
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("returns a sat price as it is without a rate lookup", async () => {
    const productEvent = signFlashSale("Hat\n\nPrice: 5000 SAT\n\n#zapsnag\n");

    const res = await callQuote({ productEvent });

    expect(getSatoshiValueMock).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual({
      amountSats: 5000,
      price: 5000,
      currency: "sats",
    });
  });

  it("rejects a note whose price was changed after signing", async () => {
    const productEvent = {
      ...signFlashSale("Hat\n\nPrice: 20 USD\n\n#zapsnag\n"),
      content: "Hat\n\nPrice: 1 USD\n\n#zapsnag\n",
    };

    const res = await callQuote({ productEvent });

    expect(res.statusCode).toBe(400);
    expect(getSatoshiValueMock).not.toHaveBeenCalled();
  });

  it("rejects a note that is not a flash sale", async () => {
    const productEvent = signFlashSale("Price: 20 USD", [["t", "hats"]]);

    const res = await callQuote({ productEvent });

    expect(res.statusCode).toBe(400);
  });

  it("rejects a flash sale without a price", async () => {
    const productEvent = signFlashSale("Hat for sale #zapsnag");

    const res = await callQuote({ productEvent });

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "Flash sale has no valid price" });
  });

  it("returns 502 when the exchange rate is unavailable", async () => {
    getSatoshiValueMock.mockRejectedValue(new Error("rates down"));
    const productEvent = signFlashSale("Hat\n\nPrice: 20 USD\n\n#zapsnag\n");

    const res = await callQuote({ productEvent });

    expect(res.statusCode).toBe(502);
  });

  it("only accepts POST", async () => {
    const res = await callQuote({}, "GET");

    expect(res.statusCode).toBe(405);
  });
});
