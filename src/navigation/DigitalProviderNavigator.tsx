import React from "react";
import { View, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Feather from "react-native-vector-icons/Feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";

import DigitalProviderDashboard from "../screens/dashboards/DigitalProviderDashboard";
import EarningsScreen from "../screens/digital/EarningsScreen";
import PortfolioScreen from "../screens/digital/PortfolioScreen";
import ChatListScreen from "../screens/shared/ChatListScreen";
import ProfileScreen from "../screens/shared/ProfileScreen";

export type DigitalTabParamList = {
  Dashboard: undefined;
  Earnings: undefined;
  Portfolio: undefined;
  Messages: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<DigitalTabParamList>();
const ROLE_COLOR = "#0d9488";

function GlassTabBar() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["rgba(255,255,255,0.0)", "rgba(255,255,255,0.96)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glassBorder} />
    </View>
  );
}

export default function DigitalProviderNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: ROLE_COLOR,
        tabBarInactiveTintColor: "#94a3b8",
        tabBarBackground: () => <GlassTabBar />,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "rgba(255,255,255,0.88)",
          borderTopWidth: 0,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          elevation: 0,
          shadowColor: "#0d9488",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.07,
          shadowRadius: 20,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, string> = {
            Dashboard: "home",
            Earnings: "dollar-sign",
            Portfolio: "grid",
            Messages: "message-square",
            Profile: "user",
          };
          return (
            <View style={styles.iconWrap}>
              {focused && (
                <View style={[styles.activeBar, { backgroundColor: ROLE_COLOR }]} />
              )}
              <Feather name={icons[route.name] ?? "circle"} size={size} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DigitalProviderDashboard} options={{ title: "Gigs" }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
      <Tab.Screen name="Messages" component={ChatListScreen} options={{ title: "Messages" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  glassBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(226,232,240,0.7)",
  },
  iconWrap: {
    alignItems: "center",
    gap: 3,
  },
  activeBar: {
    position: "absolute",
    top: -8,
    width: 20,
    height: 3,
    borderRadius: 2,
  },
});
