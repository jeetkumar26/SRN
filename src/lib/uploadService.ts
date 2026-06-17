import { customFetch } from "@workspace/api-client-react";

export interface PresignedUploadResult {
  uploadId: string;
  presignedUrl: string;
  publicUrl: string;
}

export interface UploadOptions {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  context: "avatar" | "portfolio" | "document" | "evidence";
  entityId?: string;
}

/**
 * Full presigned-URL upload flow:
 * 1. Request presigned URL from backend
 * 2. PUT the file bytes directly to storage (no auth header — presigned URL is self-authenticating)
 * 3. Confirm upload with backend to finalise record
 *
 * Returns the confirmed public URL.
 */
export async function uploadFile(
  fileUri: string,
  options: UploadOptions
): Promise<string> {
  // Step 1: Get presigned URL from backend
  const { uploadId, presignedUrl, publicUrl } = await customFetch<PresignedUploadResult>(
    "/api/uploads/presigned",
    {
      method: "POST",
      body: JSON.stringify(options),
    }
  );

  // Step 2: PUT file to presigned URL (no auth header)
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();

  const putResponse = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": options.mimeType },
    body: blob,
  });

  if (!putResponse.ok) {
    throw new Error(`Upload failed: ${putResponse.status} ${putResponse.statusText}`);
  }

  // Step 3: Confirm with backend
  await customFetch("/api/uploads/confirm", {
    method: "POST",
    body: JSON.stringify({ uploadId }),
  });

  return publicUrl;
}

/**
 * Upload a profile photo and patch the user's photoURL via the users API.
 */
export async function uploadAvatar(
  fileUri: string,
  uid: string,
  mimeType: string = "image/jpeg",
  fileSizeBytes: number = 500_000
): Promise<string> {
  const fileName = `avatar_${uid}_${Date.now()}.jpg`;

  const publicUrl = await uploadFile(fileUri, {
    fileName,
    mimeType,
    fileSizeBytes,
    context: "avatar",
    entityId: uid,
  });

  await customFetch(`/api/users/${uid}`, {
    method: "PATCH",
    body: JSON.stringify({ photoURL: publicUrl }),
  });

  return publicUrl;
}