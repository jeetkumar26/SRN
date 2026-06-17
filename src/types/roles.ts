export type UserRole = "business" | "customer" | "digital" | "local" | "admin";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: number;
  // Business
  companyName?: string;
  industry?: string;
  postedRequirementsCount?: number;
  // Digital / Local provider
  title?: string;
  skills?: string[];
  portfolioLinks?: string[];
  rating?: number;
  reviewsCount?: number;
  hourlyRate?: number;
  // Local provider
  serviceRadiusKm?: number;
  isAvailable?: boolean;
  // Common optional fields
  phone?: string;
  bio?: string;
  completedGigs?: number;
  onTimeRate?: number;
  // Admin
  privileges?: string[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  business: "Business / Startup",
  customer: "Personal / Customer",
  digital: "Digital Skill Provider",
  local: "Local Service Provider",
  admin: "Administrator",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  business: "#7c3aed",
  customer: "#2563eb",
  digital: "#0d9488",
  local: "#ea580c",
  admin: "#dc2626",
};
