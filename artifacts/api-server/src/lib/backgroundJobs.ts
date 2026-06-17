/**
 * BACKGROUND JOB SCHEDULER — MODULE 28
 *
 * Algorithm:
 * All jobs are pure Firestore-based — no Redis, no external queue.
 * Each job function is idempotent and safe to run concurrently.
 *
 * Scheduling: use the exported `startAllJobs()` function, called once
 * on server startup (index.ts). Jobs use `setInterval` internally.
 *
 * Job list:
 *  1. expireQuotes         — every 30 min: marks stale pending quotes as expired
 *  2. expireLeads          — every 30 min: marks stale unacted leads as expired
 *  3. processEmailQueue    — every 60 sec: sends queued emails via SMTP
 *  4. refreshProviderScores— every 24 hrs: recalculates scores for active providers
 *  5. sendBookingReminders — every 60 min: 24h-before and 1h-before reminders
 *  6. inactivityPing       — every 24 hrs: nudge users inactive >7 days
 *  7. cleanupOldMedia      — every 24 hrs: delete pending uploads >1 hour old
 *  8. cleanupStalePresence       — every 2 min: reset isOnline:true for users whose heartbeat expired
 *  9. downgradeExpiredSubscriptions — every 24 hrs: downgrade Pro/Business users whose plan expired
 * 10. enforceGDPRDeletion        — every 24 hrs: hard-delete accounts past the 30-day grace period
 */

import { db } from "./firebase";
import admin from "firebase-admin";
import { sendNotification } from "./notificationService";
import { sendTemplatedEmail } from "./emailService";
import { computeAndSaveProviderScore } from "./providerScore";
import { processEmailQueue } from "./emailService";
import { downgradeExpiredSubscriptions } from "./subscriptionService";
import { logger } from "./logger";

let _started = false;
const intervals: ReturnType<typeof setInterval>[] = [];

// ---------------------------------------------------------------------------
// Start all background jobs. Safe to call only once.
// ---------------------------------------------------------------------------
export function startAllJobs(): void {
  if (_started) return;
  _started = true;

  schedule("expireQuotes",          30 * 60_000,  expireQuotes);
  schedule("expireLeads",           30 * 60_000,  expireLeads);
  schedule("processEmailQueue",          60_000,  runEmailQueue);
  schedule("refreshProviderScores", 24 * 60 * 60_000, refreshProviderScores);
  schedule("sendBookingReminders",       60 * 60_000, sendBookingReminders);
  schedule("inactivityPing",        24 * 60 * 60_000, inactivityPing);
  schedule("cleanupOldMedia",       24 * 60 * 60_000, cleanupOldMedia);
  schedule("cleanupStalePresence",            2 * 60_000,  cleanupStalePresence);
  schedule("downgradeExpiredSubscriptions", 24 * 60 * 60_000, downgradeExpiredSubscriptions);
  schedule("enforceGDPRDeletion",           24 * 60 * 60_000, enforceGDPRDeletion);

  logger.info("Background jobs started");
}

export function stopAllJobs(): void {
  intervals.forEach(clearInterval);
  intervals.length = 0;
  _started = false;
}

function schedule(name: string, intervalMs: number, fn: () => Promise<void>): void {
  const id = setInterval(async () => {
    try {
      await fn();
    } catch (err) {
      logger.error({ job: name, err }, "Background job failed");
    }
  }, intervalMs);
  intervals.push(id);
  // Run immediately on startup
  fn().catch((err) => logger.error({ job: name, err }, "Initial job run failed"));
}

// ---------------------------------------------------------------------------
// JOB 1: Expire stale quotes
// Quotes that have been pending for more than 7 days are expired.
// ---------------------------------------------------------------------------
async function expireQuotes(): Promise<void> {
  const now = Date.now();

  const snap = await db
    .collection("quotes")
    .where("status", "==", "pending")
    .where("expiresAt", "<=", now)
    .get();

  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { status: "expired", expiredAt: now }));
  await batch.commit();

  logger.info({ count: snap.size }, "Expired stale quotes");
}

// ---------------------------------------------------------------------------
// JOB 2: Expire leads that providers haven't acted on
// ---------------------------------------------------------------------------
async function expireLeads(): Promise<void> {
  const now = Date.now();

  const snap = await db
    .collection("leads")
    .where("status", "in", ["new", "viewed"])
    .where("expiresAt", "<=", now)
    .get();

  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { status: "expired", expiredAt: now }));
  await batch.commit();

  logger.info({ count: snap.size }, "Expired stale leads");
}

