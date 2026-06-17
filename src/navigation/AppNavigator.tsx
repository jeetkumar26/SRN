import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import { useAuth } from "../contexts/AuthContext";

// Auth screens
import SplashScreen from "../screens/auth/SplashScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import OnboardingScreen from "../screens/auth/OnboardingScreen";

// Role navigators (tab-based, each fully isolated)
import BusinessNavigator from "./BusinessNavigator";
import CustomerNavigator from "./CustomerNavigator";
import DigitalProviderNavigator from "./DigitalProviderNavigator";
import LocalProviderNavigator from "./LocalProviderNavigator";
import AdminNavigator from "./AdminNavigator";

// Shared modal screens reachable from any role navigator
import ChatScreen from "../screens/shared/ChatScreen";
import SearchScreen from "../screens/shared/SearchScreen";
import ProviderProfileScreen from "../screens/shared/ProviderProfileScreen";
import PostRequirementScreen from "../screens/shared/PostRequirementScreen";
import NotificationsScreen from "../screens/shared/NotificationsScreen";
import RequirementDetailScreen from "../screens/shared/RequirementDetailScreen";
import BidSubmitScreen from "../screens/shared/BidSubmitScreen";
import QuoteDetailScreen from "../screens/shared/QuoteDetailScreen";
import BookingDetailScreen from "../screens/shared/BookingDetailScreen";
import ReviewScreen from "../screens/shared/ReviewScreen";
import SubscriptionScreen from "../screens/shared/SubscriptionScreen";
import SettingsScreen from "../screens/shared/SettingsScreen";
import AvailabilityScreen from "../screens/shared/AvailabilityScreen";
import AnalyticsScreen from "../screens/shared/AnalyticsScreen";
import DisputeScreen from "../screens/shared/DisputeScreen";
import ReferralsScreen from "../screens/shared/ReferralsScreen";
import PhoneVerificationScreen from "../screens/shared/PhoneVerificationScreen";
import DisputesManagementScreen from "../screens/admin/DisputesManagementScreen";
import VerificationQueueScreen from "../screens/admin/VerificationQueueScreen";

export type RootStackParamList = {
  // Auth
  Splash: undefined;
  Login: undefined;
  Onboarding: undefined;
  // Role homes (root of each tab navigator)
  BusinessHome: undefined;
  CustomerHome: undefined;
  DigitalHome: undefined;
  LocalHome: undefined;
  AdminHome: undefined;
  // Shared modals
  Chat: { conversationId: string; recipientId: string; recipientName: string };
  Search: { query?: string };
  ProviderProfile: { userId: string };
  PostRequirement: undefined;
  Notifications: undefined;
  // Detail screens
  RequirementDetail: { requirementId: string };
  BidSubmit: { requirementId: string; requirementTitle: string; receiverId: string; maxBudget: number };
  QuoteDetail: { quoteId: string; requirementId: string; requirementTitle: string; senderName: string; amount: number; durationDays: number; message?: string; status: string; createdAt?: string };
  BookingDetail: { bookingId: string };
  Review: { bookingId: string; providerName: string };
  Subscription: undefined;
  Settings: undefined;
  Availability: undefined;
  Analytics: undefined;
  Dispute: { bookingId: string; providerName: string; amount: number };
  Referrals: undefined;
  PhoneVerification: undefined;
  AdminDisputes: undefined;
  AdminVerification: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { firebaseUser, role, initializing, loadingProfile } = useAuth();

  if (initializing || loadingProfile) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!firebaseUser ? (
          // ── Not authenticated ──────────────────────────────────────
          <>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
          </>
        ) : !role ? (
          // ── Authenticated but no role yet → onboarding ────────────
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          // ── Authenticated with role → role-specific home + modals ─
          <>
            {role === "business" && (
              <Stack.Screen name="BusinessHome" component={BusinessNavigator} />
            )}
            {role === "customer" && (
              <Stack.Screen name="CustomerHome" component={CustomerNavigator} />
            )}
            {role === "digital" && (
              <Stack.Screen name="DigitalHome" component={DigitalProviderNavigator} />
            )}
            {role === "local" && (
              <Stack.Screen name="LocalHome" component={LocalProviderNavigator} />
            )}
            {role === "admin" && (
              <Stack.Screen name="AdminHome" component={AdminNavigator} />
            )}

            {/* Shared modal screens reachable from any role */}
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ presentation: "card" }}
            />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen
              name="ProviderProfile"
              component={ProviderProfileScreen}
            />
            <Stack.Screen
              name="PostRequirement"
              component={PostRequirementScreen}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
            />
            <Stack.Screen
              name="RequirementDetail"
              component={RequirementDetailScreen}
            />
            <Stack.Screen
              name="BidSubmit"
              component={BidSubmitScreen}
            />
            <Stack.Screen
              name="QuoteDetail"
              component={QuoteDetailScreen}
            />
            <Stack.Screen
              name="BookingDetail"
              component={BookingDetailScreen}
            />
            <Stack.Screen
              name="Review"
              component={ReviewScreen}
            />
            <Stack.Screen
              name="Subscription"
              component={SubscriptionScreen}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
            />
            <Stack.Screen
              name="Availability"
              component={AvailabilityScreen}
            />
            <Stack.Screen
              name="Analytics"
              component={AnalyticsScreen}
            />
            <Stack.Screen
              name="Dispute"
              component={DisputeScreen}
            />
            <Stack.Screen
              name="Referrals"
              component={ReferralsScreen}
            />
            <Stack.Screen
              name="PhoneVerification"
              component={PhoneVerificationScreen}
            />
            <Stack.Screen
              name="AdminDisputes"
              component={DisputesManagementScreen}
            />
            <Stack.Screen
              name="AdminVerification"
              component={VerificationQueueScreen}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
});
