import { db } from "./firebase";

// ---------------------------------------------------------------------------
// Semantic keyword expansion map.
// Allows "logo designer needed" to match a provider with "graphic design" skills.
// ---------------------------------------------------------------------------
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  logo: ["logo", "branding", "brand identity", "graphic design", "illustrator", "vector", "design"],
  web: ["website", "web development", "frontend", "html", "css", "javascript", "react", "wordpress", "landing page", "ui ux"],
  app: ["app", "mobile app", "ios", "android", "flutter", "react native", "application"],
  video: ["video", "editing", "youtube", "reel", "animation", "motion graphics", "premiere", "after effects", "vfx"],
  writing: ["writing", "content", "blog", "article", "copywriting", "seo content", "proofreading", "ghostwriting"],
  "social media": ["social media", "instagram", "facebook", "marketing", "digital marketing", "ads", "campaigns"],
  photo: ["photo", "photography", "photoshoot", "portrait", "product photography", "event photography"],
  data: ["data entry", "excel", "spreadsheet", "typing", "database", "data processing"],
  seo: ["seo", "search engine optimization", "keyword research", "backlinks", "ranking", "google"],
  translation: ["translation", "translate", "language", "interpreter", "localization"],
  cleaning: ["cleaning", "housekeeping", "maid", "domestic", "deep clean", "sanitation"],
  plumbing: ["plumber", "plumbing", "pipe", "leak", "drainage", "water tank"],
  electrical: ["electrician", "wiring", "electrical work", "power", "installation", "short circuit"],
  painting: ["painting", "painter", "wall paint", "interior", "exterior", "whitewash"],
  carpentry: ["carpenter", "furniture", "wood", "cabinet", "woodwork", "almira"],
  tutoring: ["tutor", "teaching", "education", "coaching", "lessons", "homework help"],
  repair: ["repair", "fix", "maintenance", "service", "technician", "ac repair", "appliance"],
};

const LOCAL_SERVICE_KEYWORDS = [
  "cleaning", "plumbing", "electrical", "painting", "carpentry",
  "repair", "installation", "delivery", "home service", "catering",
  "laundry", "gardening", "pest control", "ac service",
];

// ---------------------------------------------------------------------------
// Utility: Jaccard similarity between two text strings.
// Simple, deterministic, no external API needed.
// ---------------------------------------------------------------------------
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccardSimilarity(textA: string, textB: string): number {
  const a = tokenize(textA);
  const b = tokenize(textB);
  const intersection = [...a].filter((w) => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

function expandCategory(category: string): string {
  const lower = category.toLowerCase();
  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    if (lower.includes(key) || keywords.some((k) => lower.includes(k))) {
      return keywords.join(" ");
    }
  }
  return category;
}

// ---------------------------------------------------------------------------
// Haversine distance between two lat/lng points (km).
// ---------------------------------------------------------------------------
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface RequirementForMatching {
  id: string;
  title: string;
  description: string;
  category: string;
  skillsNeeded: string;
  minBudget: number;
  maxBudget: number;
  creatorId: string;
  lat?: number;
  lng?: number;
}

export interface MatchedProvider {
  userId: string;
  name: string;
  role: string;
  totalScore: number; // 0–100
  breakdown: {
    categoryScore: number;
    locationScore: number;
    portfolioScore: number;
    ratingScore: number;
    responseScore: number;
    activityScore: number;
    providerBaseScore: number;
  };
}

/**
 * 7-layer matching engine.
 *
 * Layer 1 — Category keyword similarity  (30%)
 * Layer 2 — Geolocation proximity         (15%)
 * Layer 3 — Portfolio text similarity     (15%)
 * Layer 4 — Provider rating               (15%)
 * Layer 5 — Response rate                 (10%)
 * Layer 6 — Activity recency              (10%)
 * Layer 7 — Stored provider base score    (5%)  (catches verification, completedGigs etc.)
 */
export async function findMatchingProviders(
  req: RequirementForMatching,
  topN = 50
): Promise<MatchedProvider[]> {
  const isLocal = LOCAL_SERVICE_KEYWORDS.some((k) =>
    req.category.toLowerCase().includes(k) ||
    req.title.toLowerCase().includes(k)
  );

  const targetRole = isLocal ? "local" : "digital";
  const snapshot = await db.collection("users").where("role", "==", targetRole).get();

  if (snapshot.empty) return [];

  const reqText = `${req.title} ${req.description} ${req.skillsNeeded}`;
  const categoryExpanded = expandCategory(req.category);
  const reqCombined = `${reqText} ${categoryExpanded}`;

  const results: MatchedProvider[] = [];

  for (const doc of snapshot.docs) {
    if (doc.id === req.creatorId) continue;

    const p = doc.data();
    const providerText = `${p.title ?? ""} ${p.skills ?? ""} ${p.description ?? ""}`;
    const portfolioKeywords = ((p.portfolioKeywords as string[]) ?? []).join(" ");
    const providerFull = `${providerText} ${portfolioKeywords}`;

    // Layer 1: Category similarity
    const categoryScore = Math.round(jaccardSimilarity(categoryExpanded, providerText) * 100);

    // Layer 2: Location (only meaningful for local providers with coords)
    let locationScore = 50; // neutral default for digital
    if (isLocal && req.lat && req.lng && p.lat && p.lng) {
      const km = haversineKm(req.lat, req.lng, p.lat as number, p.lng as number);
      const radius = (p.serviceRadiusKm as number) ?? 25;
      locationScore = km <= radius
        ? Math.max(0, Math.round(100 * (1 - km / radius)))
        : 0;
    }

    // Layer 3: Portfolio similarity
    const portfolioScore = Math.round(jaccardSimilarity(reqCombined, providerFull) * 100);

    // Layer 4: Rating
    const ratingScore = Math.round(((p.rating as number) ?? 0) / 5 * 100);

    // Layer 5: Response rate
    const responseScore = Math.min(Math.round((p.responseRate as number) ?? 70), 100);

    // Layer 6: Activity (full score ≤7 days, decays to 0 at 30 days)
    const lastActive = (p.lastActiveAt as number) ?? (p.createdAt as number) ?? 0;
    const daysSinceActive = (Date.now() - lastActive) / 86400000;
    const activityScore = daysSinceActive <= 7
      ? 100
      : Math.max(0, Math.round(100 - ((daysSinceActive - 7) / 23) * 100));

    // Layer 7: Stored provider base score
    const providerBaseScore = Math.min((p.providerScore as number) ?? 50, 100);

    const totalScore = Math.round(
      categoryScore * 0.30 +
      locationScore * 0.15 +
      portfolioScore * 0.15 +
      ratingScore * 0.15 +
      responseScore * 0.10 +
      activityScore * 0.10 +
      providerBaseScore * 0.05
    );

    // Skip providers with zero relevance to this requirement
    if (categoryScore < 5 && portfolioScore < 5 && totalScore < 15) continue;

    results.push({
      userId: doc.id,
      name: (p.name as string) ?? "Provider",
      role: p.role as string,
      totalScore,
      breakdown: {
        categoryScore,
        locationScore,
        portfolioScore,
        ratingScore,
        responseScore,
        activityScore,
        providerBaseScore,
      },
    });
  }

  return results.sort((a, b) => b.totalScore - a.totalScore).slice(0, topN);
}

/**
 * Score a single provider against a requirement (for re-ranking on demand).
 */
export async function scoreProviderForRequirement(
  providerId: string,
  req: RequirementForMatching
): Promise<number> {
  const matches = await findMatchingProviders(req, 1000);
  return matches.find((m) => m.userId === providerId)?.totalScore ?? 0;
}
