import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  ActivityIndicator, Alert, StatusBar, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { customFetch } from "@workspace/api-client-react";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { useListRequirements, useCreateQuote } from "@workspace/api-client-react";
import type { Requirement } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { Avatar, RoleBadge, StatusBadge, SectionRow } from "../../components/ui";

type NavProp = StackNavigationProp<RootStackParamList>;
type Availability = "available" | "busy" | "offline";

const AVAIL_CONFIG: Record<Availability, { label: string; color: string; icon: string; desc: string }> = {
  available: { label: "Available", color: "#10b981", icon: "check-circle", desc: "You're visible to clients" },
  busy: { label: "Busy", color: "#f59e0b", icon: "clock", desc: "Limited availability" },
  offline: { label: "Offline", color: "#94a3b8", icon: "moon", desc: "Not accepting requests" },
};

const ROLE_COLOR = "#ea580c";

// ── Pulsing availability indicator ──────────────────────────────────────────
function AvailabilityRing({ availability }: { availability: Availability }) {
  const cfg = AVAIL_CONFIG[availability];
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    animRef.current?.stop();
    pulseScale.setValue(1);
    pulseOpacity.setValue(0.6);

    if (availability === "available") {
      animRef.current = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, { toValue: 1.55, duration: 900, useNativeDriver: true }),
            Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.6, duration: 900, useNativeDriver: true }),
          ]),
        ])
      );
      animRef.current.start();
    }

    return () => animRef.current?.stop();
  }, [availability]);

  return (
    <View style={ringStyles.container}>
      {/* Pulsing halo — only shown when available */}
      {availability === "available" && (
        <Animated.View
          style={[
            ringStyles.halo,
            {
              borderColor: cfg.color,
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}
        />
      )}
      {/* Static ring */}
      <View style={[ringStyles.ring, { borderColor: cfg.color, backgroundColor: cfg.color + "10" }]}>
        <Feather name={cfg.icon as any} size={24} color={cfg.color} />
      </View>
      {/* Green glow shadow for available */}
      {availability === "available" && (
        <View style={[ringStyles.glowShadow, { shadowColor: cfg.color }]} />
      )}
    </View>
  );
}

const ringStyles = StyleSheet.create({
  container: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  halo: {
    position: "absolute", width: 64, height: 64, borderRadius: 32,
    borderWidth: 2.5,
  },
  ring: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 3,
    alignItems: "center", justifyContent: "center",
  },
  glowShadow: {
    position: "absolute", width: 56, height: 56, borderRadius: 28,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 0,
  },
});

// ── Main dashboard ───────────────────────────────────────────────────────────
export default function LocalProviderDashboard() {
  const navigation = useNavigation<NavProp>();
  const { profile, firebaseUser, signOut, refreshProfile } = useAuth();

  const [availability, setAvailability] = useState<Availability>(
    profile?.isAvailable ? "available" : "offline"
  );
  const [updatingAvail, setUpdatingAvail] = useState(false);
  const [jobsTodayCount, setJobsTodayCount] = useState(0);

  const requirementsQuery = useListRequirements();
  const createQuoteMutation = useCreateQuote();

  useEffect(() => {
    if (!firebaseUser) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    customFetch<{ items: any[] }>("/api/bookings?limit=100")
      .then((res) => {
        const todayMs = startOfDay.getTime();
        const todayCount = res.items.filter((b) => {
          const createdAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return createdAt >= todayMs;
        }).length;
        setJobsTodayCount(todayCount);
      })
      .catch((err) => console.error("[LocalDash] jobs today error:", err));
  }, [firebaseUser]);

  const handleLogOut = () => {
    Alert.alert("Sign Out", "Sign out of SRN?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  const setAvailabilityStatus = async (next: Availability) => {
    if (next === availability || updatingAvail) return;
    setUpdatingAvail(true);
    try {
      if (firebaseUser) {
        await customFetch(`/api/users/${firebaseUser.uid}`, {
          method: "PATCH",
          body: JSON.stringify({ isAvailable: next === "available" }),
        });
        await refreshProfile();
      }
      setAvailability(next);
    } catch {
      Alert.alert("Error", "Could not update availability.");
    } finally {
      setUpdatingAvail(false);
    }
  };

  const handleAcceptRequest = (req: Requirement) => {
    if (!firebaseUser) return;
    Alert.alert(
      "Accept Request",
      `Accept "${req.title}" for ₹${req.maxBudget}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: async () => {
            try {
              await createQuoteMutation.mutateAsync({
                data: {
                  requirementId: req.id,
                  senderId: firebaseUser.uid,
                  receiverId: req.creatorId,
                  amount: req.maxBudget,
                  durationDays: 1,
                },
              });
              Alert.alert("Accepted", "Request accepted! The client will be notified.");
            } catch {
              Alert.alert("Error", "Failed to accept request.");
            }
          },
        },
      ]
    );
  };

  if (!profile) return null;

  const cfg = AVAIL_CONFIG[availability];

  const localReqs = (requirementsQuery.data ?? []).filter(
    (r) =>
      (r.status === "open" || r.status == null) &&
      (r.category?.toLowerCase().includes("local") || r.category?.toLowerCase().includes("service"))
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Header */}
        <View style={styles.header}>
          <LinearGradient colors={[ROLE_COLOR + "10", "transparent"]} style={styles.headerOrb} />
          <SafeAreaView>
            <View style={styles.topRow}>
              <Avatar name={profile.name} color={ROLE_COLOR} size={50} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.greeting}>{profile.title ?? "Local Provider"}</Text>
                <Text numberOfLines={1} style={styles.userName}>{profile.name}</Text>
                <RoleBadge role="local" size="sm" />
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
                <Text style={[styles.statVal, { color: ROLE_COLOR }]}>{jobsTodayCount}</Text>
                <Text style={styles.statLbl}>Jobs today</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: ROLE_COLOR }]}>{localReqs.length}</Text>
                <Text style={styles.statLbl}>Open requests</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: "#f59e0b" }]}>{profile.rating?.toFixed(1) ?? "5.0"}</Text>
                <Text style={styles.statLbl}>Rating</Text>
              </View>
            </View>
          </SafeAreaView>
        </View>

        {/* Availability card */}
        <View style={styles.section}>
          <View style={[styles.availCard, { borderColor: cfg.color + "30" }]}>
            {/* Left: animated ring + status text */}
            <View style={styles.availLeft}>
              <AvailabilityRing availability={availability} />
              <View style={{ flex: 1 }}>
                <Text style={styles.availHint}>YOU ARE</Text>
                <Text style={[styles.availStatus, { color: cfg.color }]}>{cfg.label}</Text>
                <Text style={styles.availDesc}>{cfg.desc}</Text>
              </View>
              {updatingAvail && <ActivityIndicator size="small" color={cfg.color} />}
            </View>

            {/* Divider */}
            <View style={styles.availDivider} />

            {/* Three-way toggle buttons */}
            <View style={styles.availBtns}>
              {(["available", "busy", "offline"] as Availability[]).map((a) => {
                const ac = AVAIL_CONFIG[a];
                const isActive = a === availability;
                return (
                  <Pressable
                    key={a}
                    onPress={() => setAvailabilityStatus(a)}
                    disabled={updatingAvail}
                    style={[
                      styles.availBtn,
                      isActive
                        ? { backgroundColor: ac.color, borderColor: ac.color }
                        : { backgroundColor: ac.color + "10", borderColor: ac.color + "30" },
                    ]}
                  >
                    <Feather name={ac.icon as any} size={13} color={isActive ? "#fff" : ac.color} />
                    <Text style={[styles.availBtnText, { color: isActive ? "#fff" : ac.color }]}>
                      {ac.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Incoming requests */}
        <View style={styles.section}>
          <SectionRow
            title="Incoming requests"
            right={
              <Pressable onPress={() => navigation.navigate("Search", {})} style={styles.mapBtn}>
                <Feather name="map" size={13} color={ROLE_COLOR} />
                <Text style={[styles.mapText, { color: ROLE_COLOR }]}>Map view</Text>
              </Pressable>
            }
          />

          {requirementsQuery.isLoading ? (
            <ActivityIndicator color={ROLE_COLOR} style={{ margin: 20 }} />
          ) : localReqs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="inbox" size={28} color="#94a3b8" />
              <Text style={styles.emptyText}>No local requests right now.</Text>
            </View>
          ) : (
            localReqs.map((req) => (
              <Pressable
                key={req.id}
                onPress={() => navigation.navigate("RequirementDetail", { requirementId: req.id })}
                style={styles.reqCard}
              >
                <View style={styles.reqHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqTitle}>{req.title}</Text>
                    <Text style={styles.reqDesc} numberOfLines={2}>{req.description}</Text>
                    <Text style={[styles.reqBudget, { color: ROLE_COLOR }]}>₹{req.minBudget}–₹{req.maxBudget}</Text>
                  </View>
                  <View style={{ gap: 8, alignItems: "flex-end" }}>
                    <StatusBadge status={req.status ?? "open"} />
                    <Pressable
                      onPress={(e) => { e.stopPropagation?.(); handleAcceptRequest(req); }}
                      style={styles.acceptBtn}
                    >
                      <LinearGradient colors={[ROLE_COLOR, "#c2410c"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.acceptGrad}>
                        <Text style={styles.acceptText}>Accept</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
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
  availCard: {
    backgroundColor: "#ffffff", borderRadius: 22, borderWidth: 1.5,
    padding: 16, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  availLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  availHint: { fontSize: 9, fontWeight: "800", color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase" },
  availStatus: { fontSize: 22, fontWeight: "900", letterSpacing: -0.3, marginBottom: 1 },
  availDesc: { fontSize: 10, fontWeight: "600", color: "#94a3b8" },
  availDivider: { height: 1, backgroundColor: "#f1f5f9", marginHorizontal: -4 },
  availBtns: { flexDirection: "row", gap: 8 },
  availBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
  },
  availBtnText: { fontSize: 11, fontWeight: "800" },
  mapBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: ROLE_COLOR + "14", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  mapText: { fontSize: 12, fontWeight: "700" },
  emptyCard: { backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e2e8f0", alignItems: "center", padding: 28, gap: 10 },
  emptyText: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  reqCard: {
    backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14, marginBottom: 10,
    shadowColor: ROLE_COLOR, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  reqHeader: { flexDirection: "row", gap: 10 },
  reqTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  reqDesc: { fontSize: 12, fontWeight: "500", color: "#64748b", lineHeight: 16, marginBottom: 6 },
  reqBudget: { fontSize: 13, fontWeight: "800" },
  acceptBtn: { borderRadius: 10, overflow: "hidden" },
  acceptGrad: { paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  acceptText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
