import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";
import messaging from "@react-native-firebase/messaging";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { getUserDetails, customFetch } from "@workspace/api-client-react";
import type { UserProfile, UserRole } from "../types/roles";
import { DEV_BYPASS_AUTH } from "../config/env";

interface AuthState {
  firebaseUser: FirebaseAuthTypes.User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  initializing: boolean;
  loadingProfile: boolean;
}

interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  bypassLogin: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] =
    useState<FirebaseAuthTypes.User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const registerFcmToken = useCallback(async (uid: string) => {
    try {
      const status = await messaging().requestPermission();
      const granted =
        status === messaging.AuthorizationStatus.AUTHORIZED ||
        status === messaging.AuthorizationStatus.PROVISIONAL;
      if (!granted) return;

      const token = await messaging().getToken();
      await customFetch(`/api/users/${uid}/fcm-token`, {
        method: "PATCH",
        body: JSON.stringify({ fcmToken: token }),
      });
    } catch {
      // Non-blocking — push is a nice-to-have; never crash auth flow
    }
  }, []);

  const loadProfile = useCallback(
    async (user: FirebaseAuthTypes.User | null) => {
      if (!user) {
        setProfile(null);
        setRole(null);
        return;
      }

      setLoadingProfile(true);
      try {
        const apiUser = await getUserDetails(user.uid);
        const rawSkills = apiUser.skills;
        const skills = rawSkills
          ? rawSkills.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined;
        const extUser = apiUser as typeof apiUser & {
          serviceRadiusKm?: number;
          isAvailable?: boolean;
          postedRequirementsCount?: number;
          hourlyRate?: number;
          phone?: string;
          bio?: string;
          privileges?: string[];
        };
        const data: UserProfile = {
          uid: apiUser.id,
          name: apiUser.name ?? "",
          email: apiUser.email ?? "",
          role: apiUser.role as UserRole,
          createdAt: apiUser.createdAt ? new Date(apiUser.createdAt).getTime() : Date.now(),
          title: apiUser.title ?? undefined,
          skills,
          rating: apiUser.rating ?? undefined,
          reviewsCount: apiUser.reviewsCount ?? undefined,
          completedGigs: apiUser.completedGigs ?? undefined,
          onTimeRate: apiUser.onTimeRate ?? undefined,
          serviceRadiusKm: extUser.serviceRadiusKm ?? undefined,
          isAvailable: extUser.isAvailable ?? undefined,
          hourlyRate: extUser.hourlyRate ?? undefined,
          phone: extUser.phone ?? undefined,
          bio: extUser.bio ?? undefined,
          privileges: extUser.privileges ?? undefined,
          postedRequirementsCount: extUser.postedRequirementsCount ?? undefined,
        };
        setProfile(data);
        setRole(data.role ?? null);

        // Register FCM token now that we have a confirmed, roled user
        if (data.role) {
          registerFcmToken(user.uid);
        }

        await AsyncStorage.multiSet([
          ["userId", user.uid],
          ["userRole", data.role],
          ["userName", data.name ?? ""],
          ["userEmail", user.email ?? ""],
        ]);
      } catch (err: any) {
        if (err?.status !== 404) {
          console.error("[AuthContext] loadProfile error:", err);
        }
        // 404 = new user, not yet onboarded — show OnboardingScreen
        setProfile(null);
        setRole(null);
      } finally {
        setLoadingProfile(false);
      }
    },
    [registerFcmToken]
  );

  useEffect(() => {
    if (DEV_BYPASS_AUTH) {
      setInitializing(false);
      return;
    }
    const unsubAuth = auth().onAuthStateChanged(async (user) => {
      setFirebaseUser(user);
      await loadProfile(user);
      setInitializing(false);
    });

    // Re-register whenever FCM rotates the token (runs while any user is signed in)
    const unsubToken = messaging().onTokenRefresh((token: string) => {
      auth().currentUser?.uid &&
        customFetch(`/api/users/${auth().currentUser!.uid}/fcm-token`, {
          method: "PATCH",
          body: JSON.stringify({ fcmToken: token }),
        }).catch(() => {});
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, [loadProfile, registerFcmToken]);

  const bypassLogin = useCallback((selectedRole: UserRole) => {
    const mockUser = {
      uid: `dev-${selectedRole}`,
      email: `dev-${selectedRole}@test.com`,
      displayName: `Dev ${selectedRole}`,
    } as unknown as FirebaseAuthTypes.User;

    const mockProfile: UserProfile = {
      uid: `dev-${selectedRole}`,
      name: `Dev ${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}`,
      email: `dev-${selectedRole}@test.com`,
      role: selectedRole,
      createdAt: Date.now(),
    };

    setFirebaseUser(mockUser);
    setProfile(mockProfile);
    setRole(selectedRole);
  }, []);

  const signOut = useCallback(async () => {
    if (DEV_BYPASS_AUTH) {
      setFirebaseUser(null);
      setProfile(null);
      setRole(null);
      return;
    }
    await auth().signOut();
    // Sign out from Google too if the user signed in via Google
    if (GoogleSignin.hasPreviousSignIn()) {
      await GoogleSignin.signOut().catch(() => {});
    }
    await AsyncStorage.clear();
    setProfile(null);
    setRole(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (firebaseUser && !DEV_BYPASS_AUTH) {
      await loadProfile(firebaseUser);
    }
  }, [firebaseUser, loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        role,
        initializing,
        loadingProfile,
        signOut,
        refreshProfile,
        bypassLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
