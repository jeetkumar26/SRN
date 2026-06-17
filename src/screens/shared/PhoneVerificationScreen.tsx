import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, TextInput,
  Alert, ActivityIndicator, StatusBar, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import { ROLE_COLORS } from "../../types/roles";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;

type Step = "phone" | "otp";

export default function PhoneVerificationScreen() {
  const navigation = useNavigation<NavProp>();
  const { role } = useAuth();
  const roleColor = role ? ROLE_COLORS[role] : "#7c3aed";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpRefs = useRef<Array<TextInput | null>>([null, null, null, null, null, null]);

  const startCooldown = useCallback(() => {
    setResendCooldown(60);
    cooldownTimer.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  const handleSendOtp = useCallback(async () => {
    const trimmed = phone.replace(/\D/g, "");
    if (trimmed.length < 10) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit phone number.");
      return;
    }
    setLoading(true);
    try {
      await customFetch("/api/verify/phone/send", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: `+91${trimmed.slice(-10)}` }),
      });
      setStep("otp");
      startCooldown();
    } catch (e: any) {
      const msg = e?.message ?? "Could not send OTP. Please try again.";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  }, [phone, startCooldown]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      const trimmed = phone.replace(/\D/g, "");
      await customFetch("/api/verify/phone/send", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: `+91${trimmed.slice(-10)}` }),
      });
      startCooldown();
      Alert.alert("OTP Resent", "A new OTP has been sent to your number.");
    } catch {
      Alert.alert("Error", "Could not resend OTP.");
    } finally {
      setLoading(false);
    }
  }, [resendCooldown, phone, startCooldown]);

  const handleOtpChange = useCallback((val: string, idx: number) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) {
      otpRefs.current[idx + 1]?.focus();
    }
  }, [otp]);

  const handleOtpKeyPress = useCallback((key: string, idx: number) => {
    if (key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  }, [otp]);

  const handleVerify = useCallback(async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      Alert.alert("Invalid OTP", "Please enter all 6 digits.");
      return;
    }
    setLoading(true);
    try {
      await customFetch("/api/verify/phone/confirm", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      Alert.alert(
        "Verified!",
        "Your phone number has been verified successfully.",
        [{ text: "Done", onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      const msg = e?.message ?? "Incorrect OTP. Please try again.";
      Alert.alert("Verification Failed", msg);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [otp, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Verify Phone</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: roleColor + "14" }]}>
            <Feather name="smartphone" size={32} color={roleColor} />
          </View>

          {step === "phone" ? (
            <>
              <Text style={styles.title}>Add Your Phone</Text>
              <Text style={styles.subtitle}>
                We'll send a 6-digit OTP to verify your number. Your phone number helps build trust with clients.
              </Text>

              {/* Phone input */}
              <View style={[styles.inputWrap, { borderColor: roleColor + "40" }]}>
                <View style={styles.dialCode}>
                  <Text style={styles.dialCodeText}>+91</Text>
                </View>
                <View style={styles.inputDivider} />
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  maxLength={15}
                  autoFocus
                />
              </View>

              <Pressable
                onPress={handleSendOtp}
                disabled={loading || phone.replace(/\D/g, "").length < 10}
                style={[
                  styles.primaryBtn,
                  { backgroundColor: roleColor },
                  (loading || phone.replace(/\D/g, "").length < 10) && styles.btnDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send OTP</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Enter OTP</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to{"\n"}
                <Text style={{ fontWeight: "800", color: "#0f172a" }}>+91 {phone.replace(/\D/g, "").slice(-10)}</Text>
              </Text>

              {/* OTP boxes */}
              <View style={styles.otpRow}>
                {otp.map((digit, idx) => (
                  <TextInput
                    key={idx}
                    ref={(r) => { otpRefs.current[idx] = r; }}
                    style={[
                      styles.otpBox,
                      digit ? { borderColor: roleColor, backgroundColor: roleColor + "08" } : {},
                    ]}
                    value={digit}
                    onChangeText={(val) => handleOtpChange(val, idx)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, idx)}
                    keyboardType="number-pad"
                    maxLength={1}
                    textAlign="center"
                    selectTextOnFocus
                  />
                ))}
              </View>

              <Pressable
                onPress={handleVerify}
                disabled={loading || otp.join("").length !== 6}
                style={[
                  styles.primaryBtn,
                  { backgroundColor: roleColor },
                  (loading || otp.join("").length !== 6) && styles.btnDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify</Text>
                )}
              </Pressable>

              {/* Resend */}
              <Pressable onPress={handleResend} disabled={resendCooldown > 0 || loading}>
                <Text style={[styles.resendText, resendCooldown > 0 && { color: "#94a3b8" }]}>
                  {resendCooldown > 0
                    ? `Resend OTP in ${resendCooldown}s`
                    : "Didn't receive it? Resend OTP"}
                </Text>
              </Pressable>

              {/* Change number */}
              <Pressable onPress={() => { setStep("phone"); setOtp(["", "", "", "", "", ""]); }}>
                <Text style={[styles.resendText, { color: "#94a3b8", marginTop: 0 }]}>Change number</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
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
  content: {
    flex: 1, padding: 32, alignItems: "center", justifyContent: "center", gap: 20,
  },
  iconWrap: {
    width: 80, height: 80, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: "900", color: "#0f172a", textAlign: "center" },
  subtitle: { fontSize: 14, fontWeight: "500", color: "#64748b", textAlign: "center", lineHeight: 22 },

  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 2, overflow: "hidden",
    width: "100%", height: 58,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  dialCode: { paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  dialCodeText: { fontSize: 15, fontWeight: "800", color: "#334155" },
  inputDivider: { width: 1, height: 32, backgroundColor: "#e2e8f0" },
  phoneInput: {
    flex: 1, paddingHorizontal: 16, fontSize: 16,
    fontWeight: "700", color: "#0f172a", height: "100%",
  },

  otpRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
  otpBox: {
    width: 46, height: 56, borderRadius: 14,
    borderWidth: 2, borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    fontSize: 22, fontWeight: "900", color: "#0f172a",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },

  primaryBtn: {
    width: "100%", paddingVertical: 16, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  btnDisabled: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  primaryBtnText: { fontSize: 16, fontWeight: "900", color: "#fff" },

  resendText: {
    fontSize: 13, fontWeight: "700", color: "#7c3aed",
    textDecorationLine: "underline",
  },
});