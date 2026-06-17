import React, { useState } from "react";
import {
  StyleSheet, Text, View, Pressable, FlatList,
  TextInput, ActivityIndicator, Alert, StatusBar, Modal, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import LinearGradient from "react-native-linear-gradient";
import { useListUsers, customFetch } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { ROLE_COLORS, ROLE_LABELS } from "../../types/roles";
import type { UserRole } from "../../types/roles";

const ROLE_FILTERS: Array<UserRole | "all"> = ["all", "business", "customer", "digital", "local", "admin"];
const ADMIN_COLOR = "#dc2626";

// ── User detail modal ────────────────────────────────────────────────────────
function UserDetailModal({
  user,
  onClose,
  onAction,
}: {
  user: User | null;
  onClose: () => void;
  onAction: (u: User, action: "suspend" | "delete") => void;
}) {
  if (!user) return null;

  const uRole = user.role as UserRole;
  const roleColor = ROLE_COLORS[uRole] ?? "#64748b";
  const roleLabel = ROLE_LABELS[uRole] ?? user.role;
  const initials = user.name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();

  const joinDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "N/A";
  const completedGigs = user.completedGigs ?? 0;
  const rating = user.rating ?? null;

  const detailRows: Array<{ icon: string; label: string; value: string }> = [
    { icon: "mail", label: "Email", value: user.email },
    { icon: "briefcase", label: "Role", value: roleLabel },
    { icon: "calendar", label: "Member since", value: joinDate },
    { icon: "check-circle", label: "Completed gigs", value: completedGigs.toString() },
  ];
  if (rating !== null) {
    detailRows.push({ icon: "star", label: "Rating", value: `${rating.toFixed(1)} ★` });
  }

  return (
    <Modal visible={!!user} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />

          {/* Avatar + name */}
          <View style={modalStyles.avatarRow}>
            <View style={[modalStyles.avatarLg, { backgroundColor: roleColor + "18", borderColor: roleColor + "30" }]}>
              <Text style={[modalStyles.avatarText, { color: roleColor }]}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.name}>{user.name}</Text>
              <View style={[modalStyles.rolePill, { backgroundColor: roleColor + "18" }]}>
                <Text style={[modalStyles.roleText, { color: roleColor }]}>{roleLabel}</Text>
              </View>
            </View>
          </View>

          {/* Detail rows */}
          <View style={modalStyles.detailCard}>
            {detailRows.map((r, i) => (
              <View key={r.label} style={[modalStyles.detailRow, i < detailRows.length - 1 && modalStyles.detailRowBorder]}>
                <View style={modalStyles.detailIcon}>
                  <Feather name={r.icon as any} size={14} color="#64748b" />
                </View>
                <Text style={modalStyles.detailLabel}>{r.label}</Text>
                <Text style={modalStyles.detailValue}>{r.value}</Text>
              </View>
            ))}
          </View>

          {/* Action buttons */}
          <View style={modalStyles.actionRow}>
            <Pressable
              onPress={() => { onClose(); onAction(user, "suspend"); }}
              style={modalStyles.suspendBtn}
            >
              <Feather name="pause-circle" size={15} color="#d97706" />
              <Text style={modalStyles.suspendText}>Suspend</Text>
            </Pressable>
            <Pressable
              onPress={() => { onClose(); onAction(user, "delete"); }}
              style={modalStyles.deleteBtn}
            >
              <Feather name="trash-2" size={15} color="#ef4444" />
              <Text style={modalStyles.deleteText}>Delete</Text>
            </Pressable>
          </View>

          <Pressable onPress={onClose} style={modalStyles.closeBtn}>
            <Text style={modalStyles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36, gap: 16 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0", alignSelf: "center", marginBottom: 8 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarLg: { width: 62, height: 62, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 22, fontWeight: "800" },
  name: { fontSize: 18, fontWeight: "900", color: "#0f172a", marginBottom: 6 },
  rolePill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  roleText: { fontSize: 11, fontWeight: "800" },
  detailCard: { backgroundColor: "#f8fafc", borderRadius: 18, borderWidth: 1, borderColor: "#e2e8f0", overflow: "hidden" },
  detailRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  detailIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  detailLabel: { flex: 1, fontSize: 12, fontWeight: "600", color: "#64748b" },
  detailValue: { fontSize: 12, fontWeight: "700", color: "#0f172a", maxWidth: 170, textAlign: "right" },
  actionRow: { flexDirection: "row", gap: 10 },
  suspendBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: "#d9770630", backgroundColor: "#d9770610" },
  suspendText: { fontSize: 13, fontWeight: "700", color: "#d97706" },
  deleteBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: "#ef444430", backgroundColor: "#ef444410" },
  deleteText: { fontSize: 13, fontWeight: "700", color: "#ef4444" },
  closeBtn: { height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  closeBtnText: { fontSize: 14, fontWeight: "700", color: "#475569" },
});

