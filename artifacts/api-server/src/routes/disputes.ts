/**
 * DISPUTE & RESOLUTION SYSTEM — MODULE 26
 *
 * Algorithm:
 *  1. Either party can open a dispute on a booking within 7 days of completion
 *  2. Dispute filing freezes the booking escrow (no release/refund until resolved)
 *  3. Both parties can submit evidence (media IDs, text descriptions)
 *  4. 72-hour response window for the other party
 *  5. Admin reviews evidence and makes a ruling
 *  6. Ruling options:
 *     - RELEASE: funds released to provider (work was delivered)
 *     - REFUND:  full refund to customer (work not delivered)
 *     - SPLIT:   partial payment specified by admin
 *  7. After ruling: booking updated, notifications sent, audit trail created
 *
 * Fraud prevention:
 *  - Cannot dispute the same booking twice
 *  - Cannot dispute a booking you're not party to
 *  - Cannot dispute a booking older than 7 days post-completion
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { sendNotification } from "../lib/notificationService";
import { sendTemplatedEmail } from "../lib/emailService";
import { eventBus } from "../lib/eventBus";

const router = Router();

type DisputeStatus = "open" | "evidence_submitted" | "under_review" | "resolved" | "closed";
type DisputeRuling = "release" | "refund" | "split";

const DISPUTE_WINDOW_MS = 7 * 24 * 60 * 60_000; // 7 days after completion

// ---------------------------------------------------------------------------
// POST /disputes — File a new dispute
// ---------------------------------------------------------------------------
router.post(
  "/disputes",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const {
        bookingId,
        reason,
        description,
        evidenceMediaIds,
      } = req.body as {
        bookingId?: string;
        reason?: string;
        description?: string;
        evidenceMediaIds?: string[];
      };

      if (!bookingId || !reason) {
        res.status(400).json({ error: "bookingId and reason are required." });
        return;
      }

      const userId = req.user!.uid;

      // Verify booking exists and user is a party
      const bookingDoc = await db.collection("bookings").doc(bookingId).get();
      if (!bookingDoc.exists) { res.status(404).json({ error: "Booking not found." }); return; }

      const booking = bookingDoc.data()!;
      const isCustomer = booking.customerId === userId;
      const isProvider = booking.providerId === userId;

      if (!isCustomer && !isProvider) {
        res.status(403).json({ error: "You are not a party to this booking." });
        return;
      }

      // Only allow disputes on completed bookings within the dispute window
      if (booking.status !== "completed") {
        res.status(409).json({ error: "Disputes can only be filed on completed bookings." });
        return;
      }

      if (booking.completedAt) {
        const completedAt = booking.completedAt as number;
        if (Date.now() - completedAt > DISPUTE_WINDOW_MS) {
          res.status(409).json({ error: "Dispute window has closed (7 days after completion)." });
          return;
        }
      }

      // Check no existing dispute for this booking
      const existingSnap = await db
        .collection("disputes")
        .where("bookingId", "==", bookingId)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        res.status(409).json({ error: "A dispute already exists for this booking." });
        return;
      }

      const now = Date.now();
      const docRef = db.collection("disputes").doc();

      const dispute = {
        id: docRef.id,
        bookingId,
        requirementId: booking.requirementId ?? null,
        filedBy: userId,
        filedByType: isCustomer ? "customer" : "provider",
        againstId: isCustomer ? booking.providerId : booking.customerId,
        reason,
        description: description ?? "",
        evidenceMediaIds: evidenceMediaIds ?? [],
        counterEvidenceMediaIds: [],
        counterDescription: "",
        status: "open" as DisputeStatus,
        ruling: null as DisputeRuling | null,
        ruledAmount: null as number | null,
        ruledBy: null as string | null,
        rulingNote: null as string | null,
        createdAt: now,
        ruledAt: null as number | null,
        evidenceDeadlineAt: now + 72 * 60 * 60_000, // 72-hour window
      };

      const batch = db.batch();
      batch.set(docRef, dispute);

      // Freeze escrow on booking
      batch.update(db.collection("bookings").doc(bookingId), {
        escrowStatus: "frozen",
        disputeId: docRef.id,
        updatedAt: now,
      });

      await batch.commit();

      eventBus.emit("dispute.filed", {
        disputeId: docRef.id,
        bookingId,
        filedBy: userId,
      });

      // Notify the other party
      const otherPartyId = isCustomer ? (booking.providerId as string) : (booking.customerId as string);
      await sendNotification(otherPartyId, {
        type: "system",
        title: "Dispute Filed",
        body: `A dispute has been filed for "${booking.requirementTitle}". Submit your evidence within 72 hours.`,
        data: { disputeId: docRef.id, bookingId },
      });

      res.status(201).json({
        id: docRef.id,
        status: "open",
        evidenceDeadlineAt: new Date(dispute.evidenceDeadlineAt).toISOString(),
        bookingId,
        reason,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /disputes/:id/evidence — Submit counter-evidence (other party)
// ---------------------------------------------------------------------------
router.patch(
  "/disputes/:id/evidence",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const userId = req.user!.uid;

      const docRef = db.collection("disputes").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Dispute not found." }); return; }

      const dispute = doc.data()!;

      // Only the party against whom the dispute was filed can submit counter-evidence
      if (dispute.againstId !== userId) {
        res.status(403).json({ error: "Only the accused party can submit counter-evidence." });
        return;
      }

      if (dispute.status !== "open") {
        res.status(409).json({ error: "Evidence can only be submitted for open disputes." });
        return;
      }

      if (dispute.evidenceDeadlineAt < Date.now()) {
        res.status(409).json({ error: "Evidence submission deadline has passed." });
        return;
      }

      const { description, evidenceMediaIds } = req.body as {
        description?: string;
        evidenceMediaIds?: string[];
      };

      await docRef.update({
        counterDescription: description ?? "",
        counterEvidenceMediaIds: evidenceMediaIds ?? [],
        status: "evidence_submitted",
        evidenceSubmittedAt: Date.now(),
      });

      res.json({ success: true, status: "evidence_submitted" });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /disputes/:id/resolve — Admin resolves a dispute
// ---------------------------------------------------------------------------
router.patch(
  "/disputes/:id/resolve",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user?.role !== "admin") {
        res.status(403).json({ error: "Only admins can resolve disputes." });
        return;
      }

      const id = req.params["id"] as string;
      const { ruling, ruledAmount, note } = req.body as {
        ruling: DisputeRuling;
        ruledAmount?: number;
        note?: string;
      };

      if (!["release", "refund", "split"].includes(ruling)) {
        res.status(400).json({ error: "ruling must be 'release', 'refund', or 'split'." });
        return;
      }

      if (ruling === "split" && (!ruledAmount || ruledAmount <= 0)) {
        res.status(400).json({ error: "ruledAmount is required for split ruling." });
        return;
      }

      const docRef = db.collection("disputes").doc(id);
      const doc = await docRef.get();
      if (!doc.exists) { res.status(404).json({ error: "Dispute not found." }); return; }

      const dispute = doc.data()!;
      const now = Date.now();

      const newEscrowStatus =
        ruling === "release" ? "released"
        : ruling === "refund" ? "refunded"
        : "split";

      const batch = db.batch();

      batch.update(docRef, {
        status: "resolved",
        ruling,
        ruledAmount: ruling === "split" ? ruledAmount : null,
        ruledBy: req.user!.uid,
        rulingNote: note ?? "",
        ruledAt: now,
      });

      batch.update(db.collection("bookings").doc(dispute.bookingId as string), {
        escrowStatus: newEscrowStatus,
        disputeResolution: ruling,
        updatedAt: now,
      });

      await batch.commit();

      eventBus.emit("dispute.resolved", {
        disputeId: id,
        ruling,
        ruledBy: req.user!.uid,
      });

      // Notify both parties
      const notifBody =
        ruling === "release"
          ? "The dispute was resolved in favour of the provider."
          : ruling === "refund"
          ? "The dispute was resolved in your favour. A refund will be processed."
          : `The dispute was settled with a split payment of ₹${ruledAmount}.`;

      await Promise.allSettled([
        sendNotification(dispute.filedBy as string, {
          type: "system",
          title: "Dispute Resolved",
          body: notifBody,
          data: { disputeId: id, ruling },
        }),
        sendNotification(dispute.againstId as string, {
          type: "system",
          title: "Dispute Resolved",
          body: notifBody,
          data: { disputeId: id, ruling },
        }),
      ]);

      res.json({ success: true, ruling, status: "resolved" });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /disputes — List disputes (admin: all; user: own)
// ---------------------------------------------------------------------------
router.get(
  "/disputes",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;
      const isAdmin = req.user?.role === "admin";

      let query: FirebaseFirestore.Query = db.collection("disputes");

      if (!isAdmin) {
        // Users see disputes they filed or were filed against them
        const [filedSnap, againstSnap] = await Promise.all([
          db.collection("disputes").where("filedBy", "==", userId).get(),
          db.collection("disputes").where("againstId", "==", userId).get(),
        ]);
        const all = [...filedSnap.docs, ...againstSnap.docs];
        const seen = new Set<string>();
        const results = all
          .filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true; })
          .map((d) => mapDisputeDoc(d.data()));
        res.json(results);
        return;
      }

      const snapshot = await query.orderBy("createdAt", "desc").limit(50).get();
      res.json(snapshot.docs.map((d) => mapDisputeDoc(d.data())));
    } catch (error) {
      next(error);
    }
  }
);

function mapDisputeDoc(d: FirebaseFirestore.DocumentData) {
  return {
    id: d.id,
    bookingId: d.bookingId,
    filedBy: d.filedBy,
    filedByType: d.filedByType,
    againstId: d.againstId,
    reason: d.reason,
    description: d.description,
    status: d.status,
    ruling: d.ruling ?? null,
    ruledAmount: d.ruledAmount ?? null,
    rulingNote: d.rulingNote ?? null,
    evidenceDeadlineAt: d.evidenceDeadlineAt
      ? new Date(d.evidenceDeadlineAt as number).toISOString()
      : null,
    createdAt: d.createdAt ? new Date(d.createdAt as number).toISOString() : null,
    ruledAt: d.ruledAt ? new Date(d.ruledAt as number).toISOString() : null,
  };
}

export default router;
