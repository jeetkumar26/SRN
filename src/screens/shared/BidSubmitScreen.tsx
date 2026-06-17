import React, { useState } from "react";
import {
  StyleSheet, Text, View, Pressable, TextInput,
  ActivityIndicator, Alert, StatusBar, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RouteProp } from "@react-navigation/native";
import { customFetch } from "@workspace/api-client-react";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, "BidSubmit">;

const ACCENT = "#0d9488";

export default function BidSubmitScreen() {
  const navigation = useNavigation<NavProp>();
  const { params } = useRoute<RouteType>();

  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const parsedAmount = parseInt(amount, 10);
    const parsedDays = parseInt(days, 10);

    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert("Validation", "Please enter a valid bid amount.");
      return;
    }
    if (!parsedDays || parsedDays <= 0) {
      Alert.alert("Validation", "Please enter a valid number of days.");
      return;
    }
    if (parsedAmount > params.maxBudget) {
      Alert.alert(
        "Over budget",
        `Your bid (₹${parsedAmount.toLocaleString()}) exceeds the client's maximum budget (₹${params.maxBudget.toLocaleString()}). Continue anyway?`,
        [
          { text: "Go back", style: "cancel" },
          { text: "Submit anyway", onPress: () => doSubmit(parsedAmount, parsedDays) },
        ]
      );
      return;
    }
    doSubmit(parsedAmount, parsedDays);
  };

  const doSubmit = async (parsedAmount: number, parsedDays: number) => {
    setSubmitting(true);
    try {
      await customFetch("/api/quotes", {
        method: "POST",
        body: JSON.stringify({
          requirementId: params.requirementId,
          receiverId: params.receiverId,
          amount: parsedAmount,
          durationDays: parsedDays,
          message: message.trim(),
        }),
      });
      Alert.alert("Proposal sent!", "Your proposal has been submitted.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const msg = err?.data?.error ?? err?.message ?? "Failed to submit proposal.";
      Alert.alert("Error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Submit Proposal</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          {/* Requirement context */}
          <View style={styles.contextCard}>
            <Text style={styles.contextLabel}>Proposal for</Text>
            <Text style={styles.contextTitle}>{params.requirementTitle}</Text>
            <View style={styles.budgetHint}>
              <Feather name="info" size={13} color={ACCENT} />
              <Text style={styles.budgetHintText}>
                Client budget: up to ₹{params.maxBudget.toLocaleString()}
              </Text>
            </View>
          </View>

          {/* Amount */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Your Bid Amount (₹) *</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputPrefix}>
                <Text style={styles.inputPrefixText}>₹</Text>
              </View>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="e.g. 15000"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                style={styles.amountInput}
              />
            </View>
          </View>

          {/* Duration */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Delivery Time (days) *</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={days}
                onChangeText={setDays}
                placeholder="e.g. 14"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                style={[styles.fieldInput, { flex: 1 }]}
              />
              <View style={styles.inputSuffix}>
                <Text style={styles.inputSuffixText}>days</Text>
              </View>
            </View>
          </View>

          {/* Cover letter */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Cover Letter</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Describe your approach, relevant experience, and why you're the best fit…"
              placeholderTextColor="#94a3b8"
              multiline
              style={styles.textArea}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{message.length} / 500</Text>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [styles.submitBtn, { opacity: pressed || submitting ? 0.85 : 1 }]}
          >
            <LinearGradient
              colors={[ACCENT, "#0f766e"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGrad}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Feather name="send" size={16} color="#fff" />
                    <Text style={styles.submitText}>Send Proposal</Text>
                  </>
                )}
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  scroll: { padding: 20, gap: 20, paddingBottom: 48 },
  contextCard: {
    backgroundColor: ACCENT + "08", borderRadius: 16, padding: 16, gap: 6,
    borderWidth: 1, borderColor: ACCENT + "20",
  },
  contextLabel: { fontSize: 11, fontWeight: "700", color: ACCENT, textTransform: "uppercase", letterSpacing: 0.5 },
  contextTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", lineHeight: 21 },
  budgetHint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  budgetHintText: { fontSize: 12, fontWeight: "600", color: ACCENT },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#fff", overflow: "hidden" },
  inputPrefix: { paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#f1f5f9", borderRightWidth: 1, borderRightColor: "#e2e8f0" },
  inputPrefixText: { fontSize: 16, fontWeight: "700", color: "#475569" },
  inputSuffix: { paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#f1f5f9", borderLeftWidth: 1, borderLeftColor: "#e2e8f0" },
  inputSuffixText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  amountInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: "700", color: "#0f172a" },
  fieldInput: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: "600", color: "#0f172a" },
  textArea: {
    borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12,
    backgroundColor: "#fff", padding: 14, height: 130,
    fontSize: 14, fontWeight: "500", color: "#0f172a", lineHeight: 21,
  },
  charCount: { fontSize: 11, fontWeight: "600", color: "#94a3b8", textAlign: "right" },
  submitBtn: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  submitGrad: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});