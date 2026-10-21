import { initializeApp } from "firebase-admin/app";
import type { AppOptions } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { bucketMedia } from "./store.ts";

// Firestore and the private Storage bucket for one Firebase app. On App
// Hosting the app finds its project and bucket on its own; the emulators
// (FIRESTORE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST) take over in
// tests and local development.
export const createStorage = (options?: AppOptions, name?: string) => {
  const app = initializeApp(options, name);
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  // WOVAIN_BUCKET names the private media bucket (infra/index.ts); the
  // emulators use the app's default bucket.
  const bucket = getStorage(app).bucket(process.env["WOVAIN_BUCKET"]);
  return { db, media: bucketMedia(bucket) };
};

export type Storage = ReturnType<typeof createStorage>;
