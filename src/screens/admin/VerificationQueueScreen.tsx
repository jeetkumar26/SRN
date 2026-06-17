import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, FlatList,
  ActivityIndicator, StatusBar, Alert, Modal, TextInput, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { customFetch } from "@workspace/api-client-react";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;

interface VerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  type: "phone" | "identity" | "business";
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  documents?: string[];
  phone?: string;
  businessName?: string;
}

const TYPE_ICONS: Record<string, string> = {
  phone: "smartphone",
  identity: "user-check",
  business: "briefcase",
};

const TYPE_COLORS: Record<string, string> = {
  phone: "#7c3aed",
  identity: "#0ea5e9",
  business: "#10b981",
};

export default function VerificationQueueScreen() {
  const navigation = useNavigation<NavProp>();

  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VerificationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [acting, setActing] = useState(false);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customFetch<{ requests: VerificationRequest[] }>(
        "/api/admin/verification/queue?status=pending&limit=50"
      );
      setRequests(res.requests ?? []);
    } catch {
      Alert.alert("Error", "Could not load verification queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleApprove = useCallback(async () => {
    if (!selected) return;
    setActing(true);
    try {
      await customFetch(`/api/verify/${selected.id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      setSelected(null);
      fetchQueue();
      Alert.alert("Approved", "The verification has been approved and the user notified.");
    } catch {
      Alert.alert("Error", "Could not approve verification.");
    } finally {
      setActing(false);
    }
  }, [selected, fetchQueue]);

  const handleReject = useCallback(async () => {
    if (!selected) return;
    if (!rejectionReason.trim()) {
      Alert.alert("Required", "Please provide a reason for rejection.");
      return;
    }
    setActing(true);
    try {
      await customFetch(`/api/verify/${selected.id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason: rejectionReason }),
      });
      setSelected(null);
      setRejectionReason("");
      fetchQueue();
      Alert.alert("Rejected", "The verification has been rejected and the user notified.");
    } catch {
      Alert.alert("Error", "Could not reject verification.");
    } finally {
      setActing(false);
    }
  }, [selected, rejectionReason, fetchQueue]);

  const renderItem = useCallback(({ item }: { item: VerificationRequest }) => {
    const icon = TYPE_ICONS[item.type] ?? "shield";
    const color = TYPE_COLORS[item.type] ?? "#7c3aed";
    const submittedAt = new Date(item.submittedAt).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
    return (
      <Pressable
        onPress={() => setSelected(item)}
        style={({ pressed }) => [styles.requestCard, { opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={[styles.typeIcon, { backgroundColor: color + "14" }]}>
          <Feather name={icon as any} size={18} color={color} />
        </View>
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{item.userName}</Text>
          <Text style={styles.requestMeta}>
            <Text style={[styles.requestType, { color }]}>{item.type.toUpperCase()}</Text>
            {"  ·  "}{item.userRole}{"  ·  "}{submittedAt}
          </Text>
          {item.phone && <Text style={styles.requestDetail}>📱 {item.phone}</Text>}
          {item.businessName && <Text style={styles.requestDetail}>🏢 {item.businessName}</Text>}
        </View>
        <Feather name="chevron-right" size={16} color="#cbd5e1" />
      </Pressable>
    );
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Verification Queue</Text>
        <Pressable onPress={fetchQueue} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={16} color="#64748b" />
        </Pressable>
      </View>

      {/* Count badge */}
      <View style={styles.countBanner}>
        <View style={styles.countBadge}>
          <Feather name="clock" size={14} color="#f59e0b" />
          <Text style={styles.countText}>{requests.length} pending review</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0f172a" size="large" />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Feather name="check-circle" size={28} color="#10b981" />
          </View>
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptySubtitle}>No pending verifications</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Detail modal */}
      <Modal visible={selected !== null} animationType="slide" presentationStyle="pageSheet">
        {selected && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Review Verification</Text>
              <Pressable
                onPress={() => { setSelected(null); setRejectionReason(""); }}
                style={styles.closeBtn}
              >
                <Feather name="x" size={20} color="#0f172a" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.userChip}>
                <View style={[styles.userIcon, { backgroundColor: TYPE_COLORS[selected.type] + "14" }]}>
                  <Feather name={TYPE_ICONS[selected.type] as any ?? "user"} size={20} color={TYPE_COLORS[selected.type]} />
                </View>
                <View>
                  <Text style={styles.userName}>{selected.userName}</Text>
                  <Text style={styles.userRole}>{selected.userRole}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>VERIFICATION TYPE</Text>
                <Text style={[styles.detailValue, { color: TYPE_COLORS[selected.type], fontWeight: "800" }]}>
                  {selected.type.toUpperCase()}
                </Text>
              </View>
              {selected.phone && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>PHONE</Text>
                  <Text style={styles.detailValue}>{selected.phone}</Text>
                </View>
              )}
              {selected.businessName && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>BUSINESS</Text>
                  <Text style={styles.detailValue}>{selected.businessName}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>SUBMITTED</Text>
                <Text style={styles.detailValue}>
                  {new Date(selected.submittedAt).toLocaleString("en-IN")}
                </Text>
              </View>

              {/* Rejection reason (shown for rejection flow) */}
              <Text style={styles.rulingLabel}>Rejection Reason (if rejecting)</Text>
              <TextInput
                style={styles.rulingInput}
                multiline
                value={rejectionReason}
                onChangeText={setRejectionReason}
                placeholder="Explain why this verification was rejected. The user will see this message."
                placeholderTextColor="#94a3b8"
                numberOfLines={4}
                textAlignVertical="top"
              />

              <View style={styles.actions}>
                <Pressable
                  onPress={handleApprove}
                  disabled={acting}
                  style={[styles.actionBtn, { backgroundColor: "#10b981" }]}
                >
                  {acting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Feather name="check" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Approve</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={handleReject}
                  disabled={acting}
                  style={[styles.actionBtn, { backgroundColor: "#ef4444" }]}
                >
                  {acting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Feather name="x" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Reject</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
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
  refreshBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center",
  },
  countBanner: {
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  countBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#fffbeb", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: "#fde68a",
  },
  countText: { fontSize: 12, fontWeight: "700", color: "#92400e" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  emptySubtitle: { fontSize: 13, fontWeight: "500", color: "#64748b" },
  listContent: { padding: 14, gap: 10 },
  requestCard: {
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  typeIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  requestInfo: { flex: 1, gap: 3 },
  requestName: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  requestMeta: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  requestType: { fontSize: 11, fontWeight: "800" },
  requestDetail: { fontSize: 11, fontWeight: "600", color: "#475569" },
  modal: { flex: 1, backgroundColor: "#f8fafc" },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  modalTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center",
  },
  modalScroll: { padding: 20, gap: 16 },
  userChip: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14, marginBottom: 4,
  },
  userIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  userName: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  userRole: { fontSize: 11, fontWeight: "600", color: "#64748b", marginTop: 2 },
  detailRow: { gap: 4 },
  detailLabel: { fontSize: 9, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.6 },
  detailValue: { fontSize: 14, fontWeight: "600", color: "#334155" },
  rulingLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.6, marginTop: 4 },
  rulingInput: {
    backgroundColor: "#fff", borderRadius: 16,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14, fontSize: 13, color: "#0f172a",
    minHeight: 100, fontWeight: "500",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 14, borderRadius: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 3,
  },
  actionBtnText: { fontSize: 14, fontWeight: "900", color: "#fff" },
});