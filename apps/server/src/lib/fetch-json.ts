import { z } from "zod";

// Meta's Graph API puts a readable reason at error.message; other upstreams
// just report the status.
const errorSchema = z.object({ error: z.object({ message: z.string() }) });

// One upstream JSON call: a timeout, a status check and a schema parse.
// A failure reads "<label> answered <status>", plus the upstream's reason.
export const fetchJson = async <T extends z.ZodType>(
  url: URL | string,
  schema: T,
  {
    label,
    timeoutMs,
    ...init
  }: RequestInit & { label: string; timeoutMs: number }
): Promise<z.output<T>> => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const reason = errorSchema.safeParse(
      await response.json().catch(() => null)
    );
    throw new Error(
      `${label} answered ${response.status}${reason.success ? `: ${reason.data.error.message}` : ""}`
    );
  }
  return schema.parse(await response.json());
};
