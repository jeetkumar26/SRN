import React, { useEffect, useState, useCallback } from "react";
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
import { StatusBadge } from "../../components/ui";

type NavProp = StackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, "BookingDetail">;

const ACCENT = "#2563eb";

interface BookingData {
  id: string;
  requirementId?: string;
  requirementTitle: string;
  customerId: string;
  customerName?: string;
  providerId: string;
  providerName?: string;
  amount: number;
  durationDays?: number;
  status: string;
  category?: string;
  escrowStatus?: string;
  reviewLeft?: boolean;
  createdAt?: string;
  scheduledAt?: number;
  completedAt?: string;
}

const STATUS_TRANSITIONS: Record<string, { label: string; next: string; color: string }[]> = {
  confirmed:   [{ label: "Mark as Started",   next: "in_progress", color: "#2563eb" }],
  in_progress: [{ label: "Mark as Completed", next: "completed",   color: "#10b981" }],
  completed:   [],
  cancelled:   [],
};

export default function BookingDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const { params } = useRoute<RouteType>();
  const { profile } = useAuth();

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const isCustomer = profile?.role === "customer" || profile?.role === "business";
  const isProvider = profile?.uid === booking?.providerId;

  const fetchBooking = useCallback(() => {
    setLoading(true);
    customFetch<BookingData>(`/api/bookings/${params.bookingId}`)
      .then((b) => setBooking(b))
      .catch(() => Alert.alert("Error", "Could not load booking."))
      .finally(() => setLoading(false));
  }, [params.bookingId]);

  useEffect(() => { fetchBooking(); }, [fetchBooking]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!booking) return;
    setUpdating(true);
    try {
      await customFetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      fetchBooking();
    } catch {
      Alert.alert("Error", "Failed to update booking status.");
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      "Cancel Booking",
      "Are you sure you want to cancel this booking? This action cannot be undone.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel booking", style: "destructive",
          onPress: async () => {
            setUpdating(true);
            try {
              await customFetch(`/api/bookings/${params.bookingId}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "cancelled" }),
              });
              fetchBooking();
            } catch {
              Alert.alert("Error", "Failed to cancel booking.");
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingState}><ActivityIndicator color={ACCENT} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingState}>
          <Text style={styles.errorText}>Booking not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const transitions = STATUS_TRANSITIONS[booking.status] ?? [];
  const canCancel = ["confirmed", "in_progress"].includes(booking.status);
  const canReview = booking.status === "completed" && !booking.reviewLeft && profile?.uid === booking.customerId;

  const escrowLabel: Record<string, string> = {
    pending: "Payment pending",
    held: "Funds in escrow",
    released: "Payment released",
    disputed: "In dispute",
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Booking</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Status row */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <StatusBadge status={booking.status} />
            {booking.escrowStatus && (
              <View style={styles.escrowPill}>
                <Feather name="shield" size={12} color="#0d9488" />
                <Text style={styles.escrowText}>
                  {escrowLabel[booking.escrowStatus] ?? booking.escrowStatus}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.bookingTitle}>{booking.requirementTitle}</Text>
          {booking.category && (
            <View style={styles.catPill}>
              <Text style={styles.catText}>{booking.category}</Text>
            </View>
          )}
        </View>

        {/* Parties */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Parties</Text>
          <View style={styles.partyRow}>
            <View style={styles.partyCol}>
              <Text style={styles.partyRole}>Client</Text>
              <Text style={styles.partyName}>{booking.customerName ?? "—"}</Text>
            </View>
            <View style={styles.partyArrow}>
              <Feather name="arrow-right" size={16} color="#94a3b8" />
            </View>
            <View style={styles.partyCol}>
              <Text style={styles.partyRole}>Provider</Text>
              <Text style={styles.partyName}>{booking.providerName ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* Financials */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Payment</Text>
          <Text style={styles.amountText}>₹{booking.amount.toLocaleString()}</Text>
          {booking.durationDays && (
            <Text style={styles.durationText}>{booking.durationDays} days timeline</Text>
          )}
        </View>

        {/* Dates */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Timeline</Text>
          {booking.createdAt && (
            <View style={styles.dateRow}>
              <Feather name="calendar" size={14} color="#64748b" />
              <Text style={styles.dateText}>Booked: {new Date(booking.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
            </View>
          )}
          {booking.completedAt && (
            <View style={styles.dateRow}>
              <Feather name="check-circle" size={14} color="#10b981" />
              <Text style={styles.dateText}>Completed: {new Date(booking.completedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
            </View>
          )}
        </View>

        {/* Raise dispute CTA — completed bookings within 7 days */}
        {booking.status === "completed" && booking.completedAt && (() => {
          const daysSinceCompletion = (Date.now() - new Date(booking.completedAt).getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceCompletion <= 7;
        })() && (
          <Pressable
            onPress={() => navigation.navigate("Dispute", {
              bookingId: booking.id,
              providerName: booking.providerName ?? "Provider",
              amount: booking.amount,
            })}
            style={({ pressed }) => [styles.disputeBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Feather name="alert-circle" size={14} color="#ef4444" />
            <Text style={styles.disputeBtnText}>Raise Dispute</Text>
          </Pressable>
        )}

        {/* Leave review CTA */}
        {canReview && (
          <Pressable
            onPress={() => navigation.navigate("Review", {
              bookingId: booking.id,
              providerName: booking.providerName ?? "Provider",
            })}
            style={({ pressed }) => [styles.reviewBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Feather name="star" size={16} color="#f59e0b" />
            <Text style={styles.reviewBtnText}>Leave a Review</Text>
          </Pressable>
        )}

        {booking.reviewLeft && (
          <View style={styles.reviewedBanner}>
            <Feather name="star" size={14} color="#f59e0b" />
            <Text style={styles.reviewedText}>Review submitted</Text>
          </View>
        )}

        {/* Status transition buttons */}
        {transitions.length > 0 && (
          <View style={styles.actionsSection}>
            {transitions.map((t) => (
              <Pressable
                key={t.next}
                onPress={() => handleStatusUpdate(t.next)}
                disabled={updating}
                style={[styles.transitionBtn, { backgroundColor: t.color, opacity: updating ? 0.7 : 1 }]}
              >
                {updating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.transitionBtnText}>{t.label}</Text>}
              </Pressable>
            ))}
          </View>
        )}

        {canCancel && (
          <Pressable
            onPress={handleCancel}
            disabled={updating}
            style={[styles.cancelBtn, updating && { opacity: 0.6 }]}
          >
            <Text style={styles.cancelBtnText}>Cancel Booking</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  statusCard: {
    backgroundColor: "#fff", borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 18, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  escrowPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ccfbf1", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  escrowText: { fontSize: 11, fontWeight: "700", color: "#0d9488" },
  bookingTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a", lineHeight: 24 },
  catPill: { backgroundColor: "#f1f5f9", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  catText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  card: {
    backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, gap: 10,
  },
  cardLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 },
  partyRow: { flexDirection: "row", alignItems: "center" },
  partyCol: { flex: 1, gap: 3 },
  partyArrow: { paddingHorizontal: 12 },
  partyRole: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase" },
  partyName: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  amountText: { fontSize: 28, fontWeight: "900", color: "#0f172a", letterSpacing: -1 },
  durationText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  reviewBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#fffbeb", borderRadius: 16, height: 52,
    borderWidth: 1.5, borderColor: "#fde68a",
  },
  reviewBtnText: { color: "#92400e", fontSize: 15, fontWeight: "700" },
  reviewedBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#fffbeb", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#fde68a",
  },
  reviewedText: { fontSize: 13, fontWeight: "700", color: "#92400e" },
  actionsSection: { gap: 10 },
  transitionBtn: { borderRadius: 16, height: 52, alignItems: "center", justifyContent: "center" },
  transitionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cancelBtn: {
    borderRadius: 16, height: 48, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#fca5a5", backgroundColor: "#fef2f2",
  },
  cancelBtnText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
  disputeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#fef2f2", borderRadius: 16, height: 44,
    borderWidth: 1.5, borderColor: "#fca5a5",
  },
  disputeBtnText: { color: "#ef4444", fontSize: 13, fontWeight: "700" },
});