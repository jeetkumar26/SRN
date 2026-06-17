/**
 * KYC / VERIFICATION SYSTEM — MODULE 24
 *
 * Verification Levels (additive — each builds on the previous):
 *   Level 0 — Unverified (default)
 *   Level 1 — Email Verified   (Firebase email verification)
 *   Level 2 — Phone Verified   (OTP to mobile number)
 *   Level 3 — ID Verified      (Aadhaar / PAN card)
 *   Level 4 — Business Verified (GST / Company registration)
 *
 * Algorithm:
 * 1. User submits verification request with document upload IDs (from File Upload system)
 * 2. Server validates documents are uploaded and accessible
 * 3. Creates a verification_requests document with status="pending"
 * 4. Admin reviews documents in admin panel
 * 5. Admin approves → isVerified=true, verificationLevel=N, badge awarded
 * 6. Admin rejects → notification with reason, can re-submit
 * 7. On approval: provider score is recalculated (verification adds 15% weight)
 *
 * OTP Flow (Phone Verification):
 * 1. POST /verify/phone/send → generates 6-digit OTP, stores hashed in Firestore (10 min TTL)
 * 2. POST /verify/phone/confirm → verifies OTP hash, marks phone_verified=true
 * 3. OTP is rate-limited: max 3 attempts per hour per phone number
 *
 * Security:
 * - OTPs are stored hashed (SHA-256), never in plain text
 * - KYC documents are stored in a private Firebase Storage bucket
 * - Only admin can read KYC documents via signed URLs
 * - Verification documents are never exposed in public API responses
 */

import { db } from "./firebase";
import { sendNotification } from "./notificationService";
import { sendTemplatedEmail } from "./emailService";
import { computeAndSaveProviderScore } from "./providerScore";
import crypto from "crypto";
import { logger } from "./logger";

export type VerificationLevel = 0 | 1 | 2 | 3 | 4;

export type VerificationType =
  | "email"
  | "phone"
  | "aadhaar"
  | "pan"
  | "gst"
  | "company_registration";

export interface VerificationRequest {
  id: string;
  userId: string;
  type: VerificationType;
  documentMediaIds: string[];  // IDs from media collection (fileUpload.ts)
  additionalData?: Record<string, string>; // masked card numbers, etc.
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: number;
  reviewedAt: number | null;
}

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60_000;     // 10 minutes
const OTP_MAX_ATTEMPTS = 3;
const OTP_RATE_LIMIT_WINDOW = 60 * 60_000; // 1 hour

// ---------------------------------------------------------------------------
// Submit a verification request
// ---------------------------------------------------------------------------
export async function submitVerificationRequest(
  userId: string,
  type: VerificationType,
  documentMediaIds: string[],
  additionalData?: Record<string, string>
): Promise<VerificationRequest> {
  if (documentMediaIds.length === 0) {
    throw new Error("At least one document is required for verification.");
  }

  // Verify all media records exist and belong to user
  const mediaChecks = await Promise.all(
    documentMediaIds.map((id) => db.collection("media").doc(id).get())
  );

  for (const doc of mediaChecks) {
    if (!doc.exists) throw new Error(`Media record ${doc.id} not found.`);
    const media = doc.data()!;
    if (media.userId !== userId) throw new Error("Document does not belong to you.");
    if (media.status !== "confirmed") throw new Error("Document upload is not confirmed.");
    if (media.context !== "kyc_document") throw new Error("Document is not a KYC upload.");
  }

  // Check for existing pending request of same type
  const existing = await db
    .collection("verification_requests")
    .where("userId", "==", userId)
    .where("type", "==", type)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new Error("You already have a pending verification request of this type.");
  }

  const docRef = db.collection("verification_requests").doc();
  const request: VerificationRequest = {
    id: docRef.id,
    userId,
    type,
    documentMediaIds,
    additionalData: additionalData ?? {},
    status: "pending",
    reviewedBy: null,
    reviewNote: null,
    submittedAt: Date.now(),
    reviewedAt: null,
  };

  await docRef.set(request);

  // Notify admin (could also email admin team)
  logger.info({ verificationId: docRef.id, userId, type }, "Verification request submitted");

  return request;
}

// ---------------------------------------------------------------------------
// Admin: Approve verification request
// ---------------------------------------------------------------------------
export async function approveVerification(
  verificationId: string,
  adminUserId: string,
  note?: string
): Promise<void> {
  const docRef = db.collection("verification_requests").doc(verificationId);
  const doc = await docRef.get();

  if (!doc.exists) throw new Error("Verification request not found.");

  const request = doc.data() as VerificationRequest;
  if (request.status !== "pending") throw new Error("Request is not pending.");

  const now = Date.now();

  await docRef.update({
    status: "approved",
    reviewedBy: adminUserId,
    reviewNote: note ?? "",
    reviewedAt: now,
  });

  // Update user verification level
  const newLevel = getVerificationLevelForType(request.type);
  const userRef = db.collection("users").doc(request.userId);
  const userDoc = await userRef.get();
  const currentLevel = (userDoc.data()?.verificationLevel as VerificationLevel) ?? 0;
  const updatedLevel = Math.max(currentLevel, newLevel) as VerificationLevel;

  await userRef.update({
    isVerified: true,
    verificationLevel: updatedLevel,
    [`verified_${request.type}`]: true,
    verifiedAt: now,
  });

  // Recompute provider score (verification is 15% of score)
  computeAndSaveProviderScore(request.userId).catch(() => {});

  // Notify user
  const user = userDoc.data()!;
  await Promise.allSettled([
    sendNotification(request.userId, {
      type: "system",
      title: "Verification Approved ✓",
      body: `Your ${formatVerificationType(request.type)} verification has been approved.`,
      data: { screen: "profile" },
    }),
    user.email
      ? sendTemplatedEmail(user.email as string, "verification_approved", {
          verificationType: formatVerificationType(request.type),
        }, request.userId)
      : Promise.resolve(),
  ]);

  logger.info({ verificationId, userId: request.userId, type: request.type }, "Verification approved");
}

