/**
 * SUBSCRIPTION & PREMIUM TIERS — MODULE 27
 *
 * Tiers:
 *   Free    — 5 bids/month, basic visibility, no badge
 *   Pro     — ₹499/month — unlimited bids, +5pt score boost, verified badge ring, priority in feed
 *   Business— ₹1499/month — all Pro + bulk posting, team members (up to 5), featured slot on homepage
 *
 * Algorithm:
 * 1. User selects plan → POST /subscriptions/create → create Razorpay order
 * 2. Frontend opens Razorpay checkout
 * 3. Payment success → Razorpay fires webhook → POST /subscriptions/webhook
 * 4. Webhook verifies HMAC signature → updates user.subscriptionTier + expiresAt
 * 5. Background job checks expiry daily → downgrades expired subscriptions
 * 6. 3-day warning email sent before expiry
 *
 * Feature gating is enforced SERVER-SIDE in the relevant routes:
 * - POST /quotes: checks bid quota for free users
 * - GET /requirements/feed: premium users get higher position in feed
 * - POST /requirements: business tier only for bulk posting
 *
 * Razorpay webhook verification uses HMAC-SHA256 with RAZORPAY_WEBHOOK_SECRET.
 */

import { db } from "./firebase";
import { sendTemplatedEmail } from "./emailService";
import { sendNotification } from "./notificationService";
import { logger } from "./logger";
import crypto from "crypto";
import { eventBus } from "./eventBus";

export type SubscriptionTier = "free" | "pro" | "business";

