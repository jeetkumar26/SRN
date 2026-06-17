/**
 * FILE UPLOAD ROUTES — MODULE 23
 *
 * Two-step upload flow:
 *   Step 1: POST /uploads/presigned  → get signed URL + uploadId
 *   Step 2: PUT {uploadUrl}          → client uploads directly to Firebase Storage
 *   Step 3: POST /uploads/confirm    → server verifies and creates media record
 *
 * GET /uploads/:id     → get media record (owner or admin)
 * DELETE /uploads/:id  → delete media (owner or admin)
 */

import { Router } from "express";
import {
  generatePresignedUploadUrl,
  confirmUpload,
  deleteMedia,
  ALLOWED_TYPES,
  type UploadContext,
} from "../lib/fileUpload";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { db } from "../lib/firebase";
import { ValidationError, NotFoundError, ForbiddenError } from "../lib/fileUpload";

const router = Router();

// ---------------------------------------------------------------------------
// POST /uploads/presigned — Step 1: Generate a signed upload URL
// ---------------------------------------------------------------------------
router.post(
  "/uploads/presigned",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { fileName, mimeType, fileSizeBytes, context, entityId } = req.body as {
        fileName?: string;
        mimeType?: string;
        fileSizeBytes?: number;
        context?: UploadContext;
        entityId?: string;
      };

      if (!fileName || !mimeType || !fileSizeBytes || !context) {
        res.status(400).json({
          error: "fileName, mimeType, fileSizeBytes, and context are required.",
          allowedContexts: Object.keys(ALLOWED_TYPES),
        });
        return;
      }

      // KYC documents require at least email-verified status
      if (context === "kyc_document") {
        const userDoc = await db.collection("users").doc(req.user!.uid).get();
        if (!userDoc.data()?.email) {
          res.status(403).json({ error: "Email verification required for KYC uploads." });
          return;
        }
      }

      const result = await generatePresignedUploadUrl(req.user!.uid, {
        fileName,
        mimeType,
        fileSizeBytes,
        context,
        entityId,
      });

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /uploads/confirm — Step 3: Confirm upload completed
// ---------------------------------------------------------------------------
router.post(
  "/uploads/confirm",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { uploadId } = req.body as { uploadId?: string };

      if (!uploadId) {
        res.status(400).json({ error: "uploadId is required." });
        return;
      }

      const record = await confirmUpload(req.user!.uid, uploadId);

      res.json({
        id: record.id,
        publicUrl: record.publicUrl,
        mimeType: record.mimeType,
        context: record.context,
        fileName: record.fileName,
        fileSizeBytes: record.fileSizeBytes,
        confirmedAt: record.confirmedAt ? new Date(record.confirmedAt).toISOString() : null,
      });
    } catch (err) {
      if (err instanceof ValidationError) { res.status(400).json({ error: (err as Error).message }); return; }
      if (err instanceof NotFoundError) { res.status(404).json({ error: (err as Error).message }); return; }
      if (err instanceof ForbiddenError) { res.status(403).json({ error: (err as Error).message }); return; }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /uploads/:id — Get a media record
// ---------------------------------------------------------------------------
router.get(
  "/uploads/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const doc = await db.collection("media").doc(id).get();

      if (!doc.exists) { res.status(404).json({ error: "Media not found." }); return; }

      const record = doc.data()!;

      // KYC documents are restricted to owner and admin
      if (record.context === "kyc_document") {
        if (record.userId !== req.user!.uid && req.user?.role !== "admin") {
          res.status(403).json({ error: "Access denied." });
          return;
        }
      }

      res.json({
        id: record.id,
        context: record.context,
        fileName: record.fileName,
        mimeType: record.mimeType,
        fileSizeBytes: record.fileSizeBytes,
        publicUrl: record.status === "confirmed" ? record.publicUrl : null,
        status: record.status,
        createdAt: record.createdAt ? new Date(record.createdAt as number).toISOString() : null,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /uploads/:id — Delete a media record and its file
// ---------------------------------------------------------------------------
router.delete(
  "/uploads/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = req.params["id"] as string;
      const isAdmin = req.user?.role === "admin";

      await deleteMedia(req.user!.uid, id, isAdmin);
      res.status(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) { res.status(404).json({ error: (err as Error).message }); return; }
      if (err instanceof ForbiddenError) { res.status(403).json({ error: (err as Error).message }); return; }
      next(err);
    }
  }
);

export default router;
