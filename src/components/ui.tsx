import React from "react";
import { View, Text, StyleSheet, ViewStyle, Dimensions } from "react-native";
import LinearGradient from "react-native-linear-gradient";

const { width } = Dimensions.get("window");

// ─── Design tokens — always light/white theme ─────────────────────────────────
export const T = {
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  sub: "#475569",
  faint: "#94a3b8",
  muted: "#f1f5f9",
  violet: "#7c3aed",
  blue: "#2563eb",
  teal: "#0d9488",
  orange: "#ea580c",
  red: "#dc2626",
  green: "#10b981",
  amber: "#f59e0b",
};

export const ROLE_COLOR: Record<string, string> = {
  business: "#7c3aed",
  customer: "#2563eb",
  digital: "#0d9488",
  local: "#ea580c",
  admin: "#dc2626",
};

export const ROLE_LABEL: Record<string, string> = {
  business: "Business",
  customer: "Customer",
  digital: "Digital Provider",
  local: "Local Provider",
  admin: "Admin",
};

// ─── Card ────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  color?: string;
  padding?: number;
}
export function Card({ children, style, color = "#7c3aed", padding = 16 }: CardProps) {
  return (
    <View style={[cardStyles.card, { padding, shadowColor: color }, style]}>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
});

// ─── Avatar ──────────────────────────────────────────────────────────────────
interface AvatarProps {
  name: string;
  color: string;
  size?: number;
  style?: ViewStyle;
}
export function Avatar({ name, color, size = 44, style }: AvatarProps) {
  const initials = name
    .trim()
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color + "18",
          borderWidth: 2,
          borderColor: color + "40",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text style={{ color, fontSize: size * 0.34, fontWeight: "800" }}>
        {initials}
      </Text>
    </View>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
interface ChipProps {
  children: string;
  color?: string;
  style?: ViewStyle;
}
export function Chip({ children, color = "#7c3aed", style }: ChipProps) {
  return (
    <View
      style={[
        {
          backgroundColor: color + "14",
          borderRadius: 8,
          paddingHorizontal: 9,
          paddingVertical: 4,
        },
        style,
      ]}
    >
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{children}</Text>
    </View>
  );
}

// ─── RoleBadge ───────────────────────────────────────────────────────────────
interface RoleBadgeProps {
  role: string;
  size?: "sm" | "md";
}
export function RoleBadge({ role, size = "md" }: RoleBadgeProps) {
  const color = ROLE_COLOR[role] ?? "#7c3aed";
  const label = ROLE_LABEL[role] ?? role;
  const fs = size === "sm" ? 10 : 12;
  const px = size === "sm" ? 8 : 11;
  const py = size === "sm" ? 3 : 5;
  return (
    <View
      style={{
        backgroundColor: color + "14",
        borderRadius: 8,
        paddingHorizontal: px,
        paddingVertical: py,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color, fontSize: fs, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { color: string; label: string }> = {
  confirmed: { color: "#10b981", label: "Confirmed" },
  completed: { color: "#10b981", label: "Completed" },
  released: { color: "#10b981", label: "Released" },
  open: { color: "#10b981", label: "Open" },
  available: { color: "#10b981", label: "Available" },
  pending: { color: "#f59e0b", label: "Pending" },
  requested: { color: "#f59e0b", label: "Requested" },
  busy: { color: "#f59e0b", label: "Busy" },
  inprogress: { color: "#7c3aed", label: "In Progress" },
  "in progress": { color: "#7c3aed", label: "In Progress" },
  accepted: { color: "#2563eb", label: "Accepted" },
  cancelled: { color: "#ef4444", label: "Cancelled" },
  disputed: { color: "#ef4444", label: "Disputed" },
  offline: { color: "#64748b", label: "Offline" },
  closed: { color: "#64748b", label: "Closed" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status.toLowerCase()] ?? {
    color: "#64748b",
    label: status,
  };
  return (
    <View
      style={{
        backgroundColor: s.color + "14",
        borderRadius: 8,
        paddingHorizontal: 9,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: s.color, fontSize: 11, fontWeight: "800" }}>
        {s.label}
      </Text>
    </View>
  );
}

// ─── Stars ───────────────────────────────────────────────────────────────────
export function Stars({ value, size = 12 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text
          key={i}
          style={{
            color: i <= rounded ? "#f59e0b" : "#e2e8f0",
            fontSize: size,
          }}
        >
          ★
        </Text>
      ))}
      <Text
        style={{
          color: "#64748b",
          fontSize: size - 1,
          fontWeight: "700",
          marginLeft: 3,
        }}
      >
        {value.toFixed(1)}
      </Text>
    </View>
  );
}

// ─── OrbBackground ───────────────────────────────────────────────────────────
interface OrbProps {
  color?: string;
  color2?: string;
}
export function OrbBackground({ color = "#7c3aed", color2 = "#0d9488" }: OrbProps) {
  return (
    <>
      <LinearGradient
        colors={[color + "10", "transparent"]}
        style={orbStyles.top}
      />
      <LinearGradient
        colors={[color2 + "08", "transparent"]}
        style={orbStyles.bottom}
      />
    </>
  );
}

const orbStyles = StyleSheet.create({
  top: {
    position: "absolute",
    top: -100,
    right: -70,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  bottom: {
    position: "absolute",
    bottom: -80,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
});

// ─── SectionRow ──────────────────────────────────────────────────────────────
interface SectionRowProps {
  title: string;
  right?: React.ReactNode;
  style?: ViewStyle;
}
export function SectionRow({ title, right, style }: SectionRowProps) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 16, fontWeight: "900", color: T.text }}>
        {title}
      </Text>
      {right}
    </View>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  value: string | number;
  label: string;
  color?: string;
}
export function StatCard({ value, label, color = "#7c3aed" }: StatCardProps) {
  return (
    <View style={[statStyles.card, { shadowColor: color }]}>
      <Text style={{ fontSize: 22, fontWeight: "900", color, letterSpacing: -0.5 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 10, fontWeight: "700", color: T.sub, marginTop: 3, textAlign: "center" }}>
        {label}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
});

// ─── DashHeader ──────────────────────────────────────────────────────────────
// Reusable white-theme dashboard header with avatar, name, stats
interface DashHeaderProps {
  name: string;
  roleLabel: string;
  roleColor: string;
  stats: Array<{ value: string | number; label: string }>;
  rightContent?: React.ReactNode;
  topPadding?: number;
}
export function DashHeader({
  name,
  roleLabel,
  roleColor,
  stats,
  rightContent,
  topPadding = 56,
}: DashHeaderProps) {
  return (
    <View style={[dhStyles.container, { paddingTop: topPadding }]}>
      <LinearGradient
        colors={[roleColor + "12", "transparent"]}
        style={dhStyles.orb}
      />
      <View style={dhStyles.topRow}>
        <Avatar name={name} color={roleColor} size={48} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <RoleBadge role={roleLabel.toLowerCase().replace(" ", "")} size="sm" />
          <Text
            numberOfLines={1}
            style={{ fontSize: 17, fontWeight: "900", color: T.text, marginTop: 3 }}
          >
            {name}
          </Text>
        </View>
        {rightContent}
      </View>
      {stats.length > 0 && (
        <View style={dhStyles.statsRow}>
          {stats.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={dhStyles.divider} />}
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 20, fontWeight: "900", color: roleColor }}>
                  {s.value}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: "700", color: T.sub, marginTop: 2 }}>
                  {s.label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const dhStyles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  orb: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  divider: {
    width: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 4,
  },
});
