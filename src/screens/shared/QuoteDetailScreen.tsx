import React, { useState } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  ActivityIndicator, Alert, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RouteProp } from "@react-navigation/native";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, "QuoteDetail">;

const ACCENT = "#7c3aed";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:        { bg: "#fef9c3", text: "#92400e", label: "Pending" },
  shortlisted:    { bg: "#dbeafe", text: "#1e40af", label: "Shortlisted" },
  accepted:       { bg: "#d1fae5", text: "#065f46", label: "Accepted" },
  rejected:       { bg: "#fee2e2", text: "#991b1b", label: "Rejected" },
  withdrawn:      { bg: "#f1f5f9", text: "#475569", label: "Withdrawn" },
  counter_offered:{ bg: "#ede9fe", text: "#4c1d95", label: "Counter-offered" },
  expired:        { bg: "#f1f5f9", text: "#64748b", label: "Expired" },
};

export default function QuoteDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const { params } = useRoute<RouteType>();
  const { profile } = useAuth();

  const [acting, setActing] = useState<"accepting" | "rejecting" | null>(null);

  const statusCfg = STATUS_STYLE[params.status] ?? STATUS_STYLE.pending!;
  const canAct = params.status === "pending";

  const handleAction = async (newStatus: "accepted" | "rejected") => {
    setActing(newStatus === "accepted" ? "accepting" : "rejecting");
    try {
      await customFetch(`/api/quotes/${params.quoteId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      const msg = newStatus === "accepted"
        ? "Provider hired — booking has been created!"
        : "Proposal rejected.";
      Alert.alert(newStatus === "accepted" ? "Hired!" : "Rejected", msg, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err?.data?.error ?? "Action failed. Please try again.");
    } finally {
      setActing(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Proposal Details</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.statusBannerText, { color: statusCfg.text }]}>
            {statusCfg.label}
          </Text>
        </View>

        {/* Requirement */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>For requirement</Text>
          <Text style={styles.cardValue}>{params.requirementTitle}</Text>
        </View>

        {/* Provider info */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Provider</Text>
          <View style={styles.providerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{params.senderName[0]?.toUpperCase()}</Text>
            </View>
            <Text style={styles.providerName}>{params.senderName}</Text>
          </View>
        </View>

        {/* Offer details */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Offer</Text>
          <View style={styles.offerRow}>
            <View style={styles.offerItem}>
              <Feather name="dollar-sign" size={20} color={ACCENT} />
              <Text style={styles.offerValue}>₹{params.amount.toLocaleString()}</Text>
              <Text style={styles.offerSub}>Bid amount</Text>
            </View>
            <View style={styles.offerDivider} />
            <View style={styles.offerItem}>
              <Feather name="clock" size={20} color={ACCENT} />
              <Text style={styles.offerValue}>{params.durationDays}</Text>
              <Text style={styles.offerSub}>Days to deliver</Text>
            </View>
          </View>
        </View>

        {/* Cover letter */}
        {!!params.message && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Cover letter</Text>
            <Text style={styles.messageText}>{params.message}</Text>
          </View>
        )}

        {/* Submitted date */}
        {!!params.createdAt && (
          <Text style={styles.dateText}>
            Submitted {new Date(params.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </Text>
        )}

        {/* Actions */}
        {canAct && (
          <View style={styles.actions}>
            <Pressable
              onPress={() => handleAction("accepted")}
              disabled={!!acting}
              style={[styles.acceptBtn, acting && { opacity: 0.7 }]}
            >
              {acting === "accepting"
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={styles.acceptBtnText}>Accept & Hire</Text>
                  </>
                )}
            </Pressable>
            <Pressable
              onPress={() => handleAction("rejected")}
              disabled={!!acting}
              style={[styles.rejectBtn, acting && { opacity: 0.7 }]}
            >
              {acting === "rejecting"
                ? <ActivityIndicator color="#ef4444" size="small" />
                : (
                  <>
                    <Feather name="x" size={16} color="#ef4444" />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </>
                )}
            </Pressable>
          </View>
        )}
      </ScrollView>
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
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  statusBanner: { borderRadius: 14, padding: 14, alignItems: "center" },
  statusBannerText: { fontSize: 14, fontWeight: "800", textTransform: "capitalize" },
  card: {
    backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, gap: 10,
  },
  cardLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 },
  cardValue: { fontSize: 15, fontWeight: "800", color: "#0f172a", lineHeight: 22 },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 13, backgroundColor: ACCENT + "14", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800", color: ACCENT },
  providerName: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  offerRow: { flexDirection: "row", alignItems: "center" },
  offerItem: { flex: 1, alignItems: "center", gap: 6, padding: 8 },
  offerDivider: { width: 1, height: 60, backgroundColor: "#e2e8f0" },
  offerValue: { fontSize: 22, fontWeight: "900", color: "#0f172a", letterSpacing: -0.5 },
  offerSub: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  messageText: { fontSize: 14, fontWeight: "500", color: "#475569", lineHeight: 22 },
  dateText: { fontSize: 11, fontWeight: "600", color: "#94a3b8", textAlign: "center" },
  actions: { gap: 10, marginTop: 4 },
  acceptBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#10b981", borderRadius: 16, height: 52,
    shadowColor: "#10b981", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  acceptBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  rejectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#fef2f2", borderRadius: 16, height: 52,
    borderWidth: 1.5, borderColor: "#fca5a5",
  },
  rejectBtnText: { color: "#ef4444", fontSize: 15, fontWeight: "700" },
});