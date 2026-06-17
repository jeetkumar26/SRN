import React, { useEffect, useState } from "react";
import {
  StyleSheet, Text, View, Pressable, FlatList,
  ActivityIndicator, StatusBar, Alert, TextInput, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { customFetch } from "@workspace/api-client-react";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { useAuth } from "../../contexts/AuthContext";

interface Booking {
  id: string;
  requirementId: string;
  requirementTitle: string;
  customerId: string;
  providerId: string;
  providerName: string;
  amount: number;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";
  createdAt: number;
  scheduledAt?: number;
  category: string;
  reviewLeft?: boolean;
}

type NavProp = StackNavigationProp<RootStackParamList>;

const STATUS_CONFIG: Record<Booking["status"], { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: "Pending", color: "#d97706", bg: "#d9770614", icon: "clock" },
  confirmed: { label: "Confirmed", color: "#2563eb", bg: "#2563eb14", icon: "check" },
  in_progress: { label: "In Progress", color: "#7c3aed", bg: "#7c3aed14", icon: "activity" },
  completed: { label: "Completed", color: "#10b981", bg: "#10b98114", icon: "check-circle" },
  cancelled: { label: "Cancelled", color: "#94a3b8", bg: "#94a3b814", icon: "x-circle" },
};

const ROLE_COLOR = "#2563eb";

// ── Star rating picker ───────────────────────────────────────────────────────
function StarRow({ rating, onRate }: { rating: number; onRate: (r: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable key={s} onPress={() => onRate(s)}>
          <Feather name="star" size={28} color={s <= rating ? "#f59e0b" : "#e2e8f0"} />
        </Pressable>
      ))}
    </View>
  );
}

