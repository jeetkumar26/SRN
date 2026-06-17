import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { sendNotification } from "../lib/notificationService";
import { computeAndSaveProviderScore } from "../lib/providerScore";
import { eventBus } from "../lib/eventBus";

const router = Router();

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

// ---------------------------------------------------------------------------
// POST /reviews — Create a review after a completed booking
//
// Fraud prevention:
//   1. Booking must exist and have status "completed"
//   2. Reviewer must be a party to the booking
//   3. One review per booking (idempotent check)
//   4. Cannot review yourself
// ---------------------------------------------------------------------------
router.post(
  "/reviews",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { bookingId, rating, comment, categories } = req.body as {
        bookingId: string;
        rating: number;
        comment?: string;
        categories?: {
          quality?: number;
          communication?: number;
          timeliness?: number;
          professionalism?: number;
        };
      };

      if (!bookingId || typeof rating !== "number") {
        res.status(400).json({ error: "bookingId and rating are required." });
        return;
      }

      if (rating < 1 || rating > 5) {
        res.status(400).json({ error: "Rating must be between 1 and 5." });
        return;
      }

      const reviewerId = req.user!.uid;

      // 1. Verify booking exists and is completed
      const bookingDoc = await db.collection("bookings").doc(bookingId).get();
      if (!bookingDoc.exists) {
        res.status(404).json({ error: "Booking not found." });
        return;
      }

      const booking = bookingDoc.data()!;
      if (booking.status !== "completed") {
        res.status(409).json({ error: "Reviews can only be submitted for completed bookings." });
        return;
      }

      // 2. Reviewer must be a party to the booking
      const isCustomer = booking.customerId === reviewerId;
      const isProvider = booking.providerId === reviewerId;

      if (!isCustomer && !isProvider) {
        res.status(403).json({ error: "You are not a party to this booking." });
        return;
      }

      // 3. Determine who is being reviewed (the other party)
      const reviewedId = isCustomer
        ? (booking.providerId as string)
        : (booking.customerId as string);

      // Cannot review yourself (sanity check)
      if (reviewedId === reviewerId) {
        res.status(400).json({ error: "You cannot review yourself." });
        return;
      }

      // 4. One review per booking per reviewer (idempotent)
      const existingSnap = await db
        .collection("reviews")
        .where("bookingId", "==", bookingId)
        .where("reviewerId", "==", reviewerId)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        res.status(409).json({ error: "You have already submitted a review for this booking." });
        return;
      }

      // Validate category sub-ratings if provided
      const validCategoryRating = (val: unknown) =>
        typeof val === "number" && val >= 1 && val <= 5;

      const categoryRatings: Record<string, number> = {};
      if (categories) {
        for (const [key, val] of Object.entries(categories)) {
          if (validCategoryRating(val)) {
            categoryRatings[key] = val as number;
          }
        }
      }

      const now = Date.now();
      const docRef = db.collection("reviews").doc();

      await docRef.set({
        id: docRef.id,
        bookingId,
        requirementId: booking.requirementId ?? null,
        reviewerId,
        reviewedId,
        reviewerType: isCustomer ? "customer" : "provider",
        rating,
        comment: comment ?? "",
        categories: categoryRatings,
        createdAt: now,
      });

      // Mark the booking as reviewed so the UI shows the "Reviewed" badge
      db.collection("bookings").doc(bookingId).update({ reviewLeft: true }).catch(() => {});

      // Recalculate the reviewed user's aggregate rating
      await recalculateRating(reviewedId);

      // Recompute provider score if provider was reviewed
      if (isCustomer) {
        computeAndSaveProviderScore(reviewedId).catch(() => {});
      }

      // Emit event — triggers audit log via eventBus listener
      eventBus.emit("review.created", {
        reviewId: docRef.id,
        reviewedId,
        reviewerId,
        rating,
      });

      // Notify the reviewed user
      sendNotification(reviewedId, {
        type: "review",
        title: "You received a new review",
        body: `${rating}★ — ${comment?.substring(0, 60) ?? "No comment provided"}`,
        data: { reviewId: docRef.id, bookingId },
      }).catch(() => {});

      res.status(201).json({
        id: docRef.id,
        bookingId,
        reviewerId,
        reviewedId,
        rating,
        comment: comment ?? "",
        categories: categoryRatings,
        createdAt: new Date(now).toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /reviews — List reviews for a provider/user
// ---------------------------------------------------------------------------
router.get(
  "/reviews",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const providerId = qs(req.query.providerId);
      const reviewedId = qs(req.query.reviewedId);
      const limit = Math.min(parseInt(qs(req.query.limit) ?? "20", 10), 100);
      const targetId = providerId ?? reviewedId;

      if (!targetId) {
        res.status(400).json({ error: "providerId or reviewedId query param is required." });
        return;
      }

      const snapshot = await db
        .collection("reviews")
        .where("reviewedId", "==", targetId)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      const reviews = snapshot.docs.map((d) => {
        const r = d.data();
        return {
          id: r.id,
          bookingId: r.bookingId,
          reviewerId: r.reviewerId,
          reviewedId: r.reviewedId,
          reviewerType: r.reviewerType,
          rating: r.rating,
          comment: r.comment || undefined,
          categories: r.categories || {},
          createdAt: r.createdAt ? new Date(r.createdAt as number).toISOString() : null,
        };
      });

      res.json(reviews);
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /reviews/:id — Admin only: remove a fraudulent review
// ---------------------------------------------------------------------------
router.delete(
  "/reviews/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user?.role !== "admin") {
        res.status(403).json({ error: "Only admins can delete reviews." });
        return;
      }

      const id = req.params["id"] as string;
      const docRef = db.collection("reviews").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        res.status(404).json({ error: "Review not found." });
        return;
      }

      const reviewData = doc.data()!;
      await docRef.delete();

      // Recalculate affected user's rating
      await recalculateRating(reviewData.reviewedId as string);
      computeAndSaveProviderScore(reviewData.reviewedId as string).catch(() => {});

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Internal: Recalculates and persists aggregate rating for a user
// ---------------------------------------------------------------------------
async function recalculateRating(userId: string): Promise<void> {
  const snap = await db
    .collection("reviews")
    .where("reviewedId", "==", userId)
    .get();

  if (snap.empty) return;

  const ratings = snap.docs.map((d) => d.data().rating as number);
  const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;

  await db.collection("users").doc(userId).update({
    rating: parseFloat(average.toFixed(2)),
    reviewsCount: ratings.length,
  });
}

export default router;
