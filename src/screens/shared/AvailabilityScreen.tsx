import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  TextInput, ActivityIndicator, Alert, StatusBar,
  Switch,
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
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

interface DaySlot {
  enabled: boolean;
  start: string;
  end: string;
}

interface BlockedDate {
  date: string;
  reason?: string;
}

const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

const DEFAULT_START = "09:00";
const DEFAULT_END = "18:00";

const TIME_REGEX = /^\d{2}:\d{2}$/;

function isValidTime(t: string): boolean {
  if (!TIME_REGEX.test(t)) return false;
  const [h, m] = t.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function todayStr(): string {
  return new Date().toISOString().substring(0, 10);
}

export default function AvailabilityScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile, role } = useAuth();

  const roleColor = role ? ROLE_COLORS[role] : "#7c3aed";

  const [schedule, setSchedule] = useState<Record<DayKey, DaySlot>>(() => {
    const init = {} as Record<DayKey, DaySlot>;
    for (const d of DAYS) {
      init[d.key] = { enabled: d.key !== "sat" && d.key !== "sun", start: DEFAULT_START, end: DEFAULT_END };
    }
    return init;
  });

  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;

    customFetch<{
      isAvailable: boolean;
      schedule: Record<DayKey, { start: string; end: string } | null> | null;
      blockedDates: BlockedDate[];
    }>(`/api/availability/${profile.uid}`)
      .then((avail) => {
        setIsAvailable(avail.isAvailable);
        if (avail.schedule) {
          setSchedule((prev) => {
            const next = { ...prev };
            for (const d of DAYS) {
              const slot = avail.schedule?.[d.key];
              if (slot === null) {
                next[d.key] = { enabled: false, start: DEFAULT_START, end: DEFAULT_END };
              } else if (slot) {
                next[d.key] = { enabled: true, start: slot.start, end: slot.end };
              }
            }
            return next;
          });
        }
        setBlockedDates(avail.blockedDates ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile?.uid]);

  const updateDay = useCallback((key: DayKey, field: keyof DaySlot, value: boolean | string) => {
    setSchedule((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  const handleSaveSchedule = useCallback(async () => {
    // Validate time fields
    for (const d of DAYS) {
      const slot = schedule[d.key];
      if (!slot.enabled) continue;
      if (!isValidTime(slot.start) || !isValidTime(slot.end)) {
        Alert.alert("Invalid Time", `Please enter valid HH:MM times for ${d.label}.`);
        return;
      }
      if (slot.start >= slot.end) {
        Alert.alert("Invalid Range", `Start must be before end for ${d.label}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const apiSchedule: Record<string, { start: string; end: string } | null> = {};
      for (const d of DAYS) {
        apiSchedule[d.key] = schedule[d.key].enabled
          ? { start: schedule[d.key].start, end: schedule[d.key].end }
          : null;
      }

      await customFetch("/api/availability/hours", {
        method: "PUT",
        body: JSON.stringify({ schedule: apiSchedule }),
      });

      // Update global availability toggle
      if (profile?.uid) {
        await customFetch(`/api/users/${profile.uid}`, {
          method: "PATCH",
          body: JSON.stringify({ isAvailable }),
        });
      }

      Alert.alert("Saved", "Your availability has been updated.");
    } catch {
      Alert.alert("Error", "Could not save availability.");
    } finally {
      setSaving(false);
    }
  }, [schedule, isAvailable, profile?.uid]);

  const handleBlockDate = useCallback(async () => {
    if (!newBlockDate) {
      Alert.alert("Date required", "Please enter a date in YYYY-MM-DD format.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newBlockDate)) {
      Alert.alert("Invalid Format", "Date must be YYYY-MM-DD.");
      return;
    }
    if (newBlockDate < todayStr()) {
      Alert.alert("Invalid Date", "Cannot block a date in the past.");
      return;
    }
    if (blockedDates.some((b) => b.date === newBlockDate)) {
      Alert.alert("Already Blocked", "This date is already blocked.");
      return;
    }

    try {
      await customFetch("/api/availability/block", {
        method: "POST",
        body: JSON.stringify({
          dates: [newBlockDate],
          reason: newBlockReason.trim() || undefined,
        }),
      });
      setBlockedDates((prev) => [
        ...prev,
        { date: newBlockDate, reason: newBlockReason.trim() || undefined },
      ].sort((a, b) => a.date.localeCompare(b.date)));
      setNewBlockDate("");
      setNewBlockReason("");
    } catch {
      Alert.alert("Error", "Could not block date.");
    }
  }, [newBlockDate, newBlockReason, blockedDates]);

  const handleUnblockDate = useCallback(async (date: string) => {
    Alert.alert("Unblock Date", `Remove ${date} from blocked dates?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unblock",
        style: "destructive",
        onPress: async () => {
          try {
            await customFetch(`/api/availability/block/${date}`, { method: "DELETE" });
            setBlockedDates((prev) => prev.filter((b) => b.date !== date));
          } catch {
            Alert.alert("Error", "Could not unblock date.");
          }
        },
      },
    ]);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={roleColor} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Availability</Text>
        <Pressable
          onPress={handleSaveSchedule}
          disabled={saving}
          style={({ pressed }) => [styles.saveHeaderBtn, { backgroundColor: roleColor, opacity: pressed || saving ? 0.8 : 1 }]}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveHeaderText}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Global toggle */}
        <View style={styles.globalCard}>
          <View style={styles.globalLeft}>
            <Text style={styles.globalLabel}>Available for New Work</Text>
            <Text style={styles.globalSub}>
              {isAvailable ? "Clients can find and book you" : "You are hidden from search"}
            </Text>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={setIsAvailable}
            trackColor={{ false: "#e2e8f0", true: roleColor + "66" }}
            thumbColor={isAvailable ? roleColor : "#94a3b8"}
          />
        </View>

        {/* Weekly schedule */}
        <Text style={styles.sectionLabel}>Weekly Schedule</Text>
        <View style={styles.scheduleCard}>
          {DAYS.map((d, idx) => {
            const slot = schedule[d.key];
            return (
              <React.Fragment key={d.key}>
                {idx > 0 && <View style={styles.dayDivider} />}
                <View style={styles.dayRow}>
                  <Switch
                    value={slot.enabled}
                    onValueChange={(v) => updateDay(d.key, "enabled", v)}
                    trackColor={{ false: "#e2e8f0", true: roleColor + "66" }}
                    thumbColor={slot.enabled ? roleColor : "#94a3b8"}
                  />
                  <Text style={[styles.dayLabel, !slot.enabled && { color: "#94a3b8" }]}>
                    {d.short}
                  </Text>
                  {slot.enabled ? (
                    <View style={styles.timeRow}>
                      <TextInput
                        value={slot.start}
                        onChangeText={(v) => updateDay(d.key, "start", v)}
                        style={[
                          styles.timeInput,
                          { borderColor: isValidTime(slot.start) ? roleColor + "44" : "#fca5a5" },
                        ]}
                        placeholder="09:00"
                        placeholderTextColor="#94a3b8"
                        maxLength={5}
                        keyboardType="numbers-and-punctuation"
                      />
                      <Text style={styles.timeSep}>–</Text>
                      <TextInput
                        value={slot.end}
                        onChangeText={(v) => updateDay(d.key, "end", v)}
                        style={[
                          styles.timeInput,
                          { borderColor: isValidTime(slot.end) ? roleColor + "44" : "#fca5a5" },
                        ]}
                        placeholder="18:00"
                        placeholderTextColor="#94a3b8"
                        maxLength={5}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  ) : (
                    <View style={styles.offBadge}>
                      <Text style={styles.offText}>Off</Text>
                    </View>
                  )}
                </View>
              </React.Fragment>
            );
          })}
        </View>

        {/* Blocked dates */}
        <Text style={styles.sectionLabel}>Blocked Dates</Text>
        <View style={styles.blockedCard}>
          {blockedDates.length === 0 ? (
            <View style={styles.emptyBlocked}>
              <Feather name="calendar" size={20} color="#cbd5e1" />
              <Text style={styles.emptyBlockedText}>No blocked dates</Text>
            </View>
          ) : (
            blockedDates.map((b) => (
              <View key={b.date} style={styles.blockedRow}>
                <View style={styles.blockedLeft}>
                  <Text style={styles.blockedDate}>{b.date}</Text>
                  {b.reason && <Text style={styles.blockedReason}>{b.reason}</Text>}
                </View>
                <Pressable
                  onPress={() => handleUnblockDate(b.date)}
                  style={styles.unblockBtn}
                >
                  <Feather name="x" size={14} color="#ef4444" />
                </Pressable>
              </View>
            ))
          )}

          <View style={styles.addBlockedForm}>
            <Text style={styles.addBlockedTitle}>Block a Date</Text>
            <TextInput
              value={newBlockDate}
              onChangeText={setNewBlockDate}
              style={styles.dateInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
              maxLength={10}
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              value={newBlockReason}
              onChangeText={setNewBlockReason}
              style={styles.reasonInput}
              placeholder="Reason (optional)"
              placeholderTextColor="#94a3b8"
            />
            <Pressable
              onPress={handleBlockDate}
              style={({ pressed }) => [
                styles.blockBtn,
                { backgroundColor: roleColor, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Feather name="plus" size={14} color="#fff" />
              <Text style={styles.blockBtnText}>Add Blocked Date</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  saveHeaderBtn: {
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12,
    minWidth: 60, alignItems: "center",
  },
  saveHeaderText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  scroll: { padding: 16, gap: 14 },

  globalCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  globalLeft: { flex: 1, gap: 3 },
  globalLabel: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  globalSub: { fontSize: 12, fontWeight: "500", color: "#64748b" },

  sectionLabel: {
    fontSize: 10, fontWeight: "700", color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: 0.6,
    paddingHorizontal: 4,
  },

  scheduleCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  dayDivider: { height: 1, backgroundColor: "#f8fafc" },
  dayRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  dayLabel: { width: 36, fontSize: 14, fontWeight: "700", color: "#0f172a" },
  timeRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  timeInput: {
    flex: 1, height: 40, borderRadius: 10,
    borderWidth: 1.5, backgroundColor: "#f8fafc",
    paddingHorizontal: 10, fontSize: 14, fontWeight: "700",
    color: "#0f172a", textAlign: "center",
  },
  timeSep: { fontSize: 14, fontWeight: "600", color: "#94a3b8" },
  offBadge: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, backgroundColor: "#f1f5f9",
  },
  offText: { fontSize: 12, fontWeight: "700", color: "#94a3b8" },

  blockedCard: {
    backgroundColor: "#fff", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  emptyBlocked: {
    alignItems: "center", gap: 8, paddingVertical: 20,
  },
  emptyBlockedText: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  blockedRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  blockedLeft: { gap: 2 },
  blockedDate: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  blockedReason: { fontSize: 11, fontWeight: "500", color: "#94a3b8" },
  unblockBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#fef2f2",
    alignItems: "center", justifyContent: "center",
  },
  addBlockedForm: {
    gap: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: "#f1f5f9",
  },
  addBlockedTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  dateInput: {
    height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: "#e2e8f0",
    paddingHorizontal: 14, fontSize: 14, fontWeight: "600", color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  reasonInput: {
    height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: "#e2e8f0",
    paddingHorizontal: 14, fontSize: 14, fontWeight: "600", color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  blockBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, height: 46, borderRadius: 12,
  },
  blockBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});