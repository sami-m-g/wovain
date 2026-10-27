import { ENV } from "@/env.server";
import { demoCart, upstreamVariants } from "@/lib/checkout/catalog";
import { parseVariants, quoteCheckout } from "@/lib/checkout/quote";
import {
  createError,
  useLogger as getRequestLogger,
  withEvlog,
} from "@/lib/evlog";
import { isFlagOn } from "@/lib/feature-flags";

// Quotes the demo cart. The self-healing demo's traffic script calls it
// (apps/ops/src/traffic.ts). An error here reaches Cloud Logging as an evlog
// wide event, which the ops job turns into a heal issue (docs/flows.md).
const handleQuote = () => {
  // The flag faults every revision; FAULT_INJECTION_REVISION only the canary
  // a demo deploy marked (docs/adr/0001-progressive-delivery.md).
  const faultInjected =
    isFlagOn("fault-injection-checkout") ||
    ENV.FAULT_INJECTION_REVISION === "checkout";
  getRequestLogger().set({ checkout: { faultInjected } });
  const { rejected, variants } = parseVariants(upstreamVariants(faultInjected));
  if (rejected.length > 0) {
    // Quote what is priced, but keep the bad upstream data visible to error
    // tracking.
    getRequestLogger().error(
      createError({
        code: "UPSTREAM_VARIANT_INVALID",
        message: "The upstream returned variants that failed validation",
        status: 502,
        why: rejected
          .map(({ id, index }) => `${index}:${id ?? "unknown"}`)
          .join(",")
          .slice(0, 100),
      })
    );
  }
  return Response.json(quoteCheckout(variants, demoCart));
};

export const GET = withEvlog(handleQuote);
