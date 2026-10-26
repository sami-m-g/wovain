import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createGitLab } from "../src/gitlab.ts";

// The REST client against a local server that speaks GitLab's pagination
// headers: what goes on the wire, the page cap and the error rule (status and
// path only, never GitLab's response body).

interface Seen {
  body: string;
  method: string;
  url: URL;
}

const seen: Seen[] = [];
let server: Server;
let gitlab: ReturnType<typeof createGitLab>;
let base = "";

const note = (n: number) => ({
  author: { username: "duo" },
  body: `note ${n}`,
  created_at: "2026-10-26T00:00:00Z",
  system: false,
});

const reply = (
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) => {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(body));
};

// Notes on issue 7 run for `pages` pages of one note; issue 8 never ends.
const notesPage = (
  url: URL,
  request: IncomingMessage,
  response: ServerResponse
) => {
  const issue = Number(
    /issues\/(?<issue>\d+)\/notes/u.exec(url.pathname)?.groups?.["issue"]
  );
  const page = Number(url.searchParams.get("page") ?? "1");
  const last = issue === 7 ? 3 : Number.POSITIVE_INFINITY;
  const next = page < last ? String(page + 1) : "";
  const link = next
    ? `<${base}${url.pathname}?page=${next}&per_page=100&sort=desc>; rel="next"`
    : "";
  reply(response, 200, [note(page)], {
    ...(link ? { link } : {}),
    "x-next-page": next,
    "x-page": String(page),
  });
  return request;
};

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const url = new URL(request.url ?? "/", base);
      seen.push({
        body: Buffer.concat(chunks).toString(),
        method: request.method ?? "",
        url,
      });
      if (url.pathname.endsWith("/issues/404/notes")) {
        reply(response, 404, { message: "secret issue title" });
      } else if (url.pathname.includes("/notes")) {
        notesPage(url, request, response);
      } else if (url.pathname.endsWith("/artifacts/main/raw/sci.json")) {
        reply(response, 200, { total: 1 });
      } else if (url.pathname.endsWith("/deployments")) {
        reply(response, 200, [{ created_at: "2026-10-26T00:00:00Z" }]);
      } else {
        reply(response, 200, []);
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  gitlab = createGitLab({
    api: `${base}/api/v4`,
    project: "42",
    projectPath: "group/project",
    token: "t0ken",
  });
});

afterAll(() => {
  server.close();
});

describe("gitlab REST client", () => {
  it("sends filters as snake_case query parameters with the token", async () => {
    await gitlab.issues({
      labels: "heal",
      state: "all",
      updatedAfter: "2026-10-19T00:00:00Z",
    });
    const call = seen.at(-1);
    expect(call?.url.pathname).toBe("/api/v4/projects/42/issues");
    expect(Object.fromEntries(call?.url.searchParams ?? [])).toMatchObject({
      labels: "heal",
      per_page: "100",
      state: "all",
      updated_after: "2026-10-19T00:00:00Z",
    });
  });

  it("follows every page of a list", async () => {
    const notes = await gitlab.issueNotes(7);
    expect(notes.map((n) => n.body)).toEqual(["note 1", "note 2", "note 3"]);
  });

  it("stops at 20 pages and says so", async () => {
    await expect(gitlab.issueNotes(8)).rejects.toThrow(
      "GitLab GET issues/8/notes: more than 20 pages"
    );
  });

  it("reports the status and path, never the response body", async () => {
    const error = await gitlab
      .issueNotes(404)
      .catch((error_: unknown) => error_);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "GitLab GET projects/42/issues/404/notes: 404"
    );
    expect((error as Error).message).not.toContain("secret");
  });

  it("sends update fields in the JSON body", async () => {
    await gitlab.updateIssue(5, { stateEvent: "reopen" }).catch(() => null);
    const call = seen.find((c) => c.method === "PUT");
    expect(call?.url.pathname).toBe("/api/v4/projects/42/issues/5");
    expect(JSON.parse(call?.body ?? "{}")).toEqual({ state_event: "reopen" });
  });

  it("reads a job artifact as JSON", async () => {
    const sci = await gitlab.latestArtifactJson(
      z.object({
        total: z.number(),
      }),
      "main",
      "sci",
      "sci.json"
    );
    expect(sci).toEqual({ total: 1 });
    expect(seen.at(-1)?.url.searchParams.get("job")).toBe("sci");
  });

  it("filters deployments by finish date", async () => {
    const found = await gitlab.deployments(new Date("2026-10-19T00:00:00Z"));
    expect(found).toHaveLength(1);
    expect(
      Object.fromEntries(seen.at(-1)?.url.searchParams ?? [])
    ).toMatchObject({
      environment: "production",
      finished_after: "2026-10-19T00:00:00.000Z",
      order_by: "finished_at",
      status: "success",
    });
  });
});
