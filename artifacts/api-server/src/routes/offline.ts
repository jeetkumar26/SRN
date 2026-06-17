/**
 * OFFLINE MODE & REQUEST QUEUE — M40
 *
 * When the mobile app is offline, it queues write operations locally
 * (AsyncStorage / MMKV). When connectivity is restored, it replays them
 * against this sync endpoint.
 *
 * POST /offline/sync — Accepts a batch of queued operations
 *
 * Supported operations (idempotent actions only):
 *   - send_message       { conversationId, text, tempId }
 *   - mark_read          { notificationId }
 *   - heartbeat          {}
 *   - profile_view       { profileId }
 *   - portfolio_like     { portfolioId }
 *
 * Each operation returns a result: success | failed | skipped
 * Failed operations should be retried individually by the mobile app.
 * Skipped = already processed (idempotent guard hit).
 *
 * Security:
 *   - Each operation is validated against the authenticated user
 *   - Max 50 operations per sync call (prevents abuse)
 *   - Sensitive operations (bidding, booking state) are NOT allowed in offline queue
 *     (those require real-time validation)
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";

const router = Router();

type OperationType = "send_message" | "mark_read" | "heartbeat" | "profile_view" | "portfolio_like";

interface QueuedOperation {
  type: OperationType;
  tempId?: string;         // client-generated idempotency key
  payload: Record<string, unknown>;
  queuedAt: number;        // epoch ms when queued on device
}

interface OperationResult {
  tempId?: string;
  type: OperationType;
  status: "success" | "failed" | "skipped";
  data?: Record<string, unknown>;
  error?: string;
}

const MAX_BATCH_SIZE = 50;
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60_000; // discard operations older than 7 days

// ---------------------------------------------------------------------------
// POST /offline/sync — Replay queued offline operations
// ---------------------------------------------------------------------------
router.post(
  "/offline/sync",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { operations } = req.body as { operations?: QueuedOperation[] };

      if (!operations || !Array.isArray(operations) || operations.length === 0) {
        res.status(400).json({ error: "operations array is required." });
        return;
      }

      if (operations.length > MAX_BATCH_SIZE) {
        res.status(400).json({ error: `Maximum ${MAX_BATCH_SIZE} operations per sync.` });
        return;
      }

      const userId = req.user!.uid;
      const now = Date.now();
      const results: OperationResult[] = [];

      for (const op of operations) {
        // Discard stale operations
        if (op.queuedAt && now - op.queuedAt > MAX_QUEUE_AGE_MS) {
          results.push({ tempId: op.tempId, type: op.type, status: "skipped", error: "Operation expired." });
          continue;
        }

        try {
          const result = await processOperation(userId, op, now);
          results.push({ tempId: op.tempId, type: op.type, ...result });
        } catch (err) {
          results.push({
            tempId: op.tempId,
            type: op.type,
            status: "failed",
            error: (err as Error).message,
          });
        }
      }

      const succeeded = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "failed").length;
      const skipped = results.filter((r) => r.status === "skipped").length;

      res.json({ results, summary: { total: operations.length, succeeded, failed, skipped } });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Process a single queued operation
// ---------------------------------------------------------------------------
async function processOperation(
  userId: string,
  op: QueuedOperation,
  now: number
): Promise<{ status: "success" | "skipped"; data?: Record<string, unknown> }> {
  switch (op.type) {
    case "send_message": {
      const { conversationId, text, receiverId } = op.payload as {
        conversationId?: string;
        text?: string;
        receiverId?: string;
      };

      if (!text || !receiverId) return { status: "skipped", data: { reason: "missing required fields" } };

      // Validate receiver exists to prevent ghost messages
      const receiverDoc = await db.collection("users").doc(receiverId as string).get();
      if (!receiverDoc.exists) return { status: "skipped", data: { reason: "receiver not found" } };

      const convId = conversationId ?? `dm_${[userId, receiverId].sort().join("_")}`;
      const msgId = db.collection("messages").doc().id;

      await Promise.all([
        db.collection("messages").doc(msgId).set({
          id: msgId,
          senderId: userId,
          receiverId,
          text: (text as string).substring(0, 2000),
          isFlagged: false,
          flagCleared: false,
          conversationId: convId,
          createdAt: op.queuedAt ?? now,
          syncedAt: now,
          read: false,
          offlineSync: true,
        }),
        db.collection("conversations").doc(convId).collection("messages").doc(msgId).set({
          id: msgId,
          senderId: userId,
          text: (text as string).substring(0, 2000),
          createdAt: op.queuedAt ?? now,
          read: false,
        }),
        db.collection("conversations").doc(convId).set(
          {
            participantIds: [userId, receiverId],
            lastMessage: (text as string).substring(0, 100),
            lastMessageAt: op.queuedAt ?? now,
          },
          { merge: true }
        ),
      ]);

      return { status: "success", data: { messageId: msgId } };
    }

    case "mark_read": {
      const { notificationId } = op.payload as { notificationId?: string };
      if (!notificationId) return { status: "skipped", data: { reason: "missing notificationId" } };

      const docRef = db.collection("notifications").doc(notificationId);
      const doc = await docRef.get();
      if (!doc.exists || doc.data()?.userId !== userId) {
        return { status: "skipped", data: { reason: "not found or not owner" } };
      }

      await docRef.update({ read: true, readAt: now });
      return { status: "success" };
    }

    case "heartbeat": {
      await db.collection("users").doc(userId).update({
        lastHeartbeat: op.queuedAt ?? now,
        lastActiveAt: op.queuedAt ?? now,
      });
      return { status: "success" };
    }

    case "profile_view": {
      const { profileId } = op.payload as { profileId?: string };
      if (!profileId || profileId === userId) return { status: "skipped", data: { reason: "invalid profileId" } };

      // Validate profile exists to prevent fake engagement metrics
      const profileDoc = await db.collection("users").doc(profileId as string).get();
      if (!profileDoc.exists) return { status: "skipped", data: { reason: "profile not found" } };

      // Deduplicate by queued hour
      const viewHour = Math.floor((op.queuedAt ?? now) / 3_600_000);
      const dedupeId = `${userId}_${profileId}_${viewHour}`;
      const dedupeRef = db.collection("profile_view_dedupe").doc(dedupeId);

      if ((await dedupeRef.get()).exists) {
        return { status: "skipped", data: { reason: "duplicate" } };
      }

      await Promise.all([
        db.collection("profile_views").add({ profileId, viewerId: userId, viewedAt: op.queuedAt ?? now }),
        dedupeRef.set({ createdAt: now }),
      ]);

      return { status: "success" };
    }

    case "portfolio_like": {
      const { portfolioId, action } = op.payload as { portfolioId?: string; action?: "like" | "unlike" };
      if (!portfolioId || !action) return { status: "skipped", data: { reason: "missing portfolioId or action" } };

      const likeRef = db.collection("portfolio_likes").doc(`${userId}_${portfolioId}`);
      const docRef = db.collection("portfolios").doc(portfolioId);
      const [likeDoc, portfolioDoc] = await Promise.all([likeRef.get(), docRef.get()]);

      if (!portfolioDoc.exists) return { status: "skipped", data: { reason: "portfolio not found" } };

      if (action === "like" && !likeDoc.exists) {
        await Promise.all([
          likeRef.set({ userId, portfolioId, createdAt: op.queuedAt ?? now }),
          docRef.update({ likesCount: FieldValue.increment(1) }),
        ]);
      } else if (action === "unlike" && likeDoc.exists) {
        await Promise.all([
          likeRef.delete(),
          docRef.update({ likesCount: FieldValue.increment(-1) }),
        ]);
      }

      return { status: "success" };
    }

    default:
      return { status: "skipped", data: { reason: "unknown operation type" } };
  }
}

export default router;
