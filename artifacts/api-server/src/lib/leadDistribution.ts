import { db } from "./firebase";
import { findMatchingProviders, RequirementForMatching } from "./matchingEngine";
import { sendNotification } from "./notificationService";

const LEAD_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FCM_NOTIFY_TOP_N = 10;                   // Only push to top 10 — avoid spam

/**
 * Distributes a newly posted requirement to the best-matching providers.
 * Creates a lead document for each matched provider, then fires push
 * notifications to the top N.
 *
 * Idempotent: safe to call multiple times for the same requirement
 * (duplicate leads for the same provider are skipped).
 *
 * @returns number of NEW leads created
 */
export async function distributeLeads(req: RequirementForMatching): Promise<number> {
  const matches = await findMatchingProviders(req, 50);
  if (matches.length === 0) return 0;

  const now = Date.now();
  const expiresAt = now + LEAD_TTL_MS;

  // Find providers who already have a lead for this requirement
  const existingSnap = await db
    .collection("leads")
    .where("requirementId", "==", req.id)
    .get();
  const alreadyDistributed = new Set(
    existingSnap.docs.map((d) => d.data().providerId as string)
  );

  const newMatches = matches.filter((m) => !alreadyDistributed.has(m.userId));
  if (newMatches.length === 0) return 0;

  // Batch-write leads (Firestore batch limit is 500)
  for (let i = 0; i < newMatches.length; i += 500) {
    const batch = db.batch();
    for (const match of newMatches.slice(i, i + 500)) {
      const ref = db.collection("leads").doc();
      batch.set(ref, {
        id: ref.id,
        requirementId: req.id,
        providerId: match.userId,
        relevanceScore: match.totalScore,
        scoreBreakdown: match.breakdown,
        status: "new",        // new | viewed | applied | ignored | expired
        createdAt: now,
        expiresAt,
      });
    }
    await batch.commit();
  }

  // Push notifications to top matches (fire-and-forget, non-blocking)
  const budgetStr = `₹${req.minBudget}–₹${req.maxBudget}`;
  await Promise.allSettled(
    newMatches.slice(0, FCM_NOTIFY_TOP_N).map((m) =>
      sendNotification(m.userId, {
        type: "requirement",
        title: "New requirement matching your skills",
        body: `"${req.title}" — Budget ${budgetStr}`,
        data: {
          requirementId: req.id,
          category: req.category,
        },
      })
    )
  );

  // Record distribution metadata on the requirement
  await db.collection("requirements").doc(req.id).update({
    matchedProviderCount: matches.length,
    distributedAt: now,
  });

  return newMatches.length;
}

/**
 * Returns the personalized requirement feed for a provider.
 * Only shows leads that are not expired, not yet applied, and match optional filters.
 */
export async function getProviderFeed(
  providerId: string,
  opts: {
    limit?: number;
    offset?: number;
    category?: string;
    minBudget?: number;
    maxBudget?: number;
  } = {}
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const { limit = 20, offset = 0 } = opts;
  const now = Date.now();

  const leadsSnap = await db
    .collection("leads")
    .where("providerId", "==", providerId)
    .where("status", "in", ["new", "viewed"])
    .where("expiresAt", ">", now)
    .orderBy("expiresAt", "asc")
    .get();

  const total = leadsSnap.size;
  const page = leadsSnap.docs.slice(offset, offset + limit);
  const reqIds = page.map((d) => d.data().requirementId as string);

  if (reqIds.length === 0) return { items: [], total };

  // Fetch requirement documents in batches of 10 (Firestore 'in' limit)
  const reqMap = new Map<string, FirebaseFirestore.DocumentData>();
  for (let i = 0; i < reqIds.length; i += 10) {
    const snap = await db
      .collection("requirements")
      .where("__name__", "in", reqIds.slice(i, i + 10))
      .get();
    snap.docs.forEach((d) => reqMap.set(d.id, d.data()));
  }

  // Mark leads as viewed (batch update)
  const writeBatch = db.batch();
  page.forEach((d) => {
    if (d.data().status === "new") {
      writeBatch.update(d.ref, { status: "viewed", viewedAt: now });
    }
  });
  await writeBatch.commit();

  const rawItems = page.map((lead) => {
    const ld = lead.data();
    const req = reqMap.get(ld.requirementId as string);
    if (!req) return null;
    // Skip already-closed requirements
    if (req.status === "hired" || req.status === "completed" || req.status === "cancelled") return null;
    // Apply optional filters
    if (opts.category && req.category !== opts.category) return null;
    if (opts.minBudget && (req.maxBudget as number) < opts.minBudget) return null;
    if (opts.maxBudget && (req.minBudget as number) > opts.maxBudget) return null;
    return {
      ...req,
      createdAt: req.createdAt ? new Date(req.createdAt as number).toISOString() : null,
      leadId: ld.id,
      relevanceScore: ld.relevanceScore,
      leadStatus: ld.status,
      expiresAt: new Date(ld.expiresAt as number).toISOString(),
    };
  });

  const items = rawItems.filter(Boolean) as Record<string, unknown>[];
  return { items, total };
}

/** Marks a lead as applied when the provider submits a quote. */
export async function markLeadApplied(requirementId: string, providerId: string): Promise<void> {
  const snap = await db
    .collection("leads")
    .where("requirementId", "==", requirementId)
    .where("providerId", "==", providerId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await snap.docs[0]!.ref.update({ status: "applied", appliedAt: Date.now() });
  }
}
