import { demoCart, upstreamVariants } from "@/lib/checkout/catalog";
import { parseVariants, quoteCheckout } from "@/lib/checkout/quote";
import { useLogger as getRequestLogger, withEvlog } from "@/lib/evlog";
import { isFlagOn } from "@/lib/feature-flags";

// Quotes the demo cart. The self-healing demo's traffic script calls it
// (apps/ops/src/traffic.ts). An error here reaches Cloud Logging as an evlog
// wide event, which the ops job turns into a heal issue (docs/flows.md).
const handleQuote = () => {
  const faultInjected = isFlagOn("fault-injection-checkout");
  getRequestLogger().set({ checkout: { faultInjected } });
  const variants = parseVariants(upstreamVariants(faultInjected));
  return Response.json(quoteCheckout(variants, demoCart));
};

export const GET = withEvlog(handleQuote);
