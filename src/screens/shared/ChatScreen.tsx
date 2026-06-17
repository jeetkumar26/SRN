import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet, Text, View, Pressable, TextInput,
  FlatList, KeyboardAvoidingView, Platform,
  ActivityIndicator, StatusBar, Alert, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import firestore from "@react-native-firebase/firestore";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { useAuth } from "../../contexts/AuthContext";
import { useSendMessage, customFetch } from "@workspace/api-client-react";

type ChatRouteProp = RouteProp<RootStackParamList, "Chat">;

interface FirestoreMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
  read: boolean;
}

const PRIMARY = "#7c3aed";

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute<ChatRouteProp>();
  const { conversationId, recipientId, recipientName } = route.params;

  const { firebaseUser } = useAuth();
  const [messages, setMessages] = useState<FirestoreMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const sendMessageMutation = useSendMessage();

  const recipientInitials = recipientName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  // Real-time messages subscription
  useEffect(() => {
    if (!conversationId) return;
    const unsub = firestore()
      .collection("conversations")
      .doc(conversationId)
      .collection("messages")
      .orderBy("createdAt", "asc")
      .onSnapshot(
        (snap) => {
          setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FirestoreMessage, "id">) })));
          setLoading(false);
        },
        (err) => {
          console.error("[ChatScreen] messages snapshot error:", err);
          setLoading(false);
        }
      );
    return unsub;
  }, [conversationId]);

  // Mark incoming messages as read via API
  useEffect(() => {
    if (!firebaseUser || messages.length === 0) return;
    const hasUnread = messages.some((m) => m.senderId !== firebaseUser.uid && !m.read);
    if (!hasUnread) return;
    customFetch(`/api/messages/conversations/${conversationId}/read`, {
      method: "PATCH",
    }).catch(console.error);
  }, [messages, firebaseUser, conversationId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !firebaseUser) return;
    setSending(true);
    setText("");
    try {
      await sendMessageMutation.mutateAsync({
        data: {
          senderId: firebaseUser.uid,
          receiverId: recipientId,
          text: trimmed,
          ...(conversationId ? { conversationId } : {}),
        } as any,
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      console.error("[ChatScreen] send error:", err);
      setText(trimmed);
      Alert.alert("Send Failed", err?.data?.error ?? "Could not send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleLongPress = (msg: FirestoreMessage) => {
    setSelectedMsgId(msg.id);
    const isMine = msg.senderId === firebaseUser?.uid;
    const options: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [
      {
        text: "Copy text",
        onPress: () => {
          Share.share({ message: msg.text }).catch(console.error);
          setSelectedMsgId(null);
        },
      },
    ];
    if (isMine) {
      options.push({
        text: "Delete message",
        style: "destructive",
        onPress: () => {
          customFetch(`/api/messages/${conversationId}/messages/${msg.id}`, {
            method: "DELETE",
          }).catch(console.error);
          setSelectedMsgId(null);
        },
      });
    }
    options.push({ text: "Cancel", style: "cancel", onPress: () => setSelectedMsgId(null) });
    Alert.alert("Message", undefined, options);
  };

  const handleAttachment = () => {
    Alert.alert("Attachments", "Choose an option", [
      { text: "Camera" },
      { text: "Photo Library" },
      { text: "Document" },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const formatDateGroup = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const isMe = (senderId: string) => senderId === firebaseUser?.uid;

  // Group messages by date
  type MessageItem =
    | { type: "date"; key: string; label: string }
    | { type: "message"; key: string; msg: FirestoreMessage };

  const items: MessageItem[] = [];
  let lastDate = "";
  for (const msg of messages) {
    const dateLabel = formatDateGroup(msg.createdAt);
    if (dateLabel !== lastDate) {
      items.push({ type: "date", key: `date-${msg.createdAt}`, label: dateLabel });
      lastDate = dateLabel;
    }
    items.push({ type: "message", key: msg.id, msg });
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color="#0f172a" />
        </Pressable>

        <View style={styles.headerInfo}>
          <View style={styles.headerAvatarWrap}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{recipientInitials}</Text>
            </View>
            <View style={styles.onlineDot} />
          </View>
          <View>
            <Text style={styles.headerName}>{recipientName}</Text>
            <View style={styles.onlineRow}>
              <View style={styles.onlineDotSmall} />
              <Text style={styles.onlineText}>Active now</Text>
            </View>
          </View>
        </View>

        <Pressable style={styles.moreBtn}>
          <Feather name="more-vertical" size={18} color="#475569" />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={PRIMARY} size="large" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={items}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <LinearGradient
                  colors={[PRIMARY + "14", PRIMARY + "06"]}
                  style={styles.emptyIcon}
                >
                  <Feather name="message-circle" size={30} color={PRIMARY} />
                </LinearGradient>
                <Text style={styles.emptyTitle}>Start the conversation</Text>
                <Text style={styles.emptyText}>Send a message to {recipientName}</Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.type === "date") {
                return (
                  <View style={styles.dateGroup}>
                    <View style={styles.dateLine} />
                    <View style={styles.dateChip}>
                      <Text style={styles.dateChipText}>{item.label}</Text>
                    </View>
                    <View style={styles.dateLine} />
                  </View>
                );
              }

              const msg = item.msg;
              const mine = isMe(msg.senderId);
              const isSelected = selectedMsgId === msg.id;

              return (
                <Pressable
                  onLongPress={() => handleLongPress(msg)}
                  style={[
                    styles.msgRow,
                    mine ? styles.msgRowRight : styles.msgRowLeft,
                    isSelected && styles.msgRowSelected,
                  ]}
                >
                  {!mine && (
                    <View style={styles.smallAvatar}>
                      <Text style={styles.smallAvatarText}>{recipientInitials[0]}</Text>
                    </View>
                  )}
                  {mine ? (
                    <LinearGradient
                      colors={[PRIMARY, "#6d28d9"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.bubble, styles.bubbleMine]}
                    >
                      <Text style={[styles.bubbleText, { color: "#fff" }]}>{msg.text}</Text>
                      <View style={styles.bubbleMeta}>
                        <Text style={[styles.bubbleTime, { color: "rgba(255,255,255,0.7)" }]}>
                          {formatTime(msg.createdAt)}
                        </Text>
                        <Feather
                          name={msg.read ? "check-circle" : "check"}
                          size={10}
                          color={msg.read ? "#a5f3fc" : "rgba(255,255,255,0.5)"}
                        />
                      </View>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.bubble, styles.bubbleTheirs]}>
                      <Text style={[styles.bubbleText, { color: "#0f172a" }]}>{msg.text}</Text>
                      <View style={styles.bubbleMeta}>
                        <Text style={[styles.bubbleTime, { color: "#94a3b8" }]}>
                          {formatTime(msg.createdAt)}
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}

        {/* Composer */}
        <View style={styles.composer}>
          {/* Attachment button */}
          <Pressable onPress={handleAttachment} style={styles.attachBtn}>
            <Feather name="paperclip" size={18} color="#64748b" />
          </Pressable>

          <View style={[styles.inputWrap, text.length > 0 && styles.inputWrapActive]}>
            <TextInput
              style={styles.composerInput}
              value={text}
              onChangeText={setText}
              placeholder="Type a message..."
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={1000}
              submitBehavior="newline"
            />
          </View>

          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={({ pressed }) => [styles.sendBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            {sending ? (
              <View style={[styles.sendGrad, { backgroundColor: "#e2e8f0" }]}>
                <ActivityIndicator color={PRIMARY} size="small" />
              </View>
            ) : text.trim() ? (
              <LinearGradient
                colors={[PRIMARY, "#6d28d9"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendGrad}
              >
                <Feather name="send" size={16} color="#fff" style={{ marginLeft: 2 }} />
              </LinearGradient>
            ) : (
              <View style={[styles.sendGrad, { backgroundColor: "#f1f5f9" }]}>
                <Feather name="send" size={16} color="#94a3b8" style={{ marginLeft: 2 }} />
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10,
    gap: 10, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  headerInfo: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  headerAvatarWrap: { position: "relative" },
  headerAvatar: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: PRIMARY + "18", borderWidth: 1.5, borderColor: PRIMARY + "40",
    alignItems: "center", justifyContent: "center",
  },
  headerAvatarText: { fontSize: 14, fontWeight: "800", color: PRIMARY },
  onlineDot: {
    position: "absolute", bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: "#10b981", borderWidth: 2, borderColor: "#fff",
  },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  onlineDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10b981" },
  onlineText: { fontSize: 10, fontWeight: "600", color: "#10b981" },
  headerName: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  moreBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },

  // States
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  emptyText: { fontSize: 13, fontWeight: "500", color: "#94a3b8" },

  // Messages
  messagesList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 6 },
  dateGroup: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 8 },
  dateLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  dateChip: { backgroundColor: "#f1f5f9", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  dateChipText: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  msgRowLeft: { justifyContent: "flex-start" },
  msgRowRight: { justifyContent: "flex-end" },
  msgRowSelected: { opacity: 0.75 },
  smallAvatar: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: PRIMARY + "18", borderWidth: 1, borderColor: PRIMARY + "30",
    alignItems: "center", justifyContent: "center", marginBottom: 2,
  },
  smallAvatarText: { fontSize: 9, fontWeight: "800", color: PRIMARY },
  bubble: { maxWidth: "75%", borderRadius: 18, padding: 10, paddingHorizontal: 13 },
  bubbleMine: {
    borderBottomRightRadius: 4,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  bubbleTheirs: {
    borderBottomLeftRadius: 4, backgroundColor: "#ffffff",
    borderWidth: 1.5, borderColor: "#e2e8f0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  bubbleText: { fontSize: 14, fontWeight: "500", lineHeight: 20 },
  bubbleMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  bubbleTime: { fontSize: 9, fontWeight: "600" },

  // Composer
  composer: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 10, paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
    borderTopWidth: 1, borderTopColor: "#e2e8f0",
    backgroundColor: "rgba(255,255,255,0.95)", gap: 6,
  },
  attachBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#f1f5f9", borderWidth: 1.5, borderColor: "#e2e8f0",
    alignItems: "center", justifyContent: "center", marginBottom: 1,
  },
  inputWrap: {
    flex: 1, backgroundColor: "#f8fafc", borderRadius: 20,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    paddingHorizontal: 14, paddingVertical: 8,
    minHeight: 42, maxHeight: 120, justifyContent: "center",
  },
  inputWrapActive: { borderColor: PRIMARY + "50", backgroundColor: "#ffffff" },
  composerInput: { fontSize: 14, fontWeight: "500", color: "#0f172a", lineHeight: 20 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 2, overflow: "hidden" },
  sendGrad: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
