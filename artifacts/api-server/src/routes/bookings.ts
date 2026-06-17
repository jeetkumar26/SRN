import { Router } from "express";
import { db } from "../lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { sendNotification } from "../lib/notificationService";
import { computeAndSaveProviderScore } from "../lib/providerScore";
import { eventBus } from "../lib/eventBus";
import { creditReferralReward } from "./referrals";

const router = Router();

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

// Allowed status transitions for bookings
const BOOKING_TRANSITIONS: Record<string, string[]> = {
  confirmed: ["in_progress", "cancelled", "rescheduled"],
  in_progress: ["completed", "cancelled"],
  rescheduled: ["confirmed", "cancelled"],
  completed: [],
  cancelled: [],
};

function mapBookingDoc(b: FirebaseFirestore.DocumentData) {
  return {
    id: b.id,
    requirementId: b.requirementId,
    quoteId: b.quoteId ?? undefined,
    requirementTitle: b.requirementTitle,
    customerId: b.customerId,
    providerId: b.providerId,
    providerName: b.providerName || undefined,
    customerName: b.customerName || undefined,
    amount: b.amount,
    durationDays: b.durationDays ?? undefined,
    status: b.status,
    category: b.category,
    escrowStatus: b.escrowStatus ?? "pending",
    rescheduleDate: b.rescheduleDate ? new Date(b.rescheduleDate as number).toISOString() : undefined,
    rescheduleReason: b.rescheduleReason || undefined,
    cancellationReason: b.cancellationReason || undefined,
    startedAt: b.startedAt ? new Date(b.startedAt as number).toISOString() : null,
    completedAt: b.completedAt ? new Date(b.completedAt as number).toISOString() : null,
    createdAt: b.createdAt ? new Date(b.createdAt as number).toISOString() : new Date().toISOString(),
    reviewLeft: b.reviewLeft ?? false,
  };
}

