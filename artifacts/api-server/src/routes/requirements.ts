import { Router } from "express";
import { db } from "../lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { CreateRequirementBody } from "@workspace/api-zod";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { distributeLeads, getProviderFeed } from "../lib/leadDistribution";
import { sendNotification } from "../lib/notificationService";

const router = Router();

// ---------------------------------------------------------------------------
// Requirement lifecycle state machine.
// Only valid forward transitions are allowed — prevents status manipulation.
// ---------------------------------------------------------------------------
const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["active", "cancelled"],
  active: ["proposal_received", "cancelled"],
  proposal_received: ["shortlisted", "cancelled"],
  shortlisted: ["hired", "cancelled"],
  hired: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["reviewed"],
  reviewed: [],
  cancelled: [],
};

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

function mapRequirementDoc(r: FirebaseFirestore.DocumentData) {
  return {
    id: r.id,
    creatorId: r.creatorId,
    title: r.title,
    category: r.category,
    description: r.description,
    skillsNeeded: r.skillsNeeded || undefined,
    minBudget: r.minBudget,
    maxBudget: r.maxBudget,
    status: r.status,
    urgency: r.urgency || "normal",
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    matchedProviderCount: r.matchedProviderCount ?? 0,
    distributedAt: r.distributedAt ? new Date(r.distributedAt as number).toISOString() : null,
    createdAt: r.createdAt ? new Date(r.createdAt as number).toISOString() : new Date().toISOString(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as number).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// POST /requirements — Post a new requirement & trigger AI matching
// ---------------------------------------------------------------------------
router.post(
  "/requirements",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = CreateRequirementBody.parse(req.body);
      const userRole = req.user?.role;

      if (userRole !== "business" && userRole !== "customer" && userRole !== "admin") {
        res.status(403).json({ error: "Only Business and Customer accounts can post requirements." });
        return;
      }

      const docRef = db.collection("requirements").doc();
      const now = Date.now();

      const reqData: Record<string, unknown> = {
        id: docRef.id,
        creatorId: req.user!.uid,
        title: body.title,
        category: body.category,
        description: body.description,
        skillsNeeded: body.skillsNeeded ?? "",
        minBudget: body.minBudget,
        maxBudget: body.maxBudget,
        status: "open",
        urgency: (req.body.urgency as string) ?? "normal",  // normal | urgent | asap
        lat: (req.body.lat as number) ?? null,
        lng: (req.body.lng as number) ?? null,
        matchedProviderCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      await docRef.set(reqData);

      // Increment creator's posted requirements count (non-blocking)
      db.collection("users").doc(req.user!.uid).update({
        postedRequirementsCount: FieldValue.increment(1),
      }).catch(() => {});

      // Trigger lead distribution asynchronously (do not block HTTP response)
      distributeLeads({
        id: docRef.id,
        title: body.title,
        description: body.description,
        category: body.category,
        skillsNeeded: body.skillsNeeded ?? "",
        minBudget: body.minBudget,
        maxBudget: body.maxBudget,
        creatorId: req.user!.uid,
        lat: (req.body.lat as number) ?? undefined,
        lng: (req.body.lng as number) ?? undefined,
      }).catch((err) => {
        // Non-fatal: log and continue
        console.error("Lead distribution failed:", err);
      });

      res.status(201).json(mapRequirementDoc(reqData));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /requirements/feed — Personalized requirement feed for providers
// Must come BEFORE /requirements/:id to avoid param conflict
// ---------------------------------------------------------------------------
router.get(
  "/requirements/feed",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== "digital" && userRole !== "local" && userRole !== "admin") {
        res.status(403).json({ error: "Feed is only available for skill providers." });
        return;
      }

      const limit = parseInt(qs(req.query.limit) ?? "20", 10);
      const offset = parseInt(qs(req.query.offset) ?? "0", 10);
      const category = qs(req.query.category);
      const minBudget = req.query.minBudget ? parseInt(qs(req.query.minBudget)!, 10) : undefined;
      const maxBudget = req.query.maxBudget ? parseInt(qs(req.query.maxBudget)!, 10) : undefined;

      const feed = await getProviderFeed(req.user!.uid, {
        limit: Math.min(limit, 50),
        offset,
        category,
        minBudget,
        maxBudget,
      });

      res.json(feed);
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /requirements — List requirements with cursor-based pagination (M39)
// Query params: status, category, creatorId, limit, cursor (last doc ID)
// ---------------------------------------------------------------------------
router.get(
  "/requirements",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const status = qs(req.query.status);
      const category = qs(req.query.category);
      const creatorId = qs(req.query.creatorId);
      const limit = Math.min(parseInt(qs(req.query.limit) ?? "20", 10), 100);
      const cursor = qs(req.query.cursor); // last seen document ID

      let queryRef: FirebaseFirestore.Query = db.collection("requirements");

      if (status) queryRef = queryRef.where("status", "==", status);
      if (category) queryRef = queryRef.where("category", "==", category);
      if (creatorId) queryRef = queryRef.where("creatorId", "==", creatorId);

      queryRef = queryRef.orderBy("createdAt", "desc");

      // Apply cursor if provided (cursor = last doc ID from previous page)
      if (cursor) {
        const cursorDoc = await db.collection("requirements").doc(cursor).get();
        if (cursorDoc.exists) {
          queryRef = queryRef.startAfter(cursorDoc);
        }
      }

      // Fetch limit+1 to detect if there's a next page
      const snapshot = await queryRef.limit(limit + 1).get();
      const hasMore = snapshot.size > limit;
      const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

      res.json({
        items: docs.map((d) => mapRequirementDoc(d.data())),
        nextCursor: hasMore ? docs[docs.length - 1]!.id : null,
        hasMore,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /requirements/:id — Get a single requirement
// ---------------------------------------------------------------------------
router.get(
  "/requirements/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const doc = await db.collection("requirements").doc(req.params["id"] as string).get();
      if (!doc.exists) {
        res.status(404).json({ error: "Requirement not found." });
        return;
      }
      res.json(mapRequirementDoc(doc.data()!));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /requirements/:id/status — Lifecycle transition
// Validates the transition is legal before applying it.
// ---------------------------------------------------------------------------
router.patch(
  "/requirements/:id/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const newStatus = req.body.status as string;

      if (!newStatus) {
        res.status(400).json({ error: "status is required." });
        return;
      }

      const docRef = db.collection("requirements").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        res.status(404).json({ error: "Requirement not found." });
        return;
      }

      const data = doc.data()!;
      const currentUid = req.user!.uid;
      const currentRole = req.user?.role;

      if (data.creatorId !== currentUid && currentRole !== "admin") {
        res.status(403).json({ error: "You can only update your own requirements." });
        return;
      }

      const currentStatus = data.status as string;
      const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

      if (!allowed.includes(newStatus)) {
        res.status(400).json({
          error: `Cannot transition from "${currentStatus}" to "${newStatus}".`,
          allowedTransitions: allowed,
        });
        return;
      }

      await docRef.update({ status: newStatus, updatedAt: Date.now() });
      const updated = (await docRef.get()).data()!;
      res.json(mapRequirementDoc(updated));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /requirements/:id/shortlist/:quoteId — Shortlist a proposal
// Marks one quote as shortlisted and advances requirement status.
// ---------------------------------------------------------------------------
router.post(
  "/requirements/:id/shortlist/:quoteId",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const quoteId = req.params["quoteId"] as string;
      const currentUid = req.user!.uid;
      const currentRole = req.user?.role;

      const [reqDoc, quoteDoc] = await Promise.all([
        db.collection("requirements").doc(id).get(),
        db.collection("quotes").doc(quoteId).get(),
      ]);

      if (!reqDoc.exists) { res.status(404).json({ error: "Requirement not found." }); return; }
      if (!quoteDoc.exists) { res.status(404).json({ error: "Quote not found." }); return; }

      const reqData = reqDoc.data()!;
      if (reqData.creatorId !== currentUid && currentRole !== "admin") {
        res.status(403).json({ error: "Only the requirement owner can shortlist proposals." });
        return;
      }

      const quoteData = quoteDoc.data()!;
      if (quoteData.requirementId !== id) {
        res.status(400).json({ error: "Quote does not belong to this requirement." });
        return;
      }

      const batch = db.batch();
      batch.update(quoteDoc.ref, { status: "shortlisted", shortlistedAt: Date.now() });

      // Advance requirement to shortlisted if it's in proposal_received
      if (reqData.status === "proposal_received" || reqData.status === "active") {
        batch.update(reqDoc.ref, { status: "shortlisted", updatedAt: Date.now() });
      }

      await batch.commit();

      // Notify the provider they've been shortlisted
      await sendNotification(quoteData.senderId as string, {
        type: "shortlisted",
        title: "You've been shortlisted!",
        body: `Your proposal for "${reqData.title}" has been shortlisted.`,
        data: { requirementId: id, quoteId },
      });

      res.json({ success: true, quoteId, status: "shortlisted" });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /requirements/:id — Owner or admin can delete/cancel a requirement
// ---------------------------------------------------------------------------
router.delete(
  "/requirements/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const docRef = db.collection("requirements").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Requirement not found." }); return; }

      const data = doc.data()!;
      if (data.creatorId !== req.user!.uid && req.user?.role !== "admin") {
        res.status(403).json({ error: "You can only delete your own requirements." });
        return;
      }

      // Soft-cancel instead of hard delete if it has active quotes
      const quotesSnap = await db
        .collection("quotes")
        .where("requirementId", "==", id as string)
        .where("status", "in", ["pending", "shortlisted"])
        .get();

      if (!quotesSnap.empty) {
        // Has pending proposals — cancel gracefully
        await docRef.update({ status: "cancelled", updatedAt: Date.now() });
        res.status(200).json({ message: "Requirement cancelled (had active proposals)." });
        return;
      }

      await docRef.delete();
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
