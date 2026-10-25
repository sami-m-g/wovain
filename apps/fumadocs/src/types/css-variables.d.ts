import "react";

type CssVariables = Partial<Record<`--${string}`, string | number>>;

// Allow CSS custom properties (e.g. "--padding-right") in style objects
declare module "react" {
  // oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type -- interface merging needs an empty extends
  interface CSSProperties extends CssVariables {}
}
