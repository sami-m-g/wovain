import { createI18nMiddleware } from "fumadocs-core/i18n/middleware";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { i18n, isLocale } from "@/lib/i18n";
import { docsContentRoute, docsRoute } from "@/lib/shared";

const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}/content.md`
);
const { rewrite: rewriteSuffix } = rewritePath(
  `${docsRoute}{/*path}.md`,
  `${docsContentRoute}{/*path}/content.md`
);

const i18nMiddleware = createI18nMiddleware(i18n);

// Split a leading locale segment off the pathname: "/fr/docs/x" -> ["fr", "/docs/x"].
const splitLocale = (pathname: string): [string, string] => {
  const [, first = "", ...rest] = pathname.split("/");
  const hasLocale = first !== "" && isLocale(first);
  const isDefault = first === i18n.defaultLanguage;

  return hasLocale && !isDefault
    ? [first, `/${rest.join("/")}`]
    : [i18n.defaultLanguage, pathname];
};

// Markdown content routes live under `/{lang}/llms.mdx/docs/...`. A rewrite
// skips the i18n middleware, so the default language gets its prefix here.
const withLocale = (lang: string, path: string) => `/${lang}${path}`;

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const [lang, pathname] = splitLocale(request.nextUrl.pathname);

  const suffixPath = rewriteSuffix(pathname);
  if (suffixPath) {
    return NextResponse.rewrite(
      new URL(withLocale(lang, suffixPath), request.nextUrl)
    );
  }

  if (isMarkdownPreferred(request)) {
    const result = rewriteDocs(pathname);

    if (result) {
      return NextResponse.rewrite(
        new URL(withLocale(lang, result), request.nextUrl),
        {
          // this URL has two representations, selected by `Accept`
          headers: { Vary: "Accept" },
        }
      );
    }
  }

  return i18nMiddleware(request, event);
}

export const config = {
  // Skip API routes and Next.js internals
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
