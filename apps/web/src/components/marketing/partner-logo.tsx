import Image from "next/image";

import { Meta } from "@/components/ui/svgs/meta";

/**
 * Official partner logos. Fourthwall's wordmark comes from fourthwall.com/brand,
 * fal's from fal.ai (they publish no press kit), Meta's from svgl. Black on
 * light grounds and white on dark, as each brand asks. Decorative: the card
 * names the service next to its logo.
 */
const WORDMARKS = {
  fal: { height: 50, width: 122 },
  fourthwall: { height: 40, width: 226 },
} as const;

export const PartnerLogo = ({
  name,
}: {
  name: keyof typeof WORDMARKS | "meta";
}) => {
  if (name === "meta") {
    return <Meta aria-hidden="true" className="h-6 w-auto" />;
  }
  const { height, width } = WORDMARKS[name];
  return (
    <>
      <Image
        alt=""
        className="h-5 w-auto dark:hidden"
        height={height}
        src={`/logos/${name}-black.svg`}
        unoptimized
        width={width}
      />
      <Image
        alt=""
        className="hidden h-5 w-auto dark:block"
        height={height}
        src={`/logos/${name}-white.svg`}
        unoptimized
        width={width}
      />
    </>
  );
};
