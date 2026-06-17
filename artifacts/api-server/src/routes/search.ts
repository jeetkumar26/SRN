/**
 * SEARCH ENGINE — MODULE 12
 *
 * Four search modes:
 *  1. Keyword search  — full-text match on users (name/skills/title/description)
 *  2. Nearby search   — location-based radius filter for local providers
 *  3. Category search — exact category match + sub-category hierarchy
 *  4. Requirement search — search open requirements by keyword + filters
 *
 * Sorting algorithms for providers:
 *  - relevance: keyword match score × providerScore
 *  - rating:    rating DESC → reviewsCount DESC
 *  - distance:  haversine ASC (only for nearby)
 *  - newest:    createdAt DESC
 *
 * Search is Firestore-based (no Elasticsearch).
 * For production scale (>100k providers), migrate to Algolia or Typesense.
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { haversineKm } from "../lib/matchingEngine";

const router = Router();

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2)
  );
}

function keywordScore(query: string, targetText: string): number {
  const queryTokens = tokenize(query);
  const targetTokens = tokenize(targetText);
  let matches = 0;
  for (const token of queryTokens) {
    if (targetTokens.has(token)) matches++;
  }
  return queryTokens.size > 0 ? matches / queryTokens.size : 0;
}

// ---------------------------------------------------------------------------
// GET /search/providers — Search skill providers with filters and sorting
// ---------------------------------------------------------------------------
router.get(
  "/search/providers",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = qs(req.query.q) ?? "";
      const role = qs(req.query.role);                         // "digital" | "local"
      const category = qs(req.query.category);
      const sortBy = qs(req.query.sortBy) ?? "relevance";     // relevance | rating | distance | newest
      const limit = Math.min(parseInt(qs(req.query.limit) ?? "20", 10), 50);
      const offset = parseInt(qs(req.query.offset) ?? "0", 10);
      const minRating = parseFloat(qs(req.query.minRating) ?? "0");
      const verifiedOnly = qs(req.query.verifiedOnly) === "true";
      const isAvailable = qs(req.query.isAvailable) === "true";

      // Location params for nearby search
      const lat = qs(req.query.lat) ? parseFloat(qs(req.query.lat)!) : undefined;
      const lng = qs(req.query.lng) ? parseFloat(qs(req.query.lng)!) : undefined;
      const radiusKm = parseFloat(qs(req.query.radiusKm) ?? "50");

      let queryRef: FirebaseFirestore.Query = db.collection("users");

      // Filter by provider role
      if (role === "digital" || role === "local") {
        queryRef = queryRef.where("role", "==", role);
      } else {
        // Both provider types — must do union (two queries)
        const [digitalSnap, localSnap] = await Promise.all([
          db.collection("users").where("role", "==", "digital").get(),
          db.collection("users").where("role", "==", "local").get(),
        ]);
        const allDocs = [...digitalSnap.docs, ...localSnap.docs];
        const results = filterAndSortProviders(allDocs, {
          query, category, sortBy, minRating, verifiedOnly, isAvailable, lat, lng, radiusKm
        });
        const paginated = results.slice(offset, offset + limit);
        res.json({ providers: paginated, total: results.length });
        return;
      }

      if (verifiedOnly) queryRef = queryRef.where("isVerified", "==", true);
      if (isAvailable) queryRef = queryRef.where("isAvailable", "==", true);

      const snapshot = await queryRef.get();
      const results = filterAndSortProviders(snapshot.docs, {
        query, category, sortBy, minRating, verifiedOnly, isAvailable, lat, lng, radiusKm
      });

      const paginated = results.slice(offset, offset + limit);
      res.json({ providers: paginated, total: results.length });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /search/requirements — Search open requirements with filters
// ---------------------------------------------------------------------------
router.get(
  "/search/requirements",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = qs(req.query.q) ?? "";
      const category = qs(req.query.category);
      const urgency = qs(req.query.urgency);
      const sortBy = qs(req.query.sortBy) ?? "newest";  // newest | budget_high | budget_low | relevance
      const limit = Math.min(parseInt(qs(req.query.limit) ?? "20", 10), 100);
      const offset = parseInt(qs(req.query.offset) ?? "0", 10);
      const minBudget = qs(req.query.minBudget) ? parseInt(qs(req.query.minBudget)!, 10) : undefined;
      const maxBudget = qs(req.query.maxBudget) ? parseInt(qs(req.query.maxBudget)!, 10) : undefined;

      let queryRef: FirebaseFirestore.Query = db
        .collection("requirements")
        .where("status", "in", ["open", "active", "proposal_received"]);

      if (category) queryRef = queryRef.where("category", "==", category);
      if (urgency) queryRef = queryRef.where("urgency", "==", urgency);

      const snapshot = await queryRef.get();

      let results = snapshot.docs.map((d) => d.data());

      // Budget filters (Firestore can't do range on multiple fields without composite index)
      if (minBudget !== undefined) results = results.filter((r) => (r.maxBudget as number) >= minBudget);
      if (maxBudget !== undefined) results = results.filter((r) => (r.minBudget as number) <= maxBudget);

      // Keyword filter + relevance scoring
      if (query) {
        results = results
          .map((r) => {
            const text = `${r.title ?? ""} ${r.description ?? ""} ${r.skillsNeeded ?? ""} ${r.category ?? ""}`;
            const score = keywordScore(query, text);
            return { ...r, _relevance: score };
          })
          .filter((r) => r._relevance > 0);
      }

      // Sort
      switch (sortBy) {
        case "budget_high":
          results.sort((a, b) => (b.maxBudget as number) - (a.maxBudget as number));
          break;
        case "budget_low":
          results.sort((a, b) => (a.minBudget as number) - (b.minBudget as number));
          break;
        case "relevance":
          results.sort((a, b) => (b._relevance ?? 0) - (a._relevance ?? 0));
          break;
        case "newest":
        default:
          results.sort((a, b) => (b.createdAt as number) - (a.createdAt as number));
      }

      const paginated = results.slice(offset, offset + limit).map((r) => ({
        id: r.id,
        creatorId: r.creatorId,
        title: r.title,
        category: r.category,
        description: r.description,
        skillsNeeded: r.skillsNeeded || undefined,
        minBudget: r.minBudget,
        maxBudget: r.maxBudget,
        status: r.status,
        urgency: r.urgency ?? "normal",
        createdAt: r.createdAt ? new Date(r.createdAt as number).toISOString() : null,
      }));

      res.json({ requirements: paginated, total: results.length });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /search/nearby — Find local providers near a lat/lng coordinate
// ---------------------------------------------------------------------------
router.get(
  "/search/nearby",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const lat = qs(req.query.lat) ? parseFloat(qs(req.query.lat)!) : undefined;
      const lng = qs(req.query.lng) ? parseFloat(qs(req.query.lng)!) : undefined;
      const radiusKm = parseFloat(qs(req.query.radiusKm) ?? "25");
      const category = qs(req.query.category);
      const limit = Math.min(parseInt(qs(req.query.limit) ?? "20", 10), 50);

      if (!lat || !lng) {
        res.status(400).json({ error: "lat and lng query parameters are required." });
        return;
      }

      let queryRef: FirebaseFirestore.Query = db
        .collection("users")
        .where("role", "==", "local")
        .where("isAvailable", "==", true);

      const snapshot = await queryRef.get();

      const nearby = snapshot.docs
        .map((d) => {
          const p = d.data();
          if (!p.lat || !p.lng) return null;
          const dist = haversineKm(lat, lng, p.lat as number, p.lng as number);
          const providerRadius = (p.serviceRadiusKm as number) ?? 25;
          if (dist > radiusKm || dist > providerRadius) return null;
          return {
            id: d.id,
            name: p.name,
            title: p.title,
            skills: p.skills,
            rating: p.rating ?? 0,
            reviewsCount: p.reviewsCount ?? 0,
            isVerified: p.isVerified ?? false,
            completedGigs: p.completedGigs ?? 0,
            avatarUrl: p.avatarUrl ?? null,
            providerScore: p.providerScore ?? null,
            serviceRadiusKm: providerRadius,
            distanceKm: parseFloat(dist.toFixed(1)),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .filter((p) => !category || p.skills?.toLowerCase().includes(category.toLowerCase()))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit);

      res.json({ providers: nearby, total: nearby.length, radiusKm });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Internal: filter and sort provider snapshot docs
// ---------------------------------------------------------------------------
function filterAndSortProviders(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  opts: {
    query: string;
    category?: string;
    sortBy: string;
    minRating: number;
    verifiedOnly: boolean;
    isAvailable: boolean;
    lat?: number;
    lng?: number;
    radiusKm: number;
  }
) {
  const { query, category, sortBy, minRating, verifiedOnly, isAvailable, lat, lng, radiusKm } = opts;

  return docs
    .map((d) => {
      const p = d.data();
      if (verifiedOnly && !p.isVerified) return null;
      if (isAvailable && !p.isAvailable) return null;
      if ((p.rating as number) < minRating) return null;
      if (category) {
        const text = `${p.skills ?? ""} ${p.title ?? ""} ${p.description ?? ""}`;
        if (!text.toLowerCase().includes(category.toLowerCase())) return null;
      }

      // Location filter
      let distanceKm: number | undefined;
      if (lat && lng && p.lat && p.lng) {
        const dist = haversineKm(lat, lng, p.lat as number, p.lng as number);
        if (dist > radiusKm) return null;
        distanceKm = parseFloat(dist.toFixed(1));
      }

      const providerText = `${p.name ?? ""} ${p.title ?? ""} ${p.skills ?? ""} ${p.description ?? ""}`;
      const relevanceScore = query ? keywordScore(query, providerText) : 1;

      if (query && relevanceScore === 0) return null;

      return {
        id: d.id,
        name: p.name,
        role: p.role,
        title: p.title || undefined,
        skills: p.skills || undefined,
        location: p.location || undefined,
        rating: p.rating ?? 0,
        reviewsCount: p.reviewsCount ?? 0,
        completedGigs: p.completedGigs ?? 0,
        isVerified: p.isVerified ?? false,
        isPremium: p.isPremium ?? false,
        avatarUrl: p.avatarUrl ?? null,
        providerScore: p.providerScore ?? null,
        distanceKm: distanceKm ?? null,
        _relevance: relevanceScore,
        _createdAt: p.createdAt as number ?? 0,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => {
      switch (sortBy) {
        case "rating": return b.rating - a.rating || b.reviewsCount - a.reviewsCount;
        case "distance": return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
        case "newest": return b._createdAt - a._createdAt;
        case "relevance":
        default:
          // Combine relevance with provider score (premium providers get priority)
          const scoreA = a._relevance * 0.6 + ((a.providerScore ?? 50) / 100) * 0.4;
          const scoreB = b._relevance * 0.6 + ((b.providerScore ?? 50) / 100) * 0.4;
          return scoreB - scoreA;
      }
    })
    .map((p) => {
      const { _relevance, _createdAt, ...rest } = p;
      return rest;
    });
}

export default router;
