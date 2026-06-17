import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startAllJobs } from "./lib/backgroundJobs";
import { db } from "./lib/firebase";

const app: Express = express();

// ---------------------------------------------------------------------------
// CORS — restrict origins in production
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS =
  process.env.NODE_ENV === "production"
    ? [
        "https://srn.digitalnextworld.com",
        "https://admin.srn.digitalnextworld.com",
      ]
    : true;

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ---------------------------------------------------------------------------
// Rate limiting — M19 Security
//
// Layer 1 (IP-based)  — protects against unknown/unauthenticated attackers
//   General API  → 200 req / 15 min per IP
//   Auth routes  → 20 req / 15 min per IP  (brute-force guard)
//   OTP routes   → 5 req / 60 min per IP   (OTP abuse guard)
//
// Layer 2 (User-based) — applied after token verification, keyed by Firebase UID.
//   Prevents a single authenticated user from hammering endpoints even from
//   rotating IPs (VPN, mobile network changes).
//   General auth'd API → 300 req / 15 min per user
// ---------------------------------------------------------------------------

// IP-level limits
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please wait 15 minutes." },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Please wait 1 hour." },
});

app.use("/api/", generalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/users", authLimiter);
app.use("/api/verify/phone", otpLimiter);

// ---------------------------------------------------------------------------
// Per-user rate limiting (M19) — Firestore-backed token bucket
// Applied to all authenticated API routes.
// Window: 15 min, limit: 300 requests per user.
// ---------------------------------------------------------------------------
const USER_RATE_WINDOW_MS = 15 * 60 * 1000;
const USER_RATE_LIMIT = 300;

async function perUserRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token) { next(); return; } // unauthenticated — handled by IP limiter

  // Decode UID from the JWT header (no verify needed — just read the payload for rate limiting)
  // Full verify is done in authenticateToken middleware later
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) { next(); return; }
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64").toString("utf-8")) as { user_id?: string };
    const uid = payload.user_id;
    if (!uid) { next(); return; }

    const now = Date.now();
    const windowKey = Math.floor(now / USER_RATE_WINDOW_MS);
    const docId = `${uid}_${windowKey}`;
    const docRef = db.collection("rate_limits").doc(docId);

    const doc = await docRef.get();
    const current = (doc.data()?.count as number) ?? 0;

    if (current >= USER_RATE_LIMIT) {
      res.status(429).json({ error: "Per-user rate limit exceeded. Please wait before making more requests." });
      return;
    }

    // Increment counter (fire-and-forget, don't block the request)
    docRef.set(
      { count: current + 1, uid, expiresAt: now + USER_RATE_WINDOW_MS },
      { merge: true }
    ).catch(() => {});

    next();
  } catch {
    next(); // If rate limit check itself fails, let the request through
  }
}

app.use("/api/", perUserRateLimit);

// ---------------------------------------------------------------------------
// Body parsing & logging
// ---------------------------------------------------------------------------
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/api", router);

// ---------------------------------------------------------------------------
// Background jobs — 7 jobs via setInterval, started once on server boot
// ---------------------------------------------------------------------------
startAllJobs();

export default app;
