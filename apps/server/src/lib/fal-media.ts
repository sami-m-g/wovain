// Reads fal replies for the job handles wovain submitted and the media URLs
// they produced. Replies are untrusted data: only fields with the right shape
// are kept, and only https URLs on fal's media CDN.

import { replyRoots } from "./reply-json.ts";
import type { Reply } from "./reply-json.ts";

export interface FalJob {
  endpointId: string;
  requestId: string;
}

export const isFalMedia = (value: string) => {
  if (!URL.canParse(value)) {
    return false;
  }
  const { hostname, protocol } = new URL(value);
  return (
    protocol === "https:" &&
    (hostname === "fal.media" || hostname.endsWith(".fal.media"))
  );
};

const walk = (value: unknown, visit: (node: unknown) => void) => {
  visit(value);
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      walk(child, visit);
    }
  }
};

const collect = <T>(reply: Reply, pick: (node: unknown) => T | undefined) => {
  const found: T[] = [];
  for (const root of replyRoots(reply)) {
    walk(root, (node) => {
      const value = pick(node);
      if (value !== undefined) {
        found.push(value);
      }
    });
  }
  return found;
};

// Accepted jobs in a submit_jobs reply.
export const jobHandles = (reply: Reply): FalJob[] =>
  collect(reply, (node) =>
    typeof node === "object" &&
    node !== null &&
    "request_id" in node &&
    "endpoint_id" in node &&
    typeof node.request_id === "string" &&
    typeof node.endpoint_id === "string"
      ? { endpointId: node.endpoint_id, requestId: node.request_id }
      : undefined
  );

// The first string under `key` anywhere in a reply (a model's text output).
export const textField = (reply: Reply, key: string): string | undefined =>
  collect(reply, (node) => {
    const value: unknown =
      typeof node === "object" && node !== null
        ? Object.entries(node).find(([name]) => name === key)?.[1]
        : undefined;
    return typeof value === "string" ? value : undefined;
  })[0];

// The GPU seconds fal reports for a finished job: the queue's
// `metrics.inference_time` or a model's own `timings.inference` (H3 routes:
// DiT denoising on the GPU). fal names no GPU type. Undefined when absent.
export const gpuSeconds = (reply: Reply): number | undefined =>
  collect(reply, (node) => {
    const entries: [string, unknown][] =
      typeof node === "object" && node !== null ? Object.entries(node) : [];
    const value = entries.find(
      ([name]) => name === "inference_time" || name === "inference"
    )?.[1];
    return typeof value === "number" && value >= 0 ? value : undefined;
  })[0];

// Media URLs in a job result.
export const mediaUrls = (reply: Reply): string[] => [
  ...new Set(
    collect(reply, (node) =>
      typeof node === "string" && isFalMedia(node) ? node : undefined
    )
  ),
];
