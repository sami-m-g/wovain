// Redirects that stay on this site. Browsers treat "//host" and "/\host" as
// another origin, so a path is checked after URL resolution, never by its
// text; anything that leaves the site goes to the fallback instead.
const FALLBACK = "/dashboard";

export const sameSiteUrl = ({
  origin,
  target,
  query = {},
}: {
  origin: string;
  target: string;
  query?: Record<string, string>;
}): URL => {
  const resolved = new URL(target, origin);
  const url = resolved.origin === origin ? resolved : new URL(FALLBACK, origin);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
};

export const redirectWithin = (input: {
  origin: string;
  target: string;
  query?: Record<string, string>;
}): Response => Response.redirect(sameSiteUrl(input), 302);
