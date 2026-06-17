/**
 * AUDIT LOG — M19: Security
 *
 * Every sensitive action is recorded in the `audit_events` Firestore collection.
 * Audit records are immutable — never updated or deleted by application code.
 * Retention: Firestore TTL rule should archive/delete records older than 1 year.
 *
 * Schema: audit_events/{id}
 *  action       — string: "user.created", "booking.completed", etc.
 *  actorId      — Firebase UID of who performed the action
 *  resourceType — "user" | "booking" | "dispute" | "review" | "subscription" | ...
 *  resourceId   — document ID of the affected resource
 *  ipAddress    — optional, passed from request context
 *  metadata     — arbitrary extra fields (amount, tier, reason, etc.)
 *  timestamp    — epoch ms
 */

import { db } from "./firebase";
import { logger } from "./logger";

export interface AuditLogEntry {
  action: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write an immutable audit log entry to Firestore.
 * Non-blocking: errors are logged but never propagated.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const docRef = db.collection("audit_events").doc();
    await docRef.set({
      id: docRef.id,
      ...entry,
      timestamp: Date.now(),
    });
  } catch (err) {
    logger.error({ err, entry }, "Failed to write audit log");
  }
}

/**
 * Express middleware helper — attaches IP to any audit call made during the request.
 * Usage: writeAuditLog({ ...entry, ipAddress: getRequestIp(req) })
 */
export function getRequestIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  if (Array.isArray(forwarded)) return forwarded[0]!.trim();
  return req.ip ?? "unknown";
}