export default function BookingsScreen() {
  const navigation = useNavigation<NavProp>();
  const { firebaseUser, role } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"all" | Booking["status"]>("all");

  // Review modal state
  const [reviewTarget, setReviewTarget] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchBookings = async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const res = await customFetch<{ items: any[] }>("/api/bookings?limit=50");
      setBookings(
        res.items.map((b) => ({
          id: b.id,
          requirementId: b.requirementId ?? "",
          requirementTitle: b.requirementTitle ?? "Untitled",
          customerId: b.customerId ?? "",
          providerId: b.providerId ?? "",
          providerName: b.providerName ?? b.customerName ?? "Unknown",
          amount: b.amount ?? 0,
          status: (b.status ?? "pending") as Booking["status"],
          createdAt: b.createdAt ? new Date(b.createdAt).getTime() : Date.now(),
          scheduledAt: b.rescheduleDate ? new Date(b.rescheduleDate).getTime() : undefined,
          category: b.category ?? "General",
          reviewLeft: b.reviewLeft ?? false,
        }))
      );
    } catch (err) {
      console.error("[Bookings] fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [firebaseUser]);

  const updateStatus = async (bookingId: string, newStatus: Booking["status"]) => {
    try {
      await customFetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchBookings();
    } catch {
      Alert.alert("Error", "Failed to update booking status.");
    }
  };

  const openReview = (booking: Booking) => {
    setReviewTarget(booking);
    setReviewRating(5);
    setReviewText("");
  };

  const submitReview = async () => {
    if (!reviewTarget || !firebaseUser) return;
    setSubmittingReview(true);
    try {
      await customFetch("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          bookingId: reviewTarget.id,
          rating: reviewRating,
          comment: reviewText.trim(),
        }),
      });
      setReviewTarget(null);
      Alert.alert("Review Submitted", "Thanks for your feedback!");
      await fetchBookings();
    } catch {
      Alert.alert("Error", "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const filters: Array<"all" | Booking["status"]> = ["all", "pending", "confirmed", "in_progress", "completed", "cancelled"];
  const filtered = activeFilter === "all" ? bookings : bookings.filter((b) => b.status === activeFilter);

  const completedCount = bookings.filter((b) => b.status === "completed").length;
  const pendingCount = bookings.filter((b) => b.status === "pending").length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Bookings</Text>
          <Text style={styles.headerSub}>{bookings.length} total</Text>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={[styles.headerStatVal, { color: "#10b981" }]}>{completedCount}</Text>
            <Text style={styles.headerStatLbl}>Done</Text>
          </View>
          <View style={styles.headerStatDiv} />
          <View style={styles.headerStat}>
            <Text style={[styles.headerStatVal, { color: "#d97706" }]}>{pendingCount}</Text>
            <Text style={styles.headerStatLbl}>Pending</Text>
          </View>
        </View>
      </View>

      {/* Filter pills */}
      <FlatList
        horizontal
        data={filters}
        keyExtractor={(f) => f}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => {
          const active = activeFilter === f;
          const cfg = f !== "all" ? STATUS_CONFIG[f as Booking["status"]] : null;
          return (
            <Pressable
              onPress={() => setActiveFilter(f)}
              style={[
                styles.filterPill,
                active
                  ? { backgroundColor: cfg?.color ?? ROLE_COLOR, borderColor: cfg?.color ?? ROLE_COLOR }
                  : { backgroundColor: "#f1f5f9", borderColor: "#e2e8f0" },
              ]}
            >
              <Text style={[styles.filterText, { color: active ? "#fff" : "#64748b" }]}>
                {f === "all" ? "All" : f.replace("_", " ")}
              </Text>
            </Pressable>
          );
        }}
      />

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={ROLE_COLOR} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <LinearGradient colors={[ROLE_COLOR + "14", ROLE_COLOR + "06"]} style={styles.emptyIcon}>
            <Feather name="calendar" size={32} color={ROLE_COLOR} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>No bookings found</Text>
          <Text style={styles.emptyBody}>
            {activeFilter === "all" ? "You don't have any bookings yet." : `No ${activeFilter.replace("_", " ")} bookings.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const cfg = STATUS_CONFIG[item.status];
            const isProvider = role === "local" || role === "digital";
            const canReview = !isProvider && item.status === "completed" && !item.reviewLeft;

            return (
              <View style={styles.bookingCard}>
                {/* Accent bar */}
                <View style={[styles.accentBar, { backgroundColor: cfg.color }]} />

                <View style={styles.cardInner}>
                  {/* Top: title + status */}
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqTitle} numberOfLines={1}>{item.requirementTitle}</Text>
                      <Text style={styles.providerName}>
                        {isProvider ? "Customer booking" : `by ${item.providerName}`}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Feather name={cfg.icon as any} size={10} color={cfg.color} />
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  {/* Meta row */}
                  <View style={styles.cardMeta}>
                    <View style={styles.metaItem}>
                      <Feather name="dollar-sign" size={13} color={ROLE_COLOR} />
                      <Text style={styles.metaText}>₹{item.amount.toLocaleString()}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Feather name="tag" size={13} color="#94a3b8" />
                      <Text style={[styles.metaText, { color: "#94a3b8" }]}>{item.category}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Feather name="calendar" size={13} color="#94a3b8" />
                      <Text style={[styles.metaText, { color: "#94a3b8" }]}>
                        {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </Text>
                    </View>
                  </View>

                  {/* Scheduled date (if set) */}
                  {!!item.scheduledAt && (
                    <View style={styles.scheduledRow}>
                      <Feather name="clock" size={13} color={ROLE_COLOR} />
                      <Text style={styles.scheduledText}>
                        Scheduled:{" "}
                        {new Date(item.scheduledAt).toLocaleString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  )}

                  {/* Action buttons */}
                  <View style={styles.actionRow}>
                    {/* Message Provider / Customer button */}
                    <Pressable
                      onPress={() =>
                        navigation.navigate("Chat", {
                          conversationId: `booking_${item.id}`,
                          recipientName: isProvider ? "Customer" : item.providerName,
                          recipientId: isProvider ? item.customerId : item.providerId,
                        })
                      }
                      style={styles.msgBtn}
                    >
                      <Feather name="message-circle" size={14} color={ROLE_COLOR} />
                      <Text style={[styles.msgBtnText, { color: ROLE_COLOR }]}>
                        {isProvider ? "Message Customer" : "Message Provider"}
                      </Text>
                    </Pressable>

                    {/* Leave Review */}
                    {canReview && (
                      <Pressable onPress={() => openReview(item)} style={styles.reviewBtn}>
                        <LinearGradient colors={["#f59e0b", "#d97706"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.reviewBtnGrad}>
                          <Feather name="star" size={13} color="#fff" />
                          <Text style={styles.reviewBtnText}>Leave Review</Text>
                        </LinearGradient>
                      </Pressable>
                    )}

                    {/* Review left indicator */}
                    {!isProvider && item.status === "completed" && item.reviewLeft && (
                      <View style={styles.reviewedBadge}>
                        <Feather name="check" size={11} color="#10b981" />
                        <Text style={styles.reviewedText}>Reviewed</Text>
                      </View>
                    )}
                  </View>

                  {/* View full booking detail */}
                  <Pressable
                    onPress={() => navigation.navigate("BookingDetail", { bookingId: item.id })}
                    style={styles.detailsBtn}
                  >
                    <Feather name="eye" size={13} color="#64748b" />
                    <Text style={styles.detailsBtnText}>View Details</Text>
                  </Pressable>

                  {/* Provider: Mark Completed */}
                  {isProvider && item.status === "confirmed" && (
                    <Pressable onPress={() => updateStatus(item.id, "completed")} style={styles.completeBtn}>
                      <LinearGradient colors={["#10b981", "#059669"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.completeBtnGrad}>
                        <Feather name="check-circle" size={14} color="#fff" />
                        <Text style={styles.completeBtnText}>Mark Completed</Text>
                      </LinearGradient>
                    </Pressable>
                  )}

                  {/* Customer: Cancel */}
                  {!isProvider && item.status === "pending" && (
                    <Pressable
                      onPress={() =>
                        Alert.alert("Cancel Booking", "Are you sure you want to cancel?", [
                          { text: "No", style: "cancel" },
                          { text: "Yes, Cancel", style: "destructive", onPress: () => updateStatus(item.id, "cancelled") },
                        ])
                      }
                      style={styles.cancelBtn}
                    >
                      <Feather name="x-circle" size={14} color="#ef4444" />
                      <Text style={styles.cancelBtnText}>Cancel Booking</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Review Modal */}
      <Modal visible={!!reviewTarget} animationType="slide" transparent onRequestClose={() => setReviewTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.reviewSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.reviewSheetTitle}>Leave a Review</Text>
            {reviewTarget && (
              <Text style={styles.reviewSheetSub}>{reviewTarget.providerName}</Text>
            )}

            <Text style={styles.ratingLabel}>Your Rating</Text>
            <StarRow rating={reviewRating} onRate={setReviewRating} />

            <TextInput
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Share your experience (optional)..."
              placeholderTextColor="#94a3b8"
              multiline
              style={styles.reviewInput}
            />

            <View style={styles.reviewBtns}>
              <Pressable onPress={() => setReviewTarget(null)} style={styles.reviewCancelBtn}>
                <Text style={styles.reviewCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitReview}
                disabled={submittingReview}
                style={{ flex: 1, borderRadius: 14, overflow: "hidden" }}
              >
                <LinearGradient colors={["#f59e0b", "#d97706"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.reviewSubmitGrad}>
                  {submittingReview
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.reviewSubmitText}>Submit Review</Text>
                  }
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  headerSub: { fontSize: 11, fontWeight: "600", color: "#94a3b8", marginTop: 1 },
  headerStats: { flexDirection: "row", alignItems: "center", backgroundColor: "#f8fafc", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  headerStat: { alignItems: "center" },
  headerStatVal: { fontSize: 18, fontWeight: "900" },
  headerStatLbl: { fontSize: 9, fontWeight: "700", color: "#94a3b8" },
  headerStatDiv: { width: 1, height: 24, backgroundColor: "#e2e8f0" },
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  filterText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  emptyBody: { fontSize: 13, fontWeight: "500", color: "#94a3b8", textAlign: "center", lineHeight: 20 },
  list: { padding: 16, paddingBottom: 100, gap: 12 },
  bookingCard: {
    backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e8f0",
    flexDirection: "row", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  accentBar: { width: 4 },
  cardInner: { flex: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  reqTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 2 },
  providerName: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: "800" },
  cardMeta: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, fontWeight: "600", color: "#0f172a" },
  scheduledRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: ROLE_COLOR + "0c", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
  },
  scheduledText: { fontSize: 11, fontWeight: "700", color: ROLE_COLOR },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  msgBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: ROLE_COLOR + "40", backgroundColor: ROLE_COLOR + "0c",
  },
  msgBtnText: { fontSize: 11, fontWeight: "700" },
  reviewBtn: { borderRadius: 10, overflow: "hidden" },
  reviewBtnGrad: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8 },
  reviewBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  reviewedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#10b98114", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  reviewedText: { fontSize: 10, fontWeight: "700", color: "#10b981" },
  completeBtn: { borderRadius: 12, overflow: "hidden" },
  completeBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40 },
  completeBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: "#ef444440" },
  cancelBtnText: { color: "#ef4444", fontSize: 12, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  reviewSheet: {
    backgroundColor: "#ffffff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, gap: 14,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0", alignSelf: "center", marginBottom: 8 },
  reviewSheetTitle: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  reviewSheetSub: { fontSize: 13, fontWeight: "600", color: "#94a3b8", marginTop: -4 },
  ratingLabel: { fontSize: 11, fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  reviewInput: {
    borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 14,
    padding: 14, height: 90, fontSize: 14, fontWeight: "500",
    color: "#0f172a", textAlignVertical: "top", backgroundColor: "#f8fafc",
  },
  reviewBtns: { flexDirection: "row", gap: 10 },
  reviewCancelBtn: { flex: 0.4, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  reviewCancelText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  reviewSubmitGrad: { height: 50, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  reviewSubmitText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  detailsBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10,
    paddingVertical: 8, marginTop: 2,
  },
  detailsBtnText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
});
