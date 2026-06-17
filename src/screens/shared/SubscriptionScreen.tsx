import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  ActivityIndicator, Alert, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import type { RootStackParamList } from "../../navigation/AppNavigator";

type NavProp = StackNavigationProp<RootStackParamList>;

interface PlanFeatures {
  maxBidsPerMonth: number;
  scoreBoost: number;
  priorityFeedRank: boolean;
  verifiedBadge: boolean;
  maxTeamMembers: number;
  featuredHomepage: boolean;
}

interface Plan {
  tier: string;
  name: string;
  priceMonthly: number;
  currency: string;
  features: PlanFeatures;
}

interface SubStatus {
  tier: string;
  name: string;
  isActive: boolean;
  expiresAt: string | null;
  bidsUsed: number;
  bidsLimit: number | null;
  isPremium: boolean;
  features: PlanFeatures;
}

const PLAN_COLORS: Record<string, string> = {
  free: "#64748b",
  pro: "#7c3aed",
  business: "#d97706",
};

const PLAN_GRADIENTS: Record<string, [string, string]> = {
  free: ["#f1f5f9", "#e2e8f0"],
  pro: ["#7c3aed", "#6d28d9"],
  business: ["#d97706", "#b45309"],
};

function formatPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function FeatureRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.featureRow}>
      <Feather name={ok ? "check-circle" : "x-circle"} size={15} color={ok ? "#10b981" : "#cbd5e1"} />
      <Text style={[styles.featureText, !ok && { color: "#94a3b8" }]}>{label}</Text>
    </View>
  );
}

