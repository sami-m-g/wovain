import { RevisionsClient, ServicesClient } from "@google-cloud/run";

// A Cloud Run service's traffic, through Google's official client
// (@google-cloud/run, Cloud Run Admin API v2). The deploy job creates the
// canary revision with `gcloud run deploy --no-traffic --tag canary` and
// gives it a share (.gitlab/ci/deploy.yml); this moves the traffic after the
// verdict. Needs roles/run.developer on the service and
// roles/iam.serviceAccountUser on its runtime account (the deploy account
// has both, infra/index.ts).

const REVISION = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION" as const;
export const CANARY_TAG = "canary";

export interface Target {
  revision: string;
  percent: number;
  tag?: string | undefined;
  uri?: string | undefined;
}

// The service's resolved split: revision names even where the spec says
// LATEST.
export const splitOf = (
  statuses: {
    revision?: string | null;
    percent?: number | null;
    tag?: string | null;
    uri?: string | null;
  }[]
): { canary: Target | undefined; stable: Target | undefined } => {
  const targets: Target[] = statuses.flatMap((s) =>
    s.revision === undefined || s.revision === null || s.revision === ""
      ? []
      : [
          {
            percent: s.percent ?? 0,
            revision: s.revision,
            tag: s.tag ?? undefined,
            uri: s.uri ?? undefined,
          },
        ]
  );
  const canary = targets.find((t) => t.tag === CANARY_TAG);
  const [stable] = targets
    .filter((t) => t.revision !== canary?.revision && t.percent > 0)
    .toSorted((a, b) => b.percent - a.percent);
  return { canary, stable };
};

export const createCloudRun = (options: {
  project: string;
  region: string;
  service: string;
}) => {
  const services = new ServicesClient();
  const revisions = new RevisionsClient();
  const name = `projects/${options.project}/locations/${options.region}/services/${options.service}`;

  const get = async () => {
    const [service] = await services.getService({ name });
    return service;
  };

  return {
    name,
    // Every revision of the service, newest first.
    revisions: async () => {
      const [found] = await revisions.listRevisions({ parent: name });
      return found
        .flatMap((r) =>
          r.name === undefined || r.name === null
            ? []
            : [
                {
                  createdAt: Number(r.createTime?.seconds ?? 0) * 1000,
                  name: r.name.split("/").at(-1) ?? r.name,
                  ready:
                    r.conditions?.some(
                      (c) =>
                        c.type === "Ready" && c.state === "CONDITION_SUCCEEDED"
                    ) ?? false,
                },
              ]
        )
        .toSorted((a, b) => b.createdAt - a.createdAt);
    },
    // All traffic to one revision, every tag dropped but the ones listed
    // (kept at 0%, so their URLs still answer for debugging).
    sendAllTo: async (revision: string, keepTags: Target[] = []) => {
      const service = await get();
      service.traffic = [
        { percent: 100, revision, type: REVISION },
        ...keepTags
          .filter((t) => t.revision !== revision)
          .map((t) => ({
            percent: 0,
            revision: t.revision,
            tag: t.tag ?? null,
            type: REVISION,
          })),
      ];
      const [operation] = await services.updateService({ service });
      await operation.promise();
    },
    split: async () => {
      const service = await get();
      return splitOf(service.trafficStatuses ?? []);
    },
  };
};

export type CloudRun = ReturnType<typeof createCloudRun>;
