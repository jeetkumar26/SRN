import React, { useEffect, useState } from "react";
import {
  StyleSheet, Text, View, ScrollView, Pressable,
  ActivityIndicator, StatusBar, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";

const ROLE_COLOR = "#0d9488";

interface EarningRecord {
  id: string;
  requirementTitle: string;
  clientName: string;
  amount: number;
  status: "pending" | "released" | "disputed";
  completedAt: number;
}

const STATUS_CFG = {
  released: { label: "Released", color: "#10b981", bg: "#10b98114" },
  pending: { label: "Pending", color: "#d97706", bg: "#d9770614" },
  disputed: { label: "Disputed", color: "#ef4444", bg: "#ef444414" },
};

type Period = "week" | "month" | "all";

// ── Mini bar chart ───────────────────────────────────────────────────────────
function MiniBarChart({ records }: { records: EarningRecord[] }) {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return { label: d.toLocaleDateString("en-IN", { month: "short" }), month: d.getMonth(), year: d.getFullYear(), total: 0 };
  });

  records
    .filter((r) => r.status === "released")
    .forEach((r) => {
      const d = new Date(r.completedAt);
      const bucket = months.find((m) => m.month === d.getMonth() && m.year === d.getFullYear());
      if (bucket) bucket.total += r.amount;
    });

  const maxVal = Math.max(...months.map((m) => m.total), 1);

  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>Monthly Earnings</Text>
      <View style={chartStyles.bars}>
        {months.map((m, i) => {
          const height = Math.max((m.total / maxVal) * 72, 4);
          const isLast = i === months.length - 1;
          return (
            <View key={m.label} style={chartStyles.barCol}>
              <Text style={chartStyles.barVal}>
                {m.total > 0 ? `₹${(m.total / 1000).toFixed(0)}k` : ""}
              </Text>
              <View style={chartStyles.barTrack}>
                {isLast ? (
                  <LinearGradient
                    colors={[ROLE_COLOR, "#0f766e"]}
                    style={[chartStyles.bar, { height }]}
                  />
                ) : (
                  <View style={[chartStyles.bar, { height, backgroundColor: ROLE_COLOR + "50" }]} />
                )}
              </View>
              <Text style={[chartStyles.barLabel, isLast && { color: ROLE_COLOR, fontWeight: "800" }]}>
                {m.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 110 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  barTrack: { flex: 1, justifyContent: "flex-end", width: "100%" },
  bar: { width: "100%", borderRadius: 6 },
  barVal: { fontSize: 8, fontWeight: "700", color: "#64748b", textAlign: "center" },
  barLabel: { fontSize: 9, fontWeight: "600", color: "#94a3b8" },
});

// ── Main screen ──────────────────────────────────────────────────────────────
export default function EarningsScreen() {
  const { firebaseUser } = useAuth();
  const [records, setRecords] = useState<EarningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");

  useEffect(() => {
    if (!firebaseUser) return;
    customFetch<{ items: any[] }>("/api/bookings?status=completed&limit=50")
      .then((res) => {
        setRecords(
          res.items.map((b) => ({
            id: b.id,
            requirementTitle: b.requirementTitle ?? "Project",
            clientName: b.customerName ?? "Client",
            amount: b.amount ?? 0,
            status: (b.escrowStatus === "released"
              ? "released"
              : b.escrowStatus === "disputed"
              ? "disputed"
              : "pending") as EarningRecord["status"],
            completedAt: b.completedAt
              ? new Date(b.completedAt).getTime()
              : b.createdAt
              ? new Date(b.createdAt).getTime()
              : Date.now(),
          }))
        );
      })
      .catch((err) => console.error("[Earnings] fetch error:", err))
      .finally(() => setLoading(false));
  }, [firebaseUser]);

  const filterByPeriod = (r: EarningRecord) => {
    if (period === "all") return true;
    const now = Date.now();
    const diff = now - r.completedAt;
    if (period === "week") return diff < 7 * 24 * 60 * 60 * 1000;
    return diff < 30 * 24 * 60 * 60 * 1000;
  };

  const filtered = records.filter(filterByPeriod);
  const totalEarned = filtered.filter((r) => r.status === "released").reduce((s, r) => s + r.amount, 0);
  const pending = filtered.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount, 0);

  const handleWithdraw = () => {
    if (totalEarned === 0) {
      Alert.alert("No funds", "You have no released earnings to withdraw.");
      return;
    }
    Alert.alert(
      "Request Withdrawal",
      `Withdraw ₹${totalEarned.toLocaleString()} to your registered bank account?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Request", onPress: () => Alert.alert("Submitted", "Withdrawal request sent. Processing in 2–3 business days.") },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <Pressable onPress={handleWithdraw} style={styles.withdrawBtn}>
          <Feather name="arrow-up-circle" size={14} color="#fff" />
          <Text style={styles.withdrawText}>Withdraw</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={ROLE_COLOR} size="large" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* Period filter */}
          <View style={styles.periodRow}>
            {([["week", "This Week"], ["month", "This Month"], ["all", "All Time"]] as [Period, string][]).map(([p, label]) => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                style={[
                  styles.periodPill,
                  period === p && { backgroundColor: ROLE_COLOR, borderColor: ROLE_COLOR },
                ]}
              >
                <Text style={[styles.periodText, period === p && { color: "#fff" }]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Hero summary card */}
          <LinearGradient
            colors={[ROLE_COLOR, "#0f766e"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <LinearGradient
              colors={["rgba(255,255,255,0.15)", "transparent"]}
              style={styles.heroShine}
            />
            <Text style={styles.heroLabel}>Total Released</Text>
            <Text style={styles.heroAmount}>₹{totalEarned.toLocaleString()}</Text>
            <View style={styles.heroRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>₹{pending.toLocaleString()}</Text>
                <Text style={styles.heroStatLbl}>In Escrow</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{filtered.length}</Text>
                <Text style={styles.heroStatLbl}>Projects</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>
                  {filtered.length > 0
                    ? `₹${Math.round(totalEarned / Math.max(filtered.length, 1)).toLocaleString()}`
                    : "₹0"}
                </Text>
                <Text style={styles.heroStatLbl}>Avg / Project</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Summary chips */}
          <View style={styles.summaryRow}>
            {[
              { icon: "trending-up", color: "#10b981", label: "Released", value: `₹${totalEarned.toLocaleString()}` },
              { icon: "clock", color: "#d97706", label: "In Escrow", value: `₹${pending.toLocaleString()}` },
              { icon: "briefcase", color: ROLE_COLOR, label: "Projects", value: filtered.length.toString() },
            ].map((s) => (
              <View key={s.label} style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: s.color + "14" }]}>
                  <Feather name={s.icon as any} size={16} color={s.color} />
                </View>
                <Text style={[styles.summaryAmount, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.summaryLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Monthly chart — always shows all-time data */}
          <View style={styles.chartCard}>
            <MiniBarChart records={records} />
          </View>

          {/* Transaction list */}
          <Text style={styles.sectionTitle}>Transaction History</Text>

          {filtered.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Feather name="dollar-sign" size={28} color="#94a3b8" />
              </View>
              <Text style={styles.emptyText}>No completed projects for this period.</Text>
            </View>
          ) : (
            filtered.map((r) => {
              const cfg = STATUS_CFG[r.status];
              return (
                <View key={r.id} style={styles.txRow}>
                  <View style={[styles.txIcon, { backgroundColor: ROLE_COLOR + "14" }]}>
                    <Feather name="check-circle" size={16} color={ROLE_COLOR} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txTitle} numberOfLines={1}>{r.requirementTitle}</Text>
                    <Text style={styles.txClient}>
                      {r.clientName} · {new Date(r.completedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={styles.txAmount}>+₹{r.amount.toLocaleString()}</Text>
                    <View style={[styles.txStatus, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.txStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  withdrawBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: ROLE_COLOR, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
  },
  withdrawText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 48, gap: 14 },

  periodRow: { flexDirection: "row", gap: 8 },
  periodPill: {
    flex: 1, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5,
    borderColor: "#e2e8f0", backgroundColor: "#f8fafc", alignItems: "center",
  },
  periodText: { fontSize: 11, fontWeight: "700", color: "#64748b" },

  heroCard: {
    borderRadius: 22, padding: 20, gap: 14,
    shadowColor: ROLE_COLOR, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
    overflow: "hidden",
  },
  heroShine: {
    position: "absolute", top: 0, left: 0, right: 0, height: 60,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
  },
  heroLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.5 },
  heroAmount: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  heroRow: { flexDirection: "row", alignItems: "center" },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatVal: { fontSize: 16, fontWeight: "900", color: "#fff" },
  heroStatLbl: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.7)", marginTop: 2 },
  heroStatDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.25)" },

  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: {
    flex: 1, backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 12, alignItems: "center", gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  summaryIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  summaryAmount: { fontSize: 15, fontWeight: "900" },
  summaryLabel: { fontSize: 9, fontWeight: "700", color: "#94a3b8", textAlign: "center" },

  chartCard: {
    backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },

  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  emptyCard: {
    backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 32, alignItems: "center", gap: 12,
  },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 13, fontWeight: "600", color: "#94a3b8", textAlign: "center", lineHeight: 20 },

  txRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 12, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  txIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  txInfo: { flex: 1 },
  txTitle: { fontSize: 13, fontWeight: "700", color: "#0f172a", marginBottom: 2 },
  txClient: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  txAmount: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  txStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  txStatusText: { fontSize: 9, fontWeight: "800" },
});
