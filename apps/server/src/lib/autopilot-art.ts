import type { AutopilotRun, RunArt } from "@wovain/shared/autopilot";
import { dropProducts, printsOf } from "@wovain/shared/design";
import type { Design } from "@wovain/shared/design";

import type { Store } from "../store.ts";
import { OCR_ENDPOINT, OCR_USD } from "./art-plan.ts";
import { AutopilotRefusedError, chargeRun, recordArt } from "./autopilot.ts";
import { mediaUrls, textField } from "./fal-media.ts";
import type { Upstream } from "./upstream.ts";

// Autopilot's check on a design's art: every artwork must be an image
// generate_art made in this run, and OCR on fal must find no words on it
// beyond what its piece declared. The declared words go to the trademark
// screen.

export type FalCaller = Pick<Upstream, "call">;

const fal = async (
  upstream: FalCaller | undefined,
  userId: string,
  tool: string,
  args: Record<string, unknown>
) => {
  if (upstream === undefined) {
    throw new AutopilotRefusedError(
      "Connections aren't set up on this wovain server, so autopilot can't check the art."
    );
  }
  const outcome = await upstream.call({ args, id: "fal", tool, userId });
  if (outcome.kind === "connect") {
    throw new AutopilotRefusedError(
      `The merchant's fal account needs connecting: ${outcome.connect.connectUrl}`
    );
  }
  if (outcome.result.isError === true) {
    throw new AutopilotRefusedError(`fal refused ${tool}.`);
  }
  return outcome.result;
};

// The run's art with every finished job's image: reads the results not read
// yet. A job still running has no image yet.
const finishedArt = async (
  upstream: FalCaller | undefined,
  store: Store,
  run: AutopilotRun
) => {
  const read = await Promise.all(
    run.art.map(async (job): Promise<RunArt> => {
      if (job.url !== undefined) {
        return job;
      }
      // A job that's still running, or that fal can't read, has no image yet.
      const urls = await fal(upstream, store.userId, "get_job_result", {
        endpoint_id: job.endpointId,
        request_id: job.requestId,
      }).then(mediaUrls, (): string[] => []);
      const [url] = urls;
      return url === undefined ? job : { ...job, url };
    })
  );
  const found = new Map(
    read.flatMap((job) =>
      job.url === undefined ? [] : [[job.requestId, job.url] as const]
    )
  );
  await recordArt(store, (art) =>
    art.map((job) => {
      const url = found.get(job.requestId);
      return job.url !== undefined || url === undefined ? job : { ...job, url };
    })
  );
  return read;
};

const wordsOf = (text: string) =>
  (text.toUpperCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (word) => word.length >= 2
  );

// Words OCR reads on the image that its piece didn't declare.
const undeclaredWords = async (
  upstream: FalCaller | undefined,
  store: Store,
  job: RunArt & { url: string }
) => {
  await chargeRun(store, { on: true, usd: OCR_USD, what: "ocr" });
  const result = await fal(upstream, store.userId, "run_model", {
    endpoint_id: OCR_ENDPOINT,
    input: { image_url: job.url },
  });
  const read = textField(result, "results");
  if (read === undefined) {
    throw new AutopilotRefusedError(
      "OCR didn't return a reading of the art, so autopilot can't approve it."
    );
  }
  const declared = new Set(wordsOf(job.text.join(" ")));
  return wordsOf(read).filter((word) => !declared.has(word));
};

// Every artwork URL the design's products print.
const artworkUrls = (design: Design) => [
  ...new Set(
    dropProducts(design).flatMap((product) =>
      printsOf(product).map((print) => print.artwork.url)
    )
  ),
];

// Checks the design's art and returns the words its pieces declared, for the
// trademark screen. Refuses art the run didn't make or that prints more than
// it declared.
export const checkArt = async (
  upstream: FalCaller | undefined,
  store: Store,
  run: AutopilotRun,
  design: Design
) => {
  const art = await finishedArt(upstream, store, run);
  const byUrl = new Map(
    art.flatMap((job) =>
      job.url === undefined ? [] : [[job.url, job] as const]
    )
  );
  const jobs = artworkUrls(design).map((url) => {
    const job = byUrl.get(url);
    if (job === undefined) {
      throw new AutopilotRefusedError(
        `Artwork ${url} wasn't made by generate_art in this run: use the image URLs fal returned for this run's art.`
      );
    }
    return { ...job, url };
  });
  const extra = await Promise.all(
    jobs.map(async (job) => await undeclaredWords(upstream, store, job))
  );
  const words = [...new Set(extra.flat())];
  if (words.length > 0) {
    throw new AutopilotRefusedError(
      `The art prints words its pieces didn't declare (${words.slice(0, 8).join(", ")}): regenerate it with those words declared in text, or without them.`
    );
  }
  return [...new Set(jobs.flatMap((job) => job.text))];
};
