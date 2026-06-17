/**
 * USER BLOCKING & REPORTING — M34
 *
 * Block system:
 *   POST   /block/:userId          — block a user (hides them from feed/search)
 *   DELETE /block/:userId          — unblock a user
 *   GET    /block                  — list of users I have blocked
 *
 * The matching engine and search already respect the block list by checking
 * the `blocked_users/{blockerId}_blockedIds` array.
 * This route manages that list.
 *
 * Report system:
 *   POST   /report                 — report a user or content
 *   GET    /report (admin)         — list all reports with filters
 *   PATCH  /report/:id/resolve (admin) — mark a report resolved
 *
 * Report types: "spam", "fake_profile", "harassment", "inappropriate_content",
 *               "fraud", "fake_review", "other"
 *
 * Auto-flag: if a user receives 5+ unresolved reports, their account is
 * automatically flagged (isFlagged: true) pending admin review.
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest, requireRole } from "../middlewares/authMiddleware";
import { writeAuditLog } from "../lib/auditLog";

const router = Router();

const REPORT_TYPES = [
  "spam", "fake_profile", "harassment", "inappropriate_content",
  "fraud", "fake_review", "other",
] as const;
type ReportType = typeof REPORT_TYPES[number];

const AUTO_FLAG_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// POST /block/:userId — Block a user
// ---------------------------------------------------------------------------
router.post(
  "/block/:userId",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const blockerId = req.user!.uid;
      const blockedId = req.params["userId"] as string;

      if (blockerId === blockedId) {
        res.status(400).json({ error: "You cannot block yourself." });
        return;
      }

      // Verify target user exists
      const targetDoc = await db.collection("users").doc(blockedId).get();
      if (!targetDoc.exists) { res.status(404).json({ error: "User not found." }); return; }

      const docId = `${blockerId}_${blockedId}`;
      await db.collection("blocked_users").doc(docId).set({
        blockerId,
        blockedId,
        createdAt: Date.now(),
      });

      res.status(201).json({ success: true, blockedId });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /block/:userId — Unblock a user
// ---------------------------------------------------------------------------
router.delete(
  "/block/:userId",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const blockerId = req.user!.uid;
      const blockedId = req.params["userId"] as string;

      await db.collection("blocked_users").doc(`${blockerId}_${blockedId}`).delete();
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /block — List of users I have blocked
// ---------------------------------------------------------------------------
router.get(
  "/block",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const blockerId = req.user!.uid;

      const snap = await db
        .collection("blocked_users")
        .where("blockerId", "==", blockerId)
        .get();

      const blocked = snap.docs.map((d) => ({
        userId: d.data().blockedId as string,
        blockedAt: new Date(d.data().createdAt as number).toISOString(),
      }));

      res.json({ blocked });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /report — Report a user or piece of content
// ---------------------------------------------------------------------------
router.post(
  "/report",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const {
        reportedUserId,
        reportedContentId,
        contentType,
        reportType,
        description,
      } = req.body as {
        reportedUserId?: string;
        reportedContentId?: string;
        contentType?: string;
        reportType?: string;
        description?: string;
      };

      if (!reportedUserId) {
        res.status(400).json({ error: "reportedUserId is required." });
        return;
      }

      if (!reportType || !REPORT_TYPES.includes(reportType as ReportType)) {
        res.status(400).json({
          error: `reportType must be one of: ${REPORT_TYPES.join(", ")}`,
        });
        return;
      }

      const reporterId = req.user!.uid;
      if (reporterId === reportedUserId) {
        res.status(400).json({ error: "You cannot report yourself." });
        return;
      }

      // One report per reporter per reported user per type (idempotent)
      const existing = await db
        .collection("reports")
        .where("reporterId", "==", reporterId)
        .where("reportedUserId", "==", reportedUserId)
        .where("reportType", "==", reportType)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (!existing.empty) {
        res.status(409).json({ error: "You have already submitted this report." });
        return;
      }

      const now = Date.now();
      const docRef = db.collection("reports").doc();

      await docRef.set({
        id: docRef.id,
        reporterId,
        reportedUserId,
        reportedContentId: reportedContentId ?? null,
        contentType: contentType ?? null,
        reportType,
        description: description ?? "",
        status: "pending",
        createdAt: now,
      });

      // Auto-flag if threshold reached
      const pendingReports = await db
        .collection("reports")
        .where("reportedUserId", "==", reportedUserId)
        .where("status", "==", "pending")
        .get();

      if (pendingReports.size >= AUTO_FLAG_THRESHOLD) {
        await db.collection("users").doc(reportedUserId).update({ isFlagged: true });

        await writeAuditLog({
          action: "user.auto_flagged",
          actorId: "system",
          resourceType: "user",
          resourceId: reportedUserId,
          metadata: { reportCount: pendingReports.size },
        });
      }

      res.status(201).json({ id: docRef.id, status: "pending" });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /report — Admin: list all reports
// ---------------------------------------------------------------------------
router.get(
  "/report",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);

      let query: FirebaseFirestore.Query = db.collection("reports");
      if (status) query = query.where("status", "==", status);

      const snap = await query.orderBy("createdAt", "desc").limit(limit).get();

      const reports = snap.docs.map((d) => {
        const r = d.data();
        return {
          id: r.id,
          reporterId: r.reporterId,
          reportedUserId: r.reportedUserId,
          reportedContentId: r.reportedContentId,
          contentType: r.contentType,
          reportType: r.reportType,
          description: r.description,
          status: r.status,
          resolvedBy: r.resolvedBy ?? null,
          resolution: r.resolution ?? null,
          createdAt: new Date(r.createdAt as number).toISOString(),
        };
      });

      res.json({ reports, count: reports.length });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /report/:id/resolve — Admin resolves a report
// ---------------------------------------------------------------------------
router.patch(
  "/report/:id/resolve",
  authenticateToken,
  requireRole(["admin"]),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const { resolution, action } = req.body as {
        resolution?: string;
        action?: "warn" | "suspend" | "dismiss";
      };

      const docRef = db.collection("reports").doc(id);
      const doc = await docRef.get();
      if (!doc.exists) { res.status(404).json({ error: "Report not found." }); return; }

      const report = doc.data()!;

      await docRef.update({
        status: "resolved",
        resolution: resolution ?? "",
        resolvedBy: req.user!.uid,
        resolvedAt: Date.now(),
      });

      // If admin chose to suspend the reported user
      if (action === "suspend") {
        await db.collection("users").doc(report.reportedUserId as string).update({
          isSuspended: true,
          suspensionReason: `Report: ${resolution ?? ""}`,
          suspendedAt: Date.now(),
          suspendedBy: req.user!.uid,
        });
      }

      await writeAuditLog({
        action: "report.resolved",
        actorId: req.user!.uid,
        resourceType: "report",
        resourceId: id,
        metadata: { action, resolution },
      });

      res.json({ success: true, status: "resolved" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
