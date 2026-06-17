import { Router } from "express";
import { db } from "../lib/firebase";
import { CreateQuoteBody, UpdateQuoteStatusBody } from "@workspace/api-zod";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { markLeadApplied } from "../lib/leadDistribution";
import { sendNotification } from "../lib/notificationService";
import { computeAndSaveProviderScore } from "../lib/providerScore";
import { eventBus } from "../lib/eventBus";
import { checkBidQuota, incrementBidQuota } from "../lib/subscriptionService";

const router = Router();

const QUOTE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

function mapQuoteDoc(q: FirebaseFirestore.DocumentData) {
  return {
    id: q.id,
    requirementId: q.requirementId,
    senderId: q.senderId,
    senderName: (q.senderName as string | undefined) ?? undefined,
    receiverId: q.receiverId,
    amount: q.amount,
    durationDays: q.durationDays,
    status: q.status,
    message: q.message || undefined,
    counterAmount: q.counterAmount ?? undefined,
    counterDurationDays: q.counterDurationDays ?? undefined,
    counterMessage: q.counterMessage || undefined,
    shortlistedAt: q.shortlistedAt ? new Date(q.shortlistedAt as number).toISOString() : undefined,
    withdrawnAt: q.withdrawnAt ? new Date(q.withdrawnAt as number).toISOString() : undefined,
    expiresAt: q.expiresAt ? new Date(q.expiresAt as number).toISOString() : undefined,
    createdAt: q.createdAt ? new Date(q.createdAt as number).toISOString() : new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// POST /quotes — Submit a bid/proposal
// Guards: only providers can bid, no duplicate bids, requirement must be open
// ---------------------------------------------------------------------------
router.post(
  "/quotes",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = CreateQuoteBody.parse(req.body);
      const userRole = req.user?.role;

      if (userRole !== "digital" && userRole !== "local" && userRole !== "admin") {
        res.status(403).json({ error: "Only Skill Provider accounts can submit bids." });
        return;
      }

      const providerId = req.user!.uid;

      // Verify requirement exists and is open
      const reqDoc = await db.collection("requirements").doc(body.requirementId).get();
      if (!reqDoc.exists) {
        res.status(404).json({ error: "Requirement not found." });
        return;
      }

      const reqData = reqDoc.data()!;
      const openStatuses = ["open", "active", "proposal_received"];
      if (!openStatuses.includes(reqData.status as string)) {
        res.status(409).json({ error: "This requirement is no longer accepting proposals." });
        return;
      }

      // Prevent IDOR: receiverId must be the requirement's actual owner
      if (body.receiverId !== (reqData.creatorId as string)) {
        res.status(400).json({ error: "receiverId does not match the requirement owner." });
        return;
      }

      // Duplicate bid prevention: one bid per provider per requirement
      const existingSnap = await db
        .collection("quotes")
        .where("requirementId", "==", body.requirementId)
        .where("senderId", "==", providerId)
        .where("status", "in", ["pending", "shortlisted", "counter_offered"])
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        res.status(409).json({ error: "You have already submitted a proposal for this requirement." });
        return;
      }

      const providerDoc = await db.collection("users").doc(providerId).get();
      const senderName = (providerDoc.data()?.name as string | undefined) ?? "";

      const now = Date.now();
      const docRef = db.collection("quotes").doc();

      const quoteData = {
        id: docRef.id,
        requirementId: body.requirementId,
        senderId: providerId,
        senderName,
        receiverId: body.receiverId,
        amount: body.amount,
        durationDays: body.durationDays,
        message: (req.body.message as string) ?? "",
        status: "pending",
        createdAt: now,
        expiresAt: now + QUOTE_TTL_MS,
      };

      const batch = db.batch();
      batch.set(docRef, quoteData);

      // Advance requirement status to proposal_received if still open/active
      if (reqData.status === "open" || reqData.status === "active") {
        batch.update(db.collection("requirements").doc(body.requirementId), {
          status: "proposal_received",
          updatedAt: now,
        });
      }

      // Enforce monthly bid quota for free-tier providers (throws if exceeded)
      await checkBidQuota(providerId);

      await batch.commit();

      // Increment quota counter (non-blocking, fire-and-forget)
      incrementBidQuota(providerId).catch(() => {});

      eventBus.emit("quote.submitted", {
        quoteId: docRef.id,
        requirementId: body.requirementId,
        providerId,
        amount: body.amount,
      });

      // Mark lead as applied (non-blocking)
      markLeadApplied(body.requirementId, providerId).catch(() => {});

      // Notify the requirement owner
      sendNotification(body.receiverId, {
        type: "quote",
        title: "New proposal received",
        body: `A provider submitted a proposal for "${reqData.title}" — ₹${body.amount} in ${body.durationDays} days`,
        data: {
          requirementId: body.requirementId,
          quoteId: docRef.id,
        },
      }).catch(() => {});

      res.status(201).json(mapQuoteDoc(quoteData));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /quotes — List quotes with cursor-based pagination (M39)
// ---------------------------------------------------------------------------
router.get(
  "/quotes",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const requirementId = qs(req.query.requirementId);
      const senderId = qs(req.query.senderId);
      const currentUid = req.user!.uid;
      const currentRole = req.user?.role;
      const limit = Math.min(parseInt(qs(req.query.limit) ?? "20", 10), 100);
      const cursor = qs(req.query.cursor);

      let queryRef: FirebaseFirestore.Query = db.collection("quotes");

      if (requirementId) {
        queryRef = queryRef.where("requirementId", "==", requirementId);
      } else if (senderId) {
        queryRef = queryRef.where("senderId", "==", senderId);
      } else {
        if (currentRole !== "admin") {
          res.status(403).json({ error: "Provide requirementId or senderId filter." });
          return;
        }
      }

      queryRef = queryRef.orderBy("createdAt", "desc");

      if (cursor) {
        const cursorDoc = await db.collection("quotes").doc(cursor).get();
        if (cursorDoc.exists) queryRef = queryRef.startAfter(cursorDoc);
      }

      const snapshot = await queryRef.limit(limit + 1).get();
      const hasMore = snapshot.size > limit;
      const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;
      const now = Date.now();

      const results = docs
        .map((doc) => doc.data())
        .filter((q) => {
          if (currentRole === "admin") return true;
          return q.senderId === currentUid || q.receiverId === currentUid;
        })
        .map((q) => {
          const effectiveStatus =
            q.status === "pending" && q.expiresAt && (q.expiresAt as number) < now
              ? "expired"
              : q.status;
          return mapQuoteDoc({ ...q, status: effectiveStatus });
        });

      res.json({
        items: results,
        nextCursor: hasMore ? docs[docs.length - 1]!.id : null,
        hasMore,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /quotes/:id — Accept or reject a quote (by receiver / admin)
// ---------------------------------------------------------------------------
router.patch(
  "/quotes/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const body = UpdateQuoteStatusBody.parse(req.body);

      const docRef = db.collection("quotes").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Quote not found." }); return; }

      const quoteData = doc.data()!;
      const currentUid = req.user!.uid;
      const currentRole = req.user?.role;

      if (quoteData.receiverId !== currentUid && currentRole !== "admin") {
        res.status(403).json({ error: "Only the requirement owner can accept or reject this bid." });
        return;
      }

      // Cannot accept an expired quote
      if (
        body.status === "accepted" &&
        quoteData.expiresAt &&
        (quoteData.expiresAt as number) < Date.now()
      ) {
        res.status(409).json({ error: "This proposal has expired." });
        return;
      }

      const now = Date.now();
      await docRef.update({ status: body.status, updatedAt: now });

      if (body.status === "accepted") {
        const reqRef = db.collection("requirements").doc(quoteData.requirementId as string);
        const [reqSnap, providerDoc, customerDoc] = await Promise.all([
          reqRef.get(),
          db.collection("users").doc(quoteData.senderId as string).get(),
          db.collection("users").doc(quoteData.receiverId as string).get(),
        ]);

        if (reqSnap.exists) {
          const reqData = reqSnap.data()!;
          const providerName = (providerDoc.data()?.name as string) ?? "";
          const customerName = (customerDoc.data()?.name as string) ?? "";
          const batch = db.batch();

          // Advance requirement to hired
          batch.update(reqRef, { status: "hired", updatedAt: now });

          // Reject all other pending/shortlisted quotes for this requirement (auto-reject)
          const otherQuotesSnap = await db
            .collection("quotes")
            .where("requirementId", "==", quoteData.requirementId)
            .where("status", "in", ["pending", "shortlisted"])
            .get();

          otherQuotesSnap.docs.forEach((d) => {
            if (d.id !== id) {
              batch.update(d.ref, { status: "rejected", updatedAt: now });
            }
          });

          // Create booking record
          const bookingRef = db.collection("bookings").doc();
          batch.set(bookingRef, {
            id: bookingRef.id,
            requirementId: quoteData.requirementId,
            quoteId: id,
            requirementTitle: reqData.title ?? "Project",
            customerId: quoteData.receiverId,
            providerId: quoteData.senderId,
            providerName,
            customerName,
            amount: quoteData.amount,
            durationDays: quoteData.durationDays,
            status: "confirmed",
            category: reqData.category ?? "General",
            escrowStatus: "pending",
            scheduledDate: now,
            createdAt: now,
            startedAt: null,
            completedAt: null,
          });

          await batch.commit();

          eventBus.emit("quote.accepted", {
            quoteId: id,
            requirementId: quoteData.requirementId as string,
            providerId: quoteData.senderId as string,
            customerId: quoteData.receiverId as string,
            bookingId: bookingRef.id,
          });

          // Notify provider of acceptance
          sendNotification(quoteData.senderId as string, {
            type: "hired",
            title: "Your proposal was accepted!",
            body: `You've been hired for "${reqData.title}". Check your bookings.`,
            data: { requirementId: quoteData.requirementId as string, bookingId: bookingRef.id },
          }).catch(() => {});

          // Notify rejected providers
          otherQuotesSnap.docs.forEach((d) => {
            if (d.id !== id) {
              sendNotification(d.data().senderId as string, {
                type: "quote",
                title: "Proposal update",
                body: `Another provider was selected for "${reqData.title}".`,
                data: { requirementId: quoteData.requirementId as string },
              }).catch(() => {});
            }
          });
        }
      } else if (body.status === "rejected") {
        sendNotification(quoteData.senderId as string, {
          type: "quote",
          title: "Proposal update",
          body: "Your proposal was not selected this time. Keep applying!",
          data: { quoteId: id, requirementId: quoteData.requirementId as string },
        }).catch(() => {});
      }

      const updated = (await docRef.get()).data()!;
      res.json(mapQuoteDoc(updated));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /quotes/:id/counter — Provider or client sends a counter-offer
// ---------------------------------------------------------------------------
router.post(
  "/quotes/:id/counter",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const docRef = db.collection("quotes").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Quote not found." }); return; }

      const quoteData = doc.data()!;
      const currentUid = req.user!.uid;

      // Both sender and receiver can counter-offer
      if (quoteData.senderId !== currentUid && quoteData.receiverId !== currentUid) {
        res.status(403).json({ error: "You are not a party to this quote." });
        return;
      }

      if (!["pending", "shortlisted"].includes(quoteData.status as string)) {
        res.status(409).json({ error: "Can only counter an open proposal." });
        return;
      }

      const { amount, durationDays, message } = req.body as {
        amount?: number;
        durationDays?: number;
        message?: string;
      };

      if (!amount && !durationDays) {
        res.status(400).json({ error: "Provide at least a counter amount or duration." });
        return;
      }

      const now = Date.now();
      await docRef.update({
        status: "counter_offered",
        counterAmount: amount ?? quoteData.amount,
        counterDurationDays: durationDays ?? quoteData.durationDays,
        counterMessage: message ?? "",
        counterBy: currentUid,
        counterAt: now,
        updatedAt: now,
      });

      // Notify the other party
      const notifyUserId =
        currentUid === quoteData.senderId
          ? (quoteData.receiverId as string)
          : (quoteData.senderId as string);

      sendNotification(notifyUserId, {
        type: "counter_offer",
        title: "Counter-offer received",
        body: `A counter-offer of ₹${amount ?? quoteData.amount} was sent.`,
        data: { quoteId: id, requirementId: quoteData.requirementId as string },
      }).catch(() => {});

      const updated = (await docRef.get()).data()!;
      res.json(mapQuoteDoc(updated));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /quotes/:id — Provider withdraws their own proposal
// ---------------------------------------------------------------------------
router.delete(
  "/quotes/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const docRef = db.collection("quotes").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Quote not found." }); return; }

      const quoteData = doc.data()!;
      const currentUid = req.user!.uid;

      // Only the sender can withdraw, or admin
      if (quoteData.senderId !== currentUid && req.user?.role !== "admin") {
        res.status(403).json({ error: "You can only withdraw your own proposals." });
        return;
      }

      if (!["pending", "shortlisted", "counter_offered"].includes(quoteData.status as string)) {
        res.status(409).json({ error: "Cannot withdraw a proposal that is already accepted or rejected." });
        return;
      }

      await docRef.update({
        status: "withdrawn",
        withdrawnAt: Date.now(),
      });

      // Update provider's response rate (withdrawal penalizes slightly)
      computeAndSaveProviderScore(currentUid).catch(() => {});

      res.status(200).json({ message: "Proposal withdrawn successfully." });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
