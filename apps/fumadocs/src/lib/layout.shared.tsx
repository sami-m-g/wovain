import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

import { i18n } from "./i18n";
import { appName, gitConfig } from "./shared";

// The wovain lockup (public/brand/, the same files as the web app), one per theme.
const LOGO_HEIGHT = 24;
const LOGO_WIDTH = 100;

const Logo = () => (
  <>
    <Image
      alt={appName}
      className="dark:hidden"
      height={LOGO_HEIGHT}
      src="/brand/lockup-light.svg"
      unoptimized
      width={LOGO_WIDTH}
    />
    <Image
      alt={appName}
      className="hidden dark:block"
      height={LOGO_HEIGHT}
      src="/brand/lockup-dark.svg"
      unoptimized
      width={LOGO_WIDTH}
    />
  </>
);

export const baseOptions = (locale: string): BaseLayoutProps => ({
  githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  nav: {
    title: <Logo />,
    url: locale === i18n.defaultLanguage ? "/" : `/${locale}`,
  },
});
