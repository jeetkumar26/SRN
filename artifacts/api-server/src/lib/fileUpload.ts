/**
 * FILE UPLOAD SYSTEM — MODULE 23
 *
 * Algorithm:
 * 1. Client requests a signed upload URL → POST /uploads/presigned
 * 2. Server validates: file type, size limit, user quota
 * 3. Server generates a Firebase Storage signed PUT URL (15-min TTL)
 * 4. Client uploads the file directly to Firebase Storage (bypasses server)
 * 5. Client confirms upload → POST /uploads/confirm
 * 6. Server verifies the file exists, creates media record in Firestore
 * 7. CDN-accessible download URL is returned for use
 *
 * Why signed URLs (not server-side upload):
 * - Zero server bandwidth cost for large files
 * - Firebase Storage enforces size/type rules via Security Rules
 * - Allows resumable uploads from mobile clients natively
 */

import admin from "firebase-admin";
import path from "path";
import { db } from "./firebase";

const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET;

// ---------------------------------------------------------------------------
// Allowed file types per upload context
// ---------------------------------------------------------------------------
export const ALLOWED_TYPES: Record<UploadContext, string[]> = {
  portfolio_image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  portfolio_video: ["video/mp4", "video/webm", "video/quicktime"],
  portfolio_document: ["application/pdf"],
  avatar: ["image/jpeg", "image/png", "image/webp"],
  requirement_attachment: ["application/pdf", "image/jpeg", "image/png", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  chat_attachment: ["image/jpeg", "image/png", "image/webp", "application/pdf",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4"],
  kyc_document: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

// Max file sizes in bytes per context
const MAX_FILE_SIZES: Record<UploadContext, number> = {
  portfolio_image: 10 * 1024 * 1024,       // 10 MB
  portfolio_video: 100 * 1024 * 1024,      // 100 MB
  portfolio_document: 20 * 1024 * 1024,    // 20 MB
  avatar: 5 * 1024 * 1024,                 // 5 MB
  requirement_attachment: 20 * 1024 * 1024, // 20 MB
  chat_attachment: 25 * 1024 * 1024,       // 25 MB
  kyc_document: 10 * 1024 * 1024,          // 10 MB
};

// Monthly upload quota per user (total bytes across all uploads)
const MONTHLY_QUOTA_BYTES = 500 * 1024 * 1024; // 500 MB/month

export type UploadContext =
  | "portfolio_image"
  | "portfolio_video"
  | "portfolio_document"
  | "avatar"
  | "requirement_attachment"
  | "chat_attachment"
  | "kyc_document";

export interface PresignedUrlRequest {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  context: UploadContext;
  entityId?: string; // portfolioId, requirementId, bookingId, etc.
}

export interface PresignedUrlResponse {
  uploadId: string;
  uploadUrl: string;      // signed PUT URL — client uploads directly here
  storagePath: string;    // path inside the bucket
  expiresAt: string;      // ISO timestamp — URL expires after this
}

export interface ConfirmUploadRequest {
  uploadId: string;
}

export interface MediaRecord {
  id: string;
  userId: string;
  context: UploadContext;
  entityId: string | null;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  publicUrl: string;
  status: "pending" | "confirmed" | "deleted";
  createdAt: number;
  confirmedAt: number | null;
}

// ---------------------------------------------------------------------------
// Generate a Firebase Storage signed PUT URL for direct client upload
// ---------------------------------------------------------------------------
export async function generatePresignedUploadUrl(
  userId: string,
  request: PresignedUrlRequest
): Promise<PresignedUrlResponse> {
  if (!BUCKET_NAME) {
    throw new Error("FIREBASE_STORAGE_BUCKET environment variable is not set.");
  }

  // Validate MIME type for the given context
  const allowedTypes = ALLOWED_TYPES[request.context];
  if (!allowedTypes.includes(request.mimeType)) {
    throw new ValidationError(
      `File type "${request.mimeType}" is not allowed for ${request.context}. Allowed: ${allowedTypes.join(", ")}`
    );
  }

  // Validate file size
  const maxSize = MAX_FILE_SIZES[request.context];
  if (request.fileSizeBytes > maxSize) {
    throw new ValidationError(
      `File size ${formatBytes(request.fileSizeBytes)} exceeds the limit of ${formatBytes(maxSize)} for ${request.context}.`
    );
  }

  // Check monthly quota
  await checkUploadQuota(userId, request.fileSizeBytes);

  const bucket = admin.storage().bucket(BUCKET_NAME);
  const ext = path.extname(request.fileName).toLowerCase();
  const sanitizedName = sanitizeFileName(request.fileName);
  const storagePath = `uploads/${userId}/${request.context}/${Date.now()}_${sanitizedName}`;

  const file = bucket.file(storagePath);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresAt,
    contentType: request.mimeType,
    extensionHeaders: {
      "x-goog-content-length-range": `0,${maxSize}`,
    },
  });

  // Create a pending media record
  const docRef = db.collection("media").doc();
  const uploadRecord: MediaRecord = {
    id: docRef.id,
    userId,
    context: request.context,
    entityId: request.entityId ?? null,
    fileName: sanitizedName,
    mimeType: request.mimeType,
    fileSizeBytes: request.fileSizeBytes,
    storagePath,
    publicUrl: "",      // filled in on confirmation
    status: "pending",
    createdAt: Date.now(),
    confirmedAt: null,
  };

  await docRef.set(uploadRecord);

  return {
    uploadId: docRef.id,
    uploadUrl: signedUrl,
    storagePath,
    expiresAt: expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Confirm upload: verify file landed in Storage, generate public URL, finalize
// ---------------------------------------------------------------------------
export async function confirmUpload(
  userId: string,
  uploadId: string
): Promise<MediaRecord> {
  if (!BUCKET_NAME) {
    throw new Error("FIREBASE_STORAGE_BUCKET environment variable is not set.");
  }

  const docRef = db.collection("media").doc(uploadId);
  const doc = await docRef.get();

  if (!doc.exists) throw new NotFoundError("Upload record not found.");

  const record = doc.data() as MediaRecord;

  if (record.userId !== userId) throw new ForbiddenError("Access denied.");
  if (record.status === "confirmed") return record; // idempotent
  if (record.status === "deleted") throw new ValidationError("Upload has been deleted.");

  // Verify the file actually exists in Firebase Storage
  const bucket = admin.storage().bucket(BUCKET_NAME);
  const file = bucket.file(record.storagePath);
  const [exists] = await file.exists();

  if (!exists) {
    throw new ValidationError("File not found in storage. Upload may have failed or expired.");
  }

  // Generate a long-lived signed read URL (1 year)
  const [publicUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });

  const now = Date.now();
  await docRef.update({
    status: "confirmed",
    publicUrl,
    confirmedAt: now,
  });

  // Track upload size against monthly quota
  const quotaRef = db.collection("upload_quotas").doc(userId);
  const monthKey = new Date().toISOString().substring(0, 7); // "2026-06"
  await quotaRef.set(
    { [monthKey]: admin.firestore.FieldValue.increment(record.fileSizeBytes) },
    { merge: true }
  );

  return { ...record, status: "confirmed", publicUrl, confirmedAt: now };
}

// ---------------------------------------------------------------------------
// Soft-delete a media record and remove file from Storage
// ---------------------------------------------------------------------------
export async function deleteMedia(userId: string, uploadId: string, isAdmin = false): Promise<void> {
  if (!BUCKET_NAME) throw new Error("FIREBASE_STORAGE_BUCKET not set.");

  const docRef = db.collection("media").doc(uploadId);
  const doc = await docRef.get();

  if (!doc.exists) throw new NotFoundError("Media not found.");

  const record = doc.data() as MediaRecord;
  if (record.userId !== userId && !isAdmin) throw new ForbiddenError("Access denied.");

  const bucket = admin.storage().bucket(BUCKET_NAME);
  const file = bucket.file(record.storagePath);
  const [exists] = await file.exists();
  if (exists) await file.delete();

  await docRef.update({ status: "deleted", deletedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Quota check: prevent abuse by limiting monthly upload volume per user
// ---------------------------------------------------------------------------
async function checkUploadQuota(userId: string, additionalBytes: number): Promise<void> {
  const monthKey = new Date().toISOString().substring(0, 7);
  const quotaDoc = await db.collection("upload_quotas").doc(userId).get();
  const currentUsage = (quotaDoc.data()?.[monthKey] as number) ?? 0;

  if (currentUsage + additionalBytes > MONTHLY_QUOTA_BYTES) {
    throw new ValidationError(
      `Monthly upload quota exceeded. Used: ${formatBytes(currentUsage)} / ${formatBytes(MONTHLY_QUOTA_BYTES)}.`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sanitizeFileName(fileName: string): string {
  return path
    .basename(fileName)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 200);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class ValidationError extends Error { constructor(msg: string) { super(msg); this.name = "ValidationError"; } }
export class NotFoundError extends Error { constructor(msg: string) { super(msg); this.name = "NotFoundError"; } }
export class ForbiddenError extends Error { constructor(msg: string) { super(msg); this.name = "ForbiddenError"; } }
