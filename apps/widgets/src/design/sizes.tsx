import type { Design } from "@wovain/shared/design";

const splitSizes = (sizes: Design["sizes"]) => {
  const inStock: string[] = [];
  const outOfStock: string[] = [];
  for (const size of sizes) {
    (size.inStock ? inStock : outOfStock).push(size.size);
  }
  return { inStock, outOfStock };
};

// The in-stock range, with out-of-stock sizes crossed out.
export const Sizes = ({ sizes }: { sizes: Design["sizes"] }) => {
  const { inStock, outOfStock } = splitSizes(sizes);
  const range =
    inStock.length > 1
      ? `${inStock[0]}–${inStock.at(-1)}`
      : (inStock[0] ?? "None in stock");
  return (
    <dd className="m-0">
      {range}
      {outOfStock.length === 0 ? null : (
        <span className="text-secondary">
          {" · "}
          {outOfStock.map((size) => (
            <s className="mr-1" key={size}>
              {size}
            </s>
          ))}
          out of stock, left off
        </span>
      )}
    </dd>
  );
};
