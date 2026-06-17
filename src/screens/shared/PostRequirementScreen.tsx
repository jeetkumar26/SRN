import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet, Text, View, Pressable, TextInput,
  ScrollView, ActivityIndicator, StatusBar, Alert,
  PanResponder, LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useCreateRequirement } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";
import { Chip } from "../../components/ui";

const CATEGORIES: { label: string; icon: string }[] = [
  { label: "Web Development", icon: "code" },
  { label: "UI/UX Design", icon: "pen-tool" },
  { label: "Mobile App", icon: "smartphone" },
  { label: "Content Writing", icon: "file-text" },
  { label: "Local Services", icon: "tool" },
  { label: "Data & AI", icon: "activity" },
  { label: "Marketing", icon: "trending-up" },
  { label: "Graphic Design", icon: "layers" },
];

const PRIMARY = "#7c3aed";
const BUDGET_MIN = 500;
const BUDGET_MAX = 500000;

// ── Custom dual-handle range slider ─────────────────────────────────────────
function RangeSlider({
  minVal,
  maxVal,
  onMinChange,
  onMaxChange,
}: {
  minVal: number;
  maxVal: number;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
}) {
  const trackWidth = useRef(0);

  const valToPos = (v: number) =>
    ((v - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * trackWidth.current;

  const posToVal = (p: number) => {
    const raw = (p / trackWidth.current) * (BUDGET_MAX - BUDGET_MIN) + BUDGET_MIN;
    return Math.round(Math.max(BUDGET_MIN, Math.min(BUDGET_MAX, raw)) / 500) * 500;
  };

  const minPanRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const currentPos = valToPos(minVal);
        const newPos = currentPos + gs.dx;
        const newVal = posToVal(newPos);
        if (newVal < maxVal - 500) onMinChange(newVal);
      },
    })
  );

  const maxPanRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const currentPos = valToPos(maxVal);
        const newPos = currentPos + gs.dx;
        const newVal = posToVal(newPos);
        if (newVal > minVal + 500) onMaxChange(newVal);
      },
    })
  );

  const minPos = trackWidth.current > 0 ? valToPos(minVal) : 0;
  const maxPos = trackWidth.current > 0 ? valToPos(maxVal) : trackWidth.current;
  const fillLeft = minPos;
  const fillWidth = maxPos - minPos;

  return (
    <View style={sliderStyles.container}>
      {/* Value labels */}
      <View style={sliderStyles.labelRow}>
        <View style={[sliderStyles.valueChip, { backgroundColor: PRIMARY + "14" }]}>
          <Text style={[sliderStyles.valueText, { color: PRIMARY }]}>
            ₹{minVal.toLocaleString()}
          </Text>
        </View>
        <Text style={sliderStyles.rangeSep}>—</Text>
        <View style={[sliderStyles.valueChip, { backgroundColor: PRIMARY + "14" }]}>
          <Text style={[sliderStyles.valueText, { color: PRIMARY }]}>
            ₹{maxVal.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Track */}
      <View
        style={sliderStyles.trackContainer}
        onLayout={(e: LayoutChangeEvent) => {
          trackWidth.current = e.nativeEvent.layout.width;
        }}
      >
        {/* Background track */}
        <View style={sliderStyles.track} />

        {/* Filled range */}
        {trackWidth.current > 0 && (
          <LinearGradient
            colors={[PRIMARY, "#0d9488"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[sliderStyles.fill, { left: fillLeft, width: Math.max(0, fillWidth) }]}
          />
        )}

        {/* Min handle */}
        {trackWidth.current > 0 && (
          <View
            {...minPanRef.current.panHandlers}
            style={[sliderStyles.handle, { left: minPos - 14 }]}
          >
            <LinearGradient
              colors={[PRIMARY, "#6d28d9"]}
              style={sliderStyles.handleInner}
            >
              <Feather name="chevrons-left" size={10} color="#fff" />
            </LinearGradient>
          </View>
        )}

        {/* Max handle */}
        {trackWidth.current > 0 && (
          <View
            {...maxPanRef.current.panHandlers}
            style={[sliderStyles.handle, { left: maxPos - 14 }]}
          >
            <LinearGradient
              colors={[PRIMARY, "#6d28d9"]}
              style={sliderStyles.handleInner}
            >
              <Feather name="chevrons-right" size={10} color="#fff" />
            </LinearGradient>
          </View>
        )}
      </View>

      {/* Quick presets */}
      <View style={sliderStyles.presetRow}>
        {[
          { label: "₹5k", min: 5000, max: 25000 },
          { label: "₹50k", min: 25000, max: 75000 },
          { label: "₹1L", min: 75000, max: 200000 },
          { label: "₹2L+", min: 150000, max: 500000 },
        ].map((p) => (
          <Pressable
            key={p.label}
            onPress={() => { onMinChange(p.min); onMaxChange(p.max); }}
            style={[
              sliderStyles.preset,
              minVal === p.min && maxVal === p.max && { backgroundColor: PRIMARY, borderColor: PRIMARY },
            ]}
          >
            <Text style={[
              sliderStyles.presetText,
              minVal === p.min && maxVal === p.max && { color: "#fff" },
            ]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: { gap: 14 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  valueChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  valueText: { fontSize: 16, fontWeight: "900" },
  rangeSep: { fontSize: 16, color: "#94a3b8", fontWeight: "600" },
  trackContainer: { height: 28, justifyContent: "center", marginHorizontal: 14 },
  track: {
    height: 6, borderRadius: 3, backgroundColor: "#e2e8f0",
    position: "absolute", left: 0, right: 0,
  },
  fill: { position: "absolute", height: 6, borderRadius: 3 },
  handle: {
    position: "absolute", width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  handleInner: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  presetRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  preset: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  presetText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
});

// ── Main screen ──────────────────────────────────────────────────────────────
export default function PostRequirementScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const createRequirementMutation = useCreateRequirement();

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedCat, setSelectedCat] = useState(CATEGORIES[0].label);
  const [ddOpen, setDdOpen] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [minBudget, setMinBudget] = useState(5000);
  const [maxBudget, setMaxBudget] = useState(50000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (!trimmed || skills.includes(trimmed)) return;
    setSkills([...skills, trimmed]);
    setSkillInput("");
  };

  const handleSubmit = async () => {
    setError("");
    if (!title.trim()) { setError("Please enter a requirement title."); return; }
    if (!desc.trim()) { setError("Please enter a description."); return; }
    if (!profile?.uid) { setError("You must be logged in to post a requirement."); return; }

    setLoading(true);
    try {
      await createRequirementMutation.mutateAsync({
        data: {
          creatorId: profile.uid,
          title: title.trim(),
          category: selectedCat,
          description: desc.trim(),
          skillsNeeded: skills.length > 0 ? skills.join(", ") : undefined,
          minBudget,
          maxBudget,
        },
      });
      Alert.alert("Requirement Posted!", "Your requirement is now live.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      setError(err?.data?.error ?? err?.message ?? "Failed to post requirement. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const selectedCatObj = CATEGORIES.find((c) => c.label === selectedCat) ?? CATEGORIES[0];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient colors={[PRIMARY + "09", "transparent"]} style={styles.orbTR} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#0f172a" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Post a requirement</Text>
          <Text style={styles.headerSub}>Tell us what you need done</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressRow}>
        <View style={[styles.progressBar, { flex: 1, backgroundColor: PRIMARY }]} />
        <View style={[styles.progressBar, { flex: 1, backgroundColor: "#e2e8f0" }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>Title</Text>
          <View style={styles.inputRow}>
            <Feather name="edit-2" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Build a React Native app"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
          </View>
        </View>

        {/* Category dropdown */}
        <View style={styles.field}>
          <Text style={styles.label}>Category</Text>
          <Pressable
            onPress={() => setDdOpen(!ddOpen)}
            style={[styles.inputRow, ddOpen && { borderColor: PRIMARY, borderWidth: 1.5 }]}
          >
            <Feather name={selectedCatObj.icon as any} size={16} color={PRIMARY} style={{ marginRight: 10 }} />
            <Text style={[styles.input, { color: "#0f172a" }]}>{selectedCat}</Text>
            <Feather name={ddOpen ? "chevron-up" : "chevron-down"} size={16} color="#94a3b8" />
          </Pressable>
          {ddOpen && (
            <View style={styles.dropdown}>
              <View style={styles.dropdownGrid}>
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c.label}
                    onPress={() => { setSelectedCat(c.label); setDdOpen(false); }}
                    style={[
                      styles.dropdownItem,
                      selectedCat === c.label && { backgroundColor: PRIMARY + "14", borderColor: PRIMARY + "44" },
                    ]}
                  >
                    <Feather name={c.icon as any} size={14} color={selectedCat === c.label ? PRIMARY : "#64748b"} />
                    <Text style={[styles.dropdownLabel, selectedCat === c.label && { color: PRIMARY }]}>
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="Describe the work, scope and deliverables…"
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={4}
            style={[styles.inputRow, { height: 100, textAlignVertical: "top", paddingTop: 14 }]}
          />
        </View>

        {/* Skills */}
        <View style={styles.field}>
          <Text style={styles.label}>Skills required</Text>
          {skills.length > 0 && (
            <View style={styles.chipsRow}>
              {skills.map((s) => (
                <Pressable key={s} onPress={() => setSkills(skills.filter((x) => x !== s))} style={styles.chipWrap}>
                  <Chip color={PRIMARY}>{s}</Chip>
                  <View style={styles.chipRemove}>
                    <Feather name="x" size={8} color={PRIMARY} />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.inputRow}>
            <Feather name="tag" size={16} color="#94a3b8" style={{ marginRight: 10 }} />
            <TextInput
              value={skillInput}
              onChangeText={setSkillInput}
              onSubmitEditing={handleAddSkill}
              placeholder="Add a skill and press +"
              placeholderTextColor="#94a3b8"
              style={[styles.input, { flex: 1 }]}
              returnKeyType="done"
            />
            <Pressable onPress={handleAddSkill} style={[styles.addBtn, { backgroundColor: PRIMARY }]}>
              <Feather name="plus" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Budget range slider */}
        <View style={styles.field}>
          <View style={styles.budgetHeader}>
            <Text style={styles.label}>Budget range (₹)</Text>
            <View style={[styles.budgetTag, { backgroundColor: PRIMARY + "12" }]}>
              <Feather name="sliders" size={11} color={PRIMARY} />
              <Text style={[styles.budgetTagText, { color: PRIMARY }]}>Drag handles to set</Text>
            </View>
          </View>
          <View style={styles.sliderCard}>
            <RangeSlider
              minVal={minBudget}
              maxVal={maxBudget}
              onMinChange={setMinBudget}
              onMaxChange={setMaxBudget}
            />
          </View>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={13} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={({ pressed }) => [
            styles.submitBtn,
            { opacity: pressed || loading ? 0.88 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
        >
          <LinearGradient colors={[PRIMARY, "#6d28d9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={styles.submitText}>Post Requirement</Text>
                <Feather name="arrow-right" size={17} color="#fff" style={{ marginLeft: 8 }} />
              </>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  orbTR: { position: "absolute", top: -60, right: -40, width: 200, height: 200, borderRadius: 100 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  headerTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  headerSub: { fontSize: 11, fontWeight: "600", color: "#94a3b8", marginTop: 1 },
  progressRow: { flexDirection: "row", gap: 4, paddingHorizontal: 20, marginBottom: 8 },
  progressBar: { height: 3, borderRadius: 2 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 6 },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 8, marginLeft: 2 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#ffffff", borderWidth: 1.5, borderColor: "#e2e8f0",
    borderRadius: 14, paddingHorizontal: 14, minHeight: 50,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  input: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0f172a" },
  dropdown: { marginTop: 8, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e2e8f0", overflow: "hidden", shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  dropdownGrid: { flexDirection: "row", flexWrap: "wrap", padding: 8, gap: 4 },
  dropdownItem: { width: "48%", flexDirection: "row", alignItems: "center", gap: 7, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  dropdownLabel: { fontSize: 12, fontWeight: "700", color: "#64748b", flex: 1 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chipWrap: { position: "relative" },
  chipRemove: { position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: PRIMARY, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  budgetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  budgetTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  budgetTagText: { fontSize: 10, fontWeight: "700" },
  sliderCard: {
    backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 20, paddingTop: 18,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.15)", marginBottom: 8 },
  errorText: { color: "#ef4444", fontSize: 12, fontWeight: "600", flex: 1 },
  submitBtn: { borderRadius: 16, overflow: "hidden", shadowColor: PRIMARY, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 6, marginTop: 8 },
  submitGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 17 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
