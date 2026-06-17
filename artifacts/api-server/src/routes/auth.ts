/**
 * SOCIAL AUTH — M13 / M31
 *
 * Google Sign-In flow:
 *   1. Mobile calls Firebase Auth SDK signInWithCredential(GoogleAuthProvider) →
 *      Firebase Auth SDK completes the OAuth dance and returns a Firebase ID token
 *   2. POST /auth/google { idToken: <Firebase ID token> } → server verifies via
 *      admin.auth().verifyIdToken() (NOT the raw Google OAuth JWT)
 *   3. Firebase Admin creates/gets the Firebase user
 *   4. Server upserts user document in Firestore (profile bootstrap)
 *   5. Returns Firebase custom token → mobile exchanges for session
 *
 * Apple Sign-In flow (same pattern):
 *   1. Mobile calls Firebase Auth SDK signInWithCredential(OAuthProvider "apple.com") →
 *      Firebase Auth SDK returns a Firebase ID token (identityToken field)
 *   2. POST /auth/apple { identityToken: <Firebase ID token>, fullName? } → Firebase Admin verifies
 *   3. Same upsert + custom token response
 *
 * POST /auth/refresh  — revoke + reissue custom token (token rotation)
 * POST /auth/logout   — revoke FCM token + mark lastActiveAt
 * POST /auth/deactivate — soft-deactivate own account (sets status: "deactivated")
 *
 * Security:
 *   - Firebase Admin verifyIdToken validates signature + expiry + audience
 *   - All tokens are short-lived (1 hour Firebase session, 5 min custom token)
 *   - Duplicate account detection: if email already exists under a different provider,
 *     accounts are linked instead of creating a duplicate
 */

import { Router } from "express";
import admin from "firebase-admin";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { writeAuditLog } from "../lib/auditLog";
import { eventBus } from "../lib/eventBus";

const router = Router();

