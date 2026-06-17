/**
 * EVENT BUS — M18: Event-Driven Architecture
 *
 * In-process typed pub/sub. No Redis or external broker needed at this scale.
 * If you later need cross-process events (multiple server instances), swap the
 * emitter for a Redis Pub/Sub or Firebase Cloud Pub/Sub adapter — the call-sites
 * stay identical because they only depend on `emit()` and `on()`.
 *
 * Event catalogue:
 *  requirement.created       — new requirement posted
 *  requirement.completed     — requirement marked as completed
 *  quote.submitted           — provider placed a bid
 *  quote.accepted            — bid accepted, booking created
 *  booking.completed         — work delivered
 *  booking.cancelled         — booking cancelled
 *  review.created            — new review submitted
 *  user.registered           — new user signed up
 *  user.verified             — KYC level increased
 *  user.deactivated          — account deactivated
 *  subscription.upgraded     — paid plan activated
 *  subscription.expired      — plan downgraded
 *  dispute.filed             — dispute opened
 *  dispute.resolved          — admin ruling applied
 *  message.sent              — new chat message
 *  media.confirmed           — file upload confirmed
 */

import { EventEmitter } from "events";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Typed event payloads
// ---------------------------------------------------------------------------
export interface SRNEvents {
  "requirement.created":    { requirementId: string; creatorId: string; category: string };
  "requirement.completed":  { requirementId: string; creatorId: string };
  "quote.submitted":        { quoteId: string; requirementId: string; providerId: string; amount: number };
  "quote.accepted":         { quoteId: string; requirementId: string; providerId: string; customerId: string; bookingId: string };
  "booking.completed":      { bookingId: string; providerId: string; customerId: string; amount: number };
  "booking.cancelled":      { bookingId: string; providerId: string; customerId: string; reason?: string };
  "review.created":         { reviewId: string; reviewedId: string; reviewerId: string; rating: number };
  "user.registered":        { userId: string; role: string; provider: string };
  "user.verified":          { userId: string; level: number; type: string };
  "user.deactivated":       { userId: string };
  "subscription.upgraded":  { userId: string; tier: string; expiresAt: number };
  "subscription.expired":   { userId: string; previousTier: string };
  "dispute.filed":          { disputeId: string; bookingId: string; filedBy: string };
  "dispute.resolved":       { disputeId: string; ruling: string; ruledBy: string };
  "message.sent":           { messageId: string; senderId: string; receiverId: string };
  "media.confirmed":        { mediaId: string; userId: string; context: string };
}

export type SRNEventName = keyof SRNEvents;

// ---------------------------------------------------------------------------
// Typed EventEmitter wrapper
// ---------------------------------------------------------------------------
class SRNEventBus extends EventEmitter {
  emit<K extends SRNEventName>(event: K, payload: SRNEvents[K]): boolean {
    logger.debug({ event, payload }, "Event emitted");
    return super.emit(event, payload);
  }

  on<K extends SRNEventName>(event: K, listener: (payload: SRNEvents[K]) => void): this {
    return super.on(event, listener);
  }

  once<K extends SRNEventName>(event: K, listener: (payload: SRNEvents[K]) => void): this {
    return super.once(event, listener);
  }

  off<K extends SRNEventName>(event: K, listener: (payload: SRNEvents[K]) => void): this {
    return super.off(event, listener);
  }
}

// Singleton — shared across the entire process
export const eventBus = new SRNEventBus();

// Prevent memory leaks from unlimited listeners
eventBus.setMaxListeners(50);

// ---------------------------------------------------------------------------
// Default listeners — wire platform-wide side effects here so routes stay thin
// ---------------------------------------------------------------------------
import { computeAndSaveProviderScore } from "./providerScore";
import { sendNotification } from "./notificationService";
import { sendTemplatedEmail } from "./emailService";
import { writeAuditLog } from "./auditLog";
import { db } from "./firebase";

// On booking completion: recompute provider score + send review nudge
eventBus.on("booking.completed", async ({ bookingId, providerId, customerId, amount }) => {
  try {
    await computeAndSaveProviderScore(providerId);

    // Nudge both parties to leave a review
    await Promise.allSettled([
      sendNotification(customerId, {
        type: "review",
        title: "How did it go?",
        body: "Your booking is complete. Leave a review to help the community.",
        data: { bookingId, screen: "review_form" },
      }),
      sendNotification(providerId, {
        type: "review",
        title: "Job done!",
        body: "The client may leave you a review. Keep up the great work.",
        data: { bookingId, screen: "booking_detail" },
      }),
    ]);
  } catch (err) {
    logger.error({ err, bookingId }, "booking.completed handler failed");
  }
});

// On new review: log audit trail
eventBus.on("review.created", async ({ reviewId, reviewedId, rating }) => {
  try {
    await writeAuditLog({
      action: "review.created",
      actorId: reviewedId,
      resourceType: "review",
      resourceId: reviewId,
      metadata: { rating },
    });
  } catch (err) {
    logger.error({ err, reviewId }, "review.created handler failed");
  }
});

// On user verified: recompute score + send congratulations
eventBus.on("user.verified", async ({ userId, level, type }) => {
  try {
    await computeAndSaveProviderScore(userId);
    await sendNotification(userId, {
      type: "system",
      title: "Verification Complete!",
      body: `Your ${type} verification was approved. Your trust score has been updated.`,
      data: { screen: "profile", verificationLevel: String(level) },
    });
  } catch (err) {
    logger.error({ err, userId }, "user.verified handler failed");
  }
});

// On subscription upgrade: notify provider
eventBus.on("subscription.upgraded", async ({ userId, tier }) => {
  try {
    await sendNotification(userId, {
      type: "system",
      title: "Subscription Activated",
      body: `You're now on the ${tier} plan. Enjoy your new features!`,
      data: { screen: "subscription", tier },
    });
  } catch (err) {
    logger.error({ err, userId }, "subscription.upgraded handler failed");
  }
});

// On dispute filed: write audit log
eventBus.on("dispute.filed", async ({ disputeId, bookingId, filedBy }) => {
  try {
    await writeAuditLog({
      action: "dispute.filed",
      actorId: filedBy,
      resourceType: "dispute",
      resourceId: disputeId,
      metadata: { bookingId },
    });
  } catch (err) {
    logger.error({ err, disputeId }, "dispute.filed handler failed");
  }
});

// On dispute resolved: audit log
eventBus.on("dispute.resolved", async ({ disputeId, ruling, ruledBy }) => {
  try {
    await writeAuditLog({
      action: "dispute.resolved",
      actorId: ruledBy,
      resourceType: "dispute",
      resourceId: disputeId,
      metadata: { ruling },
    });
  } catch (err) {
    logger.error({ err, disputeId }, "dispute.resolved handler failed");
  }
});

// On user registered: send welcome email + audit log
eventBus.on("user.registered", async ({ userId, role, provider }) => {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const user = userDoc.data()!;
      await sendTemplatedEmail(user.email as string, "welcome", { name: user.name as string }, userId);
    }
    await writeAuditLog({
      action: "user.registered",
      actorId: userId,
      resourceType: "user",
      resourceId: userId,
      metadata: { role, provider },
    });
  } catch (err) {
    logger.error({ err, userId }, "user.registered handler failed");
  }
});
