import {
  dropTotals,
  lowPrints,
  printQuality,
  printsOf,
} from "@wovain/shared/design";
import type { Design, RangeProduct } from "@wovain/shared/design";
import { money } from "@wovain/shared/economics";
import { useId } from "react";

type Product = Design | RangeProduct;

// "Front · large center · 12×16 in + Back · neck mark · 3×3 in"
export const PrintLine = ({ product }: { product: Product }) => (
  <dd className="m-0">
    {printsOf(product)
      .map((item) => `${item.area} · ${item.style} · ${item.printSize}`)
      .join(" + ")}
  </dd>
);

const marginLine = ({ quote }: Product) =>
  `Profit ${money(quote.profit)} · ${Math.round(quote.marginPct)}%`;

const RangeCard = ({ product }: { product: RangeProduct }) => {
  const [mockup] = product.mockups;
  const blurry = printsOf(product).some(
    (item) => printQuality(item.artwork) === "low"
  );
  return (
    <li className="border-subtle flex flex-col overflow-hidden rounded-xl border">
      {mockup === undefined ? null : (
        <img
          alt={mockup.alt}
          className="bg-surface-secondary aspect-square w-full object-cover"
          height={160}
          src={mockup.url}
          width={160}
        />
      )}
      <div className="grid gap-0.5 p-2 text-sm">
        <p className="m-0 font-medium">{product.kind}</p>
        <p className="text-secondary m-0 truncate text-xs">
          {product.blank.name}
        </p>
        <p className="text-secondary m-0 text-xs">
          {printsOf(product)
            .map((item) => item.area)
            .join(" + ")}
        </p>
        <p className="m-0 flex items-center gap-1">
          {product.colors.map((color) => (
            <span
              className="border-default inline-block size-3 rounded-full border"
              key={color.name}
              style={{ background: color.hex }}
              title={color.name}
            />
          ))}
          <span className="sr-only">
            {`Colors: ${product.colors.map((color) => color.name).join(", ")}`}
          </span>
        </p>
        <p className="m-0 mt-1">
          <span className="font-semibold">{`$${product.quote.price.toFixed(0)}`}</span>
          <span className="text-secondary text-xs">{`  ${marginLine(product)}`}</span>
        </p>
        {blurry ? (
          <p className="text-danger m-0 text-xs">
            Art too small for this print: it would come out blurry.
          </p>
        ) : null}
      </div>
    </li>
  );
};

// The rest of the drop: one card per product, and what one of each earns.
export const DropRange = ({ design }: { design: Design }) => {
  const titleId = useId();
  if (design.range.length === 0) {
    return null;
  }
  const totals = dropTotals(design);
  return (
    <section
      aria-labelledby={titleId}
      className="border-subtle mt-4 border-t pt-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="m-0 text-sm font-semibold" id={titleId}>
          {`${design.dropName ?? "The drop"} · ${totals.count} products`}
        </h3>
        <span className="text-secondary text-sm">
          {`One of each ${money(totals.price)} → profit ${money(totals.profit)} · ${Math.round(totals.marginPct)}% margin`}
        </span>
      </div>
      <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
        {design.range.map((product) => (
          <RangeCard key={product.customizationId} product={product} />
        ))}
      </ul>
    </section>
  );
};

// Approve stays off while any print in the drop would come out blurry; the
// hero's main print has its own message.
export const LowPrintNote = ({ design }: { design: Design }) => {
  const others = lowPrints(design).filter((item) => !item.hero);
  return others.length === 0 ? null : (
    <p className="text-danger mt-3 text-sm">
      {`Some art is too small for its print and would come out blurry: ${others
        .map((item) => `${item.product} ${item.area.toLowerCase()}`)
        .join(
          ", "
        )}. Give feedback to regenerate it larger or use a smaller print.`}
    </p>
  );
};
