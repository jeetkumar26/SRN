import React, { useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  Alert, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import auth from "@react-native-firebase/auth";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import { ROLE_COLORS, ROLE_LABELS } from "../../types/roles";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;

interface SettingRowProps {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  accent?: string;
  danger?: boolean;
}

function SettingRow({ icon, label, subtitle, onPress, accent, danger }: SettingRowProps) {
  const iconColor = danger ? "#ef4444" : accent ?? "#7c3aed";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconColor + "14" }]}>
        <Feather name={icon as any} size={16} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && { color: "#ef4444" }]}>{label}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Feather name="chevron-right" size={16} color={danger ? "#fca5a5" : "#cbd5e1"} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile, role, signOut } = useAuth();

  const isProvider = role === "digital" || role === "local";
  const roleColor = role ? ROLE_COLORS[role] : "#7c3aed";
  const roleLabel = role ? ROLE_LABELS[role] : "User";

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all data. You have 30 days to cancel before deletion is final.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete My Account",
          style: "destructive",
          onPress: async () => {
            try {
              await customFetch("/api/gdpr/account", { method: "DELETE" });
              await signOut();
            } catch {
              Alert.alert("Error", "Could not delete account. Please contact support.");
            }
          },
        },
      ]
    );
  }, [signOut]);

  const handleSignOut = useCallback(() => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  }, [signOut]);

  const initials = (profile?.name ?? "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Account card */}
        <View style={styles.accountCard}>
          <View style={[styles.accountAvatar, { backgroundColor: roleColor + "18", borderColor: roleColor + "40" }]}>
            <Text style={[styles.accountInitials, { color: roleColor }]}>{initials}</Text>
          </View>
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>{profile?.name ?? "User"}</Text>
            <Text style={styles.accountEmail}>{profile?.email ?? ""}</Text>
            <View style={[styles.roleBadge, { backgroundColor: roleColor + "14" }]}>
              <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.sectionCard}>
            <SettingRow
              icon="user"
              label="Edit Profile"
              subtitle="Name, title, bio, phone"
              onPress={() => navigation.goBack()}
              accent={roleColor}
            />
            <View style={styles.rowDivider} />
            <SettingRow
              icon="credit-card"
              label="Subscription"
              subtitle="Plans & billing"
              onPress={() => navigation.navigate("Subscription")}
              accent={roleColor}
            />
          </View>
        </View>

        {/* Provider tools */}
        {isProvider && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Provider Tools</Text>
            <View style={styles.sectionCard}>
              <SettingRow
                icon="calendar"
                label="Availability"
                subtitle="Working hours & blocked dates"
                onPress={() => navigation.navigate("Availability")}
                accent={roleColor}
              />
            </View>
          </View>
        )}

        {/* Privacy & Security */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Privacy & Security</Text>
          <View style={styles.sectionCard}>
            <SettingRow
              icon="smartphone"
              label="Verify Phone Number"
              subtitle="Add & verify your phone for trust"
              onPress={() => navigation.navigate("PhoneVerification")}
              accent={roleColor}
            />
            <View style={styles.rowDivider} />
            <SettingRow
              icon="lock"
              label="Change Password"
              subtitle="Update via email link"
              onPress={() =>
                Alert.alert("Password Reset", "A reset link will be sent to your email.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Send Link",
                    onPress: async () => {
                      try {
                        if (!profile?.email) return;
                        await auth().sendPasswordResetEmail(profile.email);
                        Alert.alert("Sent", "Check your email for the reset link.");
                      } catch {
                        Alert.alert("Error", "Could not send reset email.");
                      }
                    },
                  },
                ])
              }
              accent={roleColor}
            />
            <View style={styles.rowDivider} />
            <SettingRow
              icon="download"
              label="Export My Data"
              subtitle="GDPR data export"
              onPress={() =>
                Alert.alert(
                  "Export Data",
                  "We'll email you a link to download your data within 24 hours.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Export Data",
                      onPress: async () => {
                        try {
                          await customFetch("/api/gdpr/export");
                          Alert.alert("Success", "Your data export is ready. Check your email.");
                        } catch {
                          Alert.alert("Error", "Could not export data.");
                        }
                      },
                    },
                  ]
                )
              }
              accent={roleColor}
            />
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>About</Text>
          <View style={styles.sectionCard}>
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: "#7c3aed14" }]}>
                <Feather name="info" size={16} color="#7c3aed" />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>SRN — Skill Requirement Network</Text>
                <Text style={styles.rowSubtitle}>Version 1.0.0</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Danger zone */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <SettingRow
              icon="log-out"
              label="Sign Out"
              onPress={handleSignOut}
              danger
            />
            <View style={styles.rowDivider} />
            <SettingRow
              icon="trash-2"
              label="Delete Account"
              subtitle="Permanently removes all your data"
              onPress={handleDeleteAccount}
              danger
            />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  scroll: { padding: 16, gap: 8 },

  accountCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, flexDirection: "row", alignItems: "center", gap: 14,
    marginBottom: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  accountAvatar: {
    width: 56, height: 56, borderRadius: 18,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  accountInitials: { fontSize: 18, fontWeight: "900" },
  accountInfo: { flex: 1, gap: 4 },
  accountName: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  accountEmail: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  roleBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roleText: { fontSize: 10, fontWeight: "800" },

  section: { gap: 6 },
  sectionLabel: {
    fontSize: 10, fontWeight: "700", color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  rowSubtitle: { fontSize: 11, fontWeight: "500", color: "#94a3b8", marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: "#f1f5f9", marginLeft: 64 },
});