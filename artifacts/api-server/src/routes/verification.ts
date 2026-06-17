/**
 * KYC / IDENTITY VERIFICATION ROUTES — MODULE 15
 *
 * Verification Levels:
 *   0 = unverified
 *   1 = email verified (done automatically on registration)
 *   2 = phone/OTP verified
 *   3 = Aadhaar or PAN verified (manual review by admin)
 *   4 = GST / Company registration (manual review by admin)
 *
 * Algorithm:
 *  Phone OTP:
 *    1. POST /verify/phone/send     — generate 6-digit OTP, store SHA-256 hash, TTL 10 min
 *    2. POST /verify/phone/confirm  — validate OTP hash, bump verificationLevel to 2
 *
 *  Document KYC (Aadhaar/PAN/GST):
 *    1. Upload documents via /uploads/presigned + /uploads/confirm
 *    2. POST /verify/submit         — create verification request with media IDs
 *    3. Admin reviews in dashboard
 *    4. PATCH /verify/:id/approve   — admin approves, bumps verificationLevel
 *    5. PATCH /verify/:id/reject    — admin rejects with reason
 *
 * Security:
 *  - OTP is never stored plain; only SHA-256 hash is persisted
 *  - Max 3 OTP send attempts per hour per user
 *  - Admin-only endpoints check req.user.role === "admin"
 */

import { Router } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import {
  submitVerificationRequest,
  approveVerification,
  rejectVerification,
  sendPhoneOtp,
  verifyPhoneOtp,
  type VerificationType,
} from "../lib/kycService";
import { db } from "../lib/firebase";
import { eventBus } from "../lib/eventBus";

const router = Router();

