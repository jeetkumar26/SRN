import React, { useEffect, useState } from "react";
import {
  StyleSheet, Text, View, Pressable, FlatList,
  TextInput, ActivityIndicator, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import firestore from "@react-native-firebase/firestore";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { useAuth } from "../../contexts/AuthContext";

interface Conversation {
  id: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
}

type NavProp = StackNavigationProp<RootStackParamList, "Chat">;

const AVATAR_COLORS = ["#7c3aed", "#2563eb", "#0d9488", "#ea580c", "#dc2626"];

export default function ChatListScreen() {
  const navigation = useNavigation<NavProp>();
  const { firebaseUser, profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!firebaseUser) return;

    const unsub = firestore()
      .collection("conversations")
      .where("participantIds", "array-contains", firebaseUser.uid)
      .orderBy("lastMessageAt", "desc")
      .limit(30)
      .onSnapshot(
        (snap) => {
          setConversations(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, "id">) }))
          );
          setLoading(false);
        },
        (err) => {
          console.error("[ChatList] snapshot error:", err);
          setLoading(false);
        }
      );

    return unsub;
  }, [firebaseUser]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    }
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const names = Object.values(c.participantNames ?? {}).join(" ").toLowerCase();
    return names.includes(search.toLowerCase()) || c.lastMessage?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <Pressable
          onPress={() => navigation.navigate("Search", {})}
          style={styles.newChatBtn}
        >
          <Feather name="edit" size={18} color="#7c3aed" />
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color="#94a3b8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={15} color="#94a3b8" />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#7c3aed" size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="message-circle" size={32} color="#94a3b8" />
          </View>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyText}>Start a chat from Search or a provider profile.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item: convo, index }) => {
            const otherId = convo.participantIds?.find((id) => id !== firebaseUser?.uid) ?? "";
            const otherName = convo.participantNames?.[otherId] ?? "User";
            const initials = otherName.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
            const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
            const hasUnread = convo.unreadCount > 0;

            return (
              <Pressable
                onPress={() =>
                  navigation.navigate("Chat", {
                    conversationId: convo.id,
                    recipientId: otherId,
                    recipientName: otherName,
                  })
                }
                style={({ pressed }) => [styles.convoItem, pressed && { backgroundColor: "#f8fafc" }]}
              >
                <View style={styles.avatarWrap}>
                  <View style={[styles.avatar, { backgroundColor: avatarColor + "18", borderColor: avatarColor + "44" }]}>
                    <Text style={[styles.avatarText, { color: avatarColor }]}>{initials}</Text>
                  </View>
                  <View style={[styles.onlineDot, { backgroundColor: "#10b981" }]} />
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.convoTitleRow}>
                    <Text style={[styles.convoName, hasUnread && styles.convoNameBold]}>
                      {otherName}
                    </Text>
                    <Text style={styles.convoTime}>
                      {convo.lastMessageAt ? formatTime(convo.lastMessageAt) : ""}
                    </Text>
                  </View>
                  <View style={styles.convoPreviewRow}>
                    <Text
                      style={[styles.convoPreview, hasUnread && styles.convoPreviewBold]}
                      numberOfLines={1}
                    >
                      {convo.lastMessage || "Start a conversation"}
                    </Text>
                    {hasUnread && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{convo.unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  newChatBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#7c3aed14", alignItems: "center", justifyContent: "center" },
  searchWrap: { backgroundColor: "#ffffff", paddingHorizontal: 16, paddingBottom: 12, paddingTop: 10 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f1f5f9", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "500", color: "#0f172a" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  emptyText: { fontSize: 13, fontWeight: "500", color: "#94a3b8", textAlign: "center", paddingHorizontal: 32 },
  list: { paddingBottom: 24 },
  separator: { height: 1, backgroundColor: "#f1f5f9", marginLeft: 82 },
  convoItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#ffffff" },
  avatarWrap: { position: "relative" },
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "800" },
  onlineDot: { position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#ffffff" },
  convoTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  convoName: { fontSize: 14, fontWeight: "600", color: "#0f172a", flex: 1 },
  convoNameBold: { fontWeight: "800" },
  convoTime: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  convoPreviewRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  convoPreview: { fontSize: 12, fontWeight: "500", color: "#94a3b8", flex: 1 },
  convoPreviewBold: { fontWeight: "700", color: "#475569" },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
