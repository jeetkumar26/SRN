import React, { useEffect, useState } from "react";
import {
  StyleSheet, Text, View, Pressable, FlatList,
  ActivityIndicator, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { customFetch } from "@workspace/api-client-react";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../contexts/AuthContext";
import { Card } from "../../components/ui";

interface Notification {
  id: string;
  type: "quote" | "message" | "requirement" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
  data?: Record<string, string>;
}

const NOTIF_CONFIG: Record<string, { icon: string; color: string }> = {
  quote: { icon: "dollar-sign", color: "#0d9488" },
  message: { icon: "message-circle", color: "#2563eb" },
  requirement: { icon: "file-text", color: "#7c3aed" },
  system: { icon: "shield", color: "#64748b" },
};

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const { firebaseUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = () => {
    if (!firebaseUser) return;
    customFetch<any[]>("/api/notifications?limit=50")
      .then((data) => setNotifications(
        data.map((n) => ({
          id: n.id,
          type: n.type ?? "system",
          title: n.title ?? "",
          body: n.body ?? "",
          read: n.read ?? false,
          createdAt: n.createdAt ? new Date(n.createdAt).getTime() : Date.now(),
          data: n.data ?? undefined,
        }))
      ))
      .catch((err) => console.error("[Notifications] fetch error:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNotifications();
  }, [firebaseUser]);

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    await customFetch("/api/notifications/read-all", { method: "PATCH" }).catch(console.error);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markOneRead = async (id: string) => {
    await customFetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(console.error);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#0f172a" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSub}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <Pressable onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#7c3aed" size="large" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="bell" size={32} color="#94a3b8" />
          </View>
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptyText}>No notifications yet.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: n }) => {
            const cfg = NOTIF_CONFIG[n.type] ?? NOTIF_CONFIG.system;
            return (
              <Pressable
                onPress={() => markOneRead(n.id)}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              >
                <Card
                  color={cfg.color}
                  style={[
                    styles.notifCard,
                    !n.read ? { backgroundColor: "#7c3aed08", borderColor: "#7c3aed30" } : undefined,
                  ] as any}
                >
                  <View style={styles.notifRow}>
                    <View style={[styles.notifIcon, { backgroundColor: cfg.color + "14" }]}>
                      <Feather name={cfg.icon as any} size={18} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={styles.notifTitleRow}>
                        <Text style={styles.notifTitle}>{n.title}</Text>
                        <Text style={styles.notifTime}>{formatTime(n.createdAt)}</Text>
                        {!n.read && <View style={[styles.unreadDot, { backgroundColor: "#7c3aed" }]} />}
                      </View>
                      <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                    </View>
                  </View>
                </Card>
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
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  headerSub: { fontSize: 11, fontWeight: "600", color: "#94a3b8", marginTop: 1 },
  markAllBtn: { backgroundColor: "#7c3aed14", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  markAllText: { fontSize: 12, fontWeight: "700", color: "#7c3aed" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  emptyText: { fontSize: 13, fontWeight: "500", color: "#94a3b8" },
  list: { padding: 16, gap: 10 },
  notifCard: { padding: 14 },
  notifRow: { flexDirection: "row", alignItems: "flex-start" },
  notifIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notifTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  notifTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a", flex: 1 },
  notifTime: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  notifBody: { fontSize: 12, fontWeight: "500", color: "#64748b", lineHeight: 17 },
});
