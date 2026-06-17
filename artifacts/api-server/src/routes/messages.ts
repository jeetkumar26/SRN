import { Router } from "express";
import { db } from "../lib/firebase";
import { SendMessageBody, GetMessagesQueryParams } from "@workspace/api-zod";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";

const router = Router();

// ---------------------------------------------------------------------------
// Anti-Contact-Sharing patterns
// Any message matching these patterns is blocked and flagged for admin review.
// ---------------------------------------------------------------------------
const CONTACT_PATTERNS = [
  /(\+91|0)?[6-9]\d{9}/,                              // Indian mobile numbers
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}/i,  // Email addresses
  /(wa\.me|whatsapp\.com|t\.me|telegram\.me|instagram\.com|snapchat\.com)/i,
];

function scanForContactSharing(text: string) {
  for (const pattern of CONTACT_PATTERNS) {
    if (pattern.test(text)) {
      return { isFlagged: true, result: "blocked" as const };
    }
  }
  return { isFlagged: false, result: "safe" as const };
}

// ---------------------------------------------------------------------------
// POST /messages
// Sends a message through moderation then persists in TWO places:
//   1. messages/{id}          — flat collection for admin moderation dashboard
//   2. conversations/{convId}/messages/{id} — sub-collection for real-time chat
// ---------------------------------------------------------------------------
router.post("/messages", authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = SendMessageBody.parse(req.body);

    // Verify the authenticated user is the actual sender
    if (body.senderId !== req.user!.uid) {
      res.status(403).json({ error: "Sender ID does not match authenticated user." });
      return;
    }

    const scan = scanForContactSharing(body.text);
    const safeText = scan.isFlagged
      ? "[⚠️ Message blocked: contact sharing is restricted. Use in-app features to share quotes and files.]"
      : body.text;

    const now = Date.now();
    const msgId = db.collection("messages").doc().id; // generate a shared ID

    const messageData = {
      id: msgId,
      senderId: body.senderId,
      receiverId: body.receiverId,
      text: safeText,
      attachmentUrl: body.attachmentUrl ?? "",
      attachmentName: body.attachmentName ?? "",
      attachmentSize: body.attachmentSize ?? "",
      quoteId: body.quoteId ?? null,
      isFlagged: scan.isFlagged,
      flagCleared: false,
      aiScanResult: scan.result,
      conversationId: (req.body.conversationId as string | undefined) ?? null,
      createdAt: now,
      read: false,
    };

    // 1. Write to flat messages collection (admin moderation)
    await db.collection("messages").doc(msgId).set(messageData);

    // 2. Mirror into conversation sub-collection for real-time chat display.
    //    The conversationId is derived from sorted participant IDs so it is
    //    deterministic and collision-free.
    const convId =
      (req.body.conversationId as string | undefined) ??
      `dm_${[body.senderId, body.receiverId].sort().join("_")}`;

    const convRef = db.collection("conversations").doc(convId);

    // Write message into sub-collection
    await convRef.collection("messages").doc(msgId).set({
      id: msgId,
      senderId: body.senderId,
      text: safeText,
      createdAt: now,
      read: false,
    });

    // Resolve participant display names for ChatList (only fetch if conversation is new)
    const convSnap = await convRef.get();
    let participantNames: Record<string, string> = {};
    if (!convSnap.exists || !convSnap.data()?.participantNames) {
      const [senderDoc, receiverDoc] = await Promise.all([
        db.collection("users").doc(body.senderId).get(),
        db.collection("users").doc(body.receiverId).get(),
      ]);
      participantNames = {
        [body.senderId]: (senderDoc.data()?.name as string | undefined) ?? body.senderId,
        [body.receiverId]: (receiverDoc.data()?.name as string | undefined) ?? body.receiverId,
      };
    }

    // Update conversation metadata (lastMessage, timestamp, participantNames)
    await convRef.set(
      {
        participantIds: [body.senderId, body.receiverId],
        lastMessage: safeText.substring(0, 100),
        lastMessageAt: now,
        ...(Object.keys(participantNames).length > 0 ? { participantNames } : {}),
      },
      { merge: true }
    );

    res.status(201).json({
      id: msgId,
      senderId: messageData.senderId,
      receiverId: messageData.receiverId,
      text: messageData.text,
      attachmentUrl: messageData.attachmentUrl || undefined,
      attachmentName: messageData.attachmentName || undefined,
      attachmentSize: messageData.attachmentSize || undefined,
      quoteId: messageData.quoteId || undefined,
      createdAt: new Date(messageData.createdAt).toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /messages
// Retrieves chat history between two participants using two indexed queries
// instead of a full-table scan.
// ---------------------------------------------------------------------------
router.get("/messages", authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = GetMessagesQueryParams.parse(req.query);
    const currentUid = req.user!.uid;

    if (query.senderId !== currentUid && query.receiverId !== currentUid) {
      res.status(403).json({ error: "Access denied. You can only view your own messages." });
      return;
    }

    // Use the stable conversation sub-collection — O(1) lookup, indexed
    const convId = `dm_${[query.senderId, query.receiverId].sort().join("_")}`;
    const snapshot = await db
      .collection("conversations")
      .doc(convId)
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limit(200)
      .get();

    const messages = snapshot.docs.map((doc) => {
      const m = doc.data();
      return {
        id: doc.id,
        senderId: m.senderId,
        receiverId: query.senderId === m.senderId ? query.receiverId : query.senderId,
        text: m.text,
        createdAt: m.createdAt
          ? new Date(m.createdAt).toISOString()
          : new Date().toISOString(),
      };
    });

    res.json(messages);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /messages/:convId/messages/:msgId — Sender (or admin) deletes a message
// Removes from the conversation sub-collection and soft-deletes the flat record.
// ---------------------------------------------------------------------------
router.delete(
  "/messages/:convId/messages/:msgId",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const convId = req.params["convId"] as string;
      const msgId = req.params["msgId"] as string;
      const currentUid = req.user!.uid;

      const convMsgRef = db
        .collection("conversations")
        .doc(convId)
        .collection("messages")
        .doc(msgId);

      const msgDoc = await convMsgRef.get();
      if (!msgDoc.exists) {
        res.status(404).json({ error: "Message not found." });
        return;
      }

      const msgData = msgDoc.data()!;
      if (msgData.senderId !== currentUid && req.user?.role !== "admin") {
        res.status(403).json({ error: "You can only delete your own messages." });
        return;
      }

      await convMsgRef.delete();

      // Soft-delete the flat record so the admin moderation audit trail is preserved
      db.collection("messages").doc(msgId).update({
        deleted: true,
        deletedAt: Date.now(),
        text: "[Message deleted]",
      }).catch(() => {});

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /messages/conversations/:convId/read
// Marks all unread incoming messages in a conversation as read for the current user.
// ---------------------------------------------------------------------------
router.patch(
  "/messages/conversations/:convId/read",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const convId = req.params["convId"] as string;
      const currentUid = req.user!.uid;

      const convDoc = await db.collection("conversations").doc(convId).get();
      if (!convDoc.exists) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }

      const participantIds = (convDoc.data()!.participantIds as string[] | undefined) ?? [];
      if (!participantIds.includes(currentUid) && req.user?.role !== "admin") {
        res.status(403).json({ error: "Access denied." });
        return;
      }

      const msgsSnap = await db
        .collection("conversations")
        .doc(convId)
        .collection("messages")
        .orderBy("createdAt", "desc")
        .limit(500)
        .get();

      const unread = msgsSnap.docs.filter((d) => {
        const m = d.data();
        return m.senderId !== currentUid && !m.read;
      });

      if (unread.length === 0) {
        res.json({ marked: 0 });
        return;
      }

      const batch = db.batch();
      unread.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();

      res.json({ marked: unread.length });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
