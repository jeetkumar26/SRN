import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { createUser } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import type { UserRole } from "../../types/roles";

interface TypeOption {
  id: UserRole;
  title: string;
  desc: string;
  iconName: string;
  color: string;
}

// Admin role intentionally excluded — created directly in Firebase Console.
const ROLE_OPTIONS: TypeOption[] = [
  { id: "business", title: "Business / Startup", desc: "Post requirements & hire talent", iconName: "briefcase", color: "#7c3aed" },
  { id: "customer", title: "Personal / Customer", desc: "Find local & digital help", iconName: "user", color: "#2563eb" },
  { id: "digital", title: "Digital Skill Provider", desc: "Offer remote skills — dev, design & more", iconName: "monitor", color: "#0d9488" },
  { id: "local", title: "Local Service Provider", desc: "Offer local trade & physical services", iconName: "tool", color: "#ea580c" },
];

export default function OnboardingScreen() {
  const { firebaseUser, refreshProfile } = useAuth();

  const [name, setName] = useState(firebaseUser?.displayName ?? "");
  const [selected, setSelected] = useState<UserRole>("business");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");

  const handleContinue = async () => {
    setError("");
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!firebaseUser) { setError("You must be logged in."); return; }

    setRegistering(true);
    try {
      await createUser({
        name: name.trim(),
        email: (firebaseUser.email ?? "").toLowerCase().trim(),
        role: selected,
        ...(selected === "digital" && { title: "Freelancer" }),
        ...(selected === "local" && { title: "Local Contractor" }),
      });
      await refreshProfile();
    } catch (err: any) {
      setError(err.message ?? "Failed to complete onboarding. Check connection.");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient colors={["rgba(124,58,237,0.08)", "transparent"]} style={styles.orbTR} />
      <LinearGradient colors={["rgba(20,184,166,0.06)", "transparent"]} style={styles.orbBL} />

      {/* Progress bar */}
      <View style={styles.progressRow}>
        <View style={styles.stepBar}>
          <View style={[styles.stepFill, { backgroundColor: "#7c3aed" }]} />
        </View>
        <Text style={styles.stepLabel}>Set up your profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Let's get you{"\n"}set up</Text>
        <Text style={styles.sub}>
          Tell us your name and how you'll use SRN.
        </Text>

        {/* Name field */}
        <View style={styles.section}>
          <Text style={styles.label}>Your name</Text>
          <View style={styles.inputRow}>
            <Feather name="user" size={17} color="#94a3b8" style={{ marginRight: 10 }} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Aarav Sharma"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
          </View>
        </View>

        {/* Role label */}
        <Text style={styles.roleHeading}>I want to join as…</Text>

        {/* Role grid */}
        <View style={styles.grid}>
          {ROLE_OPTIONS.map((opt) => {
            const active = selected === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                style={({ pressed }) => [
                  styles.roleCard,
                  active && { borderColor: opt.color, borderWidth: 2 },
                  { transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}
              >
                {active && (
                  <LinearGradient
                    colors={[opt.color + "10", opt.color + "05"]}
                    style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
                  />
                )}
                <View style={[styles.roleIconWrap, { backgroundColor: opt.color + "14" }]}>
                  <Feather name={opt.iconName as any} size={22} color={opt.color} />
                </View>
                <Text style={[styles.roleTitle, active && { color: opt.color }]}>
                  {opt.title}
                </Text>
                <Text style={styles.roleDesc}>{opt.desc}</Text>
                {active && (
                  <View style={[styles.checkDot, { backgroundColor: opt.color }]}>
                    <Feather name="check" size={10} color="#fff" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={13} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={handleContinue}
          disabled={registering}
          style={({ pressed }) => [
            styles.continueBtn,
            { opacity: pressed || registering ? 0.88 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
        >
          <LinearGradient
            colors={["#7c3aed", "#6d28d9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueBtnGrad}
          >
            {registering ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.continueBtnText}>Continue to dashboard</Text>
                <Feather name="arrow-right" size={17} color="#fff" style={{ marginLeft: 8 }} />
              </>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  orbTR: { position: "absolute", top: -60, right: -50, width: 240, height: 240, borderRadius: 120 },
  orbBL: { position: "absolute", bottom: -50, left: -30, width: 180, height: 180, borderRadius: 90 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 6,
  },
  stepBar: {
    height: 4,
    flex: 1,
    backgroundColor: "#e2e8f0",
    borderRadius: 2,
    overflow: "hidden",
  },
  stepFill: { flex: 1, backgroundColor: "#7c3aed", borderRadius: 2 },
  stepLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", marginLeft: 4 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  heading: {
    fontSize: 30,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
    lineHeight: 36,
    marginBottom: 8,
  },
  sub: { fontSize: 14, fontWeight: "500", color: "#64748b", lineHeight: 20, marginBottom: 28 },
  section: { marginBottom: 24 },
  label: { fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 8, marginLeft: 2 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  input: { flex: 1, fontSize: 15, fontWeight: "600", color: "#0f172a" },
  roleHeading: { fontSize: 14, fontWeight: "700", color: "#0f172a", marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  roleCard: {
    width: "47%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: "hidden",
    position: "relative",
  },
  roleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  roleTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a", lineHeight: 18 },
  roleDesc: { fontSize: 11, fontWeight: "500", color: "#64748b", lineHeight: 16 },
  checkDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.15)",
  },
  errorText: { color: "#ef4444", fontSize: 12, fontWeight: "600", flex: 1 },
  continueBtn: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  continueBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
  },
  continueBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
});
