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

interface Dispute {
  id: string;
  bookingId: string;
  raisedBy: { uid: string; name: string; role: string };
  against: { uid: string; name: string; role: string };
  reason: string;
  description: string;
  status: "open" | "under_review" | "resolved" | "dismissed";
  createdAt: string;
  bookingAmount?: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: "#fef2f2", text: "#ef4444" },
  under_review: { bg: "#fffbeb", text: "#f59e0b" },
  resolved: { bg: "#f0fdf4", text: "#10b981" },
  dismissed: { bg: "#f8fafc", text: "#94a3b8" },
};

const STATUS_FILTERS = ["all", "open", "under_review", "resolved", "dismissed"] as const;

export default function DisputesManagementScreen() {
  const navigation = useNavigation<NavProp>();

  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [ruling, setRuling] = useState("");
  const [resolving, setResolving] = useState(false);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customFetch<{ disputes: Dispute[] }>(
        `/api/admin/disputes?status=${statusFilter === "all" ? "" : statusFilter}&limit=50`
      );
      setDisputes(res.disputes ?? []);
    } catch {
      Alert.alert("Error", "Could not load disputes.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  const handleResolve = useCallback(async (resolution: "resolved" | "dismissed") => {
    if (!selected) return;
    if (!ruling.trim()) {
      Alert.alert("Required", "Please add a ruling/notes before closing this dispute.");
      return;
    }
    setResolving(true);
    try {
      await customFetch(`/api/admin/disputes/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: resolution, adminNotes: ruling }),
      });
      setSelected(null);
      setRuling("");
      fetchDisputes();
    } catch {
      Alert.alert("Error", "Could not update dispute.");
    } finally {
      setResolving(false);
    }
  }, [selected, ruling, fetchDisputes]);

  const handleMarkUnderReview = useCallback(async (dispute: Dispute) => {
    try {
      await customFetch(`/api/admin/disputes/${dispute.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "under_review" }),
      });
      fetchDisputes();
    } catch {
      Alert.alert("Error", "Could not update status.");
    }
  }, [fetchDisputes]);

  const renderDispute = useCallback(({ item }: { item: Dispute }) => {
    const sc = STATUS_COLORS[item.status] ?? STATUS_COLORS.open;
    const createdAt = new Date(item.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    return (
      <Pressable
        onPress={() => setSelected(item)}
        style={({ pressed }) => [styles.disputeCard, { opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={styles.disputeHeader}>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.text }]}>{item.status.replace("_", " ")}</Text>
          </View>
          <Text style={styles.disputeDate}>{createdAt}</Text>
        </View>
        <Text style={styles.disputeReason}>
          {item.reason.replace(/_/g, " ")}
        </Text>
        <View style={styles.disputeParties}>
          <View style={styles.partyBadge}>
            <Feather name="user" size={10} color="#7c3aed" />
            <Text style={styles.partyName}>{item.raisedBy.name}</Text>
          </View>
          <Feather name="arrow-right" size={12} color="#94a3b8" />
          <View style={[styles.partyBadge, { backgroundColor: "#fff7ed" }]}>
            <Feather name="user" size={10} color="#f59e0b" />
            <Text style={styles.partyName}>{item.against.name}</Text>
          </View>
        </View>
        {item.bookingAmount !== undefined && (
          <Text style={styles.disputeAmount}>₹{item.bookingAmount.toLocaleString("en-IN")} booking</Text>
        )}
        {item.status === "open" && (
          <Pressable
            onPress={() => handleMarkUnderReview(item)}
            style={styles.reviewBtn}
          >
            <Text style={styles.reviewBtnText}>Mark Under Review</Text>
          </Pressable>
        )}
      </Pressable>
    );
  }, [handleMarkUnderReview]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Disputes</Text>
        <Pressable onPress={fetchDisputes} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={16} color="#64748b" />
        </Pressable>
      </View>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setStatusFilter(f)}
            style={[styles.filterChip, statusFilter === f && { backgroundColor: "#0f172a", borderColor: "#0f172a" }]}
          >
            <Text style={[styles.filterText, statusFilter === f && { color: "#fff" }]}>
              {f.replace("_", " ")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0f172a" size="large" />
        </View>
      ) : disputes.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Feather name="inbox" size={28} color="#94a3b8" />
          </View>
          <Text style={styles.emptyText}>No disputes</Text>
        </View>
      ) : (
        <FlatList
          data={disputes}
          keyExtractor={(d) => d.id}
          renderItem={renderDispute}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Ruling modal */}
      <Modal visible={selected !== null} animationType="slide" presentationStyle="pageSheet">
        {selected && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dispute Details</Text>
              <Pressable onPress={() => { setSelected(null); setRuling(""); }} style={styles.closeBtn}>
                <Feather name="x" size={20} color="#0f172a" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>REASON</Text>
                <Text style={styles.detailValue}>{selected.reason.replace(/_/g, " ")}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>RAISED BY</Text>
                <Text style={styles.detailValue}>{selected.raisedBy.name} ({selected.raisedBy.role})</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>AGAINST</Text>
                <Text style={styles.detailValue}>{selected.against.name} ({selected.against.role})</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>DESCRIPTION</Text>
                <Text style={styles.detailValue}>{selected.description}</Text>
              </View>
              {selected.bookingAmount !== undefined && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>BOOKING AMOUNT</Text>
                  <Text style={styles.detailValue}>₹{selected.bookingAmount.toLocaleString("en-IN")}</Text>
                </View>
              )}

              <Text style={styles.rulingLabel}>Admin Notes / Ruling</Text>
              <TextInput
                style={styles.rulingInput}
                multiline
                value={ruling}
                onChangeText={setRuling}
                placeholder="Document your decision and any actions taken..."
                placeholderTextColor="#94a3b8"
                numberOfLines={5}
                textAlignVertical="top"
              />

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => handleResolve("resolved")}
                  disabled={resolving}
                  style={[styles.resolveBtn, { backgroundColor: "#10b981" }]}
                >
                  {resolving ? <ActivityIndicator color="#fff" size="small" /> : (
                    <>
                      <Feather name="check-circle" size={14} color="#fff" />
                      <Text style={styles.resolveBtnText}>Mark Resolved</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => handleResolve("dismissed")}
                  disabled={resolving}
                  style={[styles.resolveBtn, { backgroundColor: "#94a3b8" }]}
                >
                  <Feather name="x-circle" size={14} color="#fff" />
                  <Text style={styles.resolveBtnText}>Dismiss</Text>
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
  filterRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8, flexDirection: "row" },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#fff",
  },
  filterText: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "capitalize" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center",
  },
  emptyText: { fontSize: 15, fontWeight: "700", color: "#64748b" },
  listContent: { padding: 14, gap: 10 },
  disputeCard: {
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  disputeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  disputeDate: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  disputeReason: { fontSize: 14, fontWeight: "800", color: "#0f172a", textTransform: "capitalize" },
  disputeParties: { flexDirection: "row", alignItems: "center", gap: 8 },
  partyBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#f5f3ff", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  partyName: { fontSize: 11, fontWeight: "700", color: "#334155" },
  disputeAmount: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  reviewBtn: {
    backgroundColor: "#fffbeb", borderRadius: 10,
    paddingVertical: 8, alignItems: "center",
    borderWidth: 1, borderColor: "#fde68a",
  },
  reviewBtnText: { fontSize: 11, fontWeight: "800", color: "#f59e0b" },
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
  modalScroll: { padding: 20, gap: 14 },
  detailRow: { gap: 4 },
  detailLabel: { fontSize: 9, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.6 },
  detailValue: { fontSize: 13, fontWeight: "600", color: "#334155", lineHeight: 20 },
  rulingLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.6, marginTop: 8 },
  rulingInput: {
    backgroundColor: "#fff", borderRadius: 16,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14, fontSize: 13, color: "#0f172a",
    minHeight: 120, fontWeight: "500",
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  resolveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 14, borderRadius: 14,
  },
  resolveBtnText: { fontSize: 13, fontWeight: "900", color: "#fff" },
});