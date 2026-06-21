import { Platform } from "react-native";

// ─── DEV API URL setup ────────────────────────────────────────────────────────
//
// When running on a REAL physical device (not emulator) you need a URL your
// phone can actually reach. Choose one method:
//
//   METHOD 1 — USB cable (recommended, always works):
//     a) Connect phone via USB with USB Debugging enabled
//     b) Run on your PC:  adb reverse tcp:3000 tcp:3000
//     c) Keep DEV_API_URL_ANDROID = "http://localhost:3000"   ← already set
//     d) Start backend:   cd artifacts/api-server && pnpm dev
//
//   METHOD 2 — Same WiFi (no USB needed):
//     a) On your PC run `ipconfig` and find your IPv4 address (e.g. 192.168.1.5)
//     b) Set DEV_API_URL_ANDROID = "http://192.168.1.5:3000"
//     c) Start backend:   cd artifacts/api-server && pnpm dev
//
//   METHOD 3 — Emulator only:
//     Set DEV_API_URL_ANDROID = "http://10.0.2.2:3000"
//
// ─────────────────────────────────────────────────────────────────────────────
const DEV_API_URL_ANDROID = "http://localhost:3000"; // works with: adb reverse tcp:3000 tcp:3000
const DEV_API_URL_IOS = "http://localhost:3000";

const ENVIRONMENTS = {
  development: {
    API_URL: Platform.OS === "ios" ? DEV_API_URL_IOS : DEV_API_URL_ANDROID,
    ENV_NAME: "development" as const,
  },
  staging: {
    API_URL: "https://api-staging.srn.digitalnextworld.com",
    ENV_NAME: "staging" as const,
  },
  production: {
    API_URL: "https://api.srn.digitalnextworld.com",
    ENV_NAME: "production" as const,
  },
};

type EnvName = keyof typeof ENVIRONMENTS;

// __DEV__ is set by the Metro bundler:
//   --dev true  → __DEV__ = true  → uses development URL (your local backend)
//   --dev false → __DEV__ = false → uses production URL (deployed server)
//
// process.env.NODE_ENV is NOT reliable for this check — Metro sets it to
// "production" even for debug APK builds when --dev false is passed, which
// causes the app to blindly hit the production domain (which may not exist yet)
// instead of the local backend server.
function getCurrentEnv(): EnvName {
  if (typeof __DEV__ !== "undefined" && __DEV__) return "development";
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "staging") return "staging";
  return "production";
}

const currentEnv = getCurrentEnv();

export const config = {
  ...ENVIRONMENTS[currentEnv],
  IS_DEV: currentEnv === "development",
  IS_PROD: currentEnv === "production",
};

// ─── GOOGLE SIGN-IN ───────────────────────────────────────────────────────────
// Steps to get this value:
//   1. Firebase Console → Authentication → Sign-in method → Google → Enable
//   2. Firebase Console → Project settings → Your apps → Android app → Add SHA-1 fingerprint:
//      SHA1:   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
//      SHA256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
//   3. Re-download google-services.json and replace android/app/google-services.json
//   4. Go to Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration
//      Copy the "Web client ID" and paste it below.
export const GOOGLE_WEB_CLIENT_ID = "241786797937-6c7e7uln5umvjnebu87u12el9cu3jh02.apps.googleusercontent.com";

// ─── DEV BYPASS ───────────────────────────────────────────────────────────────
// Set to false before production release.
// When true, the login screen shows role buttons — no Firebase auth needed.
export const DEV_BYPASS_AUTH = false;
