import React, { useState } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  TextInput, ActivityIndicator, Alert, StatusBar, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { useListRequirements, useCreateQuote } from "@workspace/api-client-react";
import type { Requirement } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { Avatar, Card, RoleBadge, Chip, StatusBadge, SectionRow } from "../../components/ui";

type NavProp = StackNavigationProp<RootStackParamList>;

const ROLE_COLOR = "#0d9488";

export default function DigitalProviderDashboard() {
  const navigation = useNavigation<NavProp>();
  const { profile, signOut } = useAuth();

  const [selectedReq, setSelectedReq] = useState<Requirement | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidDuration, setBidDuration] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [bidError, setBidError] = useState("");

  const requirementsQuery = useListRequirements();
  const createQuoteMutation = useCreateQuote();

  const handleLogOut = () => {
    Alert.alert("Sign Out", "Sign out of SRN?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  const handlePlaceBid = async () => {
    if (!bidAmount.trim() || !bidDuration.trim()) {
      setBidError("Please enter amount and duration.");
      return;
    }
    if (!profile || !selectedReq) return;
    setSubmittingBid(true);
    setBidError("");
    try {
      await createQuoteMutation.mutateAsync({
        data: {
          requirementId: selectedReq.id,
          senderId: profile.uid,
          receiverId: selectedReq.creatorId,
          amount: parseInt(bidAmount, 10),
          durationDays: parseInt(bidDuration, 10),
        },
      });
      Alert.alert("Bid Placed!", "Your proposal has been submitted.");
      setBidAmount(""); setBidDuration("");
      setSelectedReq(null);
    } catch {
      setBidError("Failed to submit bid. Try again.");
    } finally {
      setSubmittingBid(false);
    }
  };

  if (!profile) return null;

  // Only show truly open requirements — exclude 'active' (bid already accepted)
  const openReqs = (requirementsQuery.data ?? []).filter(
    (r) => r.status === "open" || r.status == null
  );

  const skills = typeof profile.skills === "string"
    ? (profile.skills as string).split(",").map((s: string) => s.trim()).filter(Boolean)
    : (profile.skills as string[] | undefined) ?? [];

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
                <Text style={styles.greeting}>{profile.title ?? "Digital Provider"}</Text>
                <Text numberOfLines={1} style={styles.userName}>{profile.name}</Text>
                <RoleBadge role="digital" size="sm" />
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

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: ROLE_COLOR }]}>{openReqs.length}</Text>
                <Text style={styles.statLbl}>Active gigs</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: ROLE_COLOR }]}>{profile.reviewsCount ?? 0}</Text>
                <Text style={styles.statLbl}>Reviews</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: "#f59e0b" }]}>{profile.rating?.toFixed(1) ?? "5.0"}</Text>
                <Text style={styles.statLbl}>Rating</Text>
              </View>
            </View>
          </SafeAreaView>
        </View>

        {/* Skills chips */}
        {skills.length > 0 && (
          <View style={styles.skillsSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.skillsScroll}>
              {skills.slice(0, 8).map((s) => (
                <Chip key={s} color={ROLE_COLOR}>{s}</Chip>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Analytics banner */}
        <View style={styles.section}>
          <Pressable
            onPress={() => navigation.navigate("Analytics")}
            style={({ pressed }) => [styles.analyticsBanner, { opacity: pressed ? 0.88 : 1 }]}
          >
            <View style={[styles.analyticsBannerIcon, { backgroundColor: ROLE_COLOR + "18" }]}>
              <Feather name="bar-chart-2" size={20} color={ROLE_COLOR} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.analyticsBannerTitle}>View Your Analytics</Text>
              <Text style={styles.analyticsBannerSub}>Earnings, win rate, profile views</Text>
            </View>
            <Feather name="chevron-right" size={18} color={ROLE_COLOR} />
          </Pressable>
        </View>

        {/* Open gigs */}
        <View style={styles.section}>
          <SectionRow
            title="Open gigs for you"
            right={
              <Pressable onPress={() => requirementsQuery.refetch()} style={styles.filterBtn}>
                <Feather name="filter" size={13} color={ROLE_COLOR} />
                <Text style={[styles.filterText, { color: ROLE_COLOR }]}>Filters</Text>
              </Pressable>
            }
          />

          {requirementsQuery.isLoading ? (
            <ActivityIndicator color={ROLE_COLOR} style={{ margin: 20 }} />
          ) : openReqs.length === 0 ? (
            <Card color={ROLE_COLOR} style={{ alignItems: "center", padding: 28 }}>
              <Feather name="briefcase" size={28} color="#94a3b8" />
              <Text style={styles.emptyText}>No open gigs right now.</Text>
            </Card>
          ) : (
            openReqs.map((req) => (
              <GigCard
                key={req.id}
                req={req}
                onBid={() => setSelectedReq(req)}
                onViewDetail={() => navigation.navigate("RequirementDetail", { requirementId: req.id })}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Bid modal */}
      <Modal visible={!!selectedReq} animationType="slide" transparent onRequestClose={() => setSelectedReq(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedReq(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            {selectedReq && (
              <>
                <Text style={styles.modalTitle} numberOfLines={2}>{selectedReq.title}</Text>
                <View style={styles.budgetRow}>
                  <Feather name="dollar-sign" size={14} color={ROLE_COLOR} />
                  <Text style={[styles.budgetText, { color: ROLE_COLOR }]}>
                    Budget: ₹{selectedReq.minBudget}–₹{selectedReq.maxBudget}
                  </Text>
                </View>
                <View style={{ gap: 12, marginTop: 16 }}>
                  <TextInput
                    value={bidAmount}
                    onChangeText={setBidAmount}
                    placeholder="Your bid amount (₹)"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    style={styles.modalInput}
                  />
                  <TextInput
                    value={bidDuration}
                    onChangeText={setBidDuration}
                    placeholder="Duration (days)"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    style={styles.modalInput}
                  />
                  {!!bidError && <Text style={styles.errorText}>{bidError}</Text>}
                  <Pressable
                    onPress={handlePlaceBid}
                    disabled={submittingBid}
                    style={[styles.bidSubmit, { opacity: submittingBid ? 0.8 : 1 }]}
                  >
                    <LinearGradient colors={[ROLE_COLOR, "#0f766e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bidGrad}>
                      {submittingBid ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <Feather name="send" size={15} color="#fff" />
                          <Text style={styles.bidBtnText}>Place Bid</Text>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function GigCard({ req, onBid, onViewDetail }: { req: Requirement; onBid: () => void; onViewDetail: () => void }) {
  const skills = (req.skillsNeeded ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  return (
    <Card color={ROLE_COLOR} style={styles.gigCard}>
      <Pressable onPress={onViewDetail}>
        <View style={styles.gigHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.gigTitle} numberOfLines={2}>{req.title}</Text>
            <Text style={styles.gigDesc} numberOfLines={2}>{req.description}</Text>
          </View>
          <StatusBadge status={req.status ?? "open"} />
        </View>
        {skills.length > 0 && (
          <View style={styles.skillsRow}>
            {skills.slice(0, 3).map((s) => (
              <Chip key={s} color={ROLE_COLOR}>{s}</Chip>
            ))}
          </View>
        )}
      </Pressable>
      <View style={styles.gigFooter}>
        <Text style={[styles.gigBudget, { color: ROLE_COLOR }]}>₹{req.minBudget}–₹{req.maxBudget}</Text>
        <Pressable onPress={onBid} style={styles.bidBtn}>
          <LinearGradient colors={[ROLE_COLOR, "#0f766e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bidBtnGrad}>
            <Feather name="send" size={13} color="#fff" />
            <Text style={styles.bidBtnText}>Place bid</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: { paddingBottom: 48 },
  header: {
    backgroundColor: "#ffffff", paddingHorizontal: 20, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: "#e2e8f0", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  headerOrb: { position: "absolute", top: -60, right: -40, width: 220, height: 220, borderRadius: 110 },
  topRow: { flexDirection: "row", alignItems: "center", paddingTop: 56, marginBottom: 18 },
  greeting: { fontSize: 12, fontWeight: "600", color: "#94a3b8", marginBottom: 2 },
  userName: { fontSize: 18, fontWeight: "900", color: "#0f172a", marginBottom: 5 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  statsRow: { flexDirection: "row", backgroundColor: "#f8fafc", borderRadius: 16, paddingVertical: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  statItem: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  statLbl: { fontSize: 10, fontWeight: "700", color: "#94a3b8", marginTop: 3 },
  statDivider: { width: 1, backgroundColor: "#e2e8f0", marginVertical: 4 },
  skillsSection: { paddingVertical: 12, paddingLeft: 20 },
  skillsScroll: { gap: 8, paddingRight: 20 },
  section: { paddingHorizontal: 20, paddingTop: 16 },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: ROLE_COLOR + "14", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  filterText: { fontSize: 12, fontWeight: "700" },
  emptyText: { fontSize: 13, fontWeight: "600", color: "#94a3b8", marginTop: 10 },
  gigCard: { marginBottom: 12, padding: 14, gap: 10 },
  gigHeader: { flexDirection: "row", gap: 10 },
  gigTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  gigDesc: { fontSize: 12, fontWeight: "500", color: "#64748b", lineHeight: 16 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  gigFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  gigBudget: { fontSize: 13, fontWeight: "800", flex: 1 },
  bidBtn: { borderRadius: 10, overflow: "hidden", shadowColor: ROLE_COLOR, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  bidBtnGrad: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 36 },
  bidBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.4)" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0", alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a", marginBottom: 8 },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  budgetText: { fontSize: 13, fontWeight: "700" },
  modalInput: { backgroundColor: "#f8fafc", borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 14, paddingHorizontal: 14, height: 50, fontSize: 14, fontWeight: "600", color: "#0f172a" },
  errorText: { fontSize: 12, fontWeight: "600", color: "#ef4444" },
  bidSubmit: { borderRadius: 14, overflow: "hidden", shadowColor: ROLE_COLOR, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
  bidGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50 },
  analyticsBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1.5, borderColor: ROLE_COLOR + "30",
    padding: 14, marginBottom: 4,
    shadowColor: ROLE_COLOR, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  analyticsBannerIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  analyticsBannerTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  analyticsBannerSub: { fontSize: 11, fontWeight: "600", color: "#64748b", marginTop: 2 },
});
