import { pickColors } from "@wovain/core/drops";
import { blankVariants } from "@wovain/core/fourthwall-drops";
import type { ToolCall } from "@wovain/core/upstream";

import type { Actor } from "./actor";
import { flagContextOf } from "./flags";

// The colors and sizes a single-design product is sold in (openspec
// design-drops): the brief's garment colors matched to the blank's, and
// every size the blank comes in. Fourthwall otherwise uses only the
// blank's first color and size. Behind the design-drops flag: undefined
// when it is off, and the preview keeps Fourthwall's default.
export const variantsFor = async (
  actor: Actor,
  call: ToolCall,
  { garmentColors, slug }: { garmentColors: string[]; slug: string }
) => {
  if (!(await actor.core.flags.isOn("design-drops", flagContextOf(actor)))) {
    return;
  }
  const { colors, sizes } = await blankVariants(call, slug);
  return { colors: pickColors(colors, garmentColors), sizes };
};

// The preview's key: a preview with variants is a different customization.
export const previewKey = (
  key: string,
  variants: { colors: string[]; sizes: string[] } | undefined
) => (variants === undefined ? key : `${key}:variants`);
