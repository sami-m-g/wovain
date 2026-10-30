import type { App } from "@modelcontextprotocol/ext-apps/react";
import { Button } from "@wovain/ui/components/button";
import { useState } from "react";
import { z } from "zod";

import { ActionError, callTool, mount, say, useAction } from "./bridge.tsx";

// create_product and publish_product: the Fourthwall product with its mockup
// and price; publish it here, then ask for the paused campaign. With store
// management on, publishing goes to the merchant's approval queue: the card
// then says it waits for their approval instead of saying it is live.

const productSchema = z.looseObject({
  approval: z
    .object({ id: z.string(), status: z.string() })
    .nullable()
    .optional(),
  id: z.string(),
  mockups: z.array(z.url()),
  price: z.number(),
  productUrl: z.url().nullable(),
  status: z.enum(["hidden", "in_review", "public", "paused", "retired"]),
});
type Product = z.infer<typeof productSchema>;

const STATUS_LABEL: Record<Product["status"], string> = {
  hidden: "Hidden on Fourthwall",
  in_review: "Waiting for your approval in wovain",
  paused: "Unpublished",
  public: "Live on Fourthwall",
  retired: "Retired",
};

const statusLabel = (product: Product) =>
  product.status !== "public" && product.approval?.status === "approved"
    ? "Approved: it goes live once your shop passes its checks"
    : STATUS_LABEL[product.status];

const CAN_PUBLISH: ReadonlySet<Product["status"]> = new Set([
  "hidden",
  "paused",
]);

const ProductCard = ({ app, initial }: { app: App; initial: Product }) => {
  const [product, setProduct] = useState(initial);
  const { busy, failed, run } = useAction();
  const [mockup] = product.mockups;
  const { productUrl } = product;
  return (
    <article className="space-y-3 p-3">
      {mockup !== undefined && (
        <img
          alt="Product mockup"
          className="bg-muted w-full object-contain"
          src={mockup}
        />
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">${product.price.toFixed(2)}</span>
        <span className="text-muted-foreground">{statusLabel(product)}</span>
      </div>
      <div className="flex gap-2">
        {CAN_PUBLISH.has(product.status) && (
          <Button
            disabled={busy !== null}
            onClick={() =>
              run("publish", async () => {
                setProduct(
                  await callTool(app, productSchema, "publish_product", {
                    productId: product.id,
                  })
                );
              })
            }
            size="sm"
          >
            Publish
          </Button>
        )}
        {product.status === "public" && (
          <Button
            onClick={() =>
              say(
                app,
                `Create a paused Meta campaign for product ${product.id}.`
              )
            }
            size="sm"
          >
            Create paused campaign
          </Button>
        )}
        {productUrl !== null && product.status === "public" && (
          <Button
            onClick={() => app.openLink({ url: productUrl })}
            size="sm"
            variant="outline"
          >
            View product
          </Button>
        )}
      </div>
      <ActionError failed={failed} />
    </article>
  );
};

mount("product", productSchema, ({ app, data }) => (
  <ProductCard app={app} initial={data} />
));
