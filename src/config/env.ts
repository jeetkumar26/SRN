import { Platform } from "react-native";

const ENVIRONMENTS = {
  development: {
    // ─── How to reach the backend from a real Android device ───────────────
    // Option A – USB cable: run `adb reverse tcp:3000 tcp:3000` on your PC,
    //            then change the Android URL below to "http://localhost:3000"
    // Option B – Same WiFi: find your PC's LAN IP (run `ipconfig` → IPv4),
    //            then change the Android URL below to "http://192.168.x.x:3000"
    // Option C – Emulator (default): leave as-is, 10.0.2.2 = PC localhost
    // ───────────────────────────────────────────────────────────────────────
    API_URL: Platform.OS === "ios" ? "http://localhost:3000" : "http://10.0.2.2:3000",
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

function getCurrentEnv(): EnvName {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "staging") return "staging";
  return "development";
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
