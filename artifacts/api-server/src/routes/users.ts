import { Router } from "express";
import { db } from "../lib/firebase";
import { CreateUserBody } from "@workspace/api-zod";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { calculateProfileCompletionScore, computeAndSaveProviderScore } from "../lib/providerScore";
import { eventBus } from "../lib/eventBus";

const router = Router();

/** Safely extract a scalar string from an Express query parameter. */
function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

// ---------------------------------------------------------------------------
// POST /users — Register or retrieve user profile
// Authenticated: Firebase ID token required
// ---------------------------------------------------------------------------
router.post("/users", authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = CreateUserBody.parse(req.body);
    const uid = req.user!.uid;

    const docRef = db.collection("users").doc(uid);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data()!;
      res.status(200).json(mapUserDoc(uid, data));
      return;
    }

    const userData = {
      id: uid,
      name: body.name,
      email: body.email.toLowerCase().trim(),
      role: body.role,
      title: body.title ?? "",
      location: body.location ?? "",
      description: body.description ?? "",
      skills: body.skills ?? "",
      rating: 5.0,
      reviewsCount: 0,
      aiTrustScore: body.role === "admin" ? 100 : 85,
      isVerified: false,
      isPremium: false,
      completedGigs: 0,
      onTimeRate: 100,
      rehireCount: 0,
      createdAt: Date.now(),
    };

    await docRef.set(userData);

    eventBus.emit("user.registered", {
      userId: uid,
      role: body.role,
      provider: "email",
    });

    res.status(201).json(mapUserDoc(uid, userData));
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /users — Search and list users/providers
// Authenticated: requires valid Firebase token
// ---------------------------------------------------------------------------
router.get("/users", authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const role = qs(req.query.role);
    const queryStr = qs(req.query.query);

    const limit = Math.min(parseInt(qs(req.query.limit) ?? "50", 10), 200);

    let queryRef: FirebaseFirestore.Query = db.collection("users");
    if (role) {
      queryRef = queryRef.where("role", "==", role);
    }

    const snapshot = await queryRef.limit(limit).get();
    let results = snapshot.docs.map((doc) => doc.data());

    if (queryStr) {
      const q = queryStr.toLowerCase();
      results = results.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.title?.toLowerCase().includes(q) ||
          u.skills?.toLowerCase().includes(q)
      );
    }

    res.json(results.map((r) => mapUserDoc(r.id, r)));
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /users/:id — Get single user details
// Authenticated: requires valid Firebase token
// ---------------------------------------------------------------------------
router.get("/users/:id", authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const doc = await db.collection("users").doc(id).get();
    if (!doc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userData = doc.data()!;

    // Compute rehireCount: number of distinct customers who have booked this
    // provider more than once (i.e. repeat customers).
    const bookingsSnap = await db
      .collection("bookings")
      .where("providerId", "==", id)
      .where("status", "==", "completed")
      .get();

    const customerCounts: Record<string, number> = {};
    bookingsSnap.docs.forEach((b) => {
      const cid = b.data().customerId as string;
      customerCounts[cid] = (customerCounts[cid] ?? 0) + 1;
    });
    const computedRehireCount = Object.values(customerCounts).filter((c) => c > 1).length;

    // Persist computed values back to Firestore
    const fieldUpdates: Record<string, unknown> = {};
    if (computedRehireCount !== ((userData.rehireCount as number) ?? 0)) {
      fieldUpdates.rehireCount = computedRehireCount;
      userData.rehireCount = computedRehireCount;
    }
    // Update profile completion score if not yet set
    if (!userData.profileCompletionScore) {
      const score = calculateProfileCompletionScore(userData as Record<string, unknown>);
      fieldUpdates.profileCompletionScore = score;
      userData.profileCompletionScore = score;
    }
    if (Object.keys(fieldUpdates).length > 0) {
      await db.collection("users").doc(id).update(fieldUpdates);
    }

    // Track that owner is active (non-blocking, only when they view their own profile)
    if (req.user?.uid === id) {
      db.collection("users").doc(id).update({ lastActiveAt: Date.now() }).catch(() => {});
    }

    res.json(mapUserDoc(id, userData));
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /users/:id — Update user profile (own profile only, or admin)
// Authenticated: only the owner or an admin may update
// ---------------------------------------------------------------------------
router.patch("/users/:id", authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = req.params["id"] as string;
    const currentUid = req.user!.uid;
    const currentRole = req.user?.role;

    if (id !== currentUid && currentRole !== "admin") {
      res.status(403).json({ error: "You can only update your own profile." });
      return;
    }

    const ALLOWED_FIELDS = [
      "name", "title", "location", "description", "skills",
      "serviceRadiusKm", "isAvailable", "hourlyRate",
      "phone", "bio",
      "lat", "lng",  // coordinates for geolocation matching
    ];

    const updates: Record<string, unknown> = { lastActiveAt: Date.now() };
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Admins can also flip isVerified / isPremium
    if (currentRole === "admin") {
      if (req.body.isVerified !== undefined) updates.isVerified = req.body.isVerified;
      if (req.body.isPremium !== undefined) updates.isPremium = req.body.isPremium;
    }

    if (Object.keys(updates).length <= 1) {  // only lastActiveAt means nothing new
      res.status(400).json({ error: "No updatable fields provided." });
      return;
    }

    await db.collection("users").doc(id).update(updates);
    const updated = (await db.collection("users").doc(id).get()).data()!;

    // Recompute profile completion and provider score after profile update
    const profileScore = calculateProfileCompletionScore(updated as Record<string, unknown>);
    await db.collection("users").doc(id).update({ profileCompletionScore: profileScore });
    updated.profileCompletionScore = profileScore;

    if (currentRole === "digital" || currentRole === "local") {
      computeAndSaveProviderScore(id).catch(() => {});
    }

    res.json(mapUserDoc(id, updated));
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Helper: map Firestore user document to API response shape
// ---------------------------------------------------------------------------
function mapUserDoc(uid: string, r: FirebaseFirestore.DocumentData) {
  return {
    id: r.id ?? uid,
    name: r.name,
    email: r.email,
    role: r.role,
    title: r.title || undefined,
    rating: r.rating ?? 0,
    reviewsCount: r.reviewsCount ?? 0,
    aiTrustScore: r.aiTrustScore ?? 85,
    providerScore: r.providerScore ?? null,
    profileCompletionScore: r.profileCompletionScore ?? null,
    location: r.location || undefined,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    serviceRadiusKm: r.serviceRadiusKm ?? null,
    isAvailable: r.isAvailable ?? true,
    description: r.description || undefined,
    skills: r.skills || undefined,
    avatarUrl: r.avatarUrl || undefined,
    isVerified: r.isVerified ?? false,
    isPremium: r.isPremium ?? false,
    completedGigs: r.completedGigs ?? 0,
    onTimeRate: r.onTimeRate != null ? Math.round(r.onTimeRate as number) : 100,
    responseRate: r.responseRate ?? null,
    rehireCount: r.rehireCount ?? 0,
    portfolioItemCount: r.portfolioItemCount ?? 0,
    createdAt: r.createdAt
      ? new Date(r.createdAt as number).toISOString()
      : new Date().toISOString(),
    lastActiveAt: r.lastActiveAt
      ? new Date(r.lastActiveAt as number).toISOString()
      : null,
  };
}

export default router;
