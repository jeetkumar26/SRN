import React, { useState, useCallback, useRef } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  TextInput, Alert, ActivityIndicator, StatusBar,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RouteProp } from "@react-navigation/native";
import { customFetch } from "@workspace/api-client-react";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "Dispute">;

const REASONS = [
  { key: "not_delivered", label: "Work Not Delivered", icon: "package" },
  { key: "quality_issue", label: "Quality Below Standard", icon: "alert-triangle" },
  { key: "late_delivery", label: "Late Delivery", icon: "clock" },
  { key: "payment_issue", label: "Payment Dispute", icon: "dollar-sign" },
  { key: "fraud", label: "Fraud / Misrepresentation", icon: "shield-off" },
  { key: "other", label: "Other", icon: "more-horizontal" },
];

export default function DisputeScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { bookingId, providerName, amount } = route.params;

  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Ref guard prevents re-entry between the time the button is tapped
  // and when the Alert confirmation fires (state update is async).
  const submittingRef = useRef(false);

  const reasonMissing = reason.length === 0;
  const descTooShort = description.trim().length < 20;
  const canSubmit = !reasonMissing && !descTooShort && !submitting;

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    if (reason.length === 0 || description.trim().length < 20) return;

    submittingRef.current = true;

    Alert.alert(
      "Raise Dispute",
      "This will open a formal dispute with our support team. Continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => { submittingRef.current = false; },
        },
        {
          text: "Submit Dispute",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            try {
              await customFetch("/api/disputes", {
                method: "POST",
                body: JSON.stringify({ bookingId, reason, description }),
              });
              Alert.alert(
                "Dispute Submitted",
                "Our team will review your dispute within 2 business days and contact you via email.",
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
            } catch {
              Alert.alert("Error", "Could not submit dispute. Please try again or contact support.");
            } finally {
              setSubmitting(false);
              submittingRef.current = false;
            }
          },
        },
      ]
    );
  }, [bookingId, reason, description, navigation]);

  // Build a user-facing hint so the disabled button is never silently broken.
  const validationHint = reasonMissing
    ? "Select a reason above to continue"
    : descTooShort && description.length > 0
    ? `${20 - description.trim().length} more characters needed`
    : descTooShort
    ? "Describe the issue to continue"
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Raise Dispute</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Booking info */}
          <View style={styles.bookingCard}>
            <View style={styles.bookingIcon}>
              <Feather name="alert-circle" size={20} color="#ef4444" />
            </View>
            <View style={styles.bookingInfo}>
              <Text style={styles.bookingProvider}>{providerName}</Text>
              <Text style={styles.bookingAmount}>
                Booking #...{bookingId.slice(-8)} · ₹{amount.toLocaleString("en-IN")}
              </Text>
            </View>
          </View>

          {/* Reason selection */}
          <Text style={styles.sectionTitle}>Reason for Dispute</Text>
          <View style={styles.reasonGrid}>
            {REASONS.map((r) => {
              const selected = reason === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setReason(r.key)}
                  style={[styles.reasonCard, selected && styles.reasonCardSelected]}
                >
                  <View style={[styles.reasonIcon, selected && styles.reasonIconSelected]}>
                    <Feather name={r.icon as any} size={16} color={selected ? "#ef4444" : "#64748b"} />
                  </View>
                  <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                    {r.label}
                  </Text>
                  {selected && (
                    <View style={styles.reasonCheck}>
                      <Feather name="check" size={10} color="#ef4444" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Description */}
          <Text style={styles.sectionTitle}>Description</Text>
          <View style={[styles.textAreaWrap, descTooShort && description.length > 0 && styles.textAreaWrapError]}>
            <TextInput
              style={styles.textArea}
              multiline
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the issue in detail — include dates, what was agreed, and what happened. Minimum 20 characters."
              placeholderTextColor="#94a3b8"
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={[styles.charCount, descTooShort && description.length > 0 && styles.charCountError]}>
              {description.length}/2000
            </Text>
          </View>

          {/* Notice */}
          <View style={styles.notice}>
            <Feather name="info" size={14} color="#0ea5e9" />
            <Text style={styles.noticeText}>
              Disputes are reviewed by our trust & safety team within 2 business days.
              All parties will be notified and given a chance to respond.
            </Text>
          </View>

          {/* Validation hint */}
          {validationHint && (
            <View style={styles.hintRow}>
              <Feather name="alert-circle" size={12} color="#f59e0b" />
              <Text style={styles.hintText}>{validationHint}</Text>
            </View>
          )}

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather
                  name="alert-circle"
                  size={16}
                  color={canSubmit ? "#fff" : "#94a3b8"}
                />
                <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
                  Submit Dispute
                </Text>
              </>
            )}
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
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
  scroll: { padding: 16, gap: 14 },

  bookingCard: {
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1.5, borderColor: "#fecaca",
    padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  bookingIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: "#ef444414",
    alignItems: "center", justifyContent: "center",
  },
  bookingInfo: { flex: 1 },
  bookingProvider: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  bookingAmount: { fontSize: 11, fontWeight: "600", color: "#64748b", marginTop: 3 },

  sectionTitle: {
    fontSize: 10, fontWeight: "700", color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  reasonCard: {
    width: "47.5%", backgroundColor: "#fff", borderRadius: 16,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 12, alignItems: "center", gap: 8,
    position: "relative",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02, shadowRadius: 3, elevation: 1,
  },
  reasonCardSelected: { borderColor: "#ef4444", backgroundColor: "#fef2f2" },
  reasonIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center", justifyContent: "center",
  },
  reasonIconSelected: { backgroundColor: "#ef444420" },
  reasonLabel: { fontSize: 11, fontWeight: "700", color: "#334155", textAlign: "center" },
  reasonLabelSelected: { color: "#ef4444" },
  reasonCheck: {
    position: "absolute", top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#fecaca", alignItems: "center", justifyContent: "center",
  },

  textAreaWrap: {
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  textAreaWrapError: { borderColor: "#fca5a5" },
  textArea: { fontSize: 14, color: "#0f172a", minHeight: 120, fontWeight: "500" },
  charCount: { fontSize: 10, fontWeight: "600", color: "#94a3b8", textAlign: "right", marginTop: 8 },
  charCountError: { color: "#ef4444" },

  notice: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "#f0f9ff", borderRadius: 14,
    borderWidth: 1, borderColor: "#bae6fd",
    padding: 12,
  },
  noticeText: { flex: 1, fontSize: 11, fontWeight: "600", color: "#0369a1", lineHeight: 16 },

  hintRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#fffbeb", borderRadius: 12,
    borderWidth: 1, borderColor: "#fde68a",
    paddingHorizontal: 12, paddingVertical: 8,
  },
  hintText: { fontSize: 12, fontWeight: "700", color: "#92400e", flex: 1 },

  submitBtn: {
    backgroundColor: "#ef4444", borderRadius: 16,
    paddingVertical: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: "#ef4444", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: "#f1f5f9", shadowOpacity: 0, elevation: 0,
  },
  submitText: { fontSize: 15, fontWeight: "900", color: "#fff" },
  submitTextDisabled: { color: "#94a3b8" },
});