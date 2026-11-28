import {
  getRelatedProducts,
  isRecommendableProduct,
  tokenizeForRelatedProducts,
} from "../related-products";
import { ProductData } from "../product-parser-functions";

const NOW = 1_800_000_000;

const makeProduct = (overrides: Partial<ProductData>): ProductData => ({
  id: "id",
  pubkey: "seller-a",
  createdAt: 1_700_000_000,
  title: "Untitled",
  summary: "",
  publishedAt: "",
  images: ["https://example.com/img.jpg"],
  categories: [],
  location: "Online",
  price: 10,
  currency: "USD",
  totalCost: 10,
  ...overrides,
});

const current = makeProduct({
  id: "current",
  pubkey: "seller-a",
  d: "seedkeeper-pro",
  title: "SeedKeeper Pro",
  summary: "Anillo con elemento seguro para almacenar contraseñas y seeds",
  categories: ["Electronics", "Bitcoin"],
});

const ids = (products: ProductData[]) => products.map((p) => p.id);

describe("tokenizeForRelatedProducts", () => {
  it("lowercases, strips accents, and drops short and stop words", () => {
    expect(
      Array.from(tokenizeForRelatedProducts("Contraseñas para la Cámara, NEW!"))
    ).toEqual(["contrasenas", "camara"]);
  });

  it("returns an empty set for missing text", () => {
    expect(tokenizeForRelatedProducts(undefined).size).toBe(0);
  });
});

describe("isRecommendableProduct", () => {
  it("rejects sold, expired, flagged, imageless and unpriced listings", () => {
    expect(isRecommendableProduct(makeProduct({}), NOW)).toBe(true);
    expect(isRecommendableProduct(makeProduct({ status: "sold" }), NOW)).toBe(
      false
    );
    expect(
      isRecommendableProduct(makeProduct({ expiration: NOW - 1 }), NOW)
    ).toBe(false);
    expect(
      isRecommendableProduct(makeProduct({ contentWarning: true }), NOW)
    ).toBe(false);
    expect(isRecommendableProduct(makeProduct({ images: [] }), NOW)).toBe(
      false
    );
    expect(isRecommendableProduct(makeProduct({ currency: "" }), NOW)).toBe(
      false
    );
  });
});

describe("getRelatedProducts", () => {
  it("excludes the current listing and older revisions of it", () => {
    const olderRevision = makeProduct({
      id: "old-rev",
      pubkey: "seller-a",
      d: "seedkeeper-pro",
      title: "SeedKeeper Pro",
    });
    const related = getRelatedProducts(current, [current, olderRevision], {
      nowSeconds: NOW,
    });
    expect(related).toEqual([]);
  });

  it("leaves out listings with no shared signal", () => {
    const unrelated = makeProduct({
      id: "unrelated",
      pubkey: "seller-b",
      title: "Handmade Pottery Bowl",
      categories: ["Home"],
    });
    expect(
      getRelatedProducts(current, [unrelated], { nowSeconds: NOW })
    ).toEqual([]);
  });

  it("ranks title matches above category matches above same-seller only", () => {
    const sameSeller = makeProduct({
      id: "same-seller",
      pubkey: "seller-a",
      title: "Coffee Beans",
    });
    const sameCategory = makeProduct({
      id: "same-category",
      pubkey: "seller-b",
      title: "Hardware Wallet",
      categories: ["electronics"],
    });
    const titleMatch = makeProduct({
      id: "title-match",
      pubkey: "seller-c",
      title: "SeedKeeper Backup Card",
    });

    const related = getRelatedProducts(
      current,
      [sameSeller, sameCategory, titleMatch],
      { nowSeconds: NOW }
    );
    expect(ids(related)).toEqual([
      "title-match",
      "same-category",
      "same-seller",
    ]);
  });

  it("matches on description words", () => {
    const descriptionMatch = makeProduct({
      id: "description-match",
      pubkey: "seller-b",
      title: "Steel Plate",
      summary: "Guarda tus seeds en acero",
    });
    expect(
      ids(getRelatedProducts(current, [descriptionMatch], { nowSeconds: NOW }))
    ).toEqual(["description-match"]);
  });

  it("keeps only the newest revision of another listing", () => {
    const v1 = makeProduct({
      id: "v1",
      pubkey: "seller-b",
      d: "ring",
      title: "SeedKeeper Ring",
      createdAt: 1,
    });
    const v2 = { ...v1, id: "v2", createdAt: 2 };
    expect(
      ids(getRelatedProducts(current, [v1, v2], { nowSeconds: NOW }))
    ).toEqual(["v2"]);
  });

  it("respects the limit and breaks ties by recency", () => {
    const candidates = [1, 2, 3, 4].map((n) =>
      makeProduct({
        id: `p${n}`,
        pubkey: "seller-a",
        title: `Thing ${n}`,
        createdAt: n,
      })
    );
    expect(
      ids(
        getRelatedProducts(current, candidates, { limit: 2, nowSeconds: NOW })
      )
    ).toEqual(["p4", "p3"]);
    expect(
      getRelatedProducts(current, candidates, { limit: 0, nowSeconds: NOW })
    ).toEqual([]);
  });
});
