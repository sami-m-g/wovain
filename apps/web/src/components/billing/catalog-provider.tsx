"use client";

import type { PublicCatalog } from "@wovain/billing/catalog";
import { createContext, use } from "react";
import type { ReactNode } from "react";

// The plans, the credit pack and the credit costs (BILLING_CATALOG), read on
// the server by the locale layout and handed to client components here: the
// browser never reads the environment.
const CatalogContext = createContext<PublicCatalog | undefined>(undefined);

export const CatalogProvider = ({
  catalog,
  children,
}: {
  catalog: PublicCatalog;
  children: ReactNode;
}) => <CatalogContext value={catalog}>{children}</CatalogContext>;

export const useCatalog = (): PublicCatalog => {
  const catalog = use(CatalogContext);
  if (catalog === undefined) {
    throw new Error("useCatalog needs a CatalogProvider (the locale layout)");
  }
  return catalog;
};

/**
 * Credits for a drop with no autopilot: research, the run's designs and ad
 * copy for one approved design; autopilot adds its pick and a review per
 * design.
 */
export const dropCredits = (
  { creditCost }: Pick<PublicCatalog, "creditCost">,
  designsPerRun: number
) => {
  const manual =
    creditCost.research + designsPerRun * creditCost.design + creditCost.assist;
  return {
    autopilot: manual + (1 + designsPerRun) * creditCost.assist,
    manual,
  };
};
