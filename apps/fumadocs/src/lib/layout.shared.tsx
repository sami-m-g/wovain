import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { i18n } from "./i18n";
import { appName, gitConfig } from "./shared";

export const baseOptions = (locale: string): BaseLayoutProps => ({
  githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  nav: {
    title: appName,
    url: locale === i18n.defaultLanguage ? "/" : `/${locale}`,
  },
});