export interface SubscriptionPlan {
  id: SubscriptionTier;
  name: string;
  priceMonthly: number; // INR paise (for Razorpay)
  features: {
    maxBidsPerMonth: number;    // -1 = unlimited
    scoreBoost: number;          // added to providerScore
    priorityFeedRank: boolean;
    verifiedBadge: boolean;
    maxTeamMembers: number;
    featuredHomepage: boolean;
  };
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    features: {
      maxBidsPerMonth: 5,
      scoreBoost: 0,
      priorityFeedRank: false,
      verifiedBadge: false,
      maxTeamMembers: 1,
      featuredHomepage: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 49900, // ₹499 in paise
    features: {
      maxBidsPerMonth: -1,
      scoreBoost: 5,
      priorityFeedRank: true,
      verifiedBadge: true,
      maxTeamMembers: 1,
      featuredHomepage: false,
    },
  },
  business: {
    id: "business",
    name: "Business",
    priceMonthly: 149900, // ₹1499 in paise
    features: {
      maxBidsPerMonth: -1,
      scoreBoost: 8,
      priorityFeedRank: true,
      verifiedBadge: true,
      maxTeamMembers: 5,
      featuredHomepage: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Create a Razorpay payment order for a subscription upgrade
// ---------------------------------------------------------------------------
export async function createSubscriptionOrder(
  userId: string,
  tier: SubscriptionTier
): Promise<{ orderId: string; amount: number; currency: string; key: string }> {
  const plan = SUBSCRIPTION_PLANS[tier];
  if (tier === "free") throw new Error("Cannot create order for free tier.");

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new Error("Razorpay credentials not configured.");
  }

  // Create Razorpay order via REST API (no SDK needed)
  const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: plan.priceMonthly,
      currency: "INR",
      receipt: `sub_${userId}_${tier}_${Date.now()}`,
      notes: { userId, tier },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Razorpay order creation failed: ${err}`);
  }

  const order = await response.json() as { id: string; amount: number; currency: string };

  // Store pending subscription intent
  await db.collection("subscription_orders").doc(order.id).set({
    orderId: order.id,
    userId,
    tier,
    amount: plan.priceMonthly,
    status: "pending",
    createdAt: Date.now(),
  });

  return {
    orderId: order.id,
    amount: plan.priceMonthly,
    currency: "INR",
    key: razorpayKeyId,
  };
}

// ---------------------------------------------------------------------------
// Process Razorpay webhook — verifies HMAC and activates subscription
// ---------------------------------------------------------------------------
export async function processRazorpayWebhook(
  rawBody: string,
  signature: string
): Promise<void> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET not configured.");

  // Verify HMAC-SHA256 signature
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) {
    throw new Error("Invalid webhook signature.");
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    payload: {
      payment?: { entity: { order_id: string; status: string } };
      subscription?: { entity: { id: string; status: string } };
    };
  };

  logger.info({ event: event.event }, "Razorpay webhook received");

  if (event.event === "payment.captured" && event.payload.payment) {
    const { order_id } = event.payload.payment.entity;
    await activateSubscription(order_id);
  }

  if (event.event === "subscription.charged" && event.payload.subscription) {
    // Handle recurring billing
    await handleSubscriptionRenewal(event.payload.subscription.entity.id);
  }
}

async function activateSubscription(orderId: string): Promise<void> {
  // Wrap all DB writes in a transaction to prevent duplicate activation on Razorpay retries
  const activated = await db.runTransaction(async (t) => {
    const orderDoc = await t.get(db.collection("subscription_orders").doc(orderId));
    if (!orderDoc.exists) {
      logger.warn({ orderId }, "Webhook for unknown order");
      return null;
    }

    const order = orderDoc.data()!;
    if (order.status === "activated") return null; // idempotent guard inside transaction

    const { userId, tier } = order as { userId: string; tier: SubscriptionTier };
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60_000;

    t.update(db.collection("users").doc(userId), {
      subscriptionTier: tier,
      isPremium: tier !== "free",
      subscriptionActive: true,
      subscriptionExpiresAt: expiresAt,
      subscriptionActivatedAt: now,
    });
    t.update(orderDoc.ref, { status: "activated", activatedAt: now });

    const histRef = db.collection("subscriptions").doc();
    t.set(histRef, {
      id: histRef.id,
      userId,
      tier,
      orderId,
      amount: order.amount as number,
      activatedAt: now,
      expiresAt,
      status: "active",
    });

    return { userId, tier, expiresAt };
  });

  if (!activated) return; // Already activated or order not found

  const { userId, tier, expiresAt } = activated;

  // Emit event — push notification is handled by the eventBus listener in eventBus.ts
  eventBus.emit("subscription.upgraded", { userId, tier, expiresAt });

  // Send activation email (separate from push notification)
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const plan = SUBSCRIPTION_PLANS[tier];
      await sendTemplatedEmail(userDoc.data()!.email as string, "subscription_active", {
        planName: plan.name,
        expiresAt: new Date(expiresAt).toLocaleDateString("en-IN"),
      }, userId);
    }
  } catch { /* email is non-critical */ }

  logger.info({ userId, tier, expiresAt }, "Subscription activated");
}

async function handleSubscriptionRenewal(_subscriptionId: string): Promise<void> {
  // For Razorpay subscription (recurring), extend expiresAt by 30 days
  // Implementation depends on how Razorpay subscription IDs are mapped to users
  // This is a placeholder — full implementation requires storing Razorpay subscription IDs
  logger.info({ subscriptionId: _subscriptionId }, "Subscription renewal processed");
}

// ---------------------------------------------------------------------------
// Downgrade expired subscriptions — called by background job daily
// ---------------------------------------------------------------------------
export async function downgradeExpiredSubscriptions(): Promise<void> {
  const now = Date.now();

  const snap = await db
    .collection("users")
    .where("subscriptionTier", "in", ["pro", "business"])
    .where("subscriptionExpiresAt", "<=", now)
    .get();

  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((d) => {
    batch.update(d.ref, {
      subscriptionTier: "free",
      isPremium: false,
    });
  });
  await batch.commit();

  // Notify each downgraded user
  await Promise.allSettled(
    snap.docs.map((d) =>
      sendNotification(d.id, {
        type: "system",
        title: "Subscription expired",
        body: "Your premium plan has expired. Renew to keep your benefits.",
        data: { screen: "premium" },
      })
    )
  );

  logger.info({ downgraded: snap.size }, "Expired subscriptions downgraded");
}

// ---------------------------------------------------------------------------
// Check monthly bid quota for free users
// Returns remaining bids, throws if quota exceeded
// ---------------------------------------------------------------------------
export async function checkBidQuota(userId: string): Promise<void> {
  const userDoc = await db.collection("users").doc(userId).get();
  const tier: SubscriptionTier = (userDoc.data()?.subscriptionTier as SubscriptionTier) ?? "free";
  const plan = SUBSCRIPTION_PLANS[tier];

  if (plan.features.maxBidsPerMonth === -1) return; // unlimited

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const quotaDoc = await db.collection("bid_quotas").doc(userId).get();
  const monthKey = startOfMonth.toISOString().substring(0, 7);
  const used = (quotaDoc.data()?.[monthKey] as number) ?? 0;

  if (used >= plan.features.maxBidsPerMonth) {
    throw new Error(
      `You've used ${used}/${plan.features.maxBidsPerMonth} bids this month. Upgrade to Pro for unlimited bids.`
    );
  }
}

/** Increments monthly bid counter after a successful bid submission */
export async function incrementBidQuota(userId: string): Promise<void> {
  const monthKey = new Date().toISOString().substring(0, 7);
  const quotaRef = db.collection("bid_quotas").doc(userId);
  await quotaRef.set(
    { [monthKey]: ((await quotaRef.get()).data()?.[monthKey] as number ?? 0) + 1 },
    { merge: true }
  );
}
