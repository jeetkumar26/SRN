import React, { useEffect, useState } from "react";
import {
  StyleSheet, Text, View, Pressable, FlatList,
  TextInput, ActivityIndicator, Alert, StatusBar, Modal, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "../../contexts/AuthContext";

const ROLE_COLOR = "#0d9488";

interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  url: string;
  techStack: string[];
  category: string;
  imageEmoji: string;
  createdAt: number;
}

const CATEGORIES = ["Web App", "Mobile App", "Design", "Backend", "API", "Data / AI", "Other"];

const PROJECT_EMOJIS = ["🚀", "💡", "🎨", "⚡", "🔥", "🌐", "📱", "🤖", "🎯", "✨"];

const FIELDS: Array<{ key: string; label: string; placeholder: string; multiline?: boolean }> = [
  { key: "title", label: "Project Title *", placeholder: "e.g. E-commerce Platform" },
  { key: "desc", label: "Description *", placeholder: "Brief description of the project", multiline: true },
  { key: "url", label: "Live URL / Repo", placeholder: "https://..." },
  { key: "stack", label: "Tech Stack (comma separated)", placeholder: "React, Node.js, PostgreSQL" },
];

export default function PortfolioScreen() {
  const { firebaseUser } = useAuth();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");
  const [stack, setStack] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [emoji, setEmoji] = useState(PROJECT_EMOJIS[0]);

  const fieldValues: Record<string, string> = { title, desc, url, stack };
  const fieldSetters: Record<string, (v: string) => void> = {
    title: setTitle, desc: setDesc, url: setUrl, stack: setStack,
  };

  const fetchItems = () => {
    if (!firebaseUser) return;
    setLoading(true);
    customFetch<{ items: any[] }>("/api/portfolio?limit=50")
      .then((res) => setItems(res.items.map((i) => ({
        id: i.id,
        title: i.title ?? "",
        description: i.description ?? "",
        url: i.url ?? "",
        techStack: Array.isArray(i.techStack) ? i.techStack : (i.techStack ? String(i.techStack).split(",").map((s: string) => s.trim()) : []),
        category: i.category ?? CATEGORIES[0],
        imageEmoji: i.imageEmoji ?? "🚀",
        createdAt: i.createdAt ? new Date(i.createdAt).getTime() : Date.now(),
      }))))
      .catch((err) => console.error("[Portfolio] fetch error:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
  }, [firebaseUser]);

  const openAdd = () => {
    setEditingItem(null);
    setTitle(""); setDesc(""); setUrl(""); setStack("");
    setCategory(CATEGORIES[0]);
    setEmoji(PROJECT_EMOJIS[0]);
    setModalVisible(true);
  };

  const openEdit = (item: PortfolioItem) => {
    setEditingItem(item);
    setTitle(item.title);
    setDesc(item.description);
    setUrl(item.url ?? "");
    setStack(item.techStack?.join(", ") ?? "");
    setCategory(item.category ?? CATEGORIES[0]);
    setEmoji(item.imageEmoji ?? PROJECT_EMOJIS[0]);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !desc.trim()) {
      Alert.alert("Validation", "Please fill in title and description.");
      return;
    }
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const techStack = stack.split(",").map((s) => s.trim()).filter(Boolean);
      const body = JSON.stringify({ title: title.trim(), description: desc.trim(), url: url.trim(), techStack, category, imageEmoji: emoji });

      if (editingItem) {
        await customFetch(`/api/portfolio/${editingItem.id}`, { method: "PATCH", body });
      } else {
        await customFetch("/api/portfolio", { method: "POST", body });
      }
      fetchItems();

      setTitle(""); setDesc(""); setUrl(""); setStack("");
      setModalVisible(false);
      setEditingItem(null);
    } catch {
      Alert.alert("Error", "Failed to save portfolio item.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete", "Remove this portfolio item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          customFetch(`/api/portfolio/${id}`, { method: "DELETE" })
            .then(() => setItems((prev) => prev.filter((i) => i.id !== id)))
            .catch(() => Alert.alert("Error", "Failed to delete item."));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Portfolio</Text>
          <Text style={styles.headerSub}>{items.length} project{items.length !== 1 ? "s" : ""}</Text>
        </View>
        <Pressable onPress={openAdd} style={styles.addBtn}>
          <LinearGradient colors={[ROLE_COLOR, "#0f766e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addBtnGrad}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add Project</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={ROLE_COLOR} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <LinearGradient colors={[ROLE_COLOR + "14", ROLE_COLOR + "06"]} style={styles.emptyIconWrap}>
            <Text style={{ fontSize: 36 }}>🚀</Text>
          </LinearGradient>
          <Text style={styles.emptyTitle}>No portfolio items yet</Text>
          <Text style={styles.emptyBody}>Showcase your best work to attract clients and build credibility.</Text>
          <Pressable onPress={openAdd} style={styles.emptyBtn}>
            <LinearGradient colors={[ROLE_COLOR, "#0f766e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyBtnGrad}>
              <Text style={styles.emptyBtnText}>Add First Project</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {/* Card header: emoji + title + actions */}
              <View style={styles.cardTop}>
                <View style={[styles.emojiBox, { backgroundColor: ROLE_COLOR + "12" }]}>
                  <Text style={{ fontSize: 22 }}>{item.imageEmoji ?? "🚀"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  {item.category ? (
                    <View style={[styles.catChip, { backgroundColor: ROLE_COLOR + "12" }]}>
                      <Text style={[styles.catText, { color: ROLE_COLOR }]}>{item.category}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cardActions}>
                  <Pressable onPress={() => openEdit(item)} style={styles.editBtn}>
                    <Feather name="edit-2" size={13} color={ROLE_COLOR} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                    <Feather name="trash-2" size={13} color="#ef4444" />
                  </Pressable>
                </View>
              </View>

              {/* Description */}
              <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>

              {/* Tech stack chips */}
              {item.techStack?.length > 0 && (
                <View style={styles.stackRow}>
                  {item.techStack.slice(0, 5).map((t) => (
                    <View key={t} style={[styles.techChip, { backgroundColor: ROLE_COLOR + "10" }]}>
                      <Text style={[styles.techText, { color: ROLE_COLOR }]}>{t}</Text>
                    </View>
                  ))}
                  {item.techStack.length > 5 && (
                    <Text style={styles.techMore}>+{item.techStack.length - 5}</Text>
                  )}
                </View>
              )}

              {/* URL */}
              {!!item.url && (
                <View style={styles.urlRow}>
                  <Feather name="link" size={12} color={ROLE_COLOR} />
                  <Text style={styles.urlText} numberOfLines={1}>{item.url}</Text>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingItem ? "Edit Project" : "Add Portfolio Item"}</Text>
              <Pressable onPress={() => setModalVisible(false)} style={styles.modalClose}>
                <Feather name="x" size={20} color="#475569" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Emoji picker */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Project Icon</Text>
                <View style={styles.emojiRow}>
                  {PROJECT_EMOJIS.map((e) => (
                    <Pressable
                      key={e}
                      onPress={() => setEmoji(e)}
                      style={[styles.emojiOption, emoji === e && { backgroundColor: ROLE_COLOR + "20", borderColor: ROLE_COLOR }]}
                    >
                      <Text style={{ fontSize: 20 }}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Category */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.catRow}>
                  {CATEGORIES.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(c)}
                      style={[
                        styles.catOption,
                        category === c && { backgroundColor: ROLE_COLOR, borderColor: ROLE_COLOR },
                      ]}
                    >
                      <Text style={[styles.catOptionText, category === c && { color: "#fff" }]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Text fields */}
              {FIELDS.map(({ key, label, placeholder, multiline }) => (
                <View key={key} style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <TextInput
                    value={fieldValues[key]}
                    onChangeText={fieldSetters[key]}
                    placeholder={placeholder}
                    placeholderTextColor="#94a3b8"
                    multiline={multiline}
                    style={[styles.fieldInput, multiline && { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
                  />
                </View>
              ))}

              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => [styles.submitBtn, { opacity: pressed || saving ? 0.85 : 1 }]}
              >
                <LinearGradient colors={[ROLE_COLOR, "#0f766e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.submitBtnText}>{editingItem ? "Save Changes" : "Add to Portfolio"}</Text>
                  }
                </LinearGradient>
              </Pressable>
            </ScrollView>
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
  headerSub: { fontSize: 12, fontWeight: "600", color: "#94a3b8", marginTop: 1 },
  addBtn: { borderRadius: 12, overflow: "hidden" },
  addBtnGrad: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyIconWrap: { width: 90, height: 90, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  emptyBody: { fontSize: 13, fontWeight: "500", color: "#94a3b8", textAlign: "center", lineHeight: 20 },
  emptyBtn: { marginTop: 8, borderRadius: 14, overflow: "hidden" },
  emptyBtnGrad: { paddingHorizontal: 28, paddingVertical: 14 },
  emptyBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 14, gap: 10,
    shadowColor: ROLE_COLOR, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  emojiBox: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  catChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catText: { fontSize: 10, fontWeight: "700" },
  cardActions: { flexDirection: "row", gap: 6 },
  editBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: ROLE_COLOR + "12", alignItems: "center", justifyContent: "center" },
  deleteBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#fef2f2", alignItems: "center", justifyContent: "center" },
  cardDesc: { fontSize: 12, fontWeight: "500", color: "#64748b", lineHeight: 18 },
  stackRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  techChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  techText: { fontSize: 10, fontWeight: "700" },
  techMore: { fontSize: 10, fontWeight: "700", color: "#94a3b8" },
  urlRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  urlText: { fontSize: 11, fontWeight: "600", color: ROLE_COLOR, flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#ffffff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, maxHeight: "92%",
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0", alignSelf: "center", marginBottom: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  modalClose: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  fieldWrap: { gap: 8, marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldInput: {
    borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12,
    paddingHorizontal: 12, height: 46, fontSize: 14, fontWeight: "600",
    color: "#0f172a", backgroundColor: "#f8fafc",
  },
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emojiOption: {
    width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  catOptionText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  submitBtn: { borderRadius: 16, overflow: "hidden", marginTop: 4, marginBottom: 16 },
  submitGrad: { height: 52, alignItems: "center", justifyContent: "center" },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