// ---------------------------------------------------------------------------
// POST /verify/phone/send — Send OTP to user's phone number
// ---------------------------------------------------------------------------
router.post(
  "/verify/phone/send",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { phoneNumber } = req.body as { phoneNumber?: string };

      if (!phoneNumber) {
        res.status(400).json({ error: "phoneNumber is required." });
        return;
      }

      // Basic E.164 format validation
      if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
        res.status(400).json({ error: "phoneNumber must be in E.164 format (e.g. +919876543210)." });
        return;
      }

      await sendPhoneOtp(req.user!.uid, phoneNumber);

      res.json({
        success: true,
        message: "OTP sent. It expires in 10 minutes.",
        maskedPhone: phoneNumber.slice(0, -4).replace(/\d/g, "*") + phoneNumber.slice(-4),
      });
    } catch (error) {
      if ((error as Error).message?.includes("Rate limit")) {
        res.status(429).json({ error: (error as Error).message });
        return;
      }
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /verify/phone/confirm — Validate OTP and mark phone as verified
// ---------------------------------------------------------------------------
router.post(
  "/verify/phone/confirm",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { otp } = req.body as { otp?: string };

      if (!otp) {
        res.status(400).json({ error: "otp is required." });
        return;
      }

      if (!/^\d{6}$/.test(otp)) {
        res.status(400).json({ error: "OTP must be a 6-digit number." });
        return;
      }

      await verifyPhoneOtp(req.user!.uid, otp);

      res.json({
        success: true,
        message: "Phone number verified.",
        verificationLevel: 2,
      });
    } catch (error) {
      const msg = (error as Error).message ?? "";
      if (msg.includes("expired") || msg.includes("Invalid OTP") || msg.includes("No pending OTP")) {
        res.status(400).json({ error: msg });
        return;
      }
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /verify/submit — Submit documents for admin KYC review
// ---------------------------------------------------------------------------
router.post(
  "/verify/submit",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { type, documentMediaIds, additionalData } = req.body as {
        type?: string;
        documentMediaIds?: string[];
        additionalData?: Record<string, unknown>;
      };

      if (!type || !documentMediaIds || documentMediaIds.length === 0) {
        res.status(400).json({ error: "type and documentMediaIds are required." });
        return;
      }

      const VALID_TYPES = ["aadhaar", "pan", "gst", "company_registration"];
      if (!VALID_TYPES.includes(type)) {
        res.status(400).json({
          error: `Invalid verification type. Must be one of: ${VALID_TYPES.join(", ")}.`,
        });
        return;
      }

      const request = await submitVerificationRequest(
        req.user!.uid,
        type as VerificationType,
        documentMediaIds,
        additionalData as Record<string, string> | undefined
      );

      res.status(201).json({
        id: request.id,
        type: request.type,
        status: request.status,
        message: "Verification request submitted. Admin will review within 1-2 business days.",
        submittedAt: new Date(request.submittedAt).toISOString(),
      });
    } catch (error) {
      const msg = (error as Error).message ?? "";
      if (msg.includes("already") || msg.includes("pending")) {
        res.status(409).json({ error: msg });
        return;
      }
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /verify/status — Get current user's verification status
// ---------------------------------------------------------------------------
router.get(
  "/verify/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.uid;

      const [userDoc, pendingSnap] = await Promise.all([
        db.collection("users").doc(userId).get(),
        db.collection("verification_requests")
          .where("userId", "==", userId)
          .where("status", "==", "pending")
          .get(),
      ]);

      if (!userDoc.exists) { res.status(404).json({ error: "User not found." }); return; }

      const user = userDoc.data()!;

      res.json({
        verificationLevel: user.verificationLevel ?? 0,
        isVerified: user.isVerified ?? false,
        phoneVerified: user.phoneVerified ?? false,
        emailVerified: !!user.email,
        hasPendingRequest: !pendingSnap.empty,
        pendingTypes: pendingSnap.docs.map((d) => d.data().type),
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /verify/requests — Admin: list all pending verification requests
// ---------------------------------------------------------------------------
router.get(
  "/verify/requests",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user?.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }

      const status = (req.query["status"] as string) ?? "pending";

      const snapshot = await db
        .collection("verification_requests")
        .where("status", "==", status)
        .orderBy("createdAt", "asc")
        .limit(50)
        .get();

      const requests = snapshot.docs.map((d) => {
        const r = d.data();
        return {
          id: r.id,
          userId: r.userId,
          type: r.type,
          status: r.status,
          documentMediaIds: r.documentMediaIds,
          additionalData: r.additionalData ?? {},
          submittedAt: new Date(r.createdAt as number).toISOString(),
          reviewedBy: r.reviewedBy ?? null,
          adminNote: r.adminNote ?? null,
        };
      });

      res.json({ requests, count: requests.length });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /verify/:id/approve — Admin approves a verification request
// ---------------------------------------------------------------------------
router.patch(
  "/verify/:id/approve",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user?.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }

      const verificationId = req.params["id"] as string;
      const { note } = req.body as { note?: string };

      await approveVerification(verificationId, req.user!.uid, note);

      // Emit event to trigger score recompute and congratulations notification
      try {
        const verDoc = await db.collection("verification_requests").doc(verificationId).get();
        if (verDoc.exists) {
          const vr = verDoc.data()!;
          const userDoc = await db.collection("users").doc(vr.userId as string).get();
          eventBus.emit("user.verified", {
            userId: vr.userId as string,
            level: (userDoc.data()?.verificationLevel as number) ?? 3,
            type: vr.type as string,
          });
        }
      } catch { /* non-critical */ }

      res.json({ success: true, message: "Verification approved." });
    } catch (error) {
      const msg = (error as Error).message ?? "";
      if (msg.includes("not found") || msg.includes("Not found")) {
        res.status(404).json({ error: msg });
        return;
      }
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /verify/:id/reject — Admin rejects a verification request
// ---------------------------------------------------------------------------
router.patch(
  "/verify/:id/reject",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user?.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }

      const verificationId = req.params["id"] as string;
      const { reason } = req.body as { reason?: string };

      if (!reason) {
        res.status(400).json({ error: "A rejection reason is required." });
        return;
      }

      await rejectVerification(verificationId, req.user!.uid, reason);

      res.json({ success: true, message: "Verification rejected. User has been notified." });
    } catch (error) {
      const msg = (error as Error).message ?? "";
      if (msg.includes("not found") || msg.includes("Not found")) {
        res.status(404).json({ error: msg });
        return;
      }
      next(error);
    }
  }
);

export default router;
