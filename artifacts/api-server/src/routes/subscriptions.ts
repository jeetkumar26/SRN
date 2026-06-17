/**
 * SUBSCRIPTION MANAGEMENT ROUTES — MODULE 14
 *
 * Algorithm:
 *  1. GET  /subscriptions/plans          — list all available plans (public)
 *  2. GET  /subscriptions/status         — current user's subscription (auth required)
 *  3. POST /subscriptions/create-order   — create a Razorpay order for upgrade
 *  4. POST /subscriptions/webhook        — Razorpay webhook (HMAC-SHA256 verified)
 *  5. POST /subscriptions/cancel         — schedule cancellation at period end
 *
 * Security:
 *  - Webhook endpoint uses raw body buffer for HMAC verification (bypasses JSON parse)
 *  - Webhook is NOT behind authenticateToken — Razorpay calls it directly
 *  - All other endpoints require auth
 */

import express, { Router, type Request } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import {
  SUBSCRIPTION_PLANS,
  createSubscriptionOrder,
  processRazorpayWebhook,
} from "../lib/subscriptionService";
import { db } from "../lib/firebase";

const router = Router();

// ---------------------------------------------------------------------------
// GET /subscriptions/plans — List all subscription plans (no auth)
// ---------------------------------------------------------------------------
router.get("/subscriptions/plans", async (_req, res, next) => {
  try {
    const plans = Object.entries(SUBSCRIPTION_PLANS).map(([tier, plan]) => ({
      tier,
      name: plan.name,
      priceMonthly: plan.priceMonthly,
      currency: "INR",
      features: plan.features,
    }));

    res.json({ plans });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /subscriptions/status — Current user's subscription
// ---------------------------------------------------------------------------
router.get(
  "/subscriptions/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) { res.status(404).json({ error: "User not found." }); return; }

      const user = userDoc.data()!;
      const tier: string = (user.subscriptionTier as string) ?? "free";
      const plan = SUBSCRIPTION_PLANS[tier as keyof typeof SUBSCRIPTION_PLANS] ?? SUBSCRIPTION_PLANS.free;

      res.json({
        tier,
        name: plan.name,
        features: plan.features,
        isActive: user.subscriptionActive ?? (tier === "free"),
        expiresAt: user.subscriptionExpiresAt
          ? new Date(user.subscriptionExpiresAt as number).toISOString()
          : null,
        bidsUsed: user.bidsThisMonth ?? 0,
        bidsLimit: plan.features.maxBidsPerMonth === -1 ? null : plan.features.maxBidsPerMonth,
        isPremium: user.isPremium ?? false,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /subscriptions/create-order — Start a Razorpay payment for upgrade
// ---------------------------------------------------------------------------
router.post(
  "/subscriptions/create-order",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { tier } = req.body as { tier?: string };

      if (!tier || !SUBSCRIPTION_PLANS[tier as keyof typeof SUBSCRIPTION_PLANS]) {
        res.status(400).json({
          error: "Invalid tier. Must be 'pro' or 'business'.",
          validTiers: Object.keys(SUBSCRIPTION_PLANS).filter((t) => t !== "free"),
        });
        return;
      }

      if (tier === "free") {
        res.status(400).json({ error: "Cannot create an order for the free tier." });
        return;
      }

      const order = await createSubscriptionOrder(req.user!.uid, tier as "pro" | "business");

      res.status(201).json(order);
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /subscriptions/webhook — Razorpay webhook (raw body required for HMAC)
// ---------------------------------------------------------------------------
router.post(
  "/subscriptions/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res, next) => {
    try {
      const signature = req.headers["x-razorpay-signature"] as string | undefined;

      if (!signature) {
        res.status(400).json({ error: "Missing Razorpay signature header." });
        return;
      }

      const rawBody = (req.body as Buffer).toString("utf-8");

      await processRazorpayWebhook(rawBody, signature);

      res.json({ received: true });
    } catch (error) {
      // Return 400 for signature verification failures so Razorpay retries
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /subscriptions/cancel — Schedule cancellation at end of billing period
// ---------------------------------------------------------------------------
router.post(
  "/subscriptions/cancel",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) { res.status(404).json({ error: "User not found." }); return; }

      const user = userDoc.data()!;
      const tier = (user.subscriptionTier as string) ?? "free";

      if (tier === "free") {
        res.status(409).json({ error: "You are already on the free plan." });
        return;
      }

      // Mark cancellation — background job will downgrade after expiry
      await db.collection("users").doc(userId).update({
        subscriptionCancelledAt: Date.now(),
        subscriptionCancelScheduled: true,
      });

      res.json({
        success: true,
        message: "Subscription will be cancelled at the end of the billing period.",
        expiresAt: user.subscriptionExpiresAt
          ? new Date(user.subscriptionExpiresAt as number).toISOString()
          : null,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