// ---------------------------------------------------------------------------
// JOB 3: Process email send queue
// ---------------------------------------------------------------------------
async function runEmailQueue(): Promise<void> {
  const sent = await processEmailQueue();
  if (sent > 0) logger.info({ sent }, "Email queue processed");
}

// ---------------------------------------------------------------------------
// JOB 4: Refresh provider scores for all active providers
// Only processes providers who have been active in the last 30 days.
// ---------------------------------------------------------------------------
async function refreshProviderScores(): Promise<void> {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60_000;

  const snap = await db
    .collection("users")
    .where("role", "in", ["digital", "local"])
    .where("lastActiveAt", ">=", thirtyDaysAgo)
    .get();

  // Process in chunks to avoid overloading Firestore
  const providers = snap.docs.map((d) => d.id);
  let updated = 0;

  for (let i = 0; i < providers.length; i += 10) {
    const chunk = providers.slice(i, i + 10);
    await Promise.allSettled(chunk.map((id) => computeAndSaveProviderScore(id)));
    updated += chunk.length;
    // Small delay between chunks to avoid hot-spotting
    if (i + 10 < providers.length) await sleep(500);
  }

  if (updated > 0) logger.info({ updated }, "Provider scores refreshed");
}

// ---------------------------------------------------------------------------
// JOB 5: Send booking reminder notifications
// Reminder: 24 hours before scheduled date, and again 1 hour before.
// ---------------------------------------------------------------------------
async function sendBookingReminders(): Promise<void> {
  const now = Date.now();
  const oneHourMs = 60 * 60_000;
  const twentyFourHrsMs = 24 * oneHourMs;

  // Window: bookings whose scheduledDate falls in the next 24-25 hours (for daily check)
  // AND bookings whose scheduledDate falls in the next 1-2 hours (for hourly check)
  const windows = [
    { from: now + twentyFourHrsMs, to: now + twentyFourHrsMs + oneHourMs, label: "24h" },
    { from: now + oneHourMs, to: now + 2 * oneHourMs, label: "1h" },
  ];

  for (const window of windows) {
    const snap = await db
      .collection("bookings")
      .where("status", "in", ["confirmed", "rescheduled"])
      .where("rescheduleDate", ">=", window.from)
      .where("rescheduleDate", "<=", window.to)
      .get();

    for (const doc of snap.docs) {
      const b = doc.data();
      const reminderKey = `reminder_${window.label}_sent`;

      if (b[reminderKey]) continue; // already sent this reminder

      const notifBody =
        window.label === "24h"
          ? `Reminder: "${b.requirementTitle}" is scheduled in 24 hours.`
          : `Reminder: "${b.requirementTitle}" starts in 1 hour!`;

      await Promise.allSettled([
        sendNotification(b.customerId as string, {
          type: "booking",
          title: "Booking Reminder",
          body: notifBody,
          data: { bookingId: doc.id },
        }),
        sendNotification(b.providerId as string, {
          type: "booking",
          title: "Booking Reminder",
          body: notifBody,
          data: { bookingId: doc.id },
        }),
      ]);

      await doc.ref.update({ [reminderKey]: true });
    }
  }
}

// ---------------------------------------------------------------------------
// JOB 6: Nudge users who have been inactive for > 7 days
// Only sends once per 7-day period per user.
// ---------------------------------------------------------------------------
async function inactivityPing(): Promise<void> {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60_000;
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60_000;

  // Users who last pinged 7-14 days ago (not before, to avoid re-pinging)
  const snap = await db
    .collection("users")
    .where("lastActiveAt", ">=", fourteenDaysAgo)
    .where("lastActiveAt", "<=", sevenDaysAgo)
    .get();

  let pinged = 0;

  for (const doc of snap.docs) {
    const u = doc.data();

    // Check if already pinged in this window (prevent double-ping)
    if (u.lastInactivityPing && (u.lastInactivityPing as number) > sevenDaysAgo) continue;

    const isProvider = u.role === "digital" || u.role === "local";
    const body = isProvider
      ? "New requirements are waiting for your proposals. Check your feed!"
      : "Find the best providers for your next project. Post a requirement!";

    await sendNotification(doc.id, {
      type: "system",
      title: "We miss you on SRN 👋",
      body,
      data: { screen: isProvider ? "feed" : "home" },
    });

    await doc.ref.update({ lastInactivityPing: Date.now() });
    pinged++;
  }

  if (pinged > 0) logger.info({ pinged }, "Inactivity pings sent");
}

