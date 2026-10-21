// The authorize step sends the merchant to /sign-in and /consent with a signed
// query. Better Auth's browser client forwards its signed part as
// `oauth_query` on every POST; the pages here post through the server, so
// they do the same. Ported from @better-auth/oauth-provider's
// buildSignedOAuthQuery, which the package doesn't export.
const signedNamesParam = "ba_param";

export const signedOAuthQuery = (search: string) => {
  const params = new URLSearchParams(search);
  const names = new Set(params.getAll(signedNamesParam));
  const signed = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === "sig" || key === signedNamesParam || names.has(key)) {
      signed.append(key, value);
    }
  }
  return params.has("sig") && names.size > 0 ? signed.toString() : undefined;
};