// ---------------------------------------------------------------------------
// GET /bookings — List bookings with cursor-based pagination (M39)
// ---------------------------------------------------------------------------
router.get(
  "/bookings",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const currentUid = req.user!.uid;
      const currentRole = req.user?.role;
      const status = qs(req.query.status);
      const limit = Math.min(parseInt(qs(req.query.limit) ?? "20", 10), 100);
      const cursor = qs(req.query.cursor);

      let query: FirebaseFirestore.Query;

      if (currentRole === "admin") {
        query = db.collection("bookings");
      } else if (currentRole === "digital" || currentRole === "local") {
        query = db.collection("bookings").where("providerId", "==", currentUid);
      } else {
        query = db.collection("bookings").where("customerId", "==", currentUid);
      }

      if (status) query = query.where("status", "==", status);
      query = query.orderBy("createdAt", "desc");

      if (cursor) {
        const cursorDoc = await db.collection("bookings").doc(cursor).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }

      const snapshot = await query.limit(limit + 1).get();
      const hasMore = snapshot.size > limit;
      const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

      res.json({
        items: docs.map((d) => mapBookingDoc(d.data())),
        nextCursor: hasMore ? docs[docs.length - 1]!.id : null,
        hasMore,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /bookings/:id — Get a single booking
// ---------------------------------------------------------------------------
router.get(
  "/bookings/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const doc = await db.collection("bookings").doc(id).get();

      if (!doc.exists) { res.status(404).json({ error: "Booking not found." }); return; }

      const b = doc.data()!;
      const currentUid = req.user!.uid;

      if (
        b.customerId !== currentUid &&
        b.providerId !== currentUid &&
        req.user?.role !== "admin"
      ) {
        res.status(403).json({ error: "Access denied." });
        return;
      }

      res.json(mapBookingDoc(b));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /bookings/:id — Update booking status
// Handles: in_progress, completed, cancelled, rescheduled
// ---------------------------------------------------------------------------
router.patch(
  "/bookings/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const { status, rescheduleDate, rescheduleReason, cancellationReason } = req.body as {
        status: string;
        rescheduleDate?: string;
        rescheduleReason?: string;
        cancellationReason?: string;
      };

      if (!status) { res.status(400).json({ error: "status is required." }); return; }

      const docRef = db.collection("bookings").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Booking not found." }); return; }

      const booking = doc.data()!;
      const currentUid = req.user!.uid;
      const currentRole = req.user?.role;

      // Access control: customer or provider of this booking, or admin
      if (
        booking.customerId !== currentUid &&
        booking.providerId !== currentUid &&
        currentRole !== "admin"
      ) {
        res.status(403).json({ error: "Access denied." });
        return;
      }

      // Validate transition
      const allowed = BOOKING_TRANSITIONS[booking.status as string] ?? [];
      if (!allowed.includes(status)) {
        res.status(400).json({
          error: `Cannot transition from "${booking.status}" to "${status}".`,
          allowedTransitions: allowed,
        });
        return;
      }

      // Only provider can mark in_progress or completed
      if ((status === "in_progress" || status === "completed") && booking.providerId !== currentUid && currentRole !== "admin") {
        res.status(403).json({ error: "Only the provider can update work status." });
        return;
      }

      const now = Date.now();
      const updates: Record<string, unknown> = { status, updatedAt: now };

      if (status === "in_progress") {
        updates.startedAt = now;
        // Advance requirement to in_progress
        if (booking.requirementId) {
          db.collection("requirements")
            .doc(booking.requirementId as string)
            .update({ status: "in_progress", updatedAt: now })
            .catch(() => {});
        }
      }

      if (status === "completed") {
        updates.completedAt = now;
        updates.escrowStatus = "released";

        // Advance requirement to completed
        if (booking.requirementId) {
          db.collection("requirements")
            .doc(booking.requirementId as string)
            .update({ status: "completed", updatedAt: now })
            .catch(() => {});
        }

        // Increment provider completedGigs atomically and recompute score
        await db.collection("users").doc(booking.providerId as string).update({
          completedGigs: FieldValue.increment(1),
        });
        computeAndSaveProviderScore(booking.providerId as string).catch(() => {});

        // Emit event — triggers review nudge notification via eventBus listener
        eventBus.emit("booking.completed", {
          bookingId: id,
          providerId: booking.providerId as string,
          customerId: booking.customerId as string,
          amount: (booking.amount as number) ?? 0,
        });

        // Credit referral rewards if applicable
        creditReferralReward(booking.customerId as string).catch(() => {});
      }

      if (status === "cancelled") {
        updates.cancellationReason = cancellationReason ?? "";
        updates.escrowStatus = "refunded";

        eventBus.emit("booking.cancelled", {
          bookingId: id,
          providerId: booking.providerId as string,
          customerId: booking.customerId as string,
          reason: cancellationReason,
        });
      }

      if (status === "rescheduled") {
        if (!rescheduleDate) {
          res.status(400).json({ error: "rescheduleDate is required for rescheduling." });
          return;
        }
        updates.rescheduleDate = new Date(rescheduleDate).getTime();
        updates.rescheduleReason = rescheduleReason ?? "";
      }

      await docRef.update(updates);

      // Send notifications based on new status
      const notifMap: Record<string, { title: string; body: string }> = {
        in_progress: {
          title: "Work has started",
          body: `Provider started working on "${booking.requirementTitle}"`,
        },
        completed: {
          title: "Work completed!",
          body: `"${booking.requirementTitle}" has been marked complete. Please leave a review.`,
        },
        cancelled: {
          title: "Booking cancelled",
          body: `The booking for "${booking.requirementTitle}" has been cancelled.`,
        },
        rescheduled: {
          title: "Booking rescheduled",
          body: `"${booking.requirementTitle}" has been rescheduled.`,
        },
      };

      const notifPayload = notifMap[status];
      if (notifPayload) {
        const otherParty =
          booking.providerId === currentUid
            ? (booking.customerId as string)
            : (booking.providerId as string);

        sendNotification(otherParty, {
          type: "booking",
          ...notifPayload,
          data: { bookingId: id, status },
        }).catch(() => {});
      }

      const updated = (await docRef.get()).data()!;
      res.json(mapBookingDoc(updated));
    } catch (error) {
      next(error);
    }
  }
);

export default router;
