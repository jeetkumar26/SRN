import admin from "firebase-admin";
import path from "path";
import fs from "fs";
import { logger } from "./logger";

let serviceAccount: object;

const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON;
const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;

if (keyJson) {
  // Cloud/Railway: JSON string stored as env var
  try {
    serviceAccount = JSON.parse(keyJson);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY_JSON is not valid JSON.");
  }
} else if (keyPath) {
  // Local dev: path to service account file
  const resolvedPath = path.isAbsolute(keyPath)
    ? keyPath
    : path.resolve(process.cwd(), keyPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Firebase service account file not found at: ${resolvedPath}`);
  }
  serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
} else {
  throw new Error(
    "Firebase credentials not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY_JSON (cloud) or FIREBASE_SERVICE_ACCOUNT_KEY_PATH (local)."
  );
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

export const db = admin.firestore();
export const messaging = admin.messaging();
logger.info("Firebase Admin SDK initialized successfully");
