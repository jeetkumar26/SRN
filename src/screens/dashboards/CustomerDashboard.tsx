import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  TextInput, ActivityIndicator, Alert, StatusBar, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { useCreateRequirement, useListUsers, customFetch } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { Avatar, Card, RoleBadge, Stars, SectionRow } from "../../components/ui";

type NavProp = StackNavigationProp<RootStackParamList>;

const ROLE_COLOR = "#2563eb";

export default function CustomerDashboard() {
  const navigation = useNavigation<NavProp>();
  const { profile, signOut, firebaseUser } = useAuth();

  const [custTitle, setCustTitle] = useState("");
  const [custDesc, setCustDesc] = useState("");
  const [custMinBudget, setCustMinBudget] = useState("100");
  const [custMaxBudget, setCustMaxBudget] = useState("500");
  const [postingReq, setPostingReq] = useState(false);
  const [custError, setCustError] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [myRequirements, setMyRequirements] = useState<Array<{ id: string; title: string; status: string; maxBudget: number; quotesCount?: number }>>([]);
  const [reqsLoading, setReqsLoading] = useState(false);

  const fetchMyRequirements = useCallback(async (uid: string) => {
    setReqsLoading(true);
    try {
      const res = await customFetch<{ requirements: Array<{ id: string; title: string; status: string; maxBudget: number; quotesCount?: number }> }>(
        `/api/requirements?creatorId=${uid}&limit=10`
      );
      setMyRequirements(res.requirements ?? []);
    } catch {
      // non-critical — silently ignore
    } finally {
      setReqsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.uid) fetchMyRequirements(profile.uid);
  }, [profile?.uid, fetchMyRequirements]);

  const createRequirementMutation = useCreateRequirement();
  const localProvidersQuery = useListUsers({ role: "local" });

  const handleLogOut = () => {
    Alert.alert("Sign Out", "Sign out of SRN?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  const handlePostGig = async () => {
    if (!custTitle.trim() || !custDesc.trim()) {
      setCustError("Please enter title and description.");
      return;
    }
    if (!profile) return;
    setPostingReq(true);
    setCustError("");
    try {
      await createRequirementMutation.mutateAsync({
        data: {
          creatorId: profile.uid,
          title: custTitle.trim(),
          category: "Local Services",
          description: custDesc.trim(),
          minBudget: parseInt(custMinBudget, 10) || 100,
          maxBudget: parseInt(custMaxBudget, 10) || 500,
        },
      });
      Alert.alert("Posted!", "Your requirement is now live.");
      setCustTitle(""); setCustDesc("");
      setShowModal(false);
    } catch {
      setCustError("Failed to post requirement. Try again.");
    } finally {
      setPostingReq(false);
    }
  };

  if (!profile) return null;

  const providers: User[] = localProvidersQuery.data ?? [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning 👋" : hour < 17 ? "Good afternoon 👋" : "Good evening 👋";

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
                <Text style={styles.greeting}>{greeting}</Text>
                <Text numberOfLines={1} style={styles.userName}>{profile.name}</Text>
                <RoleBadge role="customer" size="sm" />
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
                <Text style={[styles.statVal, { color: ROLE_COLOR }]}>{providers.length}</Text>
                <Text style={styles.statLbl}>Providers</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: "#f59e0b" }]}>{profile.postedRequirementsCount ?? 0}</Text>
                <Text style={styles.statLbl}>Posted</Text>
              </View>
            </View>
          </SafeAreaView>
        </View>

        {/* Quick post card */}
        <View style={styles.section}>
          <Card color={ROLE_COLOR} style={styles.postCard}>
            <Text style={styles.postCardTitle}>What do you need done?</Text>
            <Pressable
              onPress={() => setShowModal(true)}
              style={styles.postInput}
            >
              <Feather name="edit-3" size={15} color="#94a3b8" />
              <Text style={styles.postInputPlaceholder}>Describe your requirement…</Text>
            </Pressable>
            <View style={styles.postActions}>
              <Pressable
                onPress={() => setShowModal(true)}
                style={styles.postBtnPrimary}
              >
                <LinearGradient colors={[ROLE_COLOR, "#1d4ed8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.postBtnGrad}>
                  <Feather name="plus" size={14} color="#fff" />
                  <Text style={styles.postBtnText}>Post requirement</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("Search", {})}
                style={styles.postBtnSecondary}
              >
                <Feather name="map-pin" size={14} color={ROLE_COLOR} />
                <Text style={[styles.postBtnText, { color: ROLE_COLOR }]}>Nearby</Text>
              </Pressable>
            </View>
          </Card>
        </View>

        {/* Local providers */}
        <View style={styles.section}>
          <SectionRow
            title="Local providers near you"
            right={
              <Pressable onPress={() => navigation.navigate("Search", { query: "local" })}>
                <Text style={[styles.seeAll, { color: ROLE_COLOR }]}>See all</Text>
              </Pressable>
            }
          />
          {localProvidersQuery.isLoading ? (
            <ActivityIndicator color={ROLE_COLOR} style={{ margin: 16 }} />
          ) : providers.length === 0 ? (
            <Card color={ROLE_COLOR} style={{ alignItems: "center", padding: 24 }}>
              <Feather name="map-pin" size={28} color="#94a3b8" />
              <Text style={styles.emptyText}>No local providers found.</Text>
            </Card>
          ) : (
            providers.slice(0, 5).map((u) => (
              <ProviderCard key={u.id} user={u} navigation={navigation} firebaseUser={firebaseUser} />
            ))
          )}
        </View>

        {/* My Requirements */}
        <View style={styles.section}>
          <SectionRow
            title="My requirements"
            right={
              reqsLoading ? (
                <ActivityIndicator color={ROLE_COLOR} size="small" />
              ) : (
                <Pressable onPress={() => profile?.uid && fetchMyRequirements(profile.uid)}>
                  <Text style={[styles.seeAll, { color: ROLE_COLOR }]}>Refresh</Text>
                </Pressable>
              )
            }
          />
          {myRequirements.length === 0 && !reqsLoading ? (
            <Card color={ROLE_COLOR} style={{ alignItems: "center", padding: 24 }}>
              <Feather name="file-text" size={28} color="#94a3b8" />
              <Text style={styles.emptyText}>No requirements posted yet.</Text>
            </Card>
          ) : (
            myRequirements.map((req) => (
              <Pressable
                key={req.id}
                onPress={() => navigation.navigate("RequirementDetail", { requirementId: req.id })}
                style={({ pressed }) => [styles.reqCard, { opacity: pressed ? 0.88 : 1 }]}
              >
                <View style={styles.reqRow}>
                  <View style={[styles.reqStatusDot, {
                    backgroundColor: req.status === "open" ? "#10b981" : req.status === "active" ? ROLE_COLOR : "#94a3b8"
                  }]} />
                  <Text style={styles.reqTitle} numberOfLines={1}>{req.title}</Text>
                  <Text style={[styles.reqBudget, { color: ROLE_COLOR }]}>₹{req.maxBudget.toLocaleString()}</Text>
                </View>
                <View style={styles.reqMeta}>
                  <Text style={styles.reqStatus}>{req.status}</Text>
                  {req.quotesCount !== undefined && (
                    <Text style={styles.reqQuotes}>{req.quotesCount} proposal{req.quotesCount !== 1 ? "s" : ""}</Text>
                  )}
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* Post requirement modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowModal(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Post a requirement</Text>
            <View style={{ gap: 12 }}>
              <TextInput
                value={custTitle}
                onChangeText={setCustTitle}
                placeholder="Title (e.g. AC repair needed)"
                placeholderTextColor="#94a3b8"
                style={styles.modalInput}
              />
              <TextInput
                value={custDesc}
                onChangeText={setCustDesc}
                placeholder="Describe the work…"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                style={[styles.modalInput, { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput
                  value={custMinBudget}
                  onChangeText={setCustMinBudget}
                  placeholder="Min ₹"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  style={[styles.modalInput, { flex: 1 }]}
                />
                <TextInput
                  value={custMaxBudget}
                  onChangeText={setCustMaxBudget}
                  placeholder="Max ₹"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  style={[styles.modalInput, { flex: 1 }]}
                />
              </View>
              {!!custError && <Text style={styles.errorText}>{custError}</Text>}
              <Pressable
                onPress={handlePostGig}
                disabled={postingReq}
                style={[styles.modalSubmit, { opacity: postingReq ? 0.8 : 1 }]}
              >
                <LinearGradient colors={[ROLE_COLOR, "#1d4ed8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.postBtnGrad}>
                  {postingReq ? <ActivityIndicator color="#fff" /> : <Text style={styles.postBtnText}>Post Requirement</Text>}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ProviderCard({ user, navigation, firebaseUser }: { user: User; navigation: NavProp; firebaseUser: any }) {
  const initials = user.name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  return (
    <Card color={ROLE_COLOR} style={styles.providerCard}>
      <View style={styles.providerRow}>
        <View style={[styles.providerAvatar, { backgroundColor: "#ea580c18", borderColor: "#ea580c40" }]}>
          <Text style={[styles.providerInitials, { color: "#ea580c" }]}>{initials}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.providerName}>{user.name}</Text>
          {user.title && <Text style={styles.providerTitle}>{user.title}</Text>}
          {user.rating !== undefined && <Stars value={user.rating} size={11} />}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => {
              const myId = firebaseUser?.uid ?? "anon";
              const ids = [myId, user.id].sort();
              navigation.navigate("Chat", { conversationId: `dm_${ids[0]}_${ids[1]}`, recipientId: user.id, recipientName: user.name });
            }}
            style={styles.providerAction}
          >
            <Feather name="message-circle" size={15} color={ROLE_COLOR} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("ProviderProfile", { userId: user.id })}
            style={[styles.providerAction, { backgroundColor: ROLE_COLOR, borderColor: ROLE_COLOR }]}
          >
            <Feather name="user" size={15} color="#fff" />
          </Pressable>
        </View>
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
  section: { paddingHorizontal: 20, paddingTop: 16 },
  postCard: { padding: 16, gap: 12 },
  postCardTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  postInput: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#f8fafc", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  postInputPlaceholder: { fontSize: 13, fontWeight: "500", color: "#94a3b8", flex: 1 },
  postActions: { flexDirection: "row", gap: 10 },
  postBtnPrimary: { flex: 1, borderRadius: 12, overflow: "hidden", shadowColor: ROLE_COLOR, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  postBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44 },
  postBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  postBtnSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: ROLE_COLOR + "50", backgroundColor: ROLE_COLOR + "08" },
  seeAll: { fontSize: 13, fontWeight: "700" },
  emptyText: { fontSize: 13, fontWeight: "600", color: "#94a3b8", marginTop: 10 },
  providerCard: { marginBottom: 10, padding: 14 },
  providerRow: { flexDirection: "row", alignItems: "center" },
  providerAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  providerInitials: { fontSize: 15, fontWeight: "800" },
  providerName: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  providerTitle: { fontSize: 11, fontWeight: "600", color: "#64748b", marginBottom: 3 },
  providerAction: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: ROLE_COLOR + "50", backgroundColor: ROLE_COLOR + "08" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.4)" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0", alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#0f172a", marginBottom: 20 },
  modalInput: { backgroundColor: "#f8fafc", borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 14, paddingHorizontal: 14, height: 50, fontSize: 14, fontWeight: "600", color: "#0f172a" },
  errorText: { fontSize: 12, fontWeight: "600", color: "#ef4444" },
  modalSubmit: { borderRadius: 14, overflow: "hidden", shadowColor: ROLE_COLOR, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
  reqCard: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 12, marginBottom: 8, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reqStatusDot: { width: 8, height: 8, borderRadius: 4 },
  reqTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: "#0f172a" },
  reqBudget: { fontSize: 13, fontWeight: "800" },
  reqMeta: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 16 },
  reqStatus: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textTransform: "capitalize" },
  reqQuotes: { fontSize: 10, fontWeight: "700", color: "#64748b" },
});