// ── Main screen ──────────────────────────────────────────────────────────────
export default function UsersScreen() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const usersQuery = useListUsers(roleFilter !== "all" ? { role: roleFilter } : undefined);
  const users: User[] = usersQuery.data ?? [];

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const handleAction = (user: User, action: "suspend" | "delete") => {
    Alert.alert(
      action === "suspend" ? "Suspend User" : "Delete User",
      action === "suspend"
        ? `Suspend ${user.name}? They will lose access until reinstated.`
        : `Permanently delete ${user.name}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action === "suspend" ? "Suspend" : "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (action === "suspend") {
                await customFetch(`/api/admin/users/${user.id}/suspend`, { method: "PATCH" });
                Alert.alert("Suspended", `${user.name} has been suspended.`);
              } else {
                await customFetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
                Alert.alert("Deleted", `${user.name} has been permanently deleted.`);
              }
              usersQuery.refetch();
            } catch {
              Alert.alert("Error", `Could not ${action} user. Please try again.`);
            }
          },
        },
      ]
    );
  };

  const roleCount = roleFilter !== "all" ? filtered.length : users.length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>User Management</Text>
          <Text style={styles.headerSub}>{roleCount} user{roleCount !== 1 ? "s" : ""}</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: ADMIN_COLOR + "14" }]}>
          <Feather name="users" size={14} color={ADMIN_COLOR} />
          <Text style={[styles.countText, { color: ADMIN_COLOR }]}>{filtered.length}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color="#94a3b8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={16} color="#94a3b8" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Role filter pills */}
      <FlatList
        horizontal
        data={ROLE_FILTERS}
        keyExtractor={(f) => f}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => {
          const active = roleFilter === f;
          const roleColor = f !== "all" ? ROLE_COLORS[f as UserRole] : ADMIN_COLOR;
          return (
            <Pressable
              onPress={() => setRoleFilter(f)}
              style={[
                styles.filterPill,
                active
                  ? { backgroundColor: roleColor, borderColor: roleColor }
                  : { backgroundColor: "#f1f5f9", borderColor: "#e2e8f0" },
              ]}
            >
              <Text style={[styles.filterText, { color: active ? "#fff" : "#64748b" }]}>
                {f === "all" ? "All Roles" : ROLE_LABELS[f as UserRole]}
              </Text>
            </Pressable>
          );
        }}
      />

      {usersQuery.isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={ADMIN_COLOR} size="large" />
        </View>
      ) : usersQuery.isError ? (
        <View style={styles.errorState}>
          <View style={styles.emptyIcon}>
            <Feather name="alert-circle" size={28} color="#ef4444" />
          </View>
          <Text style={styles.errorText}>Failed to load users</Text>
          <Pressable onPress={() => usersQuery.refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <LinearGradient colors={[ADMIN_COLOR + "12", ADMIN_COLOR + "06"]} style={styles.emptyIcon}>
            <Feather name="users" size={30} color={ADMIN_COLOR} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>No users found</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: user }) => {
            const uRole = user.role as UserRole;
            const roleColor = ROLE_COLORS[uRole] ?? "#64748b";
            const roleLabel = ROLE_LABELS[uRole] ?? user.role;
            const initials = user.name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
            const joinDate = user.createdAt
              ? new Date(user.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
              : null;
            const completedGigsCount = user.completedGigs ?? null;

            return (
              <View style={styles.userCard}>
                {/* Left: avatar */}
                <View style={[styles.avatar, { backgroundColor: roleColor + "18", borderColor: roleColor + "30" }]}>
                  <Text style={[styles.avatarText, { color: roleColor }]}>{initials}</Text>
                </View>

                {/* Center: info */}
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>

                  {/* Meta: join date + bookings */}
                  <View style={styles.metaRow}>
                    <View style={[styles.roleBadge, { backgroundColor: roleColor + "14" }]}>
                      <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
                    </View>
                    {joinDate && (
                      <View style={styles.metaChip}>
                        <Feather name="calendar" size={9} color="#94a3b8" />
                        <Text style={styles.metaChipText}>{joinDate}</Text>
                      </View>
                    )}
                    {completedGigsCount !== null && completedGigsCount > 0 && (
                      <View style={styles.metaChip}>
                        <Feather name="check-circle" size={9} color="#94a3b8" />
                        <Text style={styles.metaChipText}>{completedGigsCount} gigs</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Right: actions */}
                <View style={styles.actionsCol}>
                  <Pressable
                    onPress={() => setSelectedUser(user)}
                    style={[styles.actionIcon, { backgroundColor: ADMIN_COLOR + "10" }]}
                  >
                    <Feather name="eye" size={14} color={ADMIN_COLOR} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleAction(user, "suspend")}
                    style={[styles.actionIcon, { backgroundColor: "#d9770614" }]}
                  >
                    <Feather name="pause-circle" size={14} color="#d97706" />
                  </Pressable>
                  <Pressable
                    onPress={() => handleAction(user, "delete")}
                    style={[styles.actionIcon, { backgroundColor: "#ef444414" }]}
                  >
                    <Feather name="trash-2" size={14} color="#ef4444" />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* User detail modal */}
      <UserDetailModal
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onAction={handleAction}
      />
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
  countBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  countText: { fontSize: 13, fontWeight: "800" },
  searchContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: "#ffffff" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f1f5f9", borderRadius: 14, borderWidth: 1.5, borderColor: "#e2e8f0", paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0f172a" },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  filterText: { fontSize: 10, fontWeight: "700" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#64748b" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: ADMIN_COLOR },
  retryText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  userCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 12, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  avatar: { width: 46, height: 46, borderRadius: 15, borderWidth: 1.5, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontSize: 15, fontWeight: "800" },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  userEmail: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  roleBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  roleText: { fontSize: 9, fontWeight: "800" },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#f1f5f9", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  metaChipText: { fontSize: 9, fontWeight: "600", color: "#64748b" },
  actionsCol: { flexDirection: "column", gap: 5 },
  actionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
