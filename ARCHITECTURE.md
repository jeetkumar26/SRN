# SRN — Skill Requirement Network
## Architecture & Deliverables Document

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    React Native CLI App                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │AuthContext│  │RoleNavigator │  │  TanStack Query  │  │
│  │(Firebase) │  │(Bottom Tabs) │  │  + API Client    │  │
│  └──────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │  REST + Firebase SDK
         ┌────────────┴────────────┐
         │                         │
┌────────▼──────┐        ┌─────────▼────────┐
│  Express API  │        │   Firebase Suite  │
│  (Node/TS)    │        │  Auth / Firestore │
│  Fastify+Zod  │        │  Storage / FCM   │
└───────────────┘        └──────────────────┘
```

---

## 2. Role Matrix

| Role | Value | Features |
|------|-------|----------|
| Business / Startup | `business` | Post requirements, hire talent, manage proposals, business analytics |
| Personal / Customer | `customer` | Post gigs, find local services, bookings, chat |
| Digital Skill Provider | `digital` | Browse requirements, submit bids, portfolio, earnings |
| Local Service Provider | `local` | Accept service requests, manage availability & radius, bookings |
| Administrator | `admin` | User management, content moderation, platform analytics |

### Permission Matrix

| Action | business | customer | digital | local | admin |
|--------|----------|----------|---------|-------|-------|
| Read Users | ✅ | ✅ | ✅ | ✅ | ✅ |
| Post Requirement | ✅ | ✅ | ❌ | ❌ | ✅ |
| Submit Quote/Bid | ❌ | ❌ | ✅ | ✅ | ✅ |
| Accept Quote | ✅ | ✅ | ❌ | ❌ | ✅ |
| Create Booking | ✅ | ✅ | ❌ | ❌ | ✅ |
| Manage Bookings | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add Portfolio | ❌ | ❌ | ✅ | ✅ | ✅ |
| View Admin Dashboard | ❌ | ❌ | ❌ | ❌ | ✅ |
| Moderate Content | ❌ | ❌ | ❌ | ❌ | ✅ |
| Delete Any User | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 3. Firestore Schema

### `users/{uid}`
```json
{
  "uid": "string",
  "name": "string",
  "email": "string",
  "role": "business | customer | digital | local | admin",
  "createdAt": "Timestamp",
  "companyName": "string?",
  "industry": "string?",
  "title": "string?",
  "skills": ["string"],
  "rating": 5.0,
  "reviewsCount": 0,
  "hourlyRate": 15,
  "serviceRadiusKm": 15,
  "isAvailable": true,
  "privileges": ["all"]
}
```

### `requirements/{id}`
```json
{
  "id": "string",
  "creatorId": "string (uid)",
  "title": "string",
  "category": "string",
  "description": "string",
  "skillsNeeded": "string?",
  "minBudget": 100,
  "maxBudget": 500,
  "status": "open | closed | in_progress",
  "createdAt": "number (ms)"
}
```

### `quotes/{id}`
```json
{
  "id": "string",
  "requirementId": "string",
  "senderId": "string (provider uid)",
  "receiverId": "string (business/customer uid)",
  "amount": 850,
  "durationDays": 4,
  "status": "pending | accepted | rejected",
  "createdAt": "number (ms)"
}
```

### `conversations/{convId}`
```json
{
  "participantIds": ["uid1", "uid2"],
  "participantNames": { "uid1": "Alice", "uid2": "Bob" },
  "lastMessage": "string",
  "lastMessageAt": "number (ms)",
  "unreadCount": 0
}
```

### `conversations/{convId}/messages/{msgId}`
```json
{
  "senderId": "string (uid)",
  "text": "string",
  "createdAt": "number (ms)",
  "read": false
}
```

### `bookings/{id}`
```json
{
  "requirementId": "string",
  "requirementTitle": "string",
  "customerId": "string",
  "providerId": "string",
  "providerName": "string",
  "customerName": "string",
  "amount": 850,
  "status": "pending | confirmed | in_progress | completed | cancelled",
  "category": "string",
  "createdAt": "number (ms)"
}
```

### `portfolios/{id}`
```json
{
  "userId": "string",
  "title": "string",
  "description": "string",
  "url": "string?",
  "techStack": ["string"],
  "createdAt": "number (ms)"
}
```

### `notifications/{id}`
```json
{
  "userId": "string",
  "type": "quote | message | requirement | system",
  "title": "string",
  "body": "string",
  "read": false,
  "createdAt": "number (ms)",
  "data": {}
}
```

### `reviews/{id}`
```json
{
  "providerId": "string",
  "reviewerId": "string",
  "bookingId": "string",
  "rating": 5,
  "comment": "string",
  "createdAt": "number (ms)"
}
```

---

## 4. Navigation Map

```
AppNavigator (Stack)
├── [Unauthenticated]
│   ├── SplashScreen
│   └── LoginScreen
├── [Auth, no role] → OnboardingScreen
└── [Auth + role]
    ├── business → BusinessNavigator (Bottom Tabs)
    │   ├── Dashboard → BusinessDashboard
    │   ├── Post → PostRequirementScreen
    │   ├── Search → SearchScreen
    │   ├── Messages → ChatListScreen
    │   └── Profile → ProfileScreen
    ├── customer → CustomerNavigator (Bottom Tabs)
    │   ├── Home → CustomerDashboard
    │   ├── Discover → SearchScreen
    │   ├── Bookings → BookingsScreen
    │   ├── Notifications → NotificationsScreen
    │   └── Profile → ProfileScreen
    ├── digital → DigitalProviderNavigator (Bottom Tabs)
    │   ├── Gigs → DigitalProviderDashboard
    │   ├── Earnings → EarningsScreen
    │   ├── Portfolio → PortfolioScreen
    │   ├── Messages → ChatListScreen
    │   └── Profile → ProfileScreen
    ├── local → LocalProviderNavigator (Bottom Tabs)
    │   ├── Requests → LocalProviderDashboard
    │   ├── Bookings → BookingsScreen
    │   ├── Messages → ChatListScreen
    │   ├── Notifications → NotificationsScreen
    │   └── Profile → ProfileScreen
    └── admin → AdminNavigator (Bottom Tabs)
        ├── Analytics → AdminDashboard
        ├── Users → UsersScreen
        ├── Alerts → NotificationsScreen
        └── Profile → ProfileScreen

Shared Modal Screens (accessible from all role navigators):
├── Chat (conversationId, recipientId, recipientName)
├── Search (query?)
├── ProviderProfile (userId)
├── PostRequirement
└── Notifications
```

---

## 5. API Architecture

Base URL: configured via `src/config/env.ts` (no hardcoded IPs)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/healthz` | GET | None | Health check |
| `/api/users` | GET | Bearer | Search/list users |
| `/api/users` | POST | Bearer | Register user profile |
| `/api/users/:id` | GET | Bearer | Get user details |
| `/api/requirements` | GET | Bearer | List open requirements |
| `/api/requirements` | POST | Bearer (business/customer) | Create requirement |
| `/api/quotes` | POST | Bearer (provider) | Submit bid |
| `/api/quotes/:id` | PATCH | Bearer (receiver) | Accept/reject bid |
| `/api/messages` | GET | Bearer | Get chat history |
| `/api/messages` | POST | Bearer | Send message |
| `/api/admin/dashboard` | GET | Bearer (admin) | Admin analytics |

**API Client**: Generated via Orval from OpenAPI spec at `lib/api-spec/openapi.yaml`
**Query Layer**: TanStack Query v5 with centralized `QueryClient` in `App.tsx`
**Auth Token**: Firebase ID token injected via `setAuthTokenGetter` in `App.tsx`

---

## 6. Environment Setup

### `.env` (root)
```
NODE_ENV=development
PORT=3000
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=../../firebase-service-account.json
```

### `src/config/env.ts`
- `development` → `http://10.0.2.2:3000` (Android) / `http://localhost:3000` (iOS)
- `staging` → `https://api-staging.srn.digitalnextworld.com`
- `production` → `https://api.srn.digitalnextworld.com`

Switch environment by setting `NODE_ENV` before bundling.

---

## 7. Android Build Guide

### Prerequisites
- Android Studio with SDK 34
- JDK 17
- `local.properties` with `sdk.dir=/path/to/android/sdk`

### Steps
```bash
# 1. Install dependencies
pnpm install

# 2. Start Metro bundler
pnpm dev

# 3. Run on connected device / emulator
pnpm android
```

### Release APK
```bash
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

---

## 8. iOS Build Guide

### Prerequisites
- macOS with Xcode 15+
- CocoaPods

### Steps
```bash
# 1. Install dependencies
pnpm install
cd ios && pod install && cd ..

# 2. Run on simulator
pnpm ios

# 3. Archive for distribution via Xcode → Product → Archive
```

---

## 9. Firebase Security Summary

- Rules file: `firestore.rules`
- Indexes file: `firestore.indexes.json`
- Deploy: `firebase deploy --only firestore:rules,firestore:indexes`

Key enforcement:
- Users can only write their own profile document
- Providers cannot post requirements
- Business/customer cannot submit bids
- Conversations are private to participants
- Messages immutable except for `read` flag
- Notifications writable only by admin SDK (backend)
- Admin analytics collection is read-only from client

---

## 10. Migration Report (Audit Closure)

| Issue | Status | Resolution |
|-------|--------|------------|
| Expo `EXPO_PUBLIC_` env vars | ✅ Fixed | Replaced with `src/config/env.ts` |
| Duplicate `.js` + `.tsx` files in `src/` | ✅ Fixed | All 18 `.js` duplicates deleted |
| `App.js` + `App.tsx` duplicate | ✅ Fixed | `App.js` deleted |
| Role naming: frontend `"personal"` ≠ backend `"customer"` | ✅ Fixed | `OnboardingScreen` now uses `"customer"` |
| `BusinessDashboard` direct `fetch()` with hardcoded IP | ✅ Fixed | Uses Firestore for quotes, API client for requirements |
| `ChatScreen` mock static data | ✅ Fixed | Real-time Firebase Firestore sub-collection |
| `SearchScreen` mock static data | ✅ Fixed | `useListUsers` API client hook |
| `ProviderProfileScreen` mock static data | ✅ Fixed | `useGetUserDetails` API client hook |
| Session loaded from `AsyncStorage` in every dashboard | ✅ Fixed | Central `AuthContext` with `useAuth()` hook |
| No auth context | ✅ Fixed | `src/contexts/AuthContext.tsx` |
| No role-based navigation | ✅ Fixed | 5 role-specific `BottomTabNavigator` instances |
| No tab navigation | ✅ Fixed | All 5 roles have bottom tab bars |
| Missing screens | ✅ Fixed | Added: ProfileScreen, NotificationsScreen, ChatListScreen, BookingsScreen, EarningsScreen, PortfolioScreen, UsersScreen |
| No Firebase security rules | ✅ Fixed | `firestore.rules` with full RBAC |
| No Firestore indexes | ✅ Fixed | `firestore.indexes.json` with 17 composite indexes |
| `tsconfig.json` missing `noEmit` | ✅ Fixed | Added `noEmit: true` |
| `SafeAreaView` from deprecated `react-native` | ✅ Fixed | Using `react-native-safe-area-context` throughout |
