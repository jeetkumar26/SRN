import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";

const router = Router();

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

// ---------------------------------------------------------------------------
// GET /notifications — Notifications with cursor-based pagination (M39)
// ---------------------------------------------------------------------------
router.get(
  "/notifications",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;
      const unreadOnly = qs(req.query.unreadOnly) === "true";
      const limit = Math.min(parseInt(qs(req.query.limit) ?? "30", 10), 100);
      const cursor = qs(req.query.cursor);

      let query: FirebaseFirestore.Query = db
        .collection("notifications")
        .where("userId", "==", userId);

      if (unreadOnly) query = query.where("read", "==", false);
      query = query.orderBy("createdAt", "desc");

      if (cursor) {
        const cursorDoc = await db.collection("notifications").doc(cursor).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }

      const [snapshot, unreadSnap] = await Promise.all([
        query.limit(limit + 1).get(),
        db.collection("notifications").where("userId", "==", userId).where("read", "==", false).get(),
      ]);

      const hasMore = snapshot.size > limit;
      const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

      const notifications = docs.map((d) => {
        const n = d.data();
        return {
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          data: n.data ?? {},
          read: n.read ?? false,
          createdAt: n.createdAt ? new Date(n.createdAt as number).toISOString() : new Date().toISOString(),
        };
      });

      res.set("X-Unread-Count", String(unreadSnap.size));
      res.json({
        items: notifications,
        nextCursor: hasMore ? docs[docs.length - 1]!.id : null,
        hasMore,
        unreadCount: unreadSnap.size,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /notifications/:id/read — Mark a single notification as read
// ---------------------------------------------------------------------------
router.patch(
  "/notifications/:id/read",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const docRef = db.collection("notifications").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) { res.status(404).json({ error: "Notification not found." }); return; }

      const notif = doc.data()!;
      if (notif.userId !== req.user!.uid && req.user?.role !== "admin") {
        res.status(403).json({ error: "Access denied." });
        return;
      }

      await docRef.update({ read: true, readAt: Date.now() });
      res.json({ id, read: true });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /notifications/read-all — Mark ALL unread notifications as read
// ---------------------------------------------------------------------------
router.patch(
  "/notifications/read-all",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;

      const unreadSnap = await db
        .collection("notifications")
        .where("userId", "==", userId)
        .where("read", "==", false)
        .get();

      if (unreadSnap.empty) {
        res.json({ updated: 0 });
        return;
      }

      const readAt = Date.now();
      const batch = db.batch();
      unreadSnap.docs.forEach((d) => {
        batch.update(d.ref, { read: true, readAt });
      });
      await batch.commit();

      res.json({ updated: unreadSnap.size });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /users/:id/fcm-token — Register or update device FCM token
// Called by the app on login / token refresh.
// ---------------------------------------------------------------------------
router.patch(
  "/users/:id/fcm-token",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;

      // Only the user themselves can update their own FCM token
      if (id !== req.user!.uid) {
        res.status(403).json({ error: "You can only update your own FCM token." });
        return;
      }

      const { fcmToken } = req.body as { fcmToken?: string };
      if (!fcmToken || typeof fcmToken !== "string") {
        res.status(400).json({ error: "fcmToken is required." });
        return;
      }

      await db.collection("users").doc(id).update({
        fcmToken,
        lastActiveAt: Date.now(),
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
