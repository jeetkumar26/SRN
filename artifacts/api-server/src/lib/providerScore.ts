import { db } from "./firebase";

export interface ProviderScoreInput {
  rating: number;           // 0–5
  completedGigs: number;
  totalBids: number;        // total quotes ever submitted
  onTimeRate: number;       // 0–100
  isVerified: boolean;
  isPremium: boolean;
  lastActiveAt?: number;    // epoch ms
  responseRate?: number;    // 0–100
  portfolioQualityScore?: number; // 0–100
}

export interface ProviderScoreResult {
  total: number; // 0–100
  breakdown: {
    ratingScore: number;
    completionScore: number;
    responseScore: number;
    activityScore: number;
    verificationScore: number;
    portfolioScore: number;
    onTimeScore: number;
  };
}

/**
 * Deterministic, weighted formula for provider ranking.
 * Weights must sum to 1.0.
 *
 * rating        25% — most important trust signal
 * completion    20% — reliability
 * response      15% — engagement speed
 * verification  15% — identity trust
 * portfolio     10% — quality of work evidence
 * activity      10% — recency (decays after 30 days)
 * on-time        5% — delivery punctuality
 */
export function calculateProviderScore(input: ProviderScoreInput): ProviderScoreResult {
  const now = Date.now();

  const ratingScore = Math.round((input.rating / 5) * 100);

  const safeTotalBids = Math.max(input.totalBids, 1);
  const completionRatio = Math.min(input.completedGigs / safeTotalBids, 1);
  const completionScore = Math.round(completionRatio * 100);

  const responseScore = Math.min(Math.round(input.responseRate ?? 70), 100);

  const daysSinceActive = input.lastActiveAt
    ? (now - input.lastActiveAt) / 86400000
    : 30;
  // Full score up to 7 days, then linear decay to 0 at 30 days
  const activityScore = daysSinceActive <= 7
    ? 100
    : Math.max(0, Math.round(100 - ((daysSinceActive - 7) / 23) * 100));

  const verificationScore = input.isVerified ? 100 : 30;

  const portfolioScore = Math.min(Math.round(input.portfolioQualityScore ?? 50), 100);

  const onTimeScore = Math.min(Math.round(input.onTimeRate), 100);

  const raw =
    ratingScore * 0.25 +
    completionScore * 0.20 +
    responseScore * 0.15 +
    verificationScore * 0.15 +
    portfolioScore * 0.10 +
    activityScore * 0.10 +
    onTimeScore * 0.05;

  const premiumBoost = input.isPremium ? 5 : 0;

  return {
    total: Math.min(100, Math.round(raw + premiumBoost)),
    breakdown: {
      ratingScore,
      completionScore,
      responseScore,
      activityScore,
      verificationScore,
      portfolioScore,
      onTimeScore,
    },
  };
}

/** Recomputes and persists the provider score to Firestore. */
export async function computeAndSaveProviderScore(userId: string): Promise<number> {
  const [userDoc, portfolioSnap, quotesSnap] = await Promise.all([
    db.collection("users").doc(userId).get(),
    db.collection("portfolios").where("userId", "==", userId).get(),
    db.collection("quotes").where("senderId", "==", userId).get(),
  ]);

  if (!userDoc.exists) return 0;

  const user = userDoc.data()!;

  const totalLikes = portfolioSnap.docs.reduce(
    (sum, d) => sum + ((d.data().likesCount as number) ?? 0),
    0
  );
  const portfolioQualityScore = Math.min(
    100,
    portfolioSnap.size * 15 + totalLikes * 2
  );

  const result = calculateProviderScore({
    rating: (user.rating as number) ?? 0,
    completedGigs: (user.completedGigs as number) ?? 0,
    totalBids: quotesSnap.size,
    onTimeRate: (user.onTimeRate as number) ?? 100,
    isVerified: (user.isVerified as boolean) ?? false,
    isPremium: (user.isPremium as boolean) ?? false,
    lastActiveAt: (user.lastActiveAt as number) ?? (user.createdAt as number),
    responseRate: (user.responseRate as number) ?? 70,
    portfolioQualityScore,
  });

  await db.collection("users").doc(userId).update({
    providerScore: result.total,
    providerScoreBreakdown: result.breakdown,
    providerScoreUpdatedAt: Date.now(),
    portfolioQualityScore,
  });

  return result.total;
}

/** Returns 0–100 based on how complete the user's profile is. */
export function calculateProfileCompletionScore(user: Record<string, unknown>): number {
  const checks: [keyof typeof user, number][] = [
    ["name", 10],
    ["email", 10],
    ["title", 10],
    ["location", 10],
    ["description", 15],
    ["skills", 15],
    ["avatarUrl", 10],
    ["isVerified", 20],
  ];
  return checks.reduce((score, [field, weight]) => {
    const val = user[field];
    return val && val !== "" && val !== false ? score + weight : score;
  }, 0);
}
