/**
 * ADMIN PANEL — M20
 *
 * All endpoints require role === "admin".
 *
 * Dashboard & Metrics:
 *   GET  /admin/dashboard           — platform-wide KPIs
 *   GET  /admin/audit-logs          — recent audit events with filters
 *
 * User Moderation:
 *   GET  /admin/users               — paginated user list with search + filters
 *   PATCH /admin/users/:id/suspend  — suspend / unsuspend a user
 *   PATCH /admin/users/:id/role     — change user role
 *   DELETE /admin/users/:id         — hard-delete (GDPR erasure, admin only)
 *
 * KYC Verification Queue:
 *   GET  /admin/verification/queue  — pending KYC requests (oldest first)
 *
 * Dispute Management:
 *   GET  /admin/disputes            — all disputes with status filter
 *
 * Content Moderation:
 *   GET  /admin/flagged-messages    — messages flagged by anti-contact filter
 *   PATCH /admin/messages/:id/clear — clear a flagged message
 *
 * Feature Flags:
 *   GET  /admin/flags               — list all feature flags
 *   PATCH /admin/flags/:key         — toggle or set a feature flag value
 *
 * Fraud Dashboard:
 *   GET  /admin/fraud/accounts      — accounts with suspicious signals
 *   GET  /admin/fraud/reviews       — reviews flagged as suspicious
 *
 * Platform Stats:
 *   GET  /admin/stats/revenue       — subscription revenue by month
 *   GET  /admin/stats/growth        — user + requirement growth by month
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { writeAuditLog } from "../lib/auditLog";
import admin from "firebase-admin";

const router = Router();

// All admin routes require auth + admin role
router.use(authenticateToken, requireRole(["admin"]));

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

// ---------------------------------------------------------------------------
// GET /admin/dashboard — Platform-wide KPIs
// ---------------------------------------------------------------------------
router.get("/admin/dashboard", async (_req, res, next) => {
  try {
    const [
      usersSnap,
      requirementsSnap,
      quotesSnap,
      bookingsSnap,
      disputesSnap,
      verificationSnap,
      subscriptionsSnap,
    ] = await Promise.all([
      db.collection("users").get(),
      db.collection("requirements").get(),
      db.collection("quotes").get(),
      db.collection("bookings").where("status", "==", "completed").get(),
      db.collection("disputes").where("status", "in", ["open", "evidence_submitted", "under_review"]).get(),
      db.collection("verification_requests").where("status", "==", "pending").get(),
      db.collection("users").where("subscriptionTier", "in", ["pro", "business"]).get(),
    ]);

    const totalEarnings = bookingsSnap.docs.reduce(
      (sum, d) => sum + ((d.data().amount as number) ?? 0),
      0
    );

    const roleBreakdown: Record<string, number> = {};
    usersSnap.docs.forEach((d) => {
      const role = (d.data().role as string) ?? "unknown";
      roleBreakdown[role] = (roleBreakdown[role] ?? 0) + 1;
    });

    res.json({
      users: {
        total: usersSnap.size,
        byRole: roleBreakdown,
        premiumCount: subscriptionsSnap.size,
      },
      requirements: { total: requirementsSnap.size },
      quotes: { total: quotesSnap.size },
      completedBookings: bookingsSnap.size,
      totalPlatformEarnings: totalEarnings,
      pendingDisputes: disputesSnap.size,
      pendingKycRequests: verificationSnap.size,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/audit-logs — Paginated audit event log
// ---------------------------------------------------------------------------
router.get("/admin/audit-logs", async (req, res, next) => {
  try {
    const action = qs(req.query.action);
    const actorId = qs(req.query.actorId);
    const resourceType = qs(req.query.resourceType);
    const limit = Math.min(parseInt(qs(req.query.limit) ?? "50", 10), 200);

    let query: FirebaseFirestore.Query = db.collection("audit_events");
    if (action) query = query.where("action", "==", action);
    if (actorId) query = query.where("actorId", "==", actorId);
    if (resourceType) query = query.where("resourceType", "==", resourceType);

    const snap = await query.orderBy("timestamp", "desc").limit(limit).get();

    const logs = snap.docs.map((d) => {
      const e = d.data();
      return {
        id: d.id,
        action: e.action,
        actorId: e.actorId,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        ipAddress: e.ipAddress ?? null,
        metadata: e.metadata ?? {},
        timestamp: new Date(e.timestamp as number).toISOString(),
      };
    });

    res.json({ logs, count: logs.length });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/users — Paginated user list
// ---------------------------------------------------------------------------
router.get("/admin/users", async (req, res, next) => {
  try {
    const role = qs(req.query.role);
    const status = qs(req.query.status); // "active" | "suspended" | "deactivated"
    const search = qs(req.query.search);
    const limit = Math.min(parseInt(qs(req.query.limit) ?? "50", 10), 200);
    const cursor = qs(req.query.cursor);

    let query: FirebaseFirestore.Query = db.collection("users");
    if (role) query = query.where("role", "==", role);
    if (status === "suspended") query = query.where("isSuspended", "==", true);
    if (status === "deactivated") query = query.where("status", "==", "deactivated");

    query = query.orderBy("createdAt", "desc");
    if (cursor) {
      const cursorDoc = await db.collection("users").doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snap = await query.limit(limit + 1).get();
    const hasMore = snap.size > limit;
    const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

    let users = docs.map((d) => {
      const u = d.data();
      return {
        id: d.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isVerified: u.isVerified ?? false,
        isSuspended: u.isSuspended ?? false,
        isPremium: u.isPremium ?? false,
        subscriptionTier: u.subscriptionTier ?? "free",
        verificationLevel: u.verificationLevel ?? 0,
        status: u.status ?? "active",
        rating: u.rating ?? 0,
        completedGigs: u.completedGigs ?? 0,
        createdAt: u.createdAt ? new Date(u.createdAt as number).toISOString() : null,
        lastActiveAt: u.lastActiveAt ? new Date(u.lastActiveAt as number).toISOString() : null,
      };
    });

    if (search) {
      const q = search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q)
      );
    }

    res.json({
      users,
      nextCursor: hasMore ? docs[docs.length - 1]!.id : null,
      count: users.length,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/users/:id/suspend — Suspend or unsuspend a user
// ---------------------------------------------------------------------------
router.patch("/admin/users/:id/suspend", async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = req.params["id"] as string;
    const { suspend, reason } = req.body as { suspend: boolean; reason?: string };

    const userRef = db.collection("users").doc(id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) { res.status(404).json({ error: "User not found." }); return; }

    await userRef.update({
      isSuspended: suspend,
      suspensionReason: suspend ? (reason ?? "") : null,
      suspendedAt: suspend ? Date.now() : null,
      suspendedBy: suspend ? req.user!.uid : null,
    });

    // Disable/enable Firebase Auth account
    await admin.auth().updateUser(id, { disabled: suspend });

    await writeAuditLog({
      action: suspend ? "user.suspended" : "user.unsuspended",
      actorId: req.user!.uid,
      resourceType: "user",
      resourceId: id,
      metadata: { reason: reason ?? "" },
    });

    res.json({ success: true, isSuspended: suspend });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/users/:id/role — Change user role
// ---------------------------------------------------------------------------
router.patch("/admin/users/:id/role", async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = req.params["id"] as string;
    const { role } = req.body as { role?: string };

    const VALID_ROLES = ["customer", "business", "digital", "local", "admin"];
    if (!role || !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
      return;
    }

    const userRef = db.collection("users").doc(id);
    if (!(await userRef.get()).exists) { res.status(404).json({ error: "User not found." }); return; }

    await userRef.update({ role });

    await writeAuditLog({
      action: "user.role_changed",
      actorId: req.user!.uid,
      resourceType: "user",
      resourceId: id,
      metadata: { newRole: role },
    });

    res.json({ success: true, role });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/users/:id — Hard delete (GDPR erasure, admin-initiated)
// ---------------------------------------------------------------------------
router.delete("/admin/users/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = req.params["id"] as string;

    await Promise.allSettled([
      admin.auth().deleteUser(id),
      db.collection("users").doc(id).delete(),
    ]);

    await writeAuditLog({
      action: "user.hard_deleted",
      actorId: req.user!.uid,
      resourceType: "user",
      resourceId: id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/verification/queue — Pending KYC requests (oldest first)
// ---------------------------------------------------------------------------
router.get("/admin/verification/queue", async (_req, res, next) => {
  try {
    const status = qs(_req.query.status) ?? "pending";
    const snap = await db
      .collection("verification_requests")
      .where("status", "==", status)
      .orderBy("submittedAt", "asc")
      .limit(100)
      .get();

    const requests = snap.docs.map((d) => {
      const r = d.data();
      return {
        id: r.id,
        userId: r.userId,
        type: r.type,
        status: r.status,
        documentMediaIds: r.documentMediaIds,
        additionalData: r.additionalData ?? {},
        submittedAt: new Date(r.submittedAt as number).toISOString(),
        reviewedBy: r.reviewedBy ?? null,
      };
    });

    res.json({ requests, count: requests.length });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/disputes — All disputes with status filter
// ---------------------------------------------------------------------------
router.get("/admin/disputes", async (req, res, next) => {
  try {
    const status = qs(req.query.status);
    const limit = Math.min(parseInt(qs(req.query.limit) ?? "50", 10), 200);

    let query: FirebaseFirestore.Query = db.collection("disputes");
    if (status) query = query.where("status", "==", status);

    const snap = await query.orderBy("createdAt", "desc").limit(limit).get();

    const disputes = snap.docs.map((d) => {
      const r = d.data();
      return {
        id: r.id,
        bookingId: r.bookingId,
        filedBy: r.filedBy,
        filedByType: r.filedByType,
        againstId: r.againstId,
        reason: r.reason,
        status: r.status,
        ruling: r.ruling ?? null,
        evidenceDeadlineAt: r.evidenceDeadlineAt
          ? new Date(r.evidenceDeadlineAt as number).toISOString()
          : null,
        createdAt: new Date(r.createdAt as number).toISOString(),
      };
    });

    res.json({ disputes, count: disputes.length });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/flagged-messages — Contact-sharing flagged messages
// ---------------------------------------------------------------------------
router.get("/admin/flagged-messages", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(qs(req.query.limit) ?? "50", 10), 200);
    const cleared = qs(req.query.cleared) === "true";

    const snap = await db
      .collection("messages")
      .where("isFlagged", "==", true)
      .where("flagCleared", "==", cleared)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const messages = snap.docs.map((d) => {
      const m = d.data();
      return {
        id: m.id,
        senderId: m.senderId,
        receiverId: m.receiverId,
        text: m.text,
        aiScanResult: m.aiScanResult,
        flagCleared: m.flagCleared ?? false,
        createdAt: new Date(m.createdAt as number).toISOString(),
      };
    });

    res.json({ messages, count: messages.length });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/messages/:id/clear — Clear a flagged message
// ---------------------------------------------------------------------------
router.patch("/admin/messages/:id/clear", async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = req.params["id"] as string;
    await db.collection("messages").doc(id).update({
      flagCleared: true,
      flagClearedBy: req.user!.uid,
      flagClearedAt: Date.now(),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/flags — Feature flag list
// ---------------------------------------------------------------------------
router.get("/admin/flags", async (_req, res, next) => {
  try {
    const snap = await db.collection("feature_flags").get();
    const flags = snap.docs.map((d) => ({ key: d.id, ...d.data() }));
    res.json({ flags });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/flags/:key — Set or toggle a feature flag
// ---------------------------------------------------------------------------
router.patch("/admin/flags/:key", async (req: AuthenticatedRequest, res, next) => {
  try {
    const key = req.params["key"] as string;
    const { enabled, value } = req.body as { enabled?: boolean; value?: unknown };

    const flagRef = db.collection("feature_flags").doc(key);
    const updates: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: req.user!.uid };
    if (enabled !== undefined) updates.enabled = enabled;
    if (value !== undefined) updates.value = value;

    await flagRef.set(updates, { merge: true });

    await writeAuditLog({
      action: "feature_flag.updated",
      actorId: req.user!.uid,
      resourceType: "feature_flag",
      resourceId: key,
      metadata: { enabled, value },
    });

    res.json({ success: true, key, ...updates });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/fraud/accounts — Accounts with suspicious signals
// Signals: multiple accounts with same IP, very high bid volume, zero completions
// ---------------------------------------------------------------------------
router.get("/admin/fraud/accounts", async (_req, res, next) => {
  try {
    // Flag accounts created in last 7 days with >20 bids and 0 completions
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60_000;

    const snap = await db
      .collection("users")
      .where("createdAt", ">=", sevenDaysAgo)
      .where("completedGigs", "==", 0)
      .get();

    const suspicious = await Promise.all(
      snap.docs.map(async (d) => {
        const u = d.data();
        const quotesSnap = await db
          .collection("quotes")
          .where("senderId", "==", d.id)
          .get();

        const bidCount = quotesSnap.size;
        if (bidCount < 20) return null;

        return {
          id: d.id,
          name: u.name,
          email: u.email,
          role: u.role,
          bidCount,
          completedGigs: u.completedGigs ?? 0,
          createdAt: new Date(u.createdAt as number).toISOString(),
          signals: ["new_account_high_bids"],
        };
      })
    );

    const flagged = suspicious.filter((x) => x !== null);
    res.json({ flagged, count: flagged.length });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/fraud/reviews — Reviews flagged as suspicious (low comment, extremes)
// ---------------------------------------------------------------------------
router.get("/admin/fraud/reviews", async (_req, res, next) => {
  try {
    // Flag 1-star or 5-star reviews with no comment, from new accounts
    const snap = await db
      .collection("reviews")
      .where("comment", "==", "")
      .get();

    const suspicious = snap.docs
      .map((d) => {
        const r = d.data();
        if (r.rating !== 1 && r.rating !== 5) return null;
        return {
          id: r.id,
          reviewerId: r.reviewerId,
          reviewedId: r.reviewedId,
          rating: r.rating,
          bookingId: r.bookingId,
          createdAt: r.createdAt ? new Date(r.createdAt as number).toISOString() : null,
          signals: ["extreme_rating_no_comment"],
        };
      })
      .filter((x) => x !== null);

    res.json({ flagged: suspicious, count: suspicious.length });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/stats/revenue — Subscription revenue by month
// ---------------------------------------------------------------------------
router.get("/admin/stats/revenue", async (_req, res, next) => {
  try {
    const snap = await db
      .collection("subscriptions")
      .where("status", "==", "active")
      .orderBy("activatedAt", "desc")
      .limit(500)
      .get();

    const byMonth: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const s = d.data();
      const month = new Date(s.activatedAt as number).toISOString().substring(0, 7);
      byMonth[month] = (byMonth[month] ?? 0) + ((s.amount as number) ?? 0);
    });

    const revenueByMonth = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));

    res.json({ revenueByMonth });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/stats/growth — User + requirement growth by month
// ---------------------------------------------------------------------------
router.get("/admin/stats/growth", async (_req, res, next) => {
  try {
    const [usersSnap, requirementsSnap] = await Promise.all([
      db.collection("users").orderBy("createdAt", "asc").get(),
      db.collection("requirements").orderBy("createdAt", "asc").get(),
    ]);

    const usersByMonth: Record<string, number> = {};
    usersSnap.docs.forEach((d) => {
      const month = new Date(d.data().createdAt as number).toISOString().substring(0, 7);
      usersByMonth[month] = (usersByMonth[month] ?? 0) + 1;
    });

    const reqsByMonth: Record<string, number> = {};
    requirementsSnap.docs.forEach((d) => {
      const month = new Date(d.data().createdAt as number).toISOString().substring(0, 7);
      reqsByMonth[month] = (reqsByMonth[month] ?? 0) + 1;
    });

    const months = Array.from(
      new Set([...Object.keys(usersByMonth), ...Object.keys(reqsByMonth)])
    ).sort();

    const growth = months.map((month) => ({
      month,
      newUsers: usersByMonth[month] ?? 0,
      newRequirements: reqsByMonth[month] ?? 0,
    }));

    res.json({ growth });
  } catch (error) {
    next(error);
  }
});

export default router;
