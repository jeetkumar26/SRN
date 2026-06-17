import React, { useState } from "react";
import {
  StyleSheet, Text, View, Pressable, TextInput,
  ActivityIndicator, Alert, StatusBar, ScrollView,
  KeyboardAvoidingView, Platform,
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
type RouteType = RouteProp<RootStackParamList, "Review">;

const ACCENT = "#f59e0b";
const STAR_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export default function ReviewScreen() {
  const navigation = useNavigation<NavProp>();
  const { params } = useRoute<RouteType>();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert("Rating required", "Please select a star rating before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      await customFetch("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          bookingId: params.bookingId,
          rating,
          comment: comment.trim(),
        }),
      });
      Alert.alert("Thank you!", "Your review has been submitted.", [
        { text: "Done", onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const msg = err?.data?.error ?? "Failed to submit review. Please try again.";
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
        <Text style={styles.headerTitle}>Leave a Review</Text>
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
          {/* Provider context */}
          <View style={styles.providerCard}>
            <View style={styles.providerAvatar}>
              <Text style={styles.providerAvatarText}>
                {params.providerName[0]?.toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerLabel}>Rating your experience with</Text>
              <Text style={styles.providerName}>{params.providerName}</Text>
            </View>
          </View>

          {/* Star rating */}
          <View style={styles.ratingCard}>
            <Text style={styles.ratingQuestion}>How was the overall experience?</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => setRating(star)}
                  style={({ pressed }) => [styles.starBtn, pressed && { transform: [{ scale: 1.15 }] }]}
                >
                  <View style={[styles.starWrap, star <= rating && { backgroundColor: ACCENT + "18" }]}>
                    <Feather
                      name="star"
                      size={28}
                      color={star <= rating ? ACCENT : "#cbd5e1"}
                    />
                  </View>
                </Pressable>
              ))}
            </View>
            {rating > 0 && (
              <Text style={styles.ratingLabel}>{STAR_LABELS[rating]}</Text>
            )}
          </View>

          {/* Comment */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Tell us more (optional)</Text>
            <TextInput
              value={comment}
              onChangeText={(t) => setComment(t.slice(0, 500))}
              placeholder="What did you like? What could be improved? Your feedback helps the provider grow."
              placeholderTextColor="#94a3b8"
              multiline
              style={styles.textArea}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{comment.length} / 500</Text>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting || rating === 0}
            style={({ pressed }) => [
              styles.submitBtn,
              { opacity: pressed || submitting || rating === 0 ? 0.75 : 1 },
            ]}
          >
            <LinearGradient
              colors={[ACCENT, "#d97706"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGrad}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Feather name="star" size={16} color="#fff" />
                    <Text style={styles.submitText}>Submit Review</Text>
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
  providerCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#fff", borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: "#e2e8f0",
  },
  providerAvatar: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: ACCENT + "18", alignItems: "center", justifyContent: "center",
  },
  providerAvatarText: { fontSize: 22, fontWeight: "900", color: ACCENT },
  providerLabel: { fontSize: 11, fontWeight: "600", color: "#94a3b8", marginBottom: 3 },
  providerName: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  ratingCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 24,
    alignItems: "center", gap: 16,
    borderWidth: 1.5, borderColor: "#e2e8f0",
  },
  ratingQuestion: { fontSize: 16, fontWeight: "700", color: "#0f172a", textAlign: "center" },
  starsRow: { flexDirection: "row", gap: 8 },
  starBtn: { padding: 4 },
  starWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ratingLabel: { fontSize: 18, fontWeight: "800", color: ACCENT },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  textArea: {
    backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#e2e8f0",
    borderRadius: 14, padding: 14, height: 140,
    fontSize: 14, fontWeight: "500", color: "#0f172a", lineHeight: 22,
  },
  charCount: { fontSize: 11, fontWeight: "600", color: "#94a3b8", textAlign: "right" },
  submitBtn: { borderRadius: 16, overflow: "hidden" },
  submitGrad: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});