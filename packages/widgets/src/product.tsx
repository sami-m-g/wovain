import type { App } from "@modelcontextprotocol/ext-apps/react";
import { Button } from "@wovain/ui/components/button";
import { useState } from "react";
import { z } from "zod";

import { ActionError, callTool, mount, say, useAction } from "./bridge.tsx";

// create_product and publish_product: the Fourthwall product with its mockup
// and price; publish it here, then ask for the paused campaign.

const productSchema = z.looseObject({
  id: z.string(),
  mockups: z.array(z.url()),
  price: z.number(),
  productUrl: z.url().nullable(),
  status: z.enum(["hidden", "public"]),
});
type Product = z.infer<typeof productSchema>;

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
        <span className="text-muted-foreground">
          {product.status === "public"
            ? "Live on Fourthwall"
            : "Hidden on Fourthwall"}
        </span>
      </div>
      <div className="flex gap-2">
        {product.status === "hidden" ? (
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
        ) : (
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
        {productUrl !== null && (
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
