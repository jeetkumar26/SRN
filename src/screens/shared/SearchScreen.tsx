import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  StyleSheet, Text, View, Pressable, TextInput,
  FlatList, ActivityIndicator, StatusBar, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { customFetch } from "@workspace/api-client-react";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { useAuth } from "../../contexts/AuthContext";

type SearchRouteProp = RouteProp<RootStackParamList, "Search">;
type NavProp = StackNavigationProp<RootStackParamList>;
type Tab = "providers" | "requirements";

const RC: Record<string, string> = {
  digital: "#0d9488",
  local: "#ea580c",
  business: "#7c3aed",
};

const URGENCY_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#ef4444",
};

const CATEGORIES = [
  "Web Development", "UI/UX Design", "Mobile App", "Content Writing",
  "Local Services", "Data & AI", "Marketing", "Graphic Design",
];

interface ProviderResult {
  id: string;
  name: string;
  role: string;
  title?: string;
  rating?: number;
  reviewsCount?: number;
  aiTrustScore?: number;
  skills?: string;
  isVerified?: boolean;
  description?: string;
  location?: string;
}

interface RequirementResult {
  id: string;
  title: string;
  description?: string;
  category?: string;
  budget?: number;
  urgency?: string;
  status: string;
  createdAt: string;
  proposalCount?: number;
  creatorName?: string;
}

export default function SearchScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<SearchRouteProp>();
  const { firebaseUser } = useAuth();

  const [tab, setTab] = useState<Tab>("providers");
  const [query, setQuery] = useState(route.params?.query ?? "");

  const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined);
  const [pSort, setPSort] = useState("relevance");

  const [catFilter, setCatFilter] = useState<string | undefined>(undefined);
  const [rSort, setRSort] = useState("newest");

  const [providers, setProviders] = useState<ProviderResult[]>([]);
  const [requirements, setRequirements] = useState<RequirementResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (currentTab: Tab) => {
      setLoading(true);
      setHasError(false);
      try {
        if (currentTab === "providers") {
          const p = new URLSearchParams({ limit: "20", sortBy: pSort });
          if (query.trim()) p.set("q", query.trim());
          if (roleFilter) p.set("role", roleFilter);
          const res = await customFetch<{ providers: ProviderResult[]; total: number }>(
            `/api/search/providers?${p}`
          );
          setProviders(res.providers ?? []);
          setTotal(res.total ?? 0);
        } else {
          const p = new URLSearchParams({ limit: "20", sortBy: rSort });
          if (query.trim()) p.set("q", query.trim());
          if (catFilter) p.set("category", catFilter);
          const res = await customFetch<{ requirements: RequirementResult[]; total: number }>(
            `/api/search/requirements?${p}`
          );
          setRequirements(res.requirements ?? []);
          setTotal(res.total ?? 0);
        }
      } catch {
        setHasError(true);
      } finally {
        setLoading(false);
      }
    },
    [query, roleFilter, pSort, catFilter, rSort]
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(tab), 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tab, search]);

  const switchTab = useCallback((t: Tab) => {
    setTab(t);
    setHasError(false);
  }, []);

  const renderProvider = ({ item: p }: { item: ProviderResult }) => {
    const initials = p.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    const rc = RC[p.role] ?? "#7c3aed";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: rc + "18", borderColor: rc + "40" }]}>
              <Text style={[styles.avatarText, { color: rc }]}>{initials}</Text>
            </View>
            {p.isVerified && (
              <View style={styles.verifiedBadge}>
                <Feather name="shield" size={10} color="#10b981" />
              </View>
            )}
          </View>

          <View style={styles.userMeta}>
            <Text style={styles.userName} numberOfLines={1}>{p.name}</Text>
            {p.title && (
              <Text style={[styles.userTitle, { color: rc }]} numberOfLines={1}>{p.title}</Text>
            )}
            <View style={styles.statsRow}>
              {p.rating !== undefined && (
                <View style={styles.statItem}>
                  <Feather name="star" size={11} color="#f59e0b" />
                  <Text style={styles.statText}>
                    {p.rating.toFixed(1)}
                    {p.reviewsCount !== undefined && ` (${p.reviewsCount})`}
                  </Text>
                </View>
              )}
              {p.location && (
                <View style={styles.statItem}>
                  <Feather name="map-pin" size={11} color="#94a3b8" />
                  <Text style={[styles.statText, { color: "#94a3b8" }]}>{p.location}</Text>
                </View>
              )}
            </View>
          </View>

          {p.aiTrustScore !== undefined && (
            <View style={[styles.scoreBadge, { backgroundColor: rc + "10" }]}>
              <Text style={[styles.scoreText, { color: rc }]}>{p.aiTrustScore}</Text>
              <Text style={[styles.scoreLabel, { color: rc }]}>AI</Text>
            </View>
          )}
        </View>

        {p.description && (
          <Text numberOfLines={2} style={styles.description}>{p.description}</Text>
        )}

        {p.skills && (
          <View style={styles.skillsRow}>
            {p.skills.split(",").slice(0, 4).map((s) => s.trim()).filter(Boolean).map((skill) => (
              <View key={skill} style={[styles.skillChip, { backgroundColor: rc + "12" }]}>
                <Text style={[styles.skillText, { color: rc }]}>{skill}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.cardActions}>
          <Pressable
            onPress={() => navigation.navigate("ProviderProfile", { userId: p.id })}
            style={({ pressed }) => [styles.btnOutline, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Feather name="user" size={13} color="#475569" />
            <Text style={styles.btnOutlineText}>Profile</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              const myId = firebaseUser?.uid ?? "anon";
              const ids = [myId, p.id].sort();
              navigation.navigate("Chat", {
                conversationId: `dm_${ids[0]}_${ids[1]}`,
                recipientId: p.id,
                recipientName: p.name,
              });
            }}
            style={({ pressed }) => [
              styles.btnPrimary,
              { backgroundColor: rc, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Feather name="message-square" size={13} color="#fff" />
            <Text style={styles.btnPrimaryText}>Message</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderRequirement = ({ item: r }: { item: RequirementResult }) => {
    const urgencyColor = URGENCY_COLORS[r.urgency ?? ""] ?? "#94a3b8";
    const ms = Date.now() - new Date(r.createdAt).getTime();
    const daysSince = Math.floor(ms / 86400000);

    return (
      <Pressable
        onPress={() => navigation.navigate("RequirementDetail", { requirementId: r.id })}
        style={({ pressed }) => [styles.reqCard, { opacity: pressed ? 0.92 : 1 }]}
      >
        <View style={styles.reqHeader}>
          <Text style={styles.reqTitle} numberOfLines={2}>{r.title}</Text>
          {r.urgency && (
            <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor + "15" }]}>
              <Text style={[styles.urgencyText, { color: urgencyColor }]}>
                {r.urgency.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {r.category && (
          <View style={styles.catRow}>
            <View style={styles.catPill}>
              <Text style={styles.catText}>{r.category}</Text>
            </View>
          </View>
        )}

        {r.description && (
          <Text numberOfLines={2} style={styles.reqDesc}>{r.description}</Text>
        )}

        <View style={styles.reqFooter}>
          {r.budget !== undefined && (
            <View style={styles.budgetBox}>
              <Text style={styles.budgetText}>₹{r.budget.toLocaleString()}</Text>
            </View>
          )}
          <View style={styles.reqMeta}>
            {r.proposalCount !== undefined && (
              <View style={styles.statItem}>
                <Feather name="users" size={11} color="#94a3b8" />
                <Text style={styles.statText}>{r.proposalCount} bids</Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Feather name="clock" size={11} color="#94a3b8" />
              <Text style={styles.statText}>
                {daysSince === 0 ? "Today" : `${daysSince}d ago`}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const isProviders = tab === "providers";
  const listData: (ProviderResult | RequirementResult)[] = isProviders ? providers : requirements;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <View style={styles.searchRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="chevron-left" size={24} color="#0f172a" />
          </Pressable>
          <View style={styles.inputWrap}>
            <Feather name="search" size={15} color="#7c3aed" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={isProviders ? "Search providers, skills..." : "Search requirements..."}
              placeholderTextColor="#94a3b8"
              returnKeyType="search"
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")}>
                <Feather name="x" size={14} color="#94a3b8" />
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => search(tab)} style={styles.filterBtn}>
            <Feather name="refresh-cw" size={15} color="#475569" />
          </Pressable>
        </View>

        <View style={styles.tabRow}>
          {(["providers", "requirements"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => switchTab(t)}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            >
              <Feather
                name={t === "providers" ? "users" : "briefcase"}
                size={14}
                color={tab === t ? "#7c3aed" : "#94a3b8"}
              />
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === "providers" ? "Providers" : "Requirements"}
              </Text>
            </Pressable>
          ))}
        </View>

        {isProviders ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {[
              { label: "All", value: undefined },
              { label: "Digital", value: "digital" },
              { label: "Local", value: "local" },
            ].map((f) => {
              const active = roleFilter === f.value;
              return (
                <Pressable
                  key={f.label}
                  onPress={() => setRoleFilter(f.value)}
                  style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                >
                  <Text style={[styles.pillText, active && { color: "#fff" }]}>{f.label}</Text>
                </Pressable>
              );
            })}
            <View style={styles.pillSep} />
            {[
              { label: "Relevance", value: "relevance" },
              { label: "Rating", value: "rating" },
              { label: "Newest", value: "newest" },
            ].map((s) => {
              const active = pSort === s.value;
              return (
                <Pressable
                  key={s.value}
                  onPress={() => setPSort(s.value)}
                  style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                >
                  <Text style={[styles.pillText, active && { color: "#fff" }]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {[{ label: "All", value: undefined }, ...CATEGORIES.map((c) => ({ label: c, value: c }))].map((f) => {
              const active = catFilter === f.value;
              return (
                <Pressable
                  key={f.label}
                  onPress={() => setCatFilter(f.value)}
                  style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                >
                  <Text style={[styles.pillText, active && { color: "#fff" }]}>{f.label}</Text>
                </Pressable>
              );
            })}
            <View style={styles.pillSep} />
            {[
              { label: "Newest", value: "newest" },
              { label: "Budget ↑", value: "budget_high" },
              { label: "Budget ↓", value: "budget_low" },
            ].map((s) => {
              const active = rSort === s.value;
              return (
                <Pressable
                  key={s.value}
                  onPress={() => setRSort(s.value)}
                  style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                >
                  <Text style={[styles.pillText, active && { color: "#fff" }]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#7c3aed" size="large" />
        </View>
      ) : hasError ? (
        <View style={styles.centerState}>
          <View style={styles.emptyIcon}>
            <Feather name="wifi-off" size={28} color="#94a3b8" />
          </View>
          <Text style={styles.errorText}>Could not load results</Text>
          <Pressable onPress={() => search(tab)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.resultsMeta}>
              <Text style={styles.resultsCount}>
                {total} {isProviders ? "provider" : "requirement"}{total !== 1 ? "s" : ""} found
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Feather name={isProviders ? "users" : "briefcase"} size={28} color="#94a3b8" />
              </View>
              <Text style={styles.emptyTitle}>
                {isProviders ? "No providers found" : "No requirements found"}
              </Text>
              <Text style={styles.emptySubtext}>Try different keywords or clear filters</Text>
            </View>
          }
          renderItem={({ item }) =>
            isProviders
              ? renderProvider({ item: item as ProviderResult })
              : renderRequirement({ item: item as RequirementResult })
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  topBar: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center", justifyContent: "center",
  },
  inputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: "#f1f5f9", borderRadius: 14,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    paddingHorizontal: 12, height: 44, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0f172a" },
  filterBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "#f1f5f9", borderWidth: 1.5, borderColor: "#e2e8f0",
    alignItems: "center", justifyContent: "center",
  },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 11,
  },
  tabBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: "700", color: "#94a3b8" },
  tabTextActive: { color: "#7c3aed" },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5,
  },
  pillActive: { backgroundColor: "#7c3aed", borderColor: "#7c3aed" },
  pillInactive: { backgroundColor: "#f1f5f9", borderColor: "#e2e8f0" },
  pillText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  pillSep: { width: 1, backgroundColor: "#e2e8f0", marginHorizontal: 4 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#f1f5f9",
    alignItems: "center", justifyContent: "center",
  },
  errorText: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, backgroundColor: "#7c3aed" },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  resultsMeta: { paddingVertical: 12 },
  resultsCount: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  emptyState: { paddingTop: 60, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  emptySubtext: { fontSize: 13, fontWeight: "500", color: "#94a3b8" },

  // Provider card
  card: {
    backgroundColor: "#fff", borderRadius: 22,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, marginBottom: 14, gap: 10,
    shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 52, height: 52, borderRadius: 16,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "800" },
  verifiedBadge: {
    position: "absolute", bottom: -3, right: -3,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 2,
  },
  userMeta: { flex: 1 },
  userName: { fontSize: 15, fontWeight: "900", color: "#0f172a", marginBottom: 2 },
  userTitle: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  statsRow: { flexDirection: "row", gap: 12 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 11, fontWeight: "700", color: "#475569" },
  scoreBadge: {
    paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 12, alignItems: "center", minWidth: 40,
  },
  scoreText: { fontSize: 16, fontWeight: "900", lineHeight: 18 },
  scoreLabel: { fontSize: 8, fontWeight: "800", textTransform: "uppercase" },
  description: { fontSize: 13, fontWeight: "500", color: "#64748b", lineHeight: 18 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  skillChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  skillText: { fontSize: 10, fontWeight: "700" },
  cardActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  btnOutline: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 42, borderRadius: 12,
    borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  btnOutlineText: { fontSize: 12, fontWeight: "800", color: "#475569" },
  btnPrimary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 42, borderRadius: 12,
  },
  btnPrimaryText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  // Requirement card
  reqCard: {
    backgroundColor: "#fff", borderRadius: 22,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    padding: 16, marginBottom: 14, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  reqHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  reqTitle: { flex: 1, fontSize: 15, fontWeight: "900", color: "#0f172a", lineHeight: 20 },
  urgencyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  urgencyText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  catRow: { flexDirection: "row" },
  catPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, backgroundColor: "#7c3aed12",
  },
  catText: { fontSize: 11, fontWeight: "700", color: "#7c3aed" },
  reqDesc: { fontSize: 13, color: "#64748b", lineHeight: 18 },
  reqFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  budgetBox: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, backgroundColor: "#7c3aed10",
  },
  budgetText: { fontSize: 14, fontWeight: "900", color: "#7c3aed" },
  reqMeta: { flexDirection: "row", gap: 12 },
});