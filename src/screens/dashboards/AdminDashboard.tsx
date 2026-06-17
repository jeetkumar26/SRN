import React from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  ActivityIndicator, Alert, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useGetAdminDashboard } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import { Avatar, Card, RoleBadge, SectionRow } from "../../components/ui";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;

const ROLE_COLOR = "#dc2626";

export default function AdminDashboard() {
  const navigation = useNavigation<NavProp>();
  const { profile, signOut } = useAuth();

  const adminQuery = useGetAdminDashboard({
    query: { refetchInterval: 10_000 } as any,
  });

  const handleLogOut = () => {
    Alert.alert("Sign Out", "Sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  if (!profile) return null;

  const data = adminQuery.data;

  const COUNTERS = [
    { icon: "users", color: "#2563eb", label: "Users", value: data?.totalUsers ?? 0 },
    { icon: "folder", color: "#7c3aed", label: "Gigs", value: data?.totalRequirements ?? 0 },
    { icon: "edit-3", color: "#0d9488", label: "Bids", value: data?.totalBids ?? 0 },
  ];

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
                <Text style={styles.greeting}>Control center</Text>
                <Text numberOfLines={1} style={styles.userName}>{profile.name}</Text>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <RoleBadge role="admin" size="sm" />
                  <View style={styles.fullControlBadge}>
                    <Feather name="shield" size={9} color="#dc2626" />
                    <Text style={styles.fullControlText}>Full Control</Text>
                  </View>
                </View>
              </View>
              <Pressable onPress={handleLogOut} style={styles.iconBtn}>
                <Feather name="log-out" size={18} color="#475569" />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        {/* Platform status */}
        <View style={styles.section}>
          <Card color={ROLE_COLOR} style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusLeft}>
                <View style={styles.onlineDot} />
                <Text style={styles.statusLabel}>Platform status</Text>
              </View>
              <View style={styles.onlineBadge}>
                <Text style={styles.onlineText}>● Online</Text>
              </View>
            </View>
            <Text style={styles.statusSub}>
              Auto-refresh · updated just now
            </Text>
            {adminQuery.isLoading && (
              <ActivityIndicator color={ROLE_COLOR} size="small" style={{ marginTop: 8 }} />
            )}
          </Card>
        </View>

        {/* Live analytics counters */}
        <View style={styles.section}>
          <SectionRow title="Live analytics" />
          <View style={styles.countersRow}>
            {COUNTERS.map((c) => (
              <Card key={c.label} color={c.color} style={styles.counterCard}>
                <View style={[styles.counterIcon, { backgroundColor: c.color + "14" }]}>
                  <Feather name={c.icon as any} size={18} color={c.color} />
                </View>
                <Text style={[styles.counterVal, { color: c.color }]}>
                  {c.value.toLocaleString()}
                </Text>
                <Text style={styles.counterLbl}>{c.label}</Text>
              </Card>
            ))}
          </View>
        </View>

        {/* Quick admin actions */}
        <View style={styles.section}>
          <SectionRow title="Quick actions" />
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Pressable
              onPress={() => navigation.navigate("Search", {})}
              style={[styles.qaBtn, { backgroundColor: ROLE_COLOR }]}
            >
              <Feather name="users" size={16} color="#fff" />
              <Text style={styles.qaBtnText}>Manage Users</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("Notifications")}
              style={[styles.qaBtn, { backgroundColor: "#f8fafc", borderWidth: 1.5, borderColor: "#e2e8f0" }]}
            >
              <Feather name="bell" size={16} color={ROLE_COLOR} />
              <Text style={[styles.qaBtnText, { color: ROLE_COLOR }]}>Alerts</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("AdminDisputes")}
              style={[styles.qaBtn, { backgroundColor: "#fef2f2", borderWidth: 1.5, borderColor: "#fecaca" }]}
            >
              <Feather name="alert-circle" size={16} color="#ef4444" />
              <Text style={[styles.qaBtnText, { color: "#ef4444" }]}>Disputes</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("AdminVerification")}
              style={[styles.qaBtn, { backgroundColor: "#f0fdf4", borderWidth: 1.5, borderColor: "#bbf7d0" }]}
            >
              <Feather name="shield" size={16} color="#10b981" />
              <Text style={[styles.qaBtnText, { color: "#10b981" }]}>Verify Queue</Text>
            </Pressable>
          </View>
        </View>
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
  topRow: { flexDirection: "row", alignItems: "center", paddingTop: 56, marginBottom: 4 },
  greeting: { fontSize: 12, fontWeight: "600", color: "#94a3b8", marginBottom: 2 },
  userName: { fontSize: 18, fontWeight: "900", color: "#0f172a", marginBottom: 5 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  fullControlBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#dc262614", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  fullControlText: { fontSize: 10, fontWeight: "800", color: "#dc2626" },
  section: { paddingHorizontal: 20, paddingTop: 16 },
  statusCard: { padding: 16, gap: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10b981" },
  statusLabel: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  onlineBadge: { backgroundColor: "#10b98114", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9 },
  onlineText: { fontSize: 12, fontWeight: "800", color: "#10b981" },
  statusSub: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  countersRow: { flexDirection: "row", gap: 10 },
  counterCard: { flex: 1, padding: 14, alignItems: "center", gap: 8 },
  counterIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  counterVal: { fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  counterLbl: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  qaBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 14 },
  qaBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
