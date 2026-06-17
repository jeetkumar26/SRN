import React, { useEffect, useState, useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  ActivityIndicator, Alert, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RouteProp } from "@react-navigation/native";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { StatusBadge } from "../../components/ui";

type NavProp = StackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, "RequirementDetail">;

const ACCENT = "#7c3aed";

interface ReqData {
  id: string; creatorId: string; title: string; category: string;
  description: string; skillsNeeded?: string; minBudget: number;
  maxBudget: number; status?: string; urgency?: string; createdAt?: string;
}

interface QuoteData {
  id: string; requirementId: string; senderId: string; senderName?: string;
  receiverId: string; amount: number; durationDays: number;
  message?: string; status?: string; createdAt?: string;
}

export default function RequirementDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const { params } = useRoute<RouteType>();
  const { profile } = useAuth();

  const [req, setReq] = useState<ReqData | null>(null);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [loadingReq, setLoadingReq] = useState(true);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const isProvider = profile?.role === "digital" || profile?.role === "local";
  const isOwner = !!req && profile?.uid === req.creatorId;

  const fetchAll = useCallback(() => {
    setLoadingReq(true);
    setLoadingQuotes(true);

    customFetch<ReqData>(`/api/requirements/${params.requirementId}`)
      .then((r) => setReq(r))
      .catch(() => Alert.alert("Error", "Could not load requirement."))
      .finally(() => setLoadingReq(false));

    customFetch<{ items: QuoteData[] }>(`/api/quotes?requirementId=${params.requirementId}&limit=50`)
      .then((res) => setQuotes(res.items))
      .catch(() => {})
      .finally(() => setLoadingQuotes(false));
  }, [params.requirementId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleQuoteAction = async (quoteId: string, status: "accepted" | "rejected") => {
    setActingOn(quoteId);
    try {
      await customFetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (status === "accepted") Alert.alert("Hired!", "Provider hired — booking created.");
      fetchAll();
    } catch {
      Alert.alert("Error", `Failed to ${status === "accepted" ? "accept" : "reject"} bid.`);
    } finally {
      setActingOn(null);
    }
  };

  if (loadingReq) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingState}><ActivityIndicator color={ACCENT} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!req) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingState}>
          <Text style={styles.errorText}>Requirement not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canBid = isProvider && ["open", "active", "proposal_received"].includes(req.status ?? "");
  const myQuote = quotes.find((q) => q.senderId === profile?.uid);
  const openForAction = ["open", "active", "proposal_received", "shortlisted"].includes(req.status ?? "");

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Requirement</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Requirement details card */}
        <View style={styles.reqCard}>
          <View style={styles.metaRow}>
            <View style={styles.catPill}>
              <Text style={styles.catText}>{req.category}</Text>
            </View>
            <StatusBadge status={req.status ?? "open"} />
            {req.urgency && req.urgency !== "normal" && (
              <View style={[styles.urgencyPill, { backgroundColor: req.urgency === "urgent" ? "#fef2f2" : "#fffbeb" }]}>
                <Text style={[styles.urgencyText, { color: req.urgency === "urgent" ? "#dc2626" : "#d97706" }]}>
                  {req.urgency === "urgent" ? "⚡ Urgent" : "🔥 High priority"}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.reqTitle}>{req.title}</Text>
          <Text style={styles.reqDesc}>{req.description}</Text>

          {!!req.skillsNeeded && (
            <View style={styles.infoRow}>
              <Feather name="tag" size={13} color={ACCENT} />
              <Text style={styles.infoText}>{req.skillsNeeded}</Text>
            </View>
          )}

          <View style={styles.budgetBox}>
            <Feather name="dollar-sign" size={14} color={ACCENT} />
            <Text style={styles.budgetText}>
              ₹{req.minBudget.toLocaleString()} – ₹{req.maxBudget.toLocaleString()}
            </Text>
          </View>

          {req.createdAt && (
            <Text style={styles.dateText}>
              Posted {new Date(req.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </Text>
          )}
        </View>

        {/* Provider: bid CTA */}
        {canBid && (
          <View style={styles.bidCta}>
            {myQuote ? (
              <View style={styles.myBidBanner}>
                <Feather name="check-circle" size={16} color="#10b981" />
                <Text style={styles.myBidText}>
                  Your proposal: ₹{myQuote.amount.toLocaleString()} · {myQuote.durationDays}d · <Text style={{ textTransform: "capitalize" }}>{myQuote.status}</Text>
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => navigation.navigate("BidSubmit", {
                  requirementId: req.id,
                  requirementTitle: req.title,
                  receiverId: req.creatorId,
                  maxBudget: req.maxBudget,
                })}
                style={({ pressed }) => [styles.bidBtn, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Feather name="send" size={15} color="#fff" />
                <Text style={styles.bidBtnText}>Submit Proposal</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Owner: proposals list */}
        {isOwner && (
          <View style={styles.quotesSection}>
            <Text style={styles.sectionTitle}>Proposals ({quotes.length})</Text>

            {loadingQuotes ? (
              <ActivityIndicator color={ACCENT} style={{ margin: 16 }} />
            ) : quotes.length === 0 ? (
              <View style={styles.emptyQuotes}>
                <Feather name="inbox" size={28} color="#cbd5e1" />
                <Text style={styles.emptyQuotesText}>No proposals yet</Text>
              </View>
            ) : (
              quotes.map((q) => (
                <View key={q.id} style={styles.quoteCard}>
                  <View style={styles.quoteCardTop}>
                    <View style={styles.quoteAvatar}>
                      <Text style={styles.quoteAvatarText}>
                        {(q.senderName ?? "P")[0]?.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quoteSender}>{q.senderName ?? "Provider"}</Text>
                      <Text style={styles.quoteDetail}>
                        ₹{q.amount.toLocaleString()} · {q.durationDays} days
                      </Text>
                    </View>
                    <View style={[styles.qStatusPill, {
                      backgroundColor: q.status === "accepted" ? "#d1fae5"
                        : q.status === "rejected" ? "#fee2e2"
                        : "#fef9c3",
                    }]}>
                      <Text style={[styles.qStatusText, {
                        color: q.status === "accepted" ? "#065f46"
                          : q.status === "rejected" ? "#991b1b"
                          : "#92400e",
                      }]}>
                        {q.status ?? "pending"}
                      </Text>
                    </View>
                  </View>

                  {!!q.message && (
                    <Text style={styles.quoteMessage} numberOfLines={3}>{q.message}</Text>
                  )}

                  {q.status === "pending" && openForAction && (
                    <View style={styles.quoteActions}>
                      <Pressable
                        onPress={() => handleQuoteAction(q.id, "accepted")}
                        disabled={actingOn === q.id}
                        style={[styles.acceptBtn, actingOn === q.id && { opacity: 0.7 }]}
                      >
                        {actingOn === q.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.acceptBtnText}>Accept</Text>}
                      </Pressable>
                      <Pressable
                        onPress={() => handleQuoteAction(q.id, "rejected")}
                        disabled={!!actingOn}
                        style={styles.rejectBtn}
                      >
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => navigation.navigate("QuoteDetail", {
                          quoteId: q.id,
                          requirementId: req.id,
                          requirementTitle: req.title,
                          senderName: q.senderName ?? "Provider",
                          amount: q.amount,
                          durationDays: q.durationDays,
                          message: q.message,
                          status: q.status ?? "pending",
                          createdAt: q.createdAt,
                        })}
                        style={styles.detailBtn}
                      >
                        <Text style={styles.detailBtnText}>Details</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a", flex: 1, textAlign: "center", marginHorizontal: 8 },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  reqCard: {
    backgroundColor: "#fff", borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 18, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  catPill: { backgroundColor: ACCENT + "12", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  catText: { fontSize: 11, fontWeight: "800", color: ACCENT },
  urgencyPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  urgencyText: { fontSize: 11, fontWeight: "800" },
  reqTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a", lineHeight: 24 },
  reqDesc: { fontSize: 14, fontWeight: "500", color: "#475569", lineHeight: 22 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  infoText: { fontSize: 13, fontWeight: "600", color: "#64748b", flex: 1, lineHeight: 20 },
  budgetBox: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: ACCENT + "08", paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, alignSelf: "flex-start",
  },
  budgetText: { fontSize: 15, fontWeight: "900", color: ACCENT },
  dateText: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  bidCta: { gap: 0 },
  bidBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: ACCENT, borderRadius: 16, height: 52,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },
  bidBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  myBidBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#d1fae5", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "#6ee7b7",
  },
  myBidText: { fontSize: 13, fontWeight: "700", color: "#065f46", flex: 1 },
  quotesSection: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  emptyQuotes: { alignItems: "center", gap: 8, padding: 24, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#e2e8f0" },
  emptyQuotesText: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  quoteCard: {
    backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14, gap: 10,
  },
  quoteCardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  quoteAvatar: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: ACCENT + "14",
    alignItems: "center", justifyContent: "center",
  },
  quoteAvatarText: { fontSize: 16, fontWeight: "800", color: ACCENT },
  quoteSender: { fontSize: 13, fontWeight: "800", color: "#0f172a", marginBottom: 2 },
  quoteDetail: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  qStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  qStatusText: { fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  quoteMessage: { fontSize: 12, fontWeight: "500", color: "#475569", lineHeight: 18 },
  quoteActions: { flexDirection: "row", gap: 8 },
  acceptBtn: { flex: 1, backgroundColor: "#10b981", borderRadius: 10, height: 36, alignItems: "center", justifyContent: "center" },
  acceptBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  rejectBtn: { flex: 1, backgroundColor: "#fef2f2", borderRadius: 10, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#fca5a5" },
  rejectBtnText: { color: "#ef4444", fontSize: 12, fontWeight: "800" },
  detailBtn: { backgroundColor: "#f1f5f9", borderRadius: 10, height: 36, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  detailBtnText: { color: "#475569", fontSize: 12, fontWeight: "700" },
});