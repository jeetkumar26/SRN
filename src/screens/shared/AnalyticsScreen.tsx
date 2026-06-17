import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  ActivityIndicator, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import { ROLE_COLORS } from "../../types/roles";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;
type Period = "7d" | "30d" | "90d" | "all";

interface AnalyticsData {
  period: string;
  bids: {
    total: number;
    accepted: number;
    winRate: number;
    shortlisted: number;
  };
  earnings: {
    total: number;
    completedJobs: number;
    averageJobValue: number;
    byMonth: Array<{ month: string; amount: number }>;
  };
  leads: {
    received: number;
    viewed: number;
    applied: number;
    conversionRate: number;
  };
  profile: {
    views: number;
    uniqueViewers: number;
  };
}

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "all", label: "All Time" },
];

function MetricCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <View style={[styles.metricCard, { borderColor: color + "22" }]}>
      <View style={[styles.metricIcon, { backgroundColor: color + "14" }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {sub && <Text style={styles.metricSub}>{sub}</Text>}
    </View>
  );
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={styles.funnelRow}>
      <Text style={styles.funnelLabel}>{label}</Text>
      <View style={styles.funnelBarWrap}>
        <View style={[styles.funnelBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.funnelCount, { color }]}>{value}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const navigation = useNavigation<NavProp>();
  const { role } = useAuth();

  const roleColor = role ? ROLE_COLORS[role] : "#7c3aed";
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const fetchAnalytics = useCallback(async (p: Period) => {
    setLoading(true);
    setHasError(false);
    try {
      const res = await customFetch<AnalyticsData>(`/api/analytics/provider?period=${p}`);
      setData(res);
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(period);
  }, [period, fetchAnalytics]);

  const maxEarning = data
    ? Math.max(...data.earnings.byMonth.map((m) => m.amount), 1)
    : 1;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPeriod(p.key)}
            style={[styles.periodBtn, period === p.key && { backgroundColor: roleColor, borderColor: roleColor }]}
          >
            <Text style={[styles.periodText, period === p.key && { color: "#fff" }]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={roleColor} size="large" />
        </View>
      ) : hasError ? (
        <View style={styles.centerState}>
          <View style={styles.emptyIcon}>
            <Feather name="wifi-off" size={28} color="#94a3b8" />
          </View>
          <Text style={styles.errorText}>Could not load analytics</Text>
          <Pressable onPress={() => fetchAnalytics(period)} style={[styles.retryBtn, { backgroundColor: roleColor }]}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Bids section */}
          <Text style={styles.sectionTitle}>Bid Performance</Text>
          <View style={styles.metricsGrid}>
            <MetricCard
              icon="send"
              label="Total Bids"
              value={data.bids.total.toString()}
              color={roleColor}
            />
            <MetricCard
              icon="award"
              label="Win Rate"
              value={`${data.bids.winRate}%`}
              sub={`${data.bids.accepted} won`}
              color="#10b981"
            />
            <MetricCard
              icon="star"
              label="Shortlisted"
              value={data.bids.shortlisted.toString()}
              color="#f59e0b"
            />
            <MetricCard
              icon="x-circle"
              label="Not Won"
              value={(data.bids.total - data.bids.accepted - data.bids.shortlisted).toString()}
              color="#94a3b8"
            />
          </View>

          {/* Earnings section */}
          <Text style={styles.sectionTitle}>Earnings</Text>
          <View style={styles.earningsCard}>
            <View style={styles.earningsTop}>
              <View>
                <Text style={styles.earningsLabel}>Total Earnings</Text>
                <Text style={[styles.earningsTotal, { color: roleColor }]}>
                  ₹{data.earnings.total.toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={styles.earningsRight}>
                <View style={styles.earningsStat}>
                  <Text style={styles.earningsStatVal}>{data.earnings.completedJobs}</Text>
                  <Text style={styles.earningsStatLbl}>Jobs</Text>
                </View>
                <View style={[styles.earningsDivider]} />
                <View style={styles.earningsStat}>
                  <Text style={styles.earningsStatVal}>₹{data.earnings.averageJobValue.toLocaleString()}</Text>
                  <Text style={styles.earningsStatLbl}>Avg/Job</Text>
                </View>
              </View>
            </View>

            {/* Monthly bars */}
            {data.earnings.byMonth.length > 0 && (
              <View style={styles.monthlyChart}>
                <Text style={styles.chartTitle}>Monthly Breakdown</Text>
                {data.earnings.byMonth.slice(-6).map((m) => (
                  <View key={m.month} style={styles.monthRow}>
                    <Text style={styles.monthLabel}>{m.month.substring(5)}</Text>
                    <View style={styles.monthBarWrap}>
                      <View
                        style={[
                          styles.monthBarFill,
                          { width: `${Math.max(4, (m.amount / maxEarning) * 100)}%`, backgroundColor: roleColor },
                        ]}
                      />
                    </View>
                    <Text style={styles.monthAmount}>₹{(m.amount / 1000).toFixed(1)}k</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Lead funnel */}
          <Text style={styles.sectionTitle}>Lead Funnel</Text>
          <View style={styles.funnelCard}>
            <View style={styles.conversionRow}>
              <Text style={styles.conversionLabel}>Conversion Rate</Text>
              <Text style={[styles.conversionValue, { color: roleColor }]}>
                {data.leads.conversionRate}%
              </Text>
            </View>
            <View style={styles.funnelChart}>
              <FunnelBar
                label="Received"
                value={data.leads.received}
                max={data.leads.received}
                color="#94a3b8"
              />
              <FunnelBar
                label="Viewed"
                value={data.leads.viewed}
                max={data.leads.received}
                color="#f59e0b"
              />
              <FunnelBar
                label="Applied"
                value={data.leads.applied}
                max={data.leads.received}
                color={roleColor}
              />
              <FunnelBar
                label="Hired"
                value={data.bids.accepted}
                max={data.leads.received}
                color="#10b981"
              />
            </View>
          </View>

          {/* Profile visibility */}
          <Text style={styles.sectionTitle}>Profile Visibility</Text>
          <View style={styles.visibilityCard}>
            <View style={styles.visibilityStat}>
              <Feather name="eye" size={20} color={roleColor} />
              <Text style={[styles.visibilityNum, { color: roleColor }]}>{data.profile.views}</Text>
              <Text style={styles.visibilityLbl}>Total Views</Text>
            </View>
            <View style={styles.visibilityDivider} />
            <View style={styles.visibilityStat}>
              <Feather name="users" size={20} color="#10b981" />
              <Text style={[styles.visibilityNum, { color: "#10b981" }]}>{data.profile.uniqueViewers}</Text>
              <Text style={styles.visibilityLbl}>Unique Viewers</Text>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  periodRow: {
    flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  periodBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    alignItems: "center",
  },
  periodText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center",
  },
  errorText: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  scroll: { padding: 16, gap: 10 },
  sectionTitle: {
    fontSize: 10, fontWeight: "700", color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: 0.6,
    marginTop: 8, paddingHorizontal: 2,
  },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: {
    width: "47%", backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1.5, padding: 14, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  metricIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  metricLabel: { fontSize: 10, fontWeight: "600", color: "#94a3b8" },
  metricValue: { fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  metricSub: { fontSize: 10, fontWeight: "600", color: "#64748b" },

  earningsCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  earningsTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  earningsLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8", marginBottom: 4 },
  earningsTotal: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  earningsRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  earningsStat: { alignItems: "center", gap: 2 },
  earningsStatVal: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  earningsStatLbl: { fontSize: 9, fontWeight: "700", color: "#94a3b8" },
  earningsDivider: { width: 1, height: 30, backgroundColor: "#e2e8f0" },
  monthlyChart: { gap: 8 },
  chartTitle: { fontSize: 11, fontWeight: "700", color: "#64748b", marginBottom: 4 },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthLabel: { width: 28, fontSize: 10, fontWeight: "700", color: "#64748b" },
  monthBarWrap: { flex: 1, height: 10, borderRadius: 5, backgroundColor: "#f1f5f9", overflow: "hidden" },
  monthBarFill: { height: "100%", borderRadius: 5 },
  monthAmount: { width: 46, fontSize: 10, fontWeight: "700", color: "#475569", textAlign: "right" },

  funnelCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  conversionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  conversionLabel: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  conversionValue: { fontSize: 20, fontWeight: "900" },
  funnelChart: { gap: 10 },
  funnelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  funnelLabel: { width: 64, fontSize: 11, fontWeight: "600", color: "#64748b" },
  funnelBarWrap: { flex: 1, height: 10, borderRadius: 5, backgroundColor: "#f1f5f9", overflow: "hidden" },
  funnelBarFill: { height: "100%", borderRadius: 5 },
  funnelCount: { width: 28, fontSize: 12, fontWeight: "800", textAlign: "right" },

  visibilityCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, flexDirection: "row",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  visibilityStat: { flex: 1, alignItems: "center", gap: 8 },
  visibilityNum: { fontSize: 28, fontWeight: "900" },
  visibilityLbl: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  visibilityDivider: { width: 1, backgroundColor: "#e2e8f0", marginVertical: 8 },
});