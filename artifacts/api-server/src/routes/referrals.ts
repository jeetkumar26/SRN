/**
 * REFERRAL SYSTEM — M35
 *
 * Algorithm:
 *  1. Every user gets a unique referral code on account creation (auto-generated)
 *     Code format: SRN + first 4 chars of uid + random 4-char suffix (e.g. SRN-A1B2-X9Y8)
 *
 *  2. During registration, user can pass referralCode in the POST /users body
 *     Server validates the code, links the referral relationship
 *
 *  3. Reward triggers:
 *     - Referrer gets reward when referred user completes their FIRST booking
 *     - Reward: ₹50 platform credit (stored in user.referralCredits)
 *     - Referred user gets ₹25 on their first booking too
 *
 *  4. Referral credit is applied as a discount on next subscription payment
 *     (handled in subscriptionService when creating the Razorpay order)
 *
 * Endpoints:
 *   GET  /referrals/my-code       — get own referral code (auto-creates if missing)
 *   GET  /referrals/stats         — count of referred users + earned credits
 *   POST /referrals/apply         — apply a referral code (called during onboarding)
 *   GET  /referrals/leaderboard   — top referrers (gamification, public)
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
const router = Router();

function generateReferralCode(uid: string): string {
  const prefix = uid.substring(0, 4).toUpperCase();
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SRN-${prefix}-${suffix}`;
}

async function getOrCreateReferralCode(userId: string): Promise<string> {
  const userRef = db.collection("users").doc(userId);

  // Fast path — no transaction needed if code already exists
  const existing = await userRef.get();
  if (!existing.exists) throw new Error("User not found.");
  if (existing.data()!.referralCode) return existing.data()!.referralCode as string;

  // Transaction prevents two concurrent requests assigning different codes to same user
  return db.runTransaction(async (t) => {
    const doc = await t.get(userRef);
    if (!doc.exists) throw new Error("User not found.");
    if (doc.data()!.referralCode) return doc.data()!.referralCode as string;

    // Include timestamp in seed to eliminate deterministic collisions between users
    const code = generateReferralCode(userId + Date.now().toString(36));
    t.update(userRef, { referralCode: code });
    return code;
  });
}

// ---------------------------------------------------------------------------
// GET /referrals/my-code — Get own referral code
// ---------------------------------------------------------------------------
router.get(
  "/referrals/my-code",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const code = await getOrCreateReferralCode(req.user!.uid);
      const shareUrl = `https://srn.digitalnextworld.com/join?ref=${code}`;

      res.json({ code, shareUrl });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /referrals/stats — My referral statistics
// ---------------------------------------------------------------------------
router.get(
  "/referrals/stats",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;

      const [referralsSnap, userDoc] = await Promise.all([
        db.collection("referrals").where("referrerId", "==", userId).get(),
        db.collection("users").doc(userId).get(),
      ]);

      const user = userDoc.data()!;
      const referrals = referralsSnap.docs.map((d) => {
        const r = d.data();
        return {
          referredUserId: r.referredUserId,
          status: r.status,
          rewardPaid: r.rewardPaid ?? false,
          createdAt: new Date(r.createdAt as number).toISOString(),
        };
      });

      const completedReferrals = referrals.filter((r) => r.rewardPaid).length;

      res.json({
        referralCode: user.referralCode ?? (await getOrCreateReferralCode(userId)),
        totalReferred: referrals.length,
        completedReferrals,
        pendingReferrals: referrals.length - completedReferrals,
        totalCreditsEarned: (user.referralCreditsEarned as number) ?? 0,
        availableCredits: (user.referralCredits as number) ?? 0,
        referrals,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /referrals/apply — Apply a referral code during onboarding
// ---------------------------------------------------------------------------
router.post(
  "/referrals/apply",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { code } = req.body as { code?: string };

      if (!code) {
        res.status(400).json({ error: "code is required." });
        return;
      }

      const userId = req.user!.uid;

      // Check user hasn't already applied a referral code
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) { res.status(404).json({ error: "User not found." }); return; }

      const user = userDoc.data()!;
      if (user.referredBy) {
        res.status(409).json({ error: "You have already applied a referral code." });
        return;
      }

      // Find the referrer by code
      const referrerSnap = await db
        .collection("users")
        .where("referralCode", "==", code.toUpperCase())
        .limit(1)
        .get();

      if (referrerSnap.empty) {
        res.status(404).json({ error: "Invalid referral code." });
        return;
      }

      const referrer = referrerSnap.docs[0]!;
      if (referrer.id === userId) {
        res.status(400).json({ error: "You cannot use your own referral code." });
        return;
      }

      const now = Date.now();

      // Create referral record
      const refRef = db.collection("referrals").doc();
      await refRef.set({
        id: refRef.id,
        referrerId: referrer.id,
        referredUserId: userId,
        code: code.toUpperCase(),
        status: "pending",
        rewardPaid: false,
        createdAt: now,
      });

      // Link referred user to referrer
      await db.collection("users").doc(userId).update({
        referredBy: referrer.id,
        referralId: refRef.id,
      });

      res.json({
        success: true,
        message: "Referral code applied. Complete your first booking to unlock rewards!",
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Internal: Credit referral rewards after first booking completion
// Called by bookings.ts when status transitions to "completed"
// ---------------------------------------------------------------------------
export async function creditReferralReward(userId: string): Promise<void> {
  // Run inside a transaction so two concurrent booking completions can't double-pay the reward
  await db.runTransaction(async (t) => {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await t.get(userRef);
    if (!userDoc.exists) return;

    const user = userDoc.data()!;
    if (!user.referralId || user.referralRewardClaimed) return;

    const refRef = db.collection("referrals").doc(user.referralId as string);
    const refDoc = await t.get(refRef);
    if (!refDoc.exists || refDoc.data()!.rewardPaid) return;

    const referrerId = refDoc.data()!.referrerId as string;
    const referrerRef = db.collection("users").doc(referrerId);
    const referrerDoc = await t.get(referrerRef);

    const now = Date.now();
    const currentReferrerCredits = (referrerDoc.data()?.referralCredits as number) ?? 0;
    const currentReferrerEarned = (referrerDoc.data()?.referralCreditsEarned as number) ?? 0;
    const currentUserCredits = (user.referralCredits as number) ?? 0;

    // Referrer gets ₹50
    t.update(referrerRef, {
      referralCredits: currentReferrerCredits + 50,
      referralCreditsEarned: currentReferrerEarned + 50,
    });

    // Referred user gets ₹25
    t.update(userRef, {
      referralCredits: currentUserCredits + 25,
      referralRewardClaimed: true,
    });

    // Mark referral as rewarded
    t.update(refRef, {
      status: "rewarded",
      rewardPaid: true,
      rewardPaidAt: now,
    });
  });
}

// ---------------------------------------------------------------------------
// GET /referrals/leaderboard — Top referrers (public)
// ---------------------------------------------------------------------------
router.get(
  "/referrals/leaderboard",
  authenticateToken,
  async (_req, res, next) => {
    try {
      const snap = await db
        .collection("users")
        .where("referralCreditsEarned", ">", 0)
        .orderBy("referralCreditsEarned", "desc")
        .limit(20)
        .get();

      const leaderboard = snap.docs.map((d, index) => {
        const u = d.data();
        return {
          rank: index + 1,
          userId: d.id,
          name: u.name,
          avatarUrl: u.avatarUrl ?? null,
          totalCreditsEarned: u.referralCreditsEarned ?? 0,
        };
      });

      res.json({ leaderboard });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
