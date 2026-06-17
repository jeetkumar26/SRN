/**
 * APP CONFIG — M30 (Deep Links) + M37 (App Version Check)
 *
 * M37 — Version Check:
 *   GET /app/version   — returns current version info + minimum supported version
 *   The mobile app calls this on launch. If currentVersion < minVersion, app shows
 *   a force-update dialog pointing to the store URL.
 *
 * M30 — Deep Links / Universal Links:
 *   GET /.well-known/apple-app-site-association   — iOS Universal Links config
 *   GET /.well-known/assetlinks.json              — Android App Links config
 *   GET /app/link-config                          — deep link screen routing map
 *
 * Deep link routing: notification FCM data payloads include:
 *   { screen: "booking_detail", params: { bookingId: "xxx" } }
 *   { screen: "requirement_detail", params: { requirementId: "xxx" } }
 *   { screen: "chat", params: { conversationId: "xxx" } }
 *   { screen: "profile", params: { userId: "xxx" } }
 *   { screen: "review_form", params: { bookingId: "xxx" } }
 *   { screen: "subscription", params: {} }
 *   { screen: "feed", params: {} }
 *   { screen: "home", params: {} }
 *
 * Admin can update version config via PATCH /app/version (stored in Firestore).
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { writeAuditLog } from "../lib/auditLog";

const router = Router();

// Default version config (used if Firestore doc not yet set)
const DEFAULT_VERSION_CONFIG = {
  iosMinVersion: "1.0.0",
  iosLatestVersion: "1.0.0",
  iosStoreUrl: "https://apps.apple.com/app/srn/id000000000",
  androidMinVersion: "1.0.0",
  androidLatestVersion: "1.0.0",
  androidStoreUrl: "https://play.google.com/store/apps/details?id=com.digitalnextworld.srn",
  maintenanceMode: false,
  maintenanceMessage: "",
  updatedAt: Date.now(),
};

// ---------------------------------------------------------------------------
// GET /app/version — Version check endpoint (called by mobile app on launch)
// ---------------------------------------------------------------------------
router.get("/app/version", async (_req, res, next) => {
  try {
    const doc = await db.collection("app_config").doc("version").get();
    const config = doc.exists ? doc.data()! : DEFAULT_VERSION_CONFIG;

    res.json({
      ios: {
        minVersion: config.iosMinVersion,
        latestVersion: config.iosLatestVersion,
        storeUrl: config.iosStoreUrl,
      },
      android: {
        minVersion: config.androidMinVersion,
        latestVersion: config.androidLatestVersion,
        storeUrl: config.androidStoreUrl,
      },
      maintenanceMode: config.maintenanceMode ?? false,
      maintenanceMessage: config.maintenanceMessage ?? "",
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /app/version — Admin updates version configuration
// ---------------------------------------------------------------------------
router.patch(
  "/app/version",
  authenticateToken,
  requireRole(["admin"]),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const {
        iosMinVersion,
        iosLatestVersion,
        iosStoreUrl,
        androidMinVersion,
        androidLatestVersion,
        androidStoreUrl,
        maintenanceMode,
        maintenanceMessage,
      } = req.body as Partial<typeof DEFAULT_VERSION_CONFIG>;

      const updates: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: req.user!.uid };

      if (iosMinVersion) updates.iosMinVersion = iosMinVersion;
      if (iosLatestVersion) updates.iosLatestVersion = iosLatestVersion;
      if (iosStoreUrl) updates.iosStoreUrl = iosStoreUrl;
      if (androidMinVersion) updates.androidMinVersion = androidMinVersion;
      if (androidLatestVersion) updates.androidLatestVersion = androidLatestVersion;
      if (androidStoreUrl) updates.androidStoreUrl = androidStoreUrl;
      if (maintenanceMode !== undefined) updates.maintenanceMode = maintenanceMode;
      if (maintenanceMessage !== undefined) updates.maintenanceMessage = maintenanceMessage;

      await db.collection("app_config").doc("version").set(updates, { merge: true });

      writeAuditLog({
        action: "app_config.version_updated",
        actorId: req.user!.uid,
        resourceType: "app_config",
        resourceId: "version",
        metadata: updates,
      }).catch(() => {});

      res.json({ success: true, ...updates });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /app/link-config — Deep link screen routing map (used by mobile app)
// The app reads this at startup to know which FCM `screen` value maps to
// which React Native navigator screen.
// ---------------------------------------------------------------------------
router.get("/app/link-config", async (_req, res, next) => {
  try {
    const doc = await db.collection("app_config").doc("deep_links").get();

    // Default routing map — admin can override via Firestore
    const defaultMap = {
      booking_detail:      { navigator: "Main", screen: "BookingDetail",      paramKey: "bookingId" },
      requirement_detail:  { navigator: "Main", screen: "RequirementDetail",  paramKey: "requirementId" },
      chat:                { navigator: "Main", screen: "Chat",               paramKey: "conversationId" },
      profile:             { navigator: "Main", screen: "PublicProfile",      paramKey: "userId" },
      review_form:         { navigator: "Main", screen: "ReviewForm",         paramKey: "bookingId" },
      subscription:        { navigator: "Main", screen: "Subscription",       paramKey: null },
      feed:                { navigator: "Main", screen: "Feed",               paramKey: null },
      home:                { navigator: "Main", screen: "Home",               paramKey: null },
      dispute_detail:      { navigator: "Main", screen: "DisputeDetail",      paramKey: "disputeId" },
      portfolio_item:      { navigator: "Main", screen: "PortfolioItem",      paramKey: "itemId" },
      verification:        { navigator: "Main", screen: "Verification",       paramKey: null },
    };

    const config = doc.exists ? { ...defaultMap, ...doc.data() } : defaultMap;
    res.json({ routes: config });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /.well-known/apple-app-site-association — iOS Universal Links
// Tells iOS which app to open for srn.digitalnextworld.com links
// ---------------------------------------------------------------------------
router.get("/.well-known/apple-app-site-association", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "TEAMID.com.digitalnextworld.srn",
          paths: [
            "/booking/*",
            "/requirement/*",
            "/profile/*",
            "/chat/*",
            "/dispute/*",
            "/user/*",
            "/portfolio/*",
            "/subscription",
            "/subscription/*",
            "/feed",
            "/home",
            "/verification",
            "/app/*",
          ],
        },
      ],
    },
  });
});

// ---------------------------------------------------------------------------
// GET /.well-known/assetlinks.json — Android App Links
// ---------------------------------------------------------------------------
router.get("/.well-known/assetlinks.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.digitalnextworld.srn",
        sha256_cert_fingerprints: (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean),
      },
    },
  ]);
});

export default router;
