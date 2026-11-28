import { useContext, useMemo } from "react";
import ProductCard from "./utility-components/product-card";
import {
  FollowsContext,
  ProductContext,
  ReportsContext,
} from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import {
  DEFAULT_RELATED_PRODUCTS_LIMIT,
  getRelatedProducts,
} from "@/utils/parsers/related-products";
import { getListingSlug } from "@/utils/url-slugs";
import {
  getDirectFollowPubkeys,
  getListingReportSignal,
  summarizeReportEvents,
} from "@/utils/nostr/report-moderation";
import { HIDDEN_LISTINGS_PUBKEY } from "@/utils/STATIC-VARIABLES";
import { NostrEvent } from "@/utils/types/types";

type RelatedProductsProps = {
  currentProduct: ProductData;
  limit?: number;
};

export default function RelatedProducts({
  currentProduct,
  limit = DEFAULT_RELATED_PRODUCTS_LIMIT,
}: RelatedProductsProps) {
  const productContext = useContext(ProductContext);
  const followsContext = useContext(FollowsContext);
  const reportsContext = useContext(ReportsContext);
  const { pubkey: userPubkey } = useContext(SignerContext);

  const allProducts = useMemo(() => {
    const parsed: ProductData[] = [];
    (productContext.productEvents || []).forEach((event: NostrEvent) => {
      // Flash-sale notes (kind 1) are free-form posts, not catalog listings.
      if (event.kind === 1) return;
      const product = parseTags(event);
      if (product) {
        product.rawEvent = event;
        parsed.push(product);
      }
    });
    return parsed;
  }, [productContext.productEvents]);

  const reportSummaries = useMemo(
    () =>
      summarizeReportEvents({
        reportEvents: reportsContext.reportEvents,
        directFollowPubkeys: getDirectFollowPubkeys(
          followsContext.followList,
          followsContext.firstDegreeFollowsLength
        ),
        userPubkey,
      }),
    [
      reportsContext.reportEvents,
      followsContext.followList,
      followsContext.firstDegreeFollowsLength,
      userPubkey,
    ]
  );

  const relatedProducts = useMemo(() => {
    const candidates = allProducts.filter(
      (product) =>
        (product.pubkey !== HIDDEN_LISTINGS_PUBKEY ||
          product.pubkey === userPubkey) &&
        // Don't push listings someone has flagged.
        getListingReportSignal(product, reportSummaries).level === "none"
    );
    return getRelatedProducts(currentProduct, candidates, { limit });
  }, [allProducts, currentProduct, limit, reportSummaries, userPubkey]);

  if (relatedProducts.length === 0) return null;

  return (
    <section
      aria-labelledby="related-products-heading"
      className="mx-3 mt-8 mb-12 md:mx-6"
    >
      <h2
        id="related-products-heading"
        className="text-light-text dark:text-dark-text mb-4 text-2xl font-bold"
      >
        Products you may like
      </h2>
      <div className="grid max-w-full grid-cols-[repeat(auto-fill,minmax(260px,1fr))] justify-items-stretch gap-4 overflow-x-hidden">
        {relatedProducts.map((product) => (
          <ProductCard
            key={product.id}
            productData={product}
            href={`/listing/${getListingSlug(product, allProducts)}`}
          />
        ))}
      </div>
    </section>
  );
}
