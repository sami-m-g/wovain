import { getRequestConfig } from "next-intl/server";

import { toLocale } from "./locale";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = toLocale(await requestLocale);

  const { default: messages } = await import(`../../messages/${locale}.json`);

  return { locale, messages };
});
