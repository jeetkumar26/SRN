import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { computeAndSaveProviderScore } from "../lib/providerScore";

const router = Router();

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

function mapPortfolioDoc(p: FirebaseFirestore.DocumentData) {
  return {
    id: p.id,
    userId: p.userId,
    title: p.title,
    description: p.description || undefined,
    category: p.category || undefined,
    url: p.url || undefined,
    mediaUrls: p.mediaUrls ?? [],
    mediaType: p.mediaType || "image",
    techStack: p.techStack ?? [],
    tags: p.tags ?? [],
    isFeatured: p.isFeatured ?? false,
    likesCount: p.likesCount ?? 0,
    viewsCount: p.viewsCount ?? 0,
    createdAt: p.createdAt ? new Date(p.createdAt as number).toISOString() : new Date().toISOString(),
    updatedAt: p.updatedAt ? new Date(p.updatedAt as number).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// GET /portfolio — List portfolio items for a user
// ---------------------------------------------------------------------------
router.get(
  "/portfolio",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = qs(req.query.userId) ?? req.user!.uid;
      const featuredOnly = qs(req.query.featured) === "true";
      const limit = Math.min(parseInt(qs(req.query.limit) ?? "20", 10), 50);

      let query: FirebaseFirestore.Query = db
        .collection("portfolios")
        .where("userId", "==", userId);

      if (featuredOnly) {
        query = query.where("isFeatured", "==", true);
      }

      const snapshot = await query
        .orderBy("isFeatured", "desc")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      res.json(snapshot.docs.map((d) => mapPortfolioDoc(d.data())));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /portfolio — Add a new portfolio item
// ---------------------------------------------------------------------------
router.post(
  "/portfolio",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const currentRole = req.user?.role;
      if (currentRole !== "digital" && currentRole !== "local" && currentRole !== "admin") {
        res.status(403).json({ error: "Only skill providers can add portfolio items." });
        return;
      }

      const {
        title,
        description,
        category,
        url,
        mediaUrls,
        mediaType,
        techStack,
        tags,
      } = req.body as {
        title: string;
        description?: string;
        category?: string;
        url?: string;
        mediaUrls?: string[];
        mediaType?: "image" | "video" | "pdf";
        techStack?: string[];
        tags?: string[];
      };

      if (!title) {
        res.status(400).json({ error: "title is required." });
        return;
      }

      const now = Date.now();
      const docRef = db.collection("portfolios").doc();

      const portfolioData = {
        id: docRef.id,
        userId: req.user!.uid,
        title,
        description: description ?? "",
        category: category ?? "",
        url: url ?? "",
        mediaUrls: mediaUrls ?? [],
        mediaType: mediaType ?? "image",
        techStack: techStack ?? [],
        tags: tags ?? [],
        isFeatured: false,
        likesCount: 0,
        viewsCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      await docRef.set(portfolioData);

      // Update provider's portfolio keyword index for matching engine
      await updatePortfolioKeywords(req.user!.uid);

      // Recompute provider score (portfolio quality affects score)
      computeAndSaveProviderScore(req.user!.uid).catch(() => {});

      res.status(201).json(mapPortfolioDoc(portfolioData));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /portfolio/:id — Update a portfolio item
// ---------------------------------------------------------------------------
router.patch(
  "/portfolio/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const docRef = db.collection("portfolios").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Portfolio item not found." }); return; }

      const p = doc.data()!;
      if (p.userId !== req.user!.uid && req.user?.role !== "admin") {
        res.status(403).json({ error: "You can only edit your own portfolio." });
        return;
      }

      const ALLOWED_FIELDS = [
        "title", "description", "category", "url",
        "mediaUrls", "mediaType", "techStack", "tags",
      ];

      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      for (const field of ALLOWED_FIELDS) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      await docRef.update(updates);
      await updatePortfolioKeywords(p.userId as string);
      computeAndSaveProviderScore(p.userId as string).catch(() => {});

      const updated = (await docRef.get()).data()!;
      res.json(mapPortfolioDoc(updated));
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /portfolio/:id/featured — Toggle featured status (own items only)
// ---------------------------------------------------------------------------
router.patch(
  "/portfolio/:id/featured",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const docRef = db.collection("portfolios").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Portfolio item not found." }); return; }

      const p = doc.data()!;
      if (p.userId !== req.user!.uid && req.user?.role !== "admin") {
        res.status(403).json({ error: "You can only feature your own portfolio items." });
        return;
      }

      // Max 3 featured items per provider
      if (!p.isFeatured) {
        const featuredSnap = await db
          .collection("portfolios")
          .where("userId", "==", p.userId)
          .where("isFeatured", "==", true)
          .get();

        if (featuredSnap.size >= 3) {
          res.status(409).json({ error: "You can have at most 3 featured portfolio items." });
          return;
        }
      }

      const newFeatured = !p.isFeatured;
      await docRef.update({ isFeatured: newFeatured, updatedAt: Date.now() });

      res.json({ id, isFeatured: newFeatured });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /portfolio/:id/like — Like or unlike a portfolio item
// One like per user per item (toggle).
// ---------------------------------------------------------------------------
router.post(
  "/portfolio/:id/like",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const portfolioId = req.params["id"] as string;
      const userId = req.user!.uid;

      const docRef = db.collection("portfolios").doc(portfolioId);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Portfolio item not found." }); return; }

      const p = doc.data()!;

      // Check if already liked
      const likeRef = db
        .collection("portfolio_likes")
        .doc(`${userId}_${portfolioId}`);
      const likeDoc = await likeRef.get();

      if (likeDoc.exists) {
        // Unlike
        await Promise.all([
          likeRef.delete(),
          docRef.update({
            likesCount: Math.max(0, ((p.likesCount as number) ?? 0) - 1),
          }),
        ]);
        // Recompute score for portfolio owner
        computeAndSaveProviderScore(p.userId as string).catch(() => {});
        res.json({ liked: false, likesCount: Math.max(0, ((p.likesCount as number) ?? 0) - 1) });
      } else {
        // Like
        await Promise.all([
          likeRef.set({ userId, portfolioId, createdAt: Date.now() }),
          docRef.update({
            likesCount: ((p.likesCount as number) ?? 0) + 1,
          }),
        ]);
        computeAndSaveProviderScore(p.userId as string).catch(() => {});
        res.json({ liked: true, likesCount: ((p.likesCount as number) ?? 0) + 1 });
      }
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /portfolio/:id — Delete a portfolio item
// ---------------------------------------------------------------------------
router.delete(
  "/portfolio/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const docRef = db.collection("portfolios").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Portfolio item not found." }); return; }

      const p = doc.data()!;
      if (p.userId !== req.user!.uid && req.user?.role !== "admin") {
        res.status(403).json({ error: "You can only delete your own portfolio items." });
        return;
      }

      await docRef.delete();
      await updatePortfolioKeywords(p.userId as string);
      computeAndSaveProviderScore(p.userId as string).catch(() => {});

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Internal: Rebuilds the denormalized keyword index on the user document.
// This powers fast semantic matching without reading all portfolio docs.
// ---------------------------------------------------------------------------
async function updatePortfolioKeywords(userId: string): Promise<void> {
  const snap = await db
    .collection("portfolios")
    .where("userId", "==", userId)
    .get();

  const keywords = new Set<string>();
  snap.docs.forEach((d) => {
    const p = d.data();
    const words = [
      ...(p.title as string ?? "").toLowerCase().split(/\s+/),
      ...(p.description as string ?? "").toLowerCase().split(/\s+/),
      ...(p.category as string ?? "").toLowerCase().split(/\s+/),
      ...((p.techStack as string[]) ?? []).map((t: string) => t.toLowerCase()),
      ...((p.tags as string[]) ?? []).map((t: string) => t.toLowerCase()),
    ];
    words.filter((w) => w.length > 2).forEach((w) => keywords.add(w));
  });

  await db.collection("users").doc(userId).update({
    portfolioKeywords: Array.from(keywords).slice(0, 100), // cap for Firestore array size
    portfolioItemCount: snap.size,
  });
}

export default router;
