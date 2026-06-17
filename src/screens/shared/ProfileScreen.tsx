import React, { useState } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  TextInput, ActivityIndicator, Alert, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import { ROLE_LABELS, ROLE_COLORS } from "../../types/roles";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile, role, signOut, refreshProfile } = useAuth();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");
  const [title, setTitle] = useState(profile?.title ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);

  const initials = (profile?.name ?? "U").split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  const roleColor = role ? ROLE_COLORS[role] : "#7c3aed";
  const roleLabel = role ? ROLE_LABELS[role] : "User";

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "SRN Member";

  const handleSave = async () => {
    if (!profile?.uid) return;
    setSaving(true);
    try {
      const updates: Record<string, string> = { name: name.trim() };
      if (title.trim()) updates.title = title.trim();
      if (phone.trim()) updates.phone = phone.trim();
      if (bio.trim()) updates.bio = bio.trim();
      await customFetch(`/api/users/${profile.uid}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      await refreshProfile();
      setEditing(false);
      Alert.alert("Saved", "Profile updated successfully.");
    } catch (err) {
      console.error("[ProfileScreen] save error:", err);
      Alert.alert("Error", "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  const handleAvatarPress = () => {
    Alert.alert("Profile Photo", "Choose an option", [
      { text: "Take Photo" },
      { text: "Choose from Library" },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const skills = Array.isArray(profile?.skills)
    ? profile.skills
    : typeof profile?.skills === "string"
    ? (profile.skills as string).split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Hero avatar section */}
        <View style={styles.heroSection}>
          <LinearGradient colors={[roleColor + "18", roleColor + "06"]} style={styles.heroGrad} />

          {/* Avatar with camera overlay */}
          <Pressable onPress={handleAvatarPress} style={styles.avatarWrap}>
            <View style={[styles.avatarCircle, { backgroundColor: roleColor + "18", borderColor: roleColor + "44" }]}>
              <Text style={[styles.avatarText, { color: roleColor }]}>{initials}</Text>
            </View>
            <View style={[styles.cameraBtn, { backgroundColor: roleColor }]}>
              <Feather name="camera" size={11} color="#fff" />
            </View>
          </Pressable>

          <Text style={styles.heroName}>{profile?.name ?? "User"}</Text>

          <View style={[styles.roleBadge, { backgroundColor: roleColor + "14" }]}>
            <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
          </View>

          {profile?.rating !== undefined && (
            <View style={styles.ratingRow}>
              <Feather name="star" size={14} color="#f59e0b" />
              <Text style={styles.ratingText}>
                {profile.rating.toFixed(1)}
                <Text style={{ color: "#94a3b8" }}> ({profile.reviewsCount ?? 0} reviews)</Text>
              </Text>
            </View>
          )}

          <View style={styles.memberRow}>
            <Feather name="calendar" size={11} color="#94a3b8" />
            <Text style={styles.memberText}>Member since {memberSince}</Text>
          </View>
        </View>

        {/* Personal info card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Personal Information</Text>
            <Pressable
              onPress={() => {
                if (editing) {
                  setName(profile?.name ?? "");
                  setTitle(profile?.title ?? "");
                  setPhone(profile?.phone ?? "");
                  setBio(profile?.bio ?? "");
                }
                setEditing(!editing);
              }}
              style={[styles.editBtn, editing && { backgroundColor: "#fef2f2" }]}
            >
              <Feather name={editing ? "x" : "edit-2"} size={14} color={editing ? "#ef4444" : "#475569"} />
              <Text style={[styles.editBtnText, editing && { color: "#ef4444" }]}>
                {editing ? "Cancel" : "Edit"}
              </Text>
            </Pressable>
          </View>

          {/* Full Name */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            {editing ? (
              <TextInput
                value={name}
                onChangeText={setName}
                style={[styles.fieldInput, { borderColor: roleColor + "44" }]}
                placeholder="Your name"
                placeholderTextColor="#94a3b8"
              />
            ) : (
              <Text style={styles.fieldValue}>{profile?.name ?? "—"}</Text>
            )}
          </View>

          <View style={styles.fieldDivider} />

          {/* Email (read-only) */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.fieldReadOnly}>
              <Feather name="lock" size={12} color="#94a3b8" />
              <Text style={[styles.fieldValue, { flex: 1 }]}>{profile?.email ?? "—"}</Text>
            </View>
          </View>

          <View style={styles.fieldDivider} />

          {/* Phone */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            {editing ? (
              <TextInput
                value={phone}
                onChangeText={setPhone}
                style={[styles.fieldInput, { borderColor: roleColor + "44" }]}
                placeholder="+91 98765 43210"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.fieldValue}>{profile?.phone || "—"}</Text>
            )}
          </View>

          <View style={styles.fieldDivider} />

          {/* Bio */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>About Me</Text>
            {editing ? (
              <TextInput
                value={bio}
                onChangeText={setBio}
                style={[styles.fieldInput, { borderColor: roleColor + "44", height: 80, textAlignVertical: "top", paddingTop: 10 }]}
                placeholder="Tell clients a bit about yourself…"
                placeholderTextColor="#94a3b8"
                multiline
              />
            ) : (
              <Text style={[styles.fieldValue, { color: profile?.bio ? "#0f172a" : "#94a3b8" }]}>
                {profile?.bio || "No bio yet"}
              </Text>
            )}
          </View>

          {/* Provider-specific fields */}
          {(role === "digital" || role === "local") && (
            <>
              <View style={styles.fieldDivider} />
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Professional Title</Text>
                {editing ? (
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    style={[styles.fieldInput, { borderColor: roleColor + "44" }]}
                    placeholder="e.g. Senior React Developer"
                    placeholderTextColor="#94a3b8"
                  />
                ) : (
                  <Text style={styles.fieldValue}>{profile?.title ?? "—"}</Text>
                )}
              </View>
            </>
          )}

          {role === "local" && (
            <>
              <View style={styles.fieldDivider} />
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Service Radius</Text>
                <Text style={styles.fieldValue}>{profile?.serviceRadiusKm ?? 15} km</Text>
              </View>
            </>
          )}

          {role === "digital" && profile?.hourlyRate !== undefined && (
            <>
              <View style={styles.fieldDivider} />
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Hourly Rate</Text>
                <Text style={[styles.fieldValue, { color: roleColor, fontWeight: "800" }]}>₹{profile.hourlyRate}/hr</Text>
              </View>
            </>
          )}

          {editing && (
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [styles.saveBtnWrap, { opacity: pressed || saving ? 0.85 : 1 }]}
            >
              <LinearGradient colors={[roleColor, roleColor + "cc"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtn}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </LinearGradient>
            </Pressable>
          )}
        </View>

        {/* Skills for provider roles */}
        {(role === "digital" || role === "local") && skills.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Skills</Text>
            <View style={styles.skillsRow}>
              {skills.map((s) => (
                <View key={s} style={[styles.skillChip, { backgroundColor: roleColor + "12", borderColor: roleColor + "22" }]}>
                  <Text style={[styles.skillChipText, { color: roleColor }]}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Stats row for providers */}
        {(role === "digital" || role === "local") && (
          <View style={styles.statsCard}>
            {[
              { label: "Completed", value: profile?.completedGigs ?? 0, icon: "check-circle", color: "#10b981" },
              { label: "On-Time", value: `${profile?.onTimeRate ?? 100}%`, icon: "clock", color: "#2563eb" },
              { label: "Reviews", value: profile?.reviewsCount ?? 0, icon: "star", color: "#f59e0b" },
            ].map((s) => (
              <View key={s.label} style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: s.color + "14" }]}>
                  <Feather name={s.icon as any} size={14} color={s.color} />
                </View>
                <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLbl}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Settings & Subscription shortcuts */}
        <View style={styles.card}>
          <Pressable
            onPress={() => navigation.navigate("Settings")}
            style={({ pressed }) => [styles.shortcutRow, { opacity: pressed ? 0.75 : 1 }]}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: roleColor + "14" }]}>
              <Feather name="settings" size={15} color={roleColor} />
            </View>
            <Text style={styles.shortcutText}>Settings</Text>
            <Feather name="chevron-right" size={16} color="#cbd5e1" />
          </Pressable>
          <View style={styles.fieldDivider} />
          <Pressable
            onPress={() => navigation.navigate("Subscription")}
            style={({ pressed }) => [styles.shortcutRow, { opacity: pressed ? 0.75 : 1 }]}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: roleColor + "14" }]}>
              <Feather name="zap" size={15} color={roleColor} />
            </View>
            <Text style={styles.shortcutText}>Subscription</Text>
            <Feather name="chevron-right" size={16} color="#cbd5e1" />
          </Pressable>
          <View style={styles.fieldDivider} />
          <Pressable
            onPress={() => navigation.navigate("Referrals")}
            style={({ pressed }) => [styles.shortcutRow, { opacity: pressed ? 0.75 : 1 }]}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: roleColor + "14" }]}>
              <Feather name="gift" size={15} color={roleColor} />
            </View>
            <Text style={styles.shortcutText}>Referrals & Rewards</Text>
            <Feather name="chevron-right" size={16} color="#cbd5e1" />
          </Pressable>
          {(role === "digital" || role === "local") && (
            <>
              <View style={styles.fieldDivider} />
              <Pressable
                onPress={() => navigation.navigate("Analytics")}
                style={({ pressed }) => [styles.shortcutRow, { opacity: pressed ? 0.75 : 1 }]}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: roleColor + "14" }]}>
                  <Feather name="bar-chart-2" size={15} color={roleColor} />
                </View>
                <Text style={styles.shortcutText}>Analytics</Text>
                <Feather name="chevron-right" size={16} color="#cbd5e1" />
              </Pressable>
            </>
          )}
        </View>

        {/* App info */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Feather name="info" size={14} color="#94a3b8" />
            <Text style={styles.infoText}>SRN · Skill Requirement Network · v1.0</Text>
          </View>
        </View>

        {/* Sign Out */}
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOutBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Feather name="log-out" size={16} color="#ef4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48, gap: 14 },
  heroSection: {
    backgroundColor: "#ffffff", borderRadius: 24, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 28, alignItems: "center", gap: 10, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  heroGrad: { ...StyleSheet.absoluteFillObject },
  avatarWrap: { position: "relative", marginBottom: 4 },
  avatarCircle: { width: 86, height: 86, borderRadius: 28, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 28, fontWeight: "900" },
  cameraBtn: {
    position: "absolute", bottom: -4, right: -4,
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  heroName: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  roleBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  roleText: { fontSize: 12, fontWeight: "800" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ratingText: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  memberText: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },

  card: {
    backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#f1f5f9" },
  editBtnText: { fontSize: 12, fontWeight: "700", color: "#475569" },

  field: { gap: 5 },
  fieldLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  fieldReadOnly: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldInput: {
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 46,
    fontSize: 15, fontWeight: "600", color: "#0f172a", backgroundColor: "#f8fafc",
  },
  fieldDivider: { height: 1, backgroundColor: "#f1f5f9", marginHorizontal: -16 },

  saveBtnWrap: { borderRadius: 14, overflow: "hidden", marginTop: 2 },
  saveBtn: { height: 50, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skillChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  skillChipText: { fontSize: 12, fontWeight: "700" },

  statsCard: {
    backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, flexDirection: "row",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  statItem: { flex: 1, alignItems: "center", gap: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 18, fontWeight: "900" },
  statLbl: { fontSize: 9, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase" },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  infoText: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: "#fca5a5", borderRadius: 16,
    paddingVertical: 14, backgroundColor: "#fef2f2",
  },
  signOutText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
  shortcutRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 4,
  },
  shortcutIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  shortcutText: { flex: 1, fontSize: 14, fontWeight: "700", color: "#0f172a" },
});
