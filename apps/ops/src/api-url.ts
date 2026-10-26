// Builds a request URL under a fixed API base and refuses anything that would
// leave it: another host (SSRF) or a path that climbs out of the base path.
export const apiUrl = (base: string, path: string): URL => {
  const root = new URL(base);
  const rootPath = root.pathname.replace(/\/+$/u, "");
  const url = new URL(`${rootPath}${path}`, root.origin);
  if (
    !path.startsWith("/") ||
    url.origin !== root.origin ||
    !url.pathname.startsWith(`${rootPath}/`)
  ) {
    throw new Error(
      `Refusing request outside the API base: ${path.split("?")[0]}`
    );
  }
  return url;
};
