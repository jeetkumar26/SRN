import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { customFetch } from "@workspace/api-client-react";
import {
  useListRequirements,
  useUpdateQuoteStatus,
} from "@workspace/api-client-react";
import type { Requirement } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { Avatar, Card, RoleBadge, StatusBadge, SectionRow } from "../../components/ui";

type NavProp = StackNavigationProp<RootStackParamList>;

const ROLE_COLOR = "#7c3aed";

export default function BusinessDashboard() {
  const navigation = useNavigation<NavProp>();
  const { profile, signOut } = useAuth();

  const requirementsQuery = useListRequirements();
  const updateQuoteMutation = useUpdateQuoteStatus();
  const [expandedReq, setExpandedReq] = useState<string | null>(null);

  const handleLogOut = async () => {
    Alert.alert("Sign Out", "Sign out of SRN?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  const handleAcceptQuote = async (quoteId: string) => {
    try {
      await updateQuoteMutation.mutateAsync({ id: quoteId, data: { status: "accepted" } });
      Alert.alert("Accepted", "Bid accepted! Work agreement activated.");
      requirementsQuery.refetch();
    } catch {
      Alert.alert("Error", "Failed to accept bid.");
    }
  };

  if (!profile) return null;

  const myReqs = (requirementsQuery.data ?? []).filter((r) => r.creatorId === profile.uid);
  const openCount = myReqs.filter((r) => r.status === "open").length;
  const proposalCount = myReqs.filter((r) => r.status === "proposal_received").length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <LinearGradient colors={[ROLE_COLOR + "10", "transparent"]} style={styles.headerOrb} />
          <SafeAreaView>
            <View style={styles.topRow}>
              <Avatar name={profile.name} color={ROLE_COLOR} size={50} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.greeting}>Welcome back 👋</Text>
                <Text numberOfLines={1} style={styles.userName}>{profile.name}</Text>
                <RoleBadge role="business" size="sm" />
              </View>
              <View style={styles.headerActions}>
                <Pressable onPress={() => navigation.navigate("Notifications")} style={styles.iconBtn}>
                  <Feather name="bell" size={18} color="#475569" />
                </Pressable>
                <Pressable onPress={handleLogOut} style={styles.iconBtn}>
                  <Feather name="log-out" size={18} color="#475569" />
                </Pressable>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: ROLE_COLOR }]}>{myReqs.length}</Text>
                <Text style={styles.statLbl}>Active posts</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: ROLE_COLOR }]}>{openCount}</Text>
                <Text style={styles.statLbl}>Win gigs</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: "#f59e0b" }]}>{proposalCount}</Text>
                <Text style={styles.statLbl}>Proposals</Text>
              </View>
            </View>
          </SafeAreaView>
        </View>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <Pressable
            onPress={() => navigation.navigate("PostRequirement")}
            style={({ pressed }) => [styles.qaBtn, styles.qaBtnPrimary, { opacity: pressed ? 0.88 : 1 }]}
          >
            <LinearGradient colors={[ROLE_COLOR, "#6d28d9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.qaBtnGrad}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.qaBtnTextWhite}>Post Requirement</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("Search", {})}
            style={({ pressed }) => [styles.qaBtn, styles.qaBtnOutline, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Feather name="search" size={16} color={ROLE_COLOR} />
            <Text style={[styles.qaBtnText, { color: ROLE_COLOR }]}>Find Providers</Text>
          </Pressable>
        </View>

        {/* Requirements */}
        <View style={styles.section}>
          <SectionRow
            title="Your Requirements"
            right={
              <Pressable onPress={() => navigation.navigate("PostRequirement")} style={styles.newBtn}>
                <Feather name="plus" size={13} color={ROLE_COLOR} />
                <Text style={[styles.newBtnText, { color: ROLE_COLOR }]}>New</Text>
              </Pressable>
            }
          />

          {requirementsQuery.isLoading ? (
            <ActivityIndicator color={ROLE_COLOR} style={{ margin: 20 }} />
          ) : myReqs.length === 0 ? (
            <Card color={ROLE_COLOR} style={styles.emptyCard}>
              <Feather name="folder" size={32} color="#94a3b8" />
              <Text style={styles.emptyText}>No requirements posted yet.</Text>
              <Pressable onPress={() => navigation.navigate("PostRequirement")} style={[styles.emptyBtn, { backgroundColor: ROLE_COLOR }]}>
                <Text style={styles.emptyBtnText}>Post First Requirement</Text>
              </Pressable>
            </Card>
          ) : (
            myReqs.map((req) => (
              <RequirementCard
                key={req.id}
                req={req}
                expanded={expandedReq === req.id}
                onToggle={() => setExpandedReq(expandedReq === req.id ? null : req.id)}
                onAccept={handleAcceptQuote}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

interface FirestoreQuote {
  id: string; requirementId: string; senderId: string; senderName?: string; receiverId: string;
  amount: number; durationDays: number; status: string;
}

interface ReqCardProps {
  req: Requirement; expanded: boolean;
  onToggle: () => void; onAccept: (quoteId: string) => void;
}

function RequirementCard({ req, expanded, onToggle, onAccept }: ReqCardProps) {
  const navigation = useNavigation<NavProp>();
  const [quotes, setQuotes] = useState<FirestoreQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  React.useEffect(() => {
    if (!expanded) return;
    setLoadingQuotes(true);
    customFetch<{ items: FirestoreQuote[] }>(`/api/quotes?requirementId=${req.id}&limit=50`)
      .then((res) => setQuotes(res.items))
      .catch(() => {})
      .finally(() => setLoadingQuotes(false));
  }, [expanded, req.id]);

  return (
    <Card color={ROLE_COLOR} style={styles.reqCard}>
      <Pressable onPress={onToggle} style={styles.reqHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.reqTitle}>{req.title}</Text>
          <Text numberOfLines={2} style={styles.reqDesc}>{req.description}</Text>
          <View style={styles.reqMeta}>
            <Text style={[styles.reqBudget, { color: ROLE_COLOR }]}>
              ₹{req.minBudget}–₹{req.maxBudget}
            </Text>
            <View style={styles.reqCatPill}>
              <Text style={styles.reqCatText}>{req.category}</Text>
            </View>
          </View>
        </View>
        <View style={styles.reqRight}>
          <StatusBadge status={req.status ?? "open"} />
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color="#94a3b8"
            style={{ marginTop: 10 }}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.proposalsBox}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={styles.proposalsTitle}>Proposals</Text>
            <Pressable onPress={() => navigation.navigate("RequirementDetail", { requirementId: req.id })} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: ROLE_COLOR }}>Full Details</Text>
              <Feather name="external-link" size={12} color={ROLE_COLOR} />
            </Pressable>
          </View>
          {loadingQuotes ? (
            <ActivityIndicator color={ROLE_COLOR} size="small" style={{ marginVertical: 8 }} />
          ) : quotes.length === 0 ? (
            <Text style={styles.noProposals}>No proposals yet.</Text>
          ) : (
            quotes.map((q) => (
              <View key={q.id} style={styles.quoteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quoteSender}>Provider: {q.senderName || q.senderId.slice(0, 8) + "…"}</Text>
                  <Text style={styles.quoteDetail}>₹{q.amount} · {q.durationDays} days · {q.status}</Text>
                </View>
                {q.status === "pending" && (
                  <Pressable
                    onPress={() => onAccept(q.id)}
                    style={styles.acceptBtn}
                  >
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </Pressable>
                )}
              </View>
            ))
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: { paddingBottom: 48 },
  header: {
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
  headerOrb: { position: "absolute", top: -60, right: -40, width: 220, height: 220, borderRadius: 110 },
  topRow: { flexDirection: "row", alignItems: "center", paddingTop: 56, marginBottom: 18 },
  greeting: { fontSize: 12, fontWeight: "600", color: "#94a3b8", marginBottom: 2 },
  userName: { fontSize: 18, fontWeight: "900", color: "#0f172a", marginBottom: 5 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statItem: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  statLbl: { fontSize: 10, fontWeight: "700", color: "#94a3b8", marginTop: 3 },
  statDivider: { width: 1, backgroundColor: "#e2e8f0", marginVertical: 4 },
  quickActions: { flexDirection: "row", paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  qaBtn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  qaBtnPrimary: {
    shadowColor: ROLE_COLOR, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22, shadowRadius: 12, elevation: 4,
  },
  qaBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 46 },
  qaBtnTextWhite: { color: "#fff", fontSize: 13, fontWeight: "700" },
  qaBtnOutline: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 46,
    borderWidth: 1.5, borderColor: ROLE_COLOR + "50", backgroundColor: ROLE_COLOR + "08",
  },
  qaBtnText: { fontSize: 13, fontWeight: "700" },
  section: { paddingHorizontal: 20, paddingTop: 20 },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: ROLE_COLOR + "14", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  newBtnText: { fontSize: 12, fontWeight: "800" },
  emptyCard: { alignItems: "center", gap: 12, padding: 32 },
  emptyText: { fontSize: 13, fontWeight: "600", color: "#64748b", textAlign: "center" },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  reqCard: { marginBottom: 12, padding: 0 },
  reqHeader: { flexDirection: "row", padding: 16, gap: 12 },
  reqTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  reqDesc: { fontSize: 12, fontWeight: "500", color: "#64748b", lineHeight: 17, marginBottom: 8 },
  reqMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  reqBudget: { fontSize: 13, fontWeight: "800" },
  reqCatPill: { backgroundColor: "#f1f5f9", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  reqCatText: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  reqRight: { alignItems: "flex-end" },
  proposalsBox: { borderTopWidth: 1, borderTopColor: "#e2e8f0", padding: 14 },
  proposalsTitle: { fontSize: 13, fontWeight: "900", color: "#0f172a", marginBottom: 10 },
  noProposals: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  quoteRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#f8fafc", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#e2e8f0", marginBottom: 8,
  },
  quoteSender: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 2 },
  quoteDetail: { fontSize: 11, fontWeight: "500", color: "#64748b" },
  acceptBtn: { backgroundColor: "#10b981", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  acceptBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
