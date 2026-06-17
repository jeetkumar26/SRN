import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  ActivityIndicator, Share, Clipboard, StatusBar, Alert,
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

interface ReferralCode { code: string; expiresAt?: string }
interface ReferralStats {
  totalReferred: number;
  successfulConversions: number;
  creditsEarned: number;
  pendingCredits: number;
}
interface LeaderboardEntry {
  rank: number;
  name: string;
  referredCount: number;
  creditsEarned: number;
  isCurrentUser?: boolean;
}

export default function ReferralsScreen() {
  const navigation = useNavigation<NavProp>();
  const { role } = useAuth();
  const roleColor = role ? ROLE_COLORS[role] : "#7c3aed";

  const [codeData, setCodeData] = useState<ReferralCode | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [codeRes, statsRes, lbRes] = await Promise.allSettled([
        customFetch<ReferralCode>("/api/referrals/my-code"),
        customFetch<ReferralStats>("/api/referrals/stats"),
        customFetch<{ leaderboard: LeaderboardEntry[] }>("/api/referrals/leaderboard"),
      ]);
      if (codeRes.status === "fulfilled") setCodeData(codeRes.value);
      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      if (lbRes.status === "fulfilled") setLeaderboard(lbRes.value.leaderboard ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleCopy = useCallback(() => {
    if (!codeData?.code) return;
    Clipboard.setString(codeData.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codeData]);

  const handleShare = useCallback(async () => {
    if (!codeData?.code) return;
    try {
      await Share.share({
        message: `Join SRN — the Skill Requirement Network! Use my referral code ${codeData.code} to get started and we both earn credits. Download the app today.`,
        title: "Join SRN with my referral code",
      });
    } catch {
      // user dismissed share sheet
    }
  }, [codeData]);

  const medal = (rank: number) => {
    if (rank === 1) return { icon: "award", color: "#f59e0b" };
    if (rank === 2) return { icon: "award", color: "#94a3b8" };
    if (rank === 3) return { icon: "award", color: "#cd7c2f" };
    return { icon: "user", color: "#94a3b8" };
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Referrals</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={roleColor} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Referral code card */}
          <View style={[styles.codeCard, { borderColor: roleColor + "30" }]}>
            <View style={[styles.codeGlow, { backgroundColor: roleColor + "08" }]} />
            <View style={[styles.codeIconWrap, { backgroundColor: roleColor + "14" }]}>
              <Feather name="gift" size={24} color={roleColor} />
            </View>
            <Text style={styles.codeTitle}>Your Referral Code</Text>
            <Text style={styles.codeSubtitle}>Invite friends to join SRN</Text>

            <Pressable onPress={handleCopy} style={[styles.codeBlock, { borderColor: roleColor + "40" }]}>
              <Text style={[styles.codeText, { color: roleColor }]}>{codeData?.code ?? "—"}</Text>
              <Feather name={copied ? "check" : "copy"} size={18} color={copied ? "#10b981" : roleColor} />
            </Pressable>

            <View style={styles.codeActions}>
              <Pressable onPress={handleCopy} style={[styles.codeBtn, { backgroundColor: roleColor + "12" }]}>
                <Feather name={copied ? "check" : "copy"} size={14} color={roleColor} />
                <Text style={[styles.codeBtnText, { color: roleColor }]}>{copied ? "Copied!" : "Copy"}</Text>
              </Pressable>
              <Pressable onPress={handleShare} style={[styles.codeBtn, { backgroundColor: roleColor }]}>
                <Feather name="share-2" size={14} color="#fff" />
                <Text style={[styles.codeBtnText, { color: "#fff" }]}>Share</Text>
              </Pressable>
            </View>
          </View>

          {/* Stats */}
          {stats && (
            <>
              <Text style={styles.sectionTitle}>Your Stats</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: roleColor }]}>{stats.totalReferred}</Text>
                  <Text style={styles.statLabel}>Invited</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: "#10b981" }]}>{stats.successfulConversions}</Text>
                  <Text style={styles.statLabel}>Joined</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: "#f59e0b" }]}>₹{stats.creditsEarned.toLocaleString("en-IN")}</Text>
                  <Text style={styles.statLabel}>Earned</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: "#94a3b8" }]}>₹{stats.pendingCredits.toLocaleString("en-IN")}</Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>
              </View>
            </>
          )}

          {/* How it works */}
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.howCard}>
            {[
              { step: "1", text: "Share your code with friends and colleagues", icon: "share-2" },
              { step: "2", text: "They sign up and complete their profile", icon: "user-check" },
              { step: "3", text: "Both of you earn platform credits", icon: "gift" },
            ].map((item) => (
              <View key={item.step} style={styles.howRow}>
                <View style={[styles.howStep, { backgroundColor: roleColor }]}>
                  <Text style={styles.howStepText}>{item.step}</Text>
                </View>
                <View style={[styles.howIcon, { backgroundColor: roleColor + "14" }]}>
                  <Feather name={item.icon as any} size={14} color={roleColor} />
                </View>
                <Text style={styles.howText}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Top Referrers</Text>
              <View style={styles.lbCard}>
                {leaderboard.slice(0, 10).map((entry, idx) => {
                  const m = medal(entry.rank);
                  return (
                    <View key={idx} style={[styles.lbRow, entry.isCurrentUser && { backgroundColor: roleColor + "08" }]}>
                      <View style={[styles.lbRankWrap, { backgroundColor: m.color + "18" }]}>
                        <Feather name={m.icon as any} size={12} color={m.color} />
                        <Text style={[styles.lbRank, { color: m.color }]}>#{entry.rank}</Text>
                      </View>
                      <Text style={[styles.lbName, entry.isCurrentUser && { color: roleColor }]} numberOfLines={1}>
                        {entry.name} {entry.isCurrentUser ? "(You)" : ""}
                      </Text>
                      <View style={styles.lbRight}>
                        <Text style={styles.lbCount}>{entry.referredCount} invited</Text>
                        <Text style={[styles.lbCredits, { color: "#10b981" }]}>₹{entry.creditsEarned.toLocaleString()}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 14 },

  codeCard: {
    backgroundColor: "#fff", borderRadius: 24,
    borderWidth: 1.5, padding: 24,
    alignItems: "center", gap: 10, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  codeGlow: { position: "absolute", top: 0, left: 0, right: 0, height: 120, borderRadius: 24 },
  codeIconWrap: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  codeTitle: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  codeSubtitle: { fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 4 },
  codeBlock: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 2, borderRadius: 16, borderStyle: "dashed",
    paddingHorizontal: 20, paddingVertical: 14, width: "100%", justifyContent: "center",
  },
  codeText: { fontSize: 22, fontWeight: "900", letterSpacing: 3 },
  codeActions: { flexDirection: "row", gap: 10, width: "100%", marginTop: 4 },
  codeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 14,
  },
  codeBtnText: { fontSize: 14, fontWeight: "800" },

  sectionTitle: {
    fontSize: 10, fontWeight: "700", color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  statsGrid: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14, alignItems: "center", gap: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  statValue: { fontSize: 20, fontWeight: "900" },
  statLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8" },

  howCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  howRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  howStep: {
    width: 24, height: 24, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  howStepText: { fontSize: 11, fontWeight: "900", color: "#fff" },
  howIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  howText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#334155" },

  lbCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  lbRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  lbRankWrap: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  lbRank: { fontSize: 10, fontWeight: "800" },
  lbName: { flex: 1, fontSize: 13, fontWeight: "700", color: "#0f172a" },
  lbRight: { alignItems: "flex-end", gap: 2 },
  lbCount: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  lbCredits: { fontSize: 12, fontWeight: "800" },
});