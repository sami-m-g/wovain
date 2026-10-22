import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

// Merchants' records in Firestore, read through its REST API as gitlab-analytics
// (datastore.viewer). Field masks keep the read to the fields the funnel
// needs: statuses, video states, the rules list and the GPU seconds fal
// reported for each generated clip. Nothing about a merchant leaves this
// module except counts and those clip timings, which weekly.ts only
// publishes as one aggregate (count, median, p90).

const MAX_USERS = 500;

const valueSchema = z.object({
  arrayValue: z.object({ values: z.array(z.unknown()).default([]) }).optional(),
  stringValue: z.string().optional(),
});
const documentsSchema = z.object({
  documents: z
    .array(
      z.object({
        fields: z.record(z.string(), valueSchema).default({}),
        name: z.string(),
      })
    )
    .default([]),
});

export interface MerchantRecords {
  connections: number;
  designs: string[];
  ads: { status: string; videosReady: number }[];
  campaigns: { rules: number }[];
  // GPU seconds fal reported per generated clip (ad-media jobs on an
  // image- or reference-to-video endpoint) and when they were read.
  clips: ClipSample[];
}

export interface ClipSample {
  at: string;
  gpuSeconds: number;
}

const readyVideos = (videos: unknown[]) =>
  videos.filter((video) =>
    JSON.stringify(video).includes('"stringValue":"ready"')
  ).length;

// One ad-media job in Firestore's REST encoding; a number may come back as
// doubleValue or (for whole seconds) integerValue, a string.
const falJobSchema = z.object({
  mapValue: z.object({
    fields: z.object({
      endpointId: z.object({ stringValue: z.string() }),
      gpuSeconds: z
        .object({
          doubleValue: z.number().optional(),
          integerValue: z.coerce.number().optional(),
        })
        .optional(),
      measuredAt: z.object({ stringValue: z.string() }).optional(),
    }),
  }),
});
const CLIP_ENDPOINT = /(?:image|reference)-to-video$/u;

const clipSamples = (jobs: unknown[]): ClipSample[] =>
  jobs.flatMap((job) => {
    const parsed = falJobSchema.safeParse(job);
    const fields = parsed.success ? parsed.data.mapValue.fields : undefined;
    const gpuSeconds =
      fields?.gpuSeconds?.doubleValue ?? fields?.gpuSeconds?.integerValue;
    const at = fields?.measuredAt?.stringValue;
    return gpuSeconds !== undefined &&
      at !== undefined &&
      CLIP_ENDPOINT.test(fields?.endpointId.stringValue ?? "")
      ? [{ at, gpuSeconds }]
      : [];
  });

export const readRecords = async (
  project: string
): Promise<MerchantRecords[]> => {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  const client = await auth.getClient();
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const list = async (path: string, mask: string[]) => {
    const url = new URL(`${base}/${path}`);
    url.searchParams.set("pageSize", "300");
    url.searchParams.set("showMissing", "true");
    for (const field of mask) {
      url.searchParams.append("mask.fieldPaths", field);
    }
    const response = await client.request({ url: url.toString() });
    return documentsSchema.parse(response.data).documents;
  };

  // User documents have no fields; their subcollections hold the records.
  const all = await list("users", ["status"]);
  const users = all.slice(0, MAX_USERS);
  return await Promise.all(
    users.map(async (user) => {
      const id = user.name.split("/").at(-1) ?? "";
      const [connections, designs, ads, campaigns, media] = await Promise.all([
        list(`users/${id}/connections`, ["provider"]),
        list(`users/${id}/design`, ["status"]),
        list(`users/${id}/ad`, ["status", "videos"]),
        list(`users/${id}/campaign`, ["rulesCreated"]),
        list(`users/${id}/ad-media`, ["jobs"]),
      ]);
      return {
        ads: ads.map((ad) => ({
          status: ad.fields["status"]?.stringValue ?? "draft",
          videosReady: readyVideos(
            ad.fields["videos"]?.arrayValue?.values ?? []
          ),
        })),
        campaigns: campaigns.map((c) => ({
          rules: c.fields["rulesCreated"]?.arrayValue?.values.length ?? 0,
        })),
        clips: media.flatMap((m) =>
          clipSamples(m.fields["jobs"]?.arrayValue?.values ?? [])
        ),
        connections: connections.length,
        designs: designs.map((d) => d.fields["status"]?.stringValue ?? "draft"),
      };
    })
  );
};