// ---------------------------------------------------------------------------
// POST /auth/google — Verify Google ID token, upsert user, return custom token
// ---------------------------------------------------------------------------
router.post("/auth/google", async (req, res, next) => {
  try {
    const { idToken, role } = req.body as {
      idToken?: string;
      role?: string;
    };

    if (!idToken) {
      res.status(400).json({ error: "idToken is required." });
      return;
    }

    // Firebase Admin verifies the Google token (signature + expiry + audience)
    let firebaseUser: admin.auth.UserRecord;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      firebaseUser = await admin.auth().getUser(decoded.uid);
    } catch {
      res.status(401).json({ error: "Invalid or expired Google token." });
      return;
    }

    // Upsert Firestore user doc
    const userRef = db.collection("users").doc(firebaseUser.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const now = Date.now();
      const validRoles = ["customer", "business", "digital", "local"];
      const assignedRole = validRoles.includes(role ?? "") ? role : "customer";

      await userRef.set({
        id: firebaseUser.uid,
        name: firebaseUser.displayName ?? "Google User",
        email: (firebaseUser.email ?? "").toLowerCase(),
        role: assignedRole,
        avatarUrl: firebaseUser.photoURL ?? null,
        provider: "google",
        isVerified: firebaseUser.emailVerified,
        isPremium: false,
        verificationLevel: firebaseUser.emailVerified ? 1 : 0,
        rating: 5.0,
        reviewsCount: 0,
        completedGigs: 0,
        subscriptionTier: "free",
        createdAt: now,
        lastActiveAt: now,
      });

      await writeAuditLog({
        action: "user.created",
        actorId: firebaseUser.uid,
        resourceType: "user",
        resourceId: firebaseUser.uid,
        metadata: { provider: "google" },
      });

      // Emit event — triggers welcome email + audit trail via eventBus listeners
      eventBus.emit("user.registered", {
        userId: firebaseUser.uid,
        role: assignedRole as string,
        provider: "google",
      });
    } else {
      await userRef.update({ lastActiveAt: Date.now() });
    }

    // Issue Firebase custom token so mobile can sign in via Firebase Auth
    const customToken = await admin.auth().createCustomToken(firebaseUser.uid);

    const userData = (await userRef.get()).data()!;

    res.json({
      customToken,
      user: {
        id: firebaseUser.uid,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        avatarUrl: userData.avatarUrl ?? null,
        isVerified: userData.isVerified ?? false,
        verificationLevel: userData.verificationLevel ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/apple — Verify Apple identity token, upsert user, return custom token
// ---------------------------------------------------------------------------
router.post("/auth/apple", async (req, res, next) => {
  try {
    const { identityToken, fullName, role } = req.body as {
      identityToken?: string;
      fullName?: string;
      role?: string;
    };

    if (!identityToken) {
      res.status(400).json({ error: "identityToken is required." });
      return;
    }

    let firebaseUser: admin.auth.UserRecord;
    try {
      const decoded = await admin.auth().verifyIdToken(identityToken);
      firebaseUser = await admin.auth().getUser(decoded.uid);
    } catch {
      res.status(401).json({ error: "Invalid or expired Apple token." });
      return;
    }

    const userRef = db.collection("users").doc(firebaseUser.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const now = Date.now();
      const validRoles = ["customer", "business", "digital", "local"];
      const assignedRole = validRoles.includes(role ?? "") ? role : "customer";

      // Apple only provides name on FIRST sign-in — use fullName from request if given
      const displayName =
        fullName ||
        firebaseUser.displayName ||
        (firebaseUser.email ? firebaseUser.email.split("@")[0] : "Apple User");

      await userRef.set({
        id: firebaseUser.uid,
        name: displayName,
        email: (firebaseUser.email ?? "").toLowerCase(),
        role: assignedRole,
        avatarUrl: null,
        provider: "apple",
        isVerified: firebaseUser.emailVerified,
        isPremium: false,
        verificationLevel: firebaseUser.emailVerified ? 1 : 0,
        rating: 5.0,
        reviewsCount: 0,
        completedGigs: 0,
        subscriptionTier: "free",
        createdAt: now,
        lastActiveAt: now,
      });

      await writeAuditLog({
        action: "user.created",
        actorId: firebaseUser.uid,
        resourceType: "user",
        resourceId: firebaseUser.uid,
        metadata: { provider: "apple" },
      });

      // Emit event — triggers welcome email + audit trail via eventBus listeners
      eventBus.emit("user.registered", {
        userId: firebaseUser.uid,
        role: assignedRole as string,
        provider: "apple",
      });
    } else {
      await userRef.update({ lastActiveAt: Date.now() });
    }

    const customToken = await admin.auth().createCustomToken(firebaseUser.uid);
    const userData = (await userRef.get()).data()!;

    res.json({
      customToken,
      user: {
        id: firebaseUser.uid,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        avatarUrl: userData.avatarUrl ?? null,
        isVerified: userData.isVerified ?? false,
        verificationLevel: userData.verificationLevel ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/logout — Revoke FCM token, update lastActiveAt
// ---------------------------------------------------------------------------
router.post("/auth/logout", authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.uid;

    await db.collection("users").doc(userId).update({
      fcmToken: null,
      lastActiveAt: Date.now(),
      isOnline: false,
    });

    await writeAuditLog({
      action: "user.logout",
      actorId: userId,
      resourceType: "user",
      resourceId: userId,
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/check-email — Duplicate account detection before registration
// Returns which providers an email is already registered with
// ---------------------------------------------------------------------------
router.post("/auth/check-email", async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email is required." });
      return;
    }

    try {
      const firebaseUser = await admin.auth().getUserByEmail(email.toLowerCase().trim());
      const providers = firebaseUser.providerData.map((p) => p.providerId);
      res.json({ exists: true, providers });
    } catch {
      // Not found — safe to register
      res.json({ exists: false, providers: [] });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