export default function SubscriptionScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<SubStatus | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    customFetch<{ plans: Plan[] }>("/api/subscriptions/plans")
      .then((res) => setPlans(res.plans))
      .catch(() => {})
      .finally(() => setLoadingPlans(false));

    customFetch<SubStatus>("/api/subscriptions/status")
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, []);

  const handleUpgrade = useCallback(
    async (tier: string) => {
      if (upgrading) return;
      setUpgrading(tier);
      try {
        const order = await customFetch<{
          orderId: string;
          amount: number;
          currency: string;
          key: string;
        }>("/api/subscriptions/create-order", {
          method: "POST",
          body: JSON.stringify({ tier }),
        });

        // Open Razorpay checkout
        // Requires: pnpm add react-native-razorpay && cd ios && pod install
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const RazorpayCheckout = require("react-native-razorpay");
        const checkout = RazorpayCheckout.default ?? RazorpayCheckout;

        await checkout.open({
          description: `SRN ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
          currency: order.currency,
          key: order.key,
          amount: order.amount,
          order_id: order.orderId,
          name: "SRN — Skill Requirement Network",
          prefill: {
            email: profile?.email ?? "",
            name: profile?.name ?? "",
          },
          theme: { color: "#7c3aed" },
        });

        // Payment verified by Razorpay webhook server-side — refresh status
        const updated = await customFetch<SubStatus>("/api/subscriptions/status");
        setStatus(updated);
        Alert.alert("Upgraded!", `You are now on the ${updated.name} plan.`);
      } catch (err: any) {
        // User cancelled payment — err.code === "payment_cancelled"
        if (err?.code !== "payment_cancelled" && err?.message !== "PAYMENT_CANCELLED") {
          Alert.alert("Payment Error", err?.description ?? "Payment could not be completed.");
        }
      } finally {
        setUpgrading(null);
      }
    },
    [upgrading, profile]
  );

  const handleCancel = useCallback(() => {
    Alert.alert(
      "Cancel Subscription",
      "Your plan will remain active until the billing period ends.",
      [
        { text: "Keep Plan", style: "cancel" },
        {
          text: "Cancel at Period End",
          style: "destructive",
          onPress: async () => {
            try {
              await customFetch("/api/subscriptions/cancel", { method: "POST" });
              Alert.alert("Scheduled", "Subscription will be cancelled at period end.");
              const updated = await customFetch<SubStatus>("/api/subscriptions/status");
              setStatus(updated);
            } catch {
              Alert.alert("Error", "Could not cancel subscription.");
            }
          },
        },
      ]
    );
  }, []);

  const isLoading = loadingPlans || loadingStatus;
  const currentTier = status?.tier ?? "free";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Subscription</Text>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#7c3aed" size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Current plan banner */}
          {status && (
            <View style={styles.currentBanner}>
              <View style={styles.currentLeft}>
                <Text style={styles.currentLabel}>Current Plan</Text>
                <Text style={styles.currentName}>{status.name}</Text>
                {status.expiresAt && (
                  <Text style={styles.currentExpiry}>
                    Renews {new Date(status.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                )}
              </View>
              {status.bidsLimit !== null && (
                <View style={styles.bidsMeter}>
                  <Text style={styles.bidsLabel}>Bids this month</Text>
                  <Text style={styles.bidsCount}>
                    {status.bidsUsed}
                    <Text style={styles.bidsLimit}>/{status.bidsLimit}</Text>
                  </Text>
                  <View style={styles.bidsBar}>
                    <View
                      style={[
                        styles.bidsBarFill,
                        { width: `${Math.min(100, (status.bidsUsed / status.bidsLimit) * 100)}%` },
                      ]}
                    />
                  </View>
                </View>
              )}
              {status.bidsLimit === null && (
                <View style={styles.unlimitedBadge}>
                  <Feather name="zap" size={14} color="#7c3aed" />
                  <Text style={styles.unlimitedText}>Unlimited bids</Text>
                </View>
              )}
            </View>
          )}

          <Text style={styles.sectionTitle}>Choose a Plan</Text>

          {plans.map((plan) => {
            const isCurrentPlan = plan.tier === currentTier;
            const isFree = plan.tier === "free";
            const color = PLAN_COLORS[plan.tier] ?? "#7c3aed";
            const gradient = PLAN_GRADIENTS[plan.tier] ?? ["#7c3aed", "#6d28d9"];

            return (
              <View key={plan.tier} style={[styles.planCard, isCurrentPlan && styles.planCardActive]}>
                {!isFree ? (
                  <LinearGradient colors={gradient} style={styles.planHeader}>
                    <View>
                      <Text style={styles.planNamePaid}>{plan.name}</Text>
                      <Text style={styles.planPrice}>{formatPrice(plan.priceMonthly)}/month</Text>
                    </View>
                    {isCurrentPlan && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    )}
                  </LinearGradient>
                ) : (
                  <View style={[styles.planHeader, { backgroundColor: "#f1f5f9" }]}>
                    <View>
                      <Text style={[styles.planNamePaid, { color: "#475569" }]}>Free</Text>
                      <Text style={[styles.planPrice, { color: "#64748b" }]}>₹0 forever</Text>
                    </View>
                    {isCurrentPlan && (
                      <View style={[styles.currentBadge, { backgroundColor: "#47556922" }]}>
                        <Text style={[styles.currentBadgeText, { color: "#475569" }]}>Current</Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.planBody}>
                  <FeatureRow
                    ok
                    label={plan.features.maxBidsPerMonth === -1 ? "Unlimited proposals" : `${plan.features.maxBidsPerMonth} proposals/month`}
                  />
                  <FeatureRow ok={plan.features.priorityFeedRank} label="Priority in search results" />
                  <FeatureRow ok={plan.features.verifiedBadge} label="Verified badge" />
                  <FeatureRow ok={plan.features.scoreBoost > 0} label={`AI Trust Score boost (+${plan.features.scoreBoost} pts)`} />
                  <FeatureRow
                    ok={plan.features.maxTeamMembers > 1}
                    label={`Team members (up to ${plan.features.maxTeamMembers})`}
                  />
                  <FeatureRow ok={plan.features.featuredHomepage} label="Featured on homepage" />

                  {!isFree && !isCurrentPlan && (
                    <Pressable
                      onPress={() => handleUpgrade(plan.tier)}
                      disabled={upgrading === plan.tier}
                      style={({ pressed }) => [
                        styles.upgradeBtn,
                        { backgroundColor: color, opacity: pressed || upgrading === plan.tier ? 0.8 : 1 },
                      ]}
                    >
                      {upgrading === plan.tier ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Feather name="zap" size={15} color="#fff" />
                          <Text style={styles.upgradeBtnText}>Upgrade to {plan.name}</Text>
                        </>
                      )}
                    </Pressable>
                  )}

                  {!isFree && isCurrentPlan && (
                    <Pressable onPress={handleCancel} style={styles.cancelBtn}>
                      <Text style={styles.cancelBtnText}>Cancel subscription</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}

          <View style={styles.disclaimer}>
            <Feather name="shield" size={13} color="#94a3b8" />
            <Text style={styles.disclaimerText}>
              Payments are processed securely via Razorpay. Subscriptions auto-renew monthly. Cancel anytime.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 14 },

  currentBanner: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  currentLeft: { gap: 3 },
  currentLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 },
  currentName: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  currentExpiry: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  bidsMeter: { alignItems: "flex-end", gap: 4 },
  bidsLabel: { fontSize: 10, fontWeight: "600", color: "#94a3b8" },
  bidsCount: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  bidsLimit: { fontSize: 14, fontWeight: "600", color: "#94a3b8" },
  bidsBar: { width: 80, height: 4, borderRadius: 4, backgroundColor: "#e2e8f0", overflow: "hidden" },
  bidsBarFill: { height: "100%", backgroundColor: "#7c3aed", borderRadius: 4 },
  unlimitedBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: "#7c3aed12",
  },
  unlimitedText: { fontSize: 12, fontWeight: "800", color: "#7c3aed" },

  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 },

  planCard: {
    backgroundColor: "#fff", borderRadius: 22,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  planCardActive: { borderColor: "#7c3aed", borderWidth: 2 },
  planHeader: { padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planNamePaid: { fontSize: 20, fontWeight: "900", color: "#fff", marginBottom: 2 },
  planPrice: { fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  currentBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)",
  },
  currentBadgeText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  planBody: { padding: 16, gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { fontSize: 13, fontWeight: "600", color: "#0f172a", flex: 1 },
  upgradeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, height: 50, borderRadius: 14, marginTop: 6,
  },
  upgradeBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  cancelBtn: {
    alignItems: "center", paddingVertical: 12, marginTop: 4,
    borderTopWidth: 1, borderTopColor: "#f1f5f9",
  },
  cancelBtnText: { fontSize: 12, fontWeight: "700", color: "#94a3b8" },

  disclaimer: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    paddingHorizontal: 4,
  },
  disclaimerText: { flex: 1, fontSize: 11, color: "#94a3b8", lineHeight: 16 },
});