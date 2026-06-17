import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import auth from "@react-native-firebase/auth";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import LinearGradient from "react-native-linear-gradient";
import Feather from "react-native-vector-icons/Feather";
import FontAwesome from "react-native-vector-icons/FontAwesome";
import { useNavigation } from "@react-navigation/native";
import { DEV_BYPASS_AUTH } from "../../config/env";
import { useAuth } from "../../contexts/AuthContext";
import type { UserRole } from "../../types/roles";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEV_ROLES: { role: UserRole; label: string; icon: string; color: string }[] = [
  { role: "business", label: "Business / Startup", icon: "briefcase", color: "#7c3aed" },
  { role: "customer", label: "Personal / Customer", icon: "user", color: "#2563eb" },
  { role: "digital", label: "Digital Skill Provider", icon: "monitor", color: "#0d9488" },
  { role: "local", label: "Local Service Provider", icon: "map-pin", color: "#ea580c" },
];

export default function LoginScreen() {
  const navigation = useNavigation();
  const { bypassLogin } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ─── DEV BYPASS ───────────────────────────────────────────────────────────
  if (DEV_BYPASS_AUTH) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <LinearGradient colors={["rgba(124,58,237,0.09)", "transparent"]} style={styles.orbTR} />
        <LinearGradient colors={["rgba(20,184,166,0.06)", "transparent"]} style={styles.orbBL} />

        <ScrollView contentContainerStyle={styles.devContent} showsVerticalScrollIndicator={false}>
          <View style={styles.devBadge}>
            <Feather name="zap" size={11} color="#fff" />
            <Text style={styles.devBadgeText}>DEV MODE — Auth Bypassed</Text>
          </View>

          <Text style={styles.devTitle}>Quick Login</Text>
          <Text style={styles.devSub}>Tap a role to enter the app instantly.</Text>

          <View style={{ gap: 12, marginTop: 8 }}>
            {DEV_ROLES.map((item) => (
              <Pressable
                key={item.role}
                onPress={() => bypassLogin(item.role)}
                style={({ pressed }) => [
                  styles.devRoleCard,
                  { borderColor: item.color + "44", opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
                ]}
              >
                <View style={[styles.devRoleIcon, { backgroundColor: item.color + "14" }]}>
                  <Feather name={item.icon as any} size={20} color={item.color} />
                </View>
                <Text style={styles.devRoleLabel}>{item.label}</Text>
                <Feather name="arrow-right" size={16} color={item.color} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── AUTH VALIDATION ──────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!email.trim()) return "Please enter your email address.";
    if (!EMAIL_REGEX.test(email.trim())) return "Please enter a valid email address.";
    if (!password) return "Please enter your password.";
    if (isRegistering && password.length < 8) return "Password must be at least 8 characters.";
    if (isRegistering && !/[A-Z]/.test(password)) return "Password must contain one uppercase letter.";
    if (isRegistering && !/[0-9]/.test(password)) return "Password must contain one number.";
    return null;
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      setError("Enter your email address above, then tap Forgot Password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await auth().sendPasswordResetEmail(email.trim().toLowerCase());
      Alert.alert("Email sent", "Check your inbox for a password reset link.");
    } catch (e: any) {
      setError(mapFirebaseError(e.code, false));
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setLoading(true);
    try {
      if (isRegistering) {
        await auth().createUserWithEmailAndPassword(email.trim().toLowerCase(), password);
      } else {
        await auth().signInWithEmailAndPassword(email.trim().toLowerCase(), password);
      }
    } catch (e: any) {
      setError(mapFirebaseError(e.code, isRegistering));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (response.type === "cancelled") return;
      const { idToken } = response.data;
      if (!idToken) {
        setError("Google sign-in failed: no identity token received.");
        return;
      }
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      await auth().signInWithCredential(googleCredential);
    } catch (e: any) {
      if (e.code === statusCodes.IN_PROGRESS) {
        setError("Sign-in already in progress.");
      } else if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError("Google Play Services not available on this device.");
      } else {
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const has8 = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasNum = /[0-9]/.test(password);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <LinearGradient colors={["rgba(124,58,237,0.09)", "transparent"]} style={styles.orbTR} />
      <LinearGradient colors={["rgba(20,184,166,0.06)", "transparent"]} style={styles.orbBL} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#0f172a" />
        </Pressable>

        {/* Title */}
        <View style={styles.titleSection}>
          <View style={styles.logoSmall}>
            <LinearGradient colors={["#7c3aed", "#0d9488"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoSmallGrad}>
              <Feather name="zap" size={20} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={styles.title}>{isRegistering ? "Create Account" : "Welcome back"}</Text>
          <Text style={styles.titleSub}>
            {isRegistering
              ? "Join India's largest skill-requirement network."
              : "Sign in to continue."}
          </Text>
        </View>

        {/* Toggle tabs */}
        <View style={styles.tabs}>
          <Pressable
            onPress={() => { setIsRegistering(false); setError(""); }}
            style={[styles.tab, !isRegistering && styles.tabActive]}
          >
            <Text style={[styles.tabText, !isRegistering && styles.tabTextActive]}>Sign In</Text>
          </Pressable>
          <Pressable
            onPress={() => { setIsRegistering(true); setError(""); }}
            style={[styles.tab, isRegistering && styles.tabActive]}
          >
            <Text style={[styles.tabText, isRegistering && styles.tabTextActive]}>Register</Text>
          </Pressable>
        </View>

        {/* Form */}
        <View style={{ gap: 14 }}>
          {/* Email */}
          <View>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputRow}>
              <Feather name="mail" size={17} color="#94a3b8" style={{ marginRight: 10 }} />
              <TextInput
                value={email}
                onChangeText={(v) => { setEmail(v); setError(""); }}
                placeholder="you@email.com"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>
          </View>

          {/* Password */}
          <View>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <Feather name="lock" size={17} color="#94a3b8" style={{ marginRight: 10 }} />
              <TextInput
                value={password}
                onChangeText={(v) => { setPassword(v); setError(""); }}
                placeholder={isRegistering ? "Min. 8 chars, 1 uppercase, 1 number" : "••••••••"}
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={16} color="#94a3b8" />
              </Pressable>
            </View>
          </View>

          {/* Password hints */}
          {isRegistering && (
            <View style={styles.hints}>
              <Hint met={has8} label="At least 8 characters" />
              <Hint met={hasUpper} label="One uppercase letter" />
              <Hint met={hasNum} label="One number" />
            </View>
          )}

          {/* Forgot password */}
          {!isRegistering && (
            <Pressable onPress={handleForgotPassword} style={{ alignSelf: "flex-end" }}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          )}

          {/* Error */}
          {!!error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Submit */}
          <Pressable
            onPress={handleAuth}
            disabled={loading || googleLoading}
            style={({ pressed }) => [
              styles.submitBtn,
              { opacity: pressed || loading ? 0.88 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <LinearGradient
              colors={["#7c3aed", "#6d28d9"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitBtnGrad}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.submitBtnText}>
                    {isRegistering ? "Create Account" : "Sign In"}
                  </Text>
                  <Feather name="arrow-right" size={17} color="#fff" style={{ marginLeft: 8 }} />
                </>
              )}
            </LinearGradient>
          </Pressable>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign-In */}
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={loading || googleLoading}
            style={({ pressed }) => [
              styles.googleBtn,
              { opacity: pressed || googleLoading ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            {googleLoading ? (
              <ActivityIndicator color="#444" />
            ) : (
              <>
                <FontAwesome name="google" size={18} color="#EA4335" style={{ marginRight: 10 }} />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Hint({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Feather name={met ? "check-circle" : "circle"} size={12} color={met ? "#10b981" : "#94a3b8"} />
      <Text style={{ fontSize: 11, fontWeight: "600", color: met ? "#10b981" : "#94a3b8" }}>{label}</Text>
    </View>
  );
}

function mapFirebaseError(code: string | undefined, isRegistering: boolean): string {
  switch (code) {
    case "auth/email-already-in-use": return "That email is already registered. Please sign in.";
    case "auth/invalid-credential":
    case "auth/wrong-password": return "Incorrect email or password.";
    case "auth/user-not-found": return "No account found. Please register.";
    case "auth/too-many-requests": return "Too many attempts. Try again later.";
    case "auth/network-request-failed": return "Network error. Check your connection.";
    case "auth/weak-password": return "Password is too weak.";
    case "auth/invalid-email": return "Invalid email format.";
    default: return isRegistering ? "Registration failed. Try again." : "Sign in failed.";
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  orbTR: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  orbBL: {
    position: "absolute",
    bottom: -60,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 24,
  },
  titleSection: {
    marginBottom: 28,
  },
  logoSmall: {
    marginBottom: 16,
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
    alignSelf: "flex-start",
  },
  logoSmallGrad: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  titleSub: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
    lineHeight: 20,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8",
  },
  tabTextActive: {
    color: "#0f172a",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 7,
    marginLeft: 2,
  },
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
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  hints: {
    gap: 5,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  forgotText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7c3aed",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.15)",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  submitBtn: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
    marginTop: 6,
  },
  submitBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  // DEV styles
  devContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  devBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#f59e0b",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    marginBottom: 24,
  },
  devBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  devTitle: { fontSize: 28, fontWeight: "900", color: "#0f172a", marginBottom: 6 },
  devSub: { fontSize: 14, fontWeight: "500", color: "#64748b", marginBottom: 20 },
  devRoleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  devRoleIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  devRoleLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    paddingVertical: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  googleBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
});
