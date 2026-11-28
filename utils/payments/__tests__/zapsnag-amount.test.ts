const getSatoshiValueMock = jest.fn();

jest.mock("@getalby/lightning-tools", () => ({
  getSatoshiValue: (...args: unknown[]) => getSatoshiValueMock(...args),
}));

import {
  minimumSaleAmountSats,
  zapsnagAmountsAgree,
  zapsnagPriceToSats,
} from "@/utils/payments/zapsnag-amount";

describe("zapsnag amount helpers", () => {
  beforeEach(() => getSatoshiValueMock.mockReset());

  it("uses a sat price as it is", async () => {
    await expect(zapsnagPriceToSats(5000, "sats")).resolves.toBe(5000);
    await expect(zapsnagPriceToSats(5000, "SAT")).resolves.toBe(5000);
    expect(getSatoshiValueMock).not.toHaveBeenCalled();
  });

  it("converts a fiat price and rounds up to whole sats", async () => {
    getSatoshiValueMock.mockResolvedValue(30999.4);

    await expect(zapsnagPriceToSats(20, "USD")).resolves.toBe(31000);
    expect(getSatoshiValueMock).toHaveBeenCalledWith({
      amount: 20,
      currency: "USD",
    });
  });

  it("lets the browser and server amounts differ by max(2 sats, 1%)", () => {
    expect(zapsnagAmountsAgree(31000, 31300)).toBe(true);
    expect(zapsnagAmountsAgree(31000, 31400)).toBe(false);
    expect(zapsnagAmountsAgree(100, 102)).toBe(true);
    expect(zapsnagAmountsAgree(100, 103)).toBe(false);
  });

  it("needs the full price for a sat sale but allows rate drift for fiat", () => {
    expect(minimumSaleAmountSats(1000, "sats")).toBe(1000);
    expect(minimumSaleAmountSats(1000, "USD")).toBe(750);
    expect(minimumSaleAmountSats(1, "USD")).toBe(1);
  });
});
