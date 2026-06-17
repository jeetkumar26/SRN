/**
 * REAL-TIME PRESENCE — M36
 *
 * Algorithm:
 *  Online/offline is derived from heartbeat timestamps — no WebSocket needed.
 *  Mobile app sends POST /presence/heartbeat every 30 seconds while foregrounded.
 *  A user is considered "online" if their lastHeartbeat is within 60 seconds.
 *
 *  Why not Firebase Realtime Database onDisconnect()?
 *  This is a REST API server — clients are mobile apps that may background/kill
 *  the app without a clean disconnect. The heartbeat + threshold pattern works
 *  correctly for mobile without requiring a persistent connection.
 *
 * Endpoints:
 *   POST /presence/heartbeat           — client sends every 30s while active
 *   GET  /presence/:userId             — check if a user is online (for chat UI)
 *   GET  /presence/batch               — check online status for multiple users
 *   POST /presence/offline             — explicit offline signal (on app background)
 *
 * Firestore schema: users/{uid}
 *   lastHeartbeat: number (epoch ms)
 *   isOnline:      boolean (computed from heartbeat age)
 *
 * Online threshold: 60 seconds (2x heartbeat interval for tolerance)
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";

const router = Router();

const ONLINE_THRESHOLD_MS = 60_000; // 60 seconds

function isOnlineFromHeartbeat(lastHeartbeat: number | undefined): boolean {
  if (!lastHeartbeat) return false;
  return Date.now() - lastHeartbeat < ONLINE_THRESHOLD_MS;
}

// ---------------------------------------------------------------------------
// POST /presence/heartbeat — App sends this every 30s while foregrounded
// ---------------------------------------------------------------------------
router.post(
  "/presence/heartbeat",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;
      const now = Date.now();

      await db.collection("users").doc(userId).update({
        lastHeartbeat: now,
        isOnline: true,
        lastActiveAt: now,
      });

      res.json({ online: true, timestamp: now });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /presence/offline — Explicit offline signal (sent on app backgrounding)
// ---------------------------------------------------------------------------
router.post(
  "/presence/offline",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;

      await db.collection("users").doc(userId).update({
        isOnline: false,
        lastActiveAt: Date.now(),
      });

      res.json({ online: false });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /presence/:userId — Check if a single user is online
// ---------------------------------------------------------------------------
router.get(
  "/presence/:userId",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.params["userId"] as string;
      const doc = await db.collection("users").doc(userId).get();

      if (!doc.exists) { res.status(404).json({ error: "User not found." }); return; }

      const user = doc.data()!;
      const lastHeartbeat = user.lastHeartbeat as number | undefined;
      const online = isOnlineFromHeartbeat(lastHeartbeat);

      res.json({
        userId,
        online,
        lastActiveAt: user.lastActiveAt
          ? new Date(user.lastActiveAt as number).toISOString()
          : null,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /presence/batch — Check online status for multiple users (e.g. chat list)
// Body: { userIds: string[] }  (max 30 at once)
// ---------------------------------------------------------------------------
router.post(
  "/presence/batch",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { userIds } = req.body as { userIds?: string[] };

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({ error: "userIds array is required." });
        return;
      }

      if (userIds.length > 30) {
        res.status(400).json({ error: "Maximum 30 user IDs per batch request." });
        return;
      }

      // Fetch all user docs in parallel
      const docs = await Promise.all(
        userIds.map((uid) => db.collection("users").doc(uid).get())
      );

      const statuses = docs.map((doc, i) => {
        if (!doc.exists) {
          return { userId: userIds[i], online: false, lastActiveAt: null };
        }
        const user = doc.data()!;
        const lastHeartbeat = user.lastHeartbeat as number | undefined;
        return {
          userId: userIds[i],
          online: isOnlineFromHeartbeat(lastHeartbeat),
          lastActiveAt: user.lastActiveAt
            ? new Date(user.lastActiveAt as number).toISOString()
            : null,
        };
      });

      res.json({ statuses });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