// ---------------------------------------------------------------------------
// Admin: Reject verification request
// ---------------------------------------------------------------------------
export async function rejectVerification(
  verificationId: string,
  adminUserId: string,
  reason: string
): Promise<void> {
  const docRef = db.collection("verification_requests").doc(verificationId);
  const doc = await docRef.get();

  if (!doc.exists) throw new Error("Verification request not found.");

  const request = doc.data() as VerificationRequest;
  if (request.status !== "pending") throw new Error("Request is not pending.");

  await docRef.update({
    status: "rejected",
    reviewedBy: adminUserId,
    reviewNote: reason,
    reviewedAt: Date.now(),
  });

  const userDoc = await db.collection("users").doc(request.userId).get();
  const user = userDoc.data()!;

  await Promise.allSettled([
    sendNotification(request.userId, {
      type: "system",
      title: "Verification Update",
      body: `Your ${formatVerificationType(request.type)} verification was not approved. Tap for details.`,
      data: { screen: "profile/verify", reason },
    }),
    user.email
      ? sendTemplatedEmail(user.email as string, "verification_rejected", {
          verificationType: formatVerificationType(request.type),
          reason,
        }, request.userId)
      : Promise.resolve(),
  ]);

  logger.info({ verificationId, userId: request.userId, reason }, "Verification rejected");
}

// ---------------------------------------------------------------------------
// OTP: Send phone verification code
// ---------------------------------------------------------------------------
export async function sendPhoneOtp(userId: string, phoneNumber: string): Promise<void> {
  // Rate limiting: max 3 OTPs per hour per phone
  const hourAgo = Date.now() - OTP_RATE_LIMIT_WINDOW;
  const recentSnap = await db
    .collection("otp_log")
    .where("phoneNumber", "==", phoneNumber)
    .where("createdAt", ">=", hourAgo)
    .get();

  if (recentSnap.size >= OTP_MAX_ATTEMPTS) {
    throw new Error("Too many OTP requests. Please wait before requesting again.");
  }

  // Generate 6-digit OTP
  const otp = Array.from({ length: OTP_LENGTH }, () => Math.floor(Math.random() * 10)).join("");
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
  const expiresAt = Date.now() + OTP_TTL_MS;

  // Store hashed OTP (never plain text)
  await db.collection("otp_requests").doc(`${userId}_phone`).set({
    userId,
    phoneNumber,
    hashedOtp,
    expiresAt,
    attempts: 0,
    createdAt: Date.now(),
  });

  // Log attempt (for rate limiting)
  await db.collection("otp_log").add({ phoneNumber, createdAt: Date.now() });

  // In production: send via SMS provider (Twilio, MSG91, etc.)
  // For now, log for testing. Replace with actual SMS API call.
  logger.info({ userId, phoneNumber, otp: process.env.NODE_ENV !== "production" ? otp : "REDACTED" }, "OTP generated");

  // TODO: Replace with actual SMS send:
  // await sendSms(phoneNumber, `${otp} is your SRN verification code. Valid for 10 minutes.`);
}

// ---------------------------------------------------------------------------
// OTP: Verify phone OTP
// ---------------------------------------------------------------------------
export async function verifyPhoneOtp(userId: string, otp: string): Promise<void> {
  const docRef = db.collection("otp_requests").doc(`${userId}_phone`);
  const doc = await docRef.get();

  if (!doc.exists) throw new Error("No pending OTP found. Please request a new one.");

  const record = doc.data()!;

  if (record.expiresAt < Date.now()) {
    await docRef.delete();
    throw new Error("OTP has expired. Please request a new one.");
  }

  const attempts = (record.attempts as number) + 1;

  if (attempts > OTP_MAX_ATTEMPTS) {
    await docRef.delete();
    throw new Error("Too many incorrect attempts. Please request a new OTP.");
  }

  const hashedInput = crypto.createHash("sha256").update(otp).digest("hex");

  if (hashedInput !== record.hashedOtp) {
    await docRef.update({ attempts });
    throw new Error(`Incorrect OTP. ${OTP_MAX_ATTEMPTS - attempts} attempts remaining.`);
  }

  // OTP correct — mark phone as verified
  await Promise.all([
    docRef.delete(),
    db.collection("users").doc(userId).update({
      phoneNumber: record.phoneNumber,
      phoneVerified: true,
      verificationLevel: 2,
    }),
  ]);

  logger.info({ userId }, "Phone OTP verified successfully");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getVerificationLevelForType(type: VerificationType): VerificationLevel {
  switch (type) {
    case "email": return 1;
    case "phone": return 2;
    case "aadhaar":
    case "pan": return 3;
    case "gst":
    case "company_registration": return 4;
    default: return 1;
  }
}

function formatVerificationType(type: VerificationType): string {
  const map: Record<VerificationType, string> = {
    email: "Email",
    phone: "Phone",
    aadhaar: "Aadhaar",
    pan: "PAN Card",
    gst: "GST",
    company_registration: "Company Registration",
  };
  return map[type] ?? type;
}