// ---------------------------------------------------------------------------
// JOB 7: Clean up pending media uploads older than 1 hour
// These are uploads where client generated a signed URL but never confirmed.
// ---------------------------------------------------------------------------
async function cleanupOldMedia(): Promise<void> {
  const oneHourAgo = Date.now() - 60 * 60_000;

  const snap = await db
    .collection("media")
    .where("status", "==", "pending")
    .where("createdAt", "<=", oneHourAgo)
    .get();

  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((d) =>
    batch.update(d.ref, { status: "expired", expiredAt: Date.now() })
  );
  await batch.commit();

  logger.info({ count: snap.size }, "Cleaned up stale media upload records");
}

// ---------------------------------------------------------------------------
// JOB 8: Reset stale presence — users still marked online after heartbeat expired
// Presence.ts sets isOnline: true on heartbeat. If the app is killed or loses
// connectivity, it never sends the /presence/offline call. This job corrects
// stale isOnline: true flags for users whose lastHeartbeat is older than 90s.
// ---------------------------------------------------------------------------
async function cleanupStalePresence(): Promise<void> {
  const staleThreshold = Date.now() - 60_000; // 60 seconds — matches ONLINE_THRESHOLD_MS in presence.ts

  const snap = await db
    .collection("users")
    .where("isOnline", "==", true)
    .where("lastHeartbeat", "<=", staleThreshold)
    .get();

  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { isOnline: false }));
  await batch.commit();

  logger.info({ count: snap.size }, "Cleared stale presence records");
}

// ---------------------------------------------------------------------------
// JOB 9: Enforce GDPR hard-deletion after 30-day grace period
// Accounts with status:"deletion_requested" and scheduledDeletionAt <= now
// are permanently deleted across all collections + Firebase Auth.
// ---------------------------------------------------------------------------
async function enforceGDPRDeletion(): Promise<void> {
  const now = Date.now();

  const snap = await db
    .collection("users")
    .where("status", "==", "deletion_requested")
    .where("scheduledDeletionAt", "<=", now)
    .get();

  if (snap.empty) return;

  for (const userDoc of snap.docs) {
    const userId = userDoc.id;
    try {
      await hardDeleteUser(userId);
      logger.info({ userId }, "GDPR hard deletion completed");
    } catch (err) {
      logger.error({ err, userId }, "GDPR hard deletion failed — will retry next run");
    }
  }
}

async function hardDeleteUser(userId: string): Promise<void> {
  // Collections with docs owned by userId (field name → collection name)
  const ownedCollections: Array<[string, string]> = [
    ["requirements", "creatorId"],
    ["quotes", "senderId"],
    ["reviews", "reviewerId"],
    ["messages", "senderId"],
    ["notifications", "userId"],
    ["portfolio_likes", "userId"],
    ["referrals", "referrerId"],
    ["referrals", "referredUserId"],
    ["leads", "providerId"],
    ["profile_views", "viewerId"],
    ["portfolios", "userId"],
    ["audit_events", "actorId"],
  ];

  for (const [collection, field] of ownedCollections) {
    const colSnap = await db.collection(collection).where(field, "==", userId).get();
    for (let i = 0; i < colSnap.docs.length; i += 500) {
      const batch = db.batch();
      colSnap.docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // Bookings: anonymize rather than delete (preserve platform financial records)
  const bookingSnaps = await Promise.all([
    db.collection("bookings").where("customerId", "==", userId).get(),
    db.collection("bookings").where("providerId", "==", userId).get(),
  ]);
  for (const snap of bookingSnaps) {
    for (let i = 0; i < snap.docs.length; i += 500) {
      const batch = db.batch();
      snap.docs.slice(i, i + 500).forEach((d) =>
        batch.update(d.ref, { customerId: "deleted", providerId: "deleted", customerName: "Deleted User", providerName: "Deleted User" })
      );
      await batch.commit();
    }
  }

  // Single doc keyed by userId
  await db.collection("bid_quotas").doc(userId).delete().catch(() => {});

  // Delete Firebase Auth account
  await admin.auth().deleteUser(userId).catch(() => {});

  // Delete user doc last (so retries can find the user on failure)
  await db.collection("users").doc(userId).delete();
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
