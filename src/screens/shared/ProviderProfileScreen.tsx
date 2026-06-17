import React from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  ActivityIndicator, Platform, StatusBar, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { useGetUserDetails } from "@workspace/api-client-react";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { useAuth } from "../../contexts/AuthContext";

type ProfileRouteProp = RouteProp<RootStackParamList, "ProviderProfile">;
type NavProp = StackNavigationProp<RootStackParamList>;

export default function ProviderProfileScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<ProfileRouteProp>();
  const { userId } = route.params;
  const { firebaseUser } = useAuth();

  const userQuery = useGetUserDetails(userId);
  const provider = userQuery.data;

  const handleChat = () => {
    if (!provider || !firebaseUser) return;
    // Always use sorted dm_ format to match what the backend writes to
    const ids = [firebaseUser.uid, userId].sort();
    navigation.navigate("Chat", {
      conversationId: `dm_${ids[0]}_${ids[1]}`,
      recipientId: userId,
      recipientName: provider.name,
    });
  };

  const handlePostRequirement = () => {
    navigation.navigate("PostRequirement");
  };

  if (userQuery.isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#7c3aed" size="large" />
      </View>
    );
  }

  if (userQuery.isError || !provider) {
    return (
      <View style={styles.loadingScreen}>
        <View style={styles.emptyIcon}>
          <Feather name="alert-circle" size={28} color="#ef4444" />
        </View>
        <Text style={styles.errorText}>Could not load provider profile</Text>
        <Pressable onPress={() => userQuery.refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const initials = provider.name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  const roleColor = provider.role === "digital" ? "#0d9488" : provider.role === "local" ? "#ea580c" : "#7c3aed";
  const skills = provider.skills ? provider.skills.split(",").map((s) => s.trim()).filter(Boolean) : [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Cover with role-colored gradient */}
        <View style={styles.cover}>
          <LinearGradient
            colors={[roleColor + "cc", roleColor + "44", "#f8fafc00"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <SafeAreaView style={styles.coverActions}>
            <Pressable onPress={() => navigation.goBack()} style={styles.coverBtn}>
              <Feather name="chevron-left" size={22} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => Alert.alert("Share", "Share functionality coming soon.")}
              style={styles.coverBtn}
            >
              <Feather name="share" size={16} color="#fff" />
            </Pressable>
          </SafeAreaView>
        </View>

        {/* Details card - overlaps cover */}
        <View style={styles.details}>
          {/* Avatar row */}
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrap}>
              <View style={[styles.avatar, { backgroundColor: roleColor + "18", borderColor: roleColor + "40" }]}>
                <Text style={[styles.avatarText, { color: roleColor }]}>{initials}</Text>
              </View>
              {provider.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Feather name="shield" size={13} color="#10b981" />
                </View>
              )}
            </View>

            {provider.aiTrustScore !== undefined && (
              <View style={[styles.trustCard, { borderColor: roleColor + "30" }]}>
                <Text style={styles.trustLabel}>AI Trust</Text>
                <Text style={[styles.trustValue, { color: roleColor }]}>
                  {provider.aiTrustScore}
                  <Text style={{ fontSize: 11, color: "#94a3b8" }}>/100</Text>
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.name}>{provider.name}</Text>
          {provider.title && (
            <Text style={[styles.providerTitle, { color: roleColor }]}>{provider.title}</Text>
          )}

          <View style={styles.metaRow}>
            {provider.location && (
              <View style={styles.metaItem}>
                <Feather name="map-pin" size={12} color="#94a3b8" />
                <Text style={styles.metaText}>{provider.location}</Text>
              </View>
            )}
            {provider.rating !== undefined && (
              <View style={styles.metaItem}>
                <Feather name="star" size={12} color="#f59e0b" />
                <Text style={styles.metaText}>
                  {provider.rating.toFixed(1)}{provider.reviewsCount !== undefined && ` (${provider.reviewsCount} reviews)`}
                </Text>
              </View>
            )}
          </View>

          {/* Stats grid */}
          {(provider.completedGigs !== undefined || provider.onTimeRate !== undefined || provider.rehireCount !== undefined) && (
            <View style={styles.statsGrid}>
              {provider.completedGigs !== undefined && (
                <View style={styles.statBox}>
                  <View style={[styles.statIcon, { backgroundColor: roleColor + "14" }]}>
                    <Feather name="award" size={14} color={roleColor} />
                  </View>
                  <Text style={[styles.statValue, { color: roleColor }]}>{provider.completedGigs}</Text>
                  <Text style={styles.statLabel}>Completed</Text>
                </View>
              )}
              {provider.onTimeRate !== undefined && (
                <View style={styles.statBox}>
                  <View style={[styles.statIcon, { backgroundColor: "#10b98114" }]}>
                    <Feather name="zap" size={14} color="#10b981" />
                  </View>
                  <Text style={[styles.statValue, { color: "#10b981" }]}>{provider.onTimeRate}%</Text>
                  <Text style={styles.statLabel}>On Time</Text>
                </View>
              )}
              {provider.rehireCount !== undefined && (
                <View style={styles.statBox}>
                  <View style={[styles.statIcon, { backgroundColor: "#2563eb14" }]}>
                    <Feather name="refresh-cw" size={14} color="#2563eb" />
                  </View>
                  <Text style={[styles.statValue, { color: "#2563eb" }]}>{provider.rehireCount}</Text>
                  <Text style={styles.statLabel}>Rehires</Text>
                </View>
              )}
            </View>
          )}

          {/* About */}
          {provider.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About {provider.name.split(" ")[0]}</Text>
              <Text style={styles.sectionBody}>{provider.description}</Text>
            </View>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Verified Skills</Text>
              <View style={styles.skillsWrap}>
                {skills.map((skill) => (
                  <View key={skill} style={[styles.skillChip, { backgroundColor: roleColor + "12" }]}>
                    <Text style={[styles.skillText, { color: roleColor }]}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Premium badge */}
          {provider.isPremium && (
            <View style={styles.premiumBanner}>
              <Feather name="star" size={14} color="#f59e0b" />
              <Text style={styles.premiumText}>SRN Premium Provider — Priority placement in search results</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        <Pressable
          onPress={handleChat}
          style={({ pressed }) => [styles.chatIconBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Feather name="message-square" size={20} color="#7c3aed" />
        </Pressable>

        <Pressable
          onPress={handlePostRequirement}
          style={({ pressed }) => [styles.primaryBtnWrap, { opacity: pressed ? 0.9 : 1 }]}
        >
          <LinearGradient
            colors={[roleColor, roleColor + "cc"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Post Requirement</Text>
            <Feather name="arrow-right" size={16} color="#fff" style={{ marginLeft: 6 }} />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  loadingScreen: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", gap: 16 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, backgroundColor: "#7c3aed" },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  scrollContent: { paddingBottom: 110 },
  cover: { height: 180, backgroundColor: "#f1f5f9" },
  coverActions: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12 },
  coverBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  details: { paddingHorizontal: 20, marginTop: -44, backgroundColor: "#f8fafc" },
  avatarRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 },
  avatarWrap: { position: "relative" },
  avatar: { width: 84, height: 84, borderRadius: 26, borderWidth: 3, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  avatarText: { fontSize: 26, fontWeight: "800" },
  verifiedBadge: { position: "absolute", bottom: -3, right: -3, width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 3 },
  trustCard: { backgroundColor: "#fff", borderWidth: 1.5, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  trustLabel: { fontSize: 9, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 },
  trustValue: { fontSize: 20, fontWeight: "900" },
  name: { fontSize: 24, fontWeight: "900", color: "#0f172a", letterSpacing: -0.3, marginBottom: 4 },
  providerTitle: { fontSize: 13, fontWeight: "800", marginBottom: 10 },
  metaRow: { flexDirection: "row", gap: 14, marginBottom: 20 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statBox: { flex: 1, backgroundColor: "#ffffff", borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 18, padding: 12, alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 18, fontWeight: "900" },
  statLabel: { fontSize: 9, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 10 },
  sectionBody: { fontSize: 13, fontWeight: "500", color: "#64748b", lineHeight: 20 },
  skillsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skillChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  skillText: { fontSize: 11, fontWeight: "700" },
  premiumBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fef3c714", borderWidth: 1.5, borderColor: "#f59e0b44", borderRadius: 14, padding: 12, marginBottom: 20 },
  premiumText: { fontSize: 12, fontWeight: "700", color: "#92400e", flex: 1 },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    borderTopWidth: 1, borderTopColor: "#e2e8f0",
    backgroundColor: "#ffffff", gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 4,
  },
  chatIconBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: "#7c3aed14", borderWidth: 1.5, borderColor: "#7c3aed30", alignItems: "center", justifyContent: "center" },
  primaryBtnWrap: { flex: 1, borderRadius: 16, overflow: "hidden", shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 52, borderRadius: 16 },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
