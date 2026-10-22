import type { AdRatio } from "@wovain/shared/ad";
import type { Design } from "@wovain/shared/design";

// Ad images on the merchant's fal account: Nano Banana Pro edits the
// Fourthwall mockup into a scene, with the artwork as a second reference so
// the print stays the same. The playbook writes the scene; wovain fixes the
// model, the references and the size.

export const AD_IMAGE_ENDPOINT = "fal-ai/nano-banana-pro/edit";
// fal's list price per image (get_pricing, October 2026). 2K can bill more.
export const AD_IMAGE_USD = 0.15;

const KEEP_PRINT =
  "Image 1 is the product mockup and Image 2 is its print. Keep the garment and the print exactly as shown: same artwork, colors, size and position, fully visible and undistorted. Photorealistic, natural light. No added text, logos, watermarks or price tags. Keep the top and bottom 14% free of important detail.";

export interface AdImageRequest {
  color?: string | undefined;
  ratio: AdRatio;
  scene: string;
}

export const adImageInputs = (design: Design, images: AdImageRequest[]) =>
  images.map(({ color, ratio, scene }) => {
    const mockup =
      design.mockups.find((item) => item.color === color) ?? design.mockups[0];
    return {
      aspect_ratio: ratio,
      image_urls: [mockup?.url ?? design.artwork.url, design.artwork.url],
      num_images: 1,
      output_format: "jpeg",
      prompt: `${scene}\n\n${KEEP_PRINT}`,
      resolution: "2K",
    };
  });
