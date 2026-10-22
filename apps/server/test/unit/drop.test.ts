import { dropTotals, lowPrints } from "@wovain/shared/design";
import type { Design } from "@wovain/shared/design";
import { expect, test } from "vitest";

import { demoDesign } from "../helpers.ts";

const tee: Design = { ...demoDesign, id: "d1" };
const mug = {
  ...demoDesign,
  customizationId: "cus_mug",
  kind: "Mug",
  quote: { ...demoDesign.quote, price: 22, profit: 12.4 },
};

test("one of each product: the drop's price, profit and margin", () => {
  const totals = dropTotals({ ...tee, range: [mug] });
  expect(totals).toMatchObject({ count: 2, price: 52 });
  expect(totals.profit).toBeCloseTo(24.7, 5);
  expect(totals.marginPct).toBeCloseTo(47.5, 1);
});

test("a blurry print anywhere in the drop is named", () => {
  const small = { ...demoDesign.artwork, widthPx: 900 };
  const low = lowPrints({
    ...tee,
    range: [
      {
        ...mug,
        blank: { catalogProductId: "pro_mug", name: "White mug" },
        extraPlacements: [
          {
            area: "Back",
            artwork: small,
            printSize: "12×16 in",
            style: "large",
          },
        ],
      },
    ],
  });
  expect(low).toEqual([{ area: "Back", hero: false, product: "White mug" }]);
});
