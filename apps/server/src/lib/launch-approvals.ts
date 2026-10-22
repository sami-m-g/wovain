import { randomBytes, timingSafeEqual } from "node:crypto";

import { Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

// The merchant's own confirmation of a campaign launch, out of band from the
// chat: the Launch button opens wovain's confirm page, the merchant signs in
// to wovain in their browser, sees the campaign and its budget, and presses
// Confirm. Only that POST writes an approval, and launch_campaign spends only
// by consuming one. Nothing a tool returns can approve a launch.

// launchRequests/{id}: a pending confirm page for one merchant and campaign.
// When the page is shown, the hashes of its cookie and its form's CSRF token
// are stored; the POST must bring both.
const requestSchema = z.object({
  campaignId: z.string(),
  confirmHash: z.string().optional(),
  csrfHash: z.string().optional(),
  expiresAt: z.instanceof(Timestamp),
  summary: z.string(),
  userId: z.string(),
});

// launchApprovals/{userId}: the confirmed launch, consumed once.
const approvalSchema = z.object({
  campaignId: z.string(),
  expiresAt: z.instanceof(Timestamp),
});

const REQUEST_MS = 10 * 60 * 1000;
const APPROVAL_MS = 10 * 60 * 1000;

const sameHash = (stored: string | undefined, given: string) =>
  stored !== undefined &&
  stored.length === given.length &&
  timingSafeEqual(Buffer.from(stored), Buffer.from(given));

export const createLaunchApprovals = (
  db: Firestore,
  now: () => number = Date.now
) => {
  const requests = db.collection("launchRequests");
  const approvals = db.collection("launchApprovals");
  const expiry = (ms: number) => Timestamp.fromMillis(now() + ms);
  const live = (expiresAt: Timestamp) => expiresAt.toMillis() > now();
  const pending = async (id: string) => {
    const doc = await requests.doc(id).get();
    const request = doc.exists ? requestSchema.parse(doc.data()) : undefined;
    return request !== undefined && live(request.expiresAt)
      ? request
      : undefined;
  };

  return {
    // The Confirm press: the page's cookie and CSRF token must match what
    // `prepare` stored. Approves once and deletes the request.
    confirm: async (id: string, confirmHash: string, csrfHash: string) =>
      await db.runTransaction(async (tx) => {
        const ref = requests.doc(id);
        const doc = await tx.get(ref);
        const request = doc.exists
          ? requestSchema.parse(doc.data())
          : undefined;
        const valid =
          request !== undefined &&
          live(request.expiresAt) &&
          sameHash(request.confirmHash, confirmHash) &&
          sameHash(request.csrfHash, csrfHash);
        if (valid) {
          tx.delete(ref);
          tx.set(approvals.doc(request.userId), {
            campaignId: request.campaignId,
            expiresAt: expiry(APPROVAL_MS),
          });
        }
        return valid;
      }),

    // Consumes the merchant's confirmation for this campaign, once.
    consume: async (userId: string, campaignId: string) =>
      await db.runTransaction(async (tx) => {
        const ref = approvals.doc(userId);
        const doc = await tx.get(ref);
        const approval = doc.exists
          ? approvalSchema.parse(doc.data())
          : undefined;
        const valid =
          approval?.campaignId === campaignId && live(approval.expiresAt);
        if (doc.exists) {
          tx.delete(ref);
        }
        return valid;
      }),

    create: async (userId: string, campaignId: string, summary: string) => {
      const id = randomBytes(24).toString("base64url");
      await requests
        .doc(id)
        .set({ campaignId, expiresAt: expiry(REQUEST_MS), summary, userId });
      return id;
    },

    // Whose confirm page this is, before they sign in.
    owner: async (id: string) => {
      const request = await pending(id);
      return request?.userId;
    },

    // Shows the page to the signed-in merchant it was made for: stores the
    // hashes of its cookie and CSRF token, and returns what to show.
    prepare: async (
      id: string,
      userId: string,
      hashes: { confirmHash: string; csrfHash: string }
    ) => {
      const request = await pending(id);
      const mine = request?.userId === userId;
      if (mine) {
        await requests.doc(id).update(hashes);
      }
      return mine
        ? { campaignId: request.campaignId, summary: request.summary }
        : undefined;
    },
  };
};

export type LaunchApprovals = ReturnType<typeof createLaunchApprovals>;
