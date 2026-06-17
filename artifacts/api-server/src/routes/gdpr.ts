/**
 * GDPR / SOFT DELETE — M29
 *
 * Algorithm:
 *  1. DELETE /gdpr/account      — User requests account deletion
 *     - Sets status: "deletion_requested", deletionRequestedAt: now
 *     - Schedules hard deletion after 30-day grace period
 *     - Background job handles final deletion after grace period
 *     - User can cancel within 30 days via POST /gdpr/account/cancel-deletion
 *
 *  2. GET /gdpr/export          — Export all personal data (GDPR Article 20)
 *     - Returns user profile, requirements, quotes, bookings, reviews, messages
 *     - Streams as a single JSON document
 *
 *  3. POST /gdpr/account/cancel-deletion — Cancel scheduled deletion
 *
 *  4. POST /gdpr/anonymize      — Admin can anonymize a specific user (RTBF)
 *     - Replaces PII with anonymized placeholders
 *     - Keeps non-PII data for statistical integrity
 *
 * Soft delete pattern (all collections):
 *   - deletedAt timestamp is set instead of hard delete
 *   - Application queries filter out deletedAt IS NOT NULL automatically
 *   - After 30-day grace period, hard delete runs via background job
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import admin from "firebase-admin";
import { authenticateToken, AuthenticatedRequest, requireRole } from "../middlewares/authMiddleware";
import { writeAuditLog } from "../lib/auditLog";

const router = Router();

const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60_000; // 30 days

// ---------------------------------------------------------------------------
// DELETE /gdpr/account — Request account deletion (soft delete + 30-day grace)
// ---------------------------------------------------------------------------
router.delete(
  "/gdpr/account",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;
      const { reason } = req.body as { reason?: string };

      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) { res.status(404).json({ error: "User not found." }); return; }

      const now = Date.now();
      const scheduledDeletionAt = now + DELETION_GRACE_PERIOD_MS;

      await userRef.update({
        status: "deletion_requested",
        deletionRequestedAt: now,
        scheduledDeletionAt,
        deletionReason: reason ?? "",
        fcmToken: null,     // revoke push immediately
        isAvailable: false, // remove from matching
      });

      await writeAuditLog({
        action: "user.deletion_requested",
        actorId: userId,
        resourceType: "user",
        resourceId: userId,
        metadata: { scheduledDeletionAt, reason: reason ?? "" },
      });

      res.json({
        success: true,
        message: "Account deletion scheduled. Your data will be permanently deleted in 30 days.",
        scheduledDeletionAt: new Date(scheduledDeletionAt).toISOString(),
        canCancelUntil: new Date(scheduledDeletionAt).toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /gdpr/account/cancel-deletion — Cancel a pending deletion request
// ---------------------------------------------------------------------------
router.post(
  "/gdpr/account/cancel-deletion",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) { res.status(404).json({ error: "User not found." }); return; }

      const user = userDoc.data()!;
      if (user.status !== "deletion_requested") {
        res.status(409).json({ error: "No pending deletion request found." });
        return;
      }

      await userRef.update({
        status: "active",
        deletionRequestedAt: null,
        scheduledDeletionAt: null,
        deletionReason: null,
        isAvailable: true,
      });

      await writeAuditLog({
        action: "user.deletion_cancelled",
        actorId: userId,
        resourceType: "user",
        resourceId: userId,
      });

      res.json({ success: true, message: "Account deletion cancelled. Your account is restored." });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /gdpr/export — Export all personal data for the authenticated user
// ---------------------------------------------------------------------------
router.get(
  "/gdpr/export",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;

      const [
        userDoc,
        requirementsSnap,
        quotesSnap,
        bookingsSnap,
        reviewsSnap,
        messagesSnap,
        portfolioSnap,
        notificationsSnap,
      ] = await Promise.all([
        db.collection("users").doc(userId).get(),
        db.collection("requirements").where("creatorId", "==", userId).get(),
        db.collection("quotes").where("senderId", "==", userId).get(),
        db.collection("bookings").where("customerId", "==", userId).get(),
        db.collection("reviews").where("reviewerId", "==", userId).get(),
        db.collection("messages").where("senderId", "==", userId).limit(500).get(),
        db.collection("portfolios").where("userId", "==", userId).get(),
        db.collection("notifications").where("userId", "==", userId).limit(200).get(),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        exportVersion: "1.0",
        profile: userDoc.exists ? userDoc.data() : null,
        requirements: requirementsSnap.docs.map((d) => d.data()),
        quotes: quotesSnap.docs.map((d) => d.data()),
        bookings: bookingsSnap.docs.map((d) => d.data()),
        reviews: reviewsSnap.docs.map((d) => d.data()),
        messages: messagesSnap.docs.map((d) => d.data()),
        portfolio: portfolioSnap.docs.map((d) => d.data()),
        notifications: notificationsSnap.docs.map((d) => d.data()),
      };

      await writeAuditLog({
        action: "user.data_exported",
        actorId: userId,
        resourceType: "user",
        resourceId: userId,
      });

      res.setHeader("Content-Disposition", `attachment; filename="srn-data-export-${userId}.json"`);
      res.setHeader("Content-Type", "application/json");
      res.json(exportData);
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /gdpr/anonymize/:userId — Admin: anonymize a user's PII (RTBF)
// Replaces name, email, phone with hashed/anonymized placeholders.
// Keeps non-PII data (ratings, booking counts) for platform integrity.
// ---------------------------------------------------------------------------
router.post(
  "/gdpr/anonymize/:userId",
  authenticateToken,
  requireRole(["admin"]),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const targetUserId = req.params["userId"] as string;

      const userRef = db.collection("users").doc(targetUserId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) { res.status(404).json({ error: "User not found." }); return; }

      const anonymizedEmail = `deleted-${targetUserId.substring(0, 8)}@anonymized.srn`;

      const batch = db.batch();

      // Anonymize user profile
      batch.update(userRef, {
        name: "Deleted User",
        email: anonymizedEmail,
        phone: null,
        avatarUrl: null,
        location: null,
        lat: null,
        lng: null,
        description: "",
        skills: "",
        fcmToken: null,
        status: "anonymized",
        anonymizedAt: Date.now(),
        anonymizedBy: req.user!.uid,
      });

      await batch.commit();

      // Delete from Firebase Auth
      await admin.auth().deleteUser(targetUserId).catch(() => {});

      await writeAuditLog({
        action: "user.anonymized",
        actorId: req.user!.uid,
        resourceType: "user",
        resourceId: targetUserId,
      });

      res.json({ success: true, message: "User PII anonymized successfully." });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
