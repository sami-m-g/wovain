import {
  adMediaSchema,
  adStatusOf,
  mergeConcepts,
  storedAdSchema,
} from "@wovain/shared/ad";
import type { Ad, AdMedia, ConceptRevision, Decision } from "@wovain/shared/ad";
import {
  AUTOPILOT_TERMS,
  autopilotConsentSchema,
  autopilotRunSchema,
} from "@wovain/shared/autopilot";
import type { AutopilotConsent, AutopilotRun } from "@wovain/shared/autopilot";
import { savedCampaignSchema } from "@wovain/shared/campaign";
import type { SavedCampaign } from "@wovain/shared/campaign";
import { designSchema, stagedArtworkSchema } from "@wovain/shared/design";
import type { Design, StagedArtwork } from "@wovain/shared/design";
import { applySettingsPatch, settingsSchema } from "@wovain/shared/settings";
import type { Settings, SettingsPatch } from "@wovain/shared/settings";
import { briefRecordSchema } from "@wovain/shared/trends";
import type {
  DocumentData,
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import { z } from "zod";

type Bucket = ReturnType<Storage["bucket"]>;

type Kind =
  | "ad"
  | "ad-media"
  | "artwork"
  | "autopilotConsent"
  | "autopilotRun"
  | "brief"
  | "campaign"
  | "design"
  | "settings";

// Settings and the campaign are single records.
const ONLY = "current";

// Artwork bytes between stage_artwork and put_artwork, which may run on
// different server instances.
export interface Media {
  get: (key: string) => Promise<Uint8Array<ArrayBuffer> | undefined>;
  put: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>;
}

// The project's private Cloud Storage bucket: readable only with the
// server's credentials.
export const bucketMedia = (bucket: Bucket): Media => ({
  get: async (key) => {
    const file = bucket.file(key);
    const [exists] = await file.exists();
    const [bytes] = exists ? await file.download() : [];
    return bytes === undefined ? undefined : new Uint8Array(bytes);
  },
  put: async (key, bytes, contentType) => {
    await bucket
      .file(key)
      .save(Buffer.from(bytes), { contentType, resumable: false });
  },
});

// One kind of record under users/{userId}, checked against its schema.
const tableIn =
  (user: DocumentReference) =>
  <T extends DocumentData>(kind: Kind, schema: z.ZodType<T>) => {
    const collection = user.collection(kind);
    return {
      all: async (tx?: Transaction): Promise<T[]> => {
        const snapshot = await (tx?.get(collection) ?? collection.get());
        return snapshot.docs.map((doc) => schema.parse(doc.data()));
      },
      get: async (id: string, tx?: Transaction): Promise<T | undefined> => {
        const ref = collection.doc(id);
        const doc = await (tx?.get(ref) ?? ref.get());
        return doc.exists ? schema.parse(doc.data()) : undefined;
      },
      // Counters make ids unique even when two tool calls save at once.
      nextId: async (prefix: string, tx: Transaction) => {
        const ref = user.collection("counters").doc(kind);
        const doc = await tx.get(ref);
        const { n: last } = doc.exists
          ? z.object({ n: z.int() }).parse(doc.data())
          : { n: 0 };
        const n = last + 1;
        tx.set(ref, { n });
        return `${prefix}${n}`;
      },
      put: async (id: string, value: T, tx?: Transaction): Promise<T> => {
        const saved = schema.parse(value);
        const ref = collection.doc(id);
        await (tx === undefined ? ref.set(saved) : tx.set(ref, saved));
        return saved;
      },
    };
  };

interface Table<T> {
  all: (tx?: Transaction) => Promise<T[]>;
  get: (id: string, tx?: Transaction) => Promise<T | undefined>;
  put: (id: string, value: T, tx?: Transaction) => Promise<T>;
}

// One merchant's autopilot records: the opt-in the confirm page writes and
// the runs, plus the transactions that check them.
const autopilotRecords = ({
  consents,
  designs,
  requireDesign,
  runs,
  transaction,
}: {
  consents: Table<AutopilotConsent>;
  designs: Table<Design>;
  requireDesign: (id: string, tx: Transaction) => Promise<Design>;
  runs: Table<AutopilotRun>;
  transaction: <T>(work: (tx: Transaction) => Promise<T>) => Promise<T>;
}) => {
  const runningIn = async (tx: Transaction) => {
    const all = await runs.all(tx);
    return all.find((run) => run.status === "running");
  };

  // Changes the running autopilot run in one transaction; undefined when
  // none is running.
  const changeRunningRun = async (
    change: (run: AutopilotRun) => AutopilotRun
  ) =>
    await transaction(async (tx) => {
      const running = await runningIn(tx);
      return running === undefined
        ? undefined
        : await runs.put(running.id, change(running), tx);
    });

  return {
    changeRun: async (
      id: string,
      change: (run: AutopilotRun) => AutopilotRun
    ) =>
      await transaction(async (tx) => {
        const run = await runs.get(id, tx);
        if (run === undefined) {
          throw new Error(`No autopilot run ${id}`);
        }
        return await runs.put(id, change(run), tx);
      }),
    changeRunningRun,
    getAutopilotConsent: async (): Promise<AutopilotConsent | undefined> =>
      await consents.get(ONLY),
    getAutopilotRuns: async (): Promise<AutopilotRun[]> => await runs.all(),
    // replaceDesign for an autopilot approval: in the same transaction, the
    // run must still be running and the merchant's opt-in still current.
    replaceDesignInRun: async (
      id: string,
      runId: string,
      change: (current: Design) => Omit<Design, "id">
    ) =>
      await transaction(async (tx) => {
        const [run, consent, current] = await Promise.all([
          runs.get(runId, tx),
          consents.get(ONLY, tx),
          requireDesign(id, tx),
        ]);
        if (run?.status !== "running") {
          throw new Error(`Autopilot run ${runId} isn't running.`);
        }
        if (
          consent?.version !== AUTOPILOT_TERMS.version ||
          consent.revokedAt !== undefined
        ) {
          throw new Error("Autopilot is off for this merchant.");
        }
        return await designs.put(id, { ...change(current), id }, tx);
      }),
    runningIn,
    saveAutopilotConsent: async (consent: AutopilotConsent) =>
      await consents.put(ONLY, consent),
    // Creates the run unless one with its id exists (the same runKey returns
    // that run); refuses while another run is still running.
    startRun: async (run: AutopilotRun) =>
      await transaction(async (tx) => {
        const all = await runs.all(tx);
        const same = all.find((item) => item.id === run.id);
        if (same !== undefined) {
          return same;
        }
        const running = all.find((item) => item.status === "running");
        if (running !== undefined) {
          throw new Error(
            `Autopilot run ${running.id} is still running: stop it with autopilot_stop first.`
          );
        }
        return await runs.put(run.id, run, tx);
      }),
  };
};

// One merchant's records (spec.md > Data Model): settings, staged artwork,
// designs, ads (one ad set per design, keyed by design id) and the campaign,
// as Firestore documents under users/{userId}/{kind}/{id}, each checked
// against its schema on every read.
export const createStore = (db: Firestore, media: Media, userId: string) => {
  const user = db.collection("users").doc(userId);
  const table = tableIn(user);
  const ads = table("ad", storedAdSchema);
  const adMedia = table("ad-media", adMediaSchema);
  const briefs = table("brief", briefRecordSchema);
  const artworks = table("artwork", stagedArtworkSchema);
  const campaigns = table("campaign", savedCampaignSchema);
  const designs = table("design", designSchema);
  const settingsTable = table("settings", settingsSchema);
  const consents = table("autopilotConsent", autopilotConsentSchema);
  const runs = table("autopilotRun", autopilotRunSchema);

  const settings = async () =>
    (await settingsTable.get(ONLY)) ?? settingsSchema.parse({});
  const requireDesign = async (id: string, tx?: Transaction) => {
    const design = await designs.get(id, tx);
    if (design === undefined) {
      throw new Error(`No design ${id}`);
    }
    return design;
  };

  // Each change that reads before it writes runs in one transaction, so
  // overlapping tool calls (a widget polling while a skill writes) can't
  // interleave inside it. Firestore wants every read before the first write.
  const transaction = async <T>(work: (tx: Transaction) => Promise<T>) =>
    await db.runTransaction(work, { maxAttempts: 10 });

  // Records approve or skip on a product's concepts and counts the ad widgets
  // still waiting, in one step.
  const recordConcepts = async (
    designId: string,
    statuses: Record<string, Decision>
  ) =>
    await transaction(async (tx) => {
      const all = await ads.all(tx);
      const current = all.find((item) => item.designId === designId);
      const known = new Set(current?.concepts.map((concept) => concept.id));
      const unknown = Object.keys(statuses).find((id) => !known.has(id));
      if (current === undefined || unknown !== undefined) {
        throw new Error(`No ad ${unknown ?? ""} for ${designId}`);
      }
      const concepts = current.concepts.map((concept) => {
        const status = statuses[concept.id];
        return status === undefined ? concept : { ...concept, status };
      });
      const ad = await ads.put(
        designId,
        { ...current, concepts, status: adStatusOf(concepts) },
        tx
      );
      const waiting = all.filter(
        (item) => item.designId !== designId && item.status === "draft"
      ).length;
      return { ad, waiting: ad.status === "draft" ? waiting + 1 : waiting };
    });

  const { runningIn, ...autopilot } = autopilotRecords({
    consents,
    designs,
    requireDesign,
    runs,
    transaction,
  });

  return {
    ...autopilot,
    getAdMedia: async (designId: string): Promise<AdMedia> =>
      (await adMedia.get(designId)) ?? { jobs: [], urls: [] },
    getAds: async (): Promise<Ad[]> => await ads.all(),
    getArtwork: async (id: string): Promise<StagedArtwork | undefined> =>
      await artworks.get(id),
    getCampaign: async (): Promise<SavedCampaign | undefined> =>
      await campaigns.get(ONLY),
    getDesign: async (id: string): Promise<Design | undefined> =>
      await designs.get(id),
    getDesigns: async (): Promise<Design[]> => await designs.all(),
    getSettings: async (): Promise<Settings> => await settings(),
    ownsBrief: async (id: string) => (await briefs.get(id)) !== undefined,
    readArtworkBytes: async (artwork: StagedArtwork) => {
      const bytes = await media.get(artwork.key);
      if (bytes === undefined) {
        throw new Error(`staged artwork ${artwork.id} has no bytes`);
      }
      return bytes;
    },
    // Adds submitted jobs (or their GPU time, by request ID) or collected URLs
    // to a design's ad media.
    recordAdMedia: async (designId: string, added: Partial<AdMedia>) =>
      await transaction(async (tx) => {
        const current = (await adMedia.get(designId, tx)) ?? {
          jobs: [],
          urls: [],
        };
        const jobs = new Map(current.jobs.map((job) => [job.requestId, job]));
        for (const job of added.jobs ?? []) {
          jobs.set(job.requestId, { ...jobs.get(job.requestId), ...job });
        }
        return await adMedia.put(
          designId,
          {
            jobs: [...jobs.values()],
            urls: [...new Set([...current.urls, ...(added.urls ?? [])])],
          },
          tx
        );
      }),
    // Records one concept's approve or skip, sets the product's status from
    // all its concepts and counts the ad widgets still waiting, in one step.
    recordConcept: async (
      designId: string,
      conceptId: string,
      status: Decision
    ) => await recordConcepts(designId, { [conceptId]: status }),
    // Several concepts' choices in one step (autopilot decides them together).
    recordConcepts,
    // Reads and replaces a design in one transaction: `change` sees the
    // stored copy, may throw to refuse, and returns the whole new design
    // (fields it leaves out are removed).
    replaceDesign: async (
      id: string,
      change: (current: Design) => Omit<Design, "id">
    ) =>
      await transaction(
        async (tx) =>
          await designs.put(
            id,
            { ...change(await requireDesign(id, tx)), id },
            tx
          )
      ),
    requireDesign: async (id: string): Promise<Design> =>
      await requireDesign(id),
    // Bytes go to media first, so a record never points at missing bytes.
    saveArtwork: async (
      artwork: Omit<StagedArtwork, "id" | "key">,
      bytes: Uint8Array,
      fileName: string
    ): Promise<StagedArtwork> => {
      const key = `${userId}/${fileName}`;
      await media.put(key, bytes, artwork.contentType);
      return await transaction(async (tx) => {
        const id = await artworks.nextId("a", tx);
        return await artworks.put(id, { ...artwork, id, key }, tx);
      });
    },
    saveBrief: async (id: string) => await briefs.put(id, { id }),
    saveCampaign: async (campaign: SavedCampaign) =>
      await campaigns.put(ONLY, campaign),
    // Adds or revises concepts on a product's ads; the rest keep their choice.
    saveConcepts: async (
      ad: Omit<Ad, "concepts" | "status">,
      concepts: ConceptRevision[]
    ) =>
      await transaction(async (tx) => {
        const current = await ads.get(ad.designId, tx);
        const merged = mergeConcepts(current?.concepts ?? [], concepts);
        return await ads.put(
          ad.designId,
          { ...ad, concepts: merged, status: adStatusOf(merged) },
          tx
        );
      }),
    // A design without an id is new; one with an id replaces the stored copy,
    // keeping its publish state unless the caller sets it.
    saveDesign: async (
      design: Omit<Design, "id"> & { id?: string | undefined }
    ) =>
      await transaction(async (tx) => {
        // A new id has no stored copy, so its read is skipped. A new design
        // made while an autopilot run is running belongs to that run.
        const current =
          design.id === undefined
            ? undefined
            : await designs.get(design.id, tx);
        const running = current === undefined ? await runningIn(tx) : undefined;
        const id = design.id ?? (await designs.nextId("d", tx));
        const { run: _ignored, ...fields } = design;
        return await designs.put(
          id,
          {
            ...current,
            ...fields,
            ...(running === undefined ? {} : { run: running.id }),
            id,
          },
          tx
        );
      }),
    updateDesign: async (id: string, patch: Partial<Design>) =>
      await transaction(
        async (tx) =>
          await designs.put(
            id,
            { ...(await requireDesign(id, tx)), ...patch, id },
            tx
          )
      ),
    updateSettings: async (patch: SettingsPatch): Promise<Settings> =>
      await settingsTable.put(
        ONLY,
        applySettingsPatch(await settings(), patch)
      ),
    userId,
  };
};

export type Store = ReturnType<typeof createStore>;
