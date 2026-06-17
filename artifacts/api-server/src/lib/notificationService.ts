import { db, messaging } from "./firebase";
import { logger } from "./logger";

export type NotificationType =
  | "quote"
  | "message"
  | "requirement"
  | "system"
  | "booking"
  | "review"
  | "counter_offer"
  | "shortlisted"
  | "hired"
  | "completed";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Sends a notification to a single user.
 * Always writes to Firestore (in-app bell).
 * Also fires FCM push if the user has a registered device token.
 * FCM failure is non-fatal — in-app notification is already persisted.
 */
export async function sendNotification(
  userId: string,
  payload: NotificationPayload
): Promise<void> {
  const now = Date.now();
  const notifRef = db.collection("notifications").doc();

  // Always persist in-app notification
  await notifRef.set({
    id: notifRef.id,
    userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    read: false,
    createdAt: now,
  });

  // Fire FCM push if device token exists — fetch lazily
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    const fcmToken = userDoc.data()?.fcmToken as string | undefined;

    if (fcmToken) {
      await messaging.send({
        token: fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          notificationId: notifRef.id,
          type: payload.type,
          ...(payload.data ?? {}),
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channelId: "srn_default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              contentAvailable: true,
            },
          },
        },
      });
    }
  } catch (err) {
    // Log but do not throw — in-app notification is already saved
    logger.warn({ userId, err }, "FCM push failed");
  }
}

/** Sends the same notification to multiple users concurrently. */
export async function sendBulkNotification(
  userIds: string[],
  payload: NotificationPayload
): Promise<void> {
  if (userIds.length === 0) return;
  await Promise.allSettled(userIds.map((uid) => sendNotification(uid, payload)));
}
