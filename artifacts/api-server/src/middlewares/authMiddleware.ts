import type { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";

export interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken & { role?: string };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Access token is required" });
    return;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Fetch user profile from Firestore to get their role
    const userDoc = await admin.firestore().collection("users").doc(decodedToken.uid).get();
    let role: string | undefined = undefined;
    if (userDoc.exists) {
      role = userDoc.data()?.role;
    }

    req.user = {
      ...decodedToken,
      role,
    };
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid or expired access token" });
    return;
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!req.user.role || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Access denied. Insufficient permissions." });
      return;
    }
    next();
  };
};
