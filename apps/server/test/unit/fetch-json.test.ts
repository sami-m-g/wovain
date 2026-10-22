import { afterEach, expect, test } from "vitest";
import { z } from "zod";

import { fetchJson } from "../../src/lib/fetch-json.ts";
import { restoreFetch, stubFetch } from "../helpers.ts";

afterEach(restoreFetch);

const schema = z.object({ id: z.string() });
const options = { label: "Upstream", timeoutMs: 1000 };

test("returns the parsed body", async () => {
  stubFetch(async () => await Promise.resolve(Response.json({ id: "a" })));
  await expect(fetchJson("https://x.test/", schema, options)).resolves.toEqual({
    id: "a",
  });
});

test("names the upstream and status when the answer is not ok", async () => {
  stubFetch(
    async () => await Promise.resolve(Response.json({}, { status: 503 }))
  );
  await expect(fetchJson("https://x.test/", schema, options)).rejects.toThrow(
    "Upstream answered 503"
  );
});

test("appends the reason from an error body", async () => {
  stubFetch(
    async () =>
      await Promise.resolve(
        Response.json({ error: { message: "bad" } }, { status: 400 })
      )
  );
  await expect(fetchJson("https://x.test/", schema, options)).rejects.toThrow(
    "Upstream answered 400: bad"
  );
});

test("rejects a body that fails the schema", async () => {
  stubFetch(async () => await Promise.resolve(Response.json({ id: 1 })));
  await expect(fetchJson("https://x.test/", schema, options)).rejects.toThrow();
});
