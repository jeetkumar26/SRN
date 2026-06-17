/**
 * PROVIDER ANALYTICS DASHBOARD — MODULE 25
 *
 * Metrics tracked:
 *   - Profile views (tracked on GET /users/:id for anyone other than self)
 *   - Requirement click-throughs (lead views already tracked in leadDistribution)
 *   - Bid win rate (accepted / total bids)
 *   - Average response time (time between quote notification and first message)
 *   - Earnings timeline (from completed bookings, grouped by month)
 *   - Portfolio views + likes breakdown
 *   - Conversion funnel: leads → viewed → applied → shortlisted → hired
 *
 * All analytics are computed on-demand from existing Firestore collections.
 * Heavy aggregations run at most once per hour per user (cached in user doc).
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";

const router = Router();

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

// ---------------------------------------------------------------------------
// GET /analytics/provider — Provider's own analytics dashboard
// ---------------------------------------------------------------------------
router.get(
  "/analytics/provider",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== "digital" && userRole !== "local" && userRole !== "admin") {
        res.status(403).json({ error: "Only skill providers can view provider analytics." });
        return;
      }

      const providerId = req.user!.uid;
      const period = qs(req.query.period) ?? "30d"; // 7d | 30d | 90d | all

      const periodMs = {
        "7d": 7 * 24 * 60 * 60_000,
        "30d": 30 * 24 * 60 * 60_000,
        "90d": 90 * 24 * 60 * 60_000,
        "all": Number.MAX_SAFE_INTEGER,
      }[period] ?? 30 * 24 * 60 * 60_000;

      const since = Date.now() - periodMs;

      // Run all queries in parallel
      const [quotesSnap, bookingsSnap, profileViewsSnap, leadsSnap] = await Promise.all([
        db.collection("quotes")
          .where("senderId", "==", providerId)
          .where("createdAt", ">=", since)
          .get(),
        db.collection("bookings")
          .where("providerId", "==", providerId)
          .where("createdAt", ">=", since)
          .get(),
        db.collection("profile_views")
          .where("profileId", "==", providerId)
          .where("viewedAt", ">=", since)
          .get(),
        db.collection("leads")
          .where("providerId", "==", providerId)
          .where("createdAt", ">=", since)
          .get(),
      ]);

      // Bid metrics
      const totalBids = quotesSnap.size;
      const acceptedBids = quotesSnap.docs.filter((d) => d.data().status === "accepted").length;
      const winRate = totalBids > 0 ? parseFloat(((acceptedBids / totalBids) * 100).toFixed(1)) : 0;

      // Earnings
      const completedBookings = bookingsSnap.docs.filter((d) => d.data().status === "completed");
      const totalEarnings = completedBookings.reduce((sum, d) => sum + ((d.data().amount as number) ?? 0), 0);

      // Monthly earnings breakdown
      const earningsByMonth: Record<string, number> = {};
      completedBookings.forEach((d) => {
        const b = d.data();
        const month = b.completedAt
          ? new Date(b.completedAt as number).toISOString().substring(0, 7)
          : new Date(b.createdAt as number).toISOString().substring(0, 7);
        earningsByMonth[month] = (earningsByMonth[month] ?? 0) + ((b.amount as number) ?? 0);
      });

      // Lead funnel
      const leadsTotal = leadsSnap.size;
      const leadsViewed = leadsSnap.docs.filter((d) => d.data().status !== "new").length;
      const leadsApplied = leadsSnap.docs.filter((d) => d.data().status === "applied").length;

      const shortlistedSnap = await db
        .collection("quotes")
        .where("senderId", "==", providerId)
        .where("status", "in", ["shortlisted", "accepted"])
        .where("createdAt", ">=", since)
        .get();

      // Profile views
      const profileViewCount = profileViewsSnap.size;
      const uniqueViewers = new Set(profileViewsSnap.docs.map((d) => d.data().viewerId)).size;

      // Response rate (track how quickly provider responds to first message after hiring)
      const userDoc = await db.collection("users").doc(providerId).get();
      const user = userDoc.data()!;

      res.json({
        period,
        since: new Date(since).toISOString(),
        bids: {
          total: totalBids,
          accepted: acceptedBids,
          winRate,
          shortlisted: shortlistedSnap.size,
        },
        earnings: {
          total: totalEarnings,
          completedJobs: completedBookings.length,
          averageJobValue: completedBookings.length > 0
            ? Math.round(totalEarnings / completedBookings.length)
            : 0,
          byMonth: Object.entries(earningsByMonth)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, amount]) => ({ month, amount })),
        },
        leads: {
          received: leadsTotal,
          viewed: leadsViewed,
          applied: leadsApplied,
          conversionRate: leadsTotal > 0
            ? parseFloat(((leadsApplied / leadsTotal) * 100).toFixed(1))
            : 0,
        },
        profileViews: {
          total: profileViewCount,
          unique: uniqueViewers,
        },
        providerScore: user.providerScore ?? null,
        profileCompletionScore: user.profileCompletionScore ?? null,
        rating: user.rating ?? 0,
        reviewsCount: user.reviewsCount ?? 0,
        responseRate: user.responseRate ?? null,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /analytics/profile-view — Track a profile view
// Called by frontend when a user views another user's profile
// ---------------------------------------------------------------------------
router.post(
  "/analytics/profile-view",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { profileId } = req.body as { profileId?: string };
      const viewerId = req.user!.uid;

      if (!profileId) { res.status(400).json({ error: "profileId is required." }); return; }
      if (profileId === viewerId) { res.json({ tracked: false }); return; } // don't track self-views

      // Deduplicate: one view per viewer per profile per hour
      const oneHourAgo = Date.now() - 60 * 60_000;
      const recentView = await db
        .collection("profile_views")
        .where("profileId", "==", profileId)
        .where("viewerId", "==", viewerId)
        .where("viewedAt", ">=", oneHourAgo)
        .limit(1)
        .get();

      if (!recentView.empty) { res.json({ tracked: false }); return; }

      await db.collection("profile_views").add({
        profileId,
        viewerId,
        viewedAt: Date.now(),
      });

      res.json({ tracked: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
