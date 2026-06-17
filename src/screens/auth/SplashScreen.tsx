import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Dimensions,
  StatusBar,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import Feather from "react-native-vector-icons/Feather";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../../navigation/AppNavigator";

const { width } = Dimensions.get("window");

type NavigationProp = StackNavigationProp<RootStackParamList, "Splash">;

interface Props {
  navigation: NavigationProp;
}

export default function SplashScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Background orbs */}
      <LinearGradient
        colors={["rgba(124,58,237,0.10)", "transparent"]}
        style={styles.orbTopRight}
      />
      <LinearGradient
        colors={["rgba(20,184,166,0.08)", "transparent"]}
        style={styles.orbBottomLeft}
      />
      <LinearGradient
        colors={["rgba(37,99,235,0.06)", "transparent"]}
        style={styles.orbMid}
      />

      {/* Center content */}
      <View style={styles.center}>
        {/* Logo card */}
        <View style={styles.logoWrap}>
          <LinearGradient
            colors={["#7c3aed", "#0d9488"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoCard}
          >
            <Feather name="zap" size={46} color="#ffffff" />
          </LinearGradient>
        </View>

        <Text style={styles.appName}>
          SRN<Text style={{ color: "#7c3aed" }}>.</Text>
        </Text>
        <Text style={styles.subtitle}>Skill Requirement Network</Text>
        <Text style={styles.tagline}>Where Skills Meet Requirements</Text>
        <Text style={styles.desc}>
          India's multi-role marketplace connecting{"\n"}businesses, customers &amp; skilled providers.
        </Text>

        {/* Dots */}
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>

      {/* Bottom CTA */}
      <View style={styles.bottom}>
        <Pressable
          onPress={() => navigation.navigate("Login")}
          style={({ pressed }) => [
            styles.primaryBtn,
            { opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
        >
          <LinearGradient
            colors={["#7c3aed", "#6d28d9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtnGrad}
          >
            <Feather name="zap" size={17} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryBtnText}>Get Started</Text>
            <Feather name="arrow-right" size={17} color="rgba(255,255,255,0.7)" style={{ marginLeft: 8 }} />
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("Login")}
          style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.secondaryBtnText}>
            Already have an account?{" "}
            <Text style={{ color: "#7c3aed", fontWeight: "700" }}>Sign In</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 52,
    paddingHorizontal: 24,
  },
  orbTopRight: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  orbBottomLeft: {
    position: "absolute",
    bottom: -60,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  orbMid: {
    position: "absolute",
    top: "40%",
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
    marginBottom: 30,
  },
  logoCard: {
    width: 108,
    height: 108,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 52,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -1.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    fontWeight: "600",
    color: "#7c3aed",
    marginBottom: 16,
  },
  desc: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    marginTop: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e2e8f0",
  },
  dotActive: {
    width: 24,
    backgroundColor: "#7c3aed",
  },
  bottom: {
    width: "100%",
    gap: 14,
  },
  primaryBtn: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 18,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
});
