# Firebase Setup Guide — SRN Mobile

Complete setup steps required before the app can run.
**Do these steps in order** — each step depends on the previous.

---

## STEP 1: Rotate the Service Account Key (SECURITY FIRST)

The existing `firebase-service-account.json` in this project folder must be
replaced immediately because it may have been exposed.

1. Open [Firebase Console](https://console.firebase.google.com)
2. Select project **skill-requirement-network**
3. Click the gear icon → **Project Settings** → **Service accounts**
4. Click **Generate new private key** → Confirm
5. Save the downloaded file to a location **outside the project** (e.g. `C:\Users\TUSHAR\secrets\srn-service-account.json`)
6. Update your `.env` file:
   ```
   FIREBASE_SERVICE_ACCOUNT_KEY_PATH=C:\Users\TUSHAR\secrets\srn-service-account.json
   ```
7. Delete the old key file from the project folder if it still exists

---

## STEP 2: Get google-services.json for Android

1. In Firebase Console → Project Settings → **Your apps**
2. Look for an Android app with package name `com.srn.mobile`
3. If it doesn't exist, click **Add app** → Android:
   - Package name: `com.srn.mobile`
   - App nickname: `SRN Mobile`
   - Debug signing cert: leave blank for now
4. Click **Download google-services.json**
5. Place the file at: `android/app/google-services.json`
6. Delete `android/app/google-services-PLACEHOLDER.json`

> Without this file, Firebase Auth and Firestore will NOT work on Android.

---

## STEP 3: Enable Firebase Authentication

1. Firebase Console → **Authentication** → **Sign-in method**
2. Enable **Email/Password** provider → Save
3. (Optional for production): Enable **Google** sign-in

---

## STEP 4: Enable Firestore Database

1. Firebase Console → **Firestore Database** → **Create database**
2. Choose **Start in production mode**
3. Select a region close to your users (e.g., `asia-south1` for India)
4. Click **Enable**

---

## STEP 5: Deploy Security Rules and Indexes

Install the Firebase CLI first (only needed once):
```bash
npm install -g firebase-tools
firebase login
```

From the project root, deploy rules and indexes:
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Expected output:
```
✔  firestore:  Rules file firestore.rules compiled successfully
✔  firestore:  Uploaded Cloud Firestore Security Rules
✔  firestore:  Deployed indexes in firestore.indexes.json
✔  Deploy complete!
```

> **CRITICAL**: Until rules are deployed, Firestore has no access control —
> any authenticated user can read or write any data.

---

## STEP 6: Firestore Collection Structure

The app uses these collections (created automatically when first written to):

| Collection | Written by | Purpose |
|-----------|-----------|---------|
| `users` | Client (Onboarding) | User profiles, roles, ratings |
| `requirements` | Backend API | Job requirements / gigs |
| `quotes` | Backend API | Provider bids/proposals |
| `conversations` | Backend API | Chat conversation metadata |
| `conversations/{id}/messages` | Backend API | Individual chat messages |
| `messages` | Backend API | Flat messages for admin moderation |
| `bookings` | Backend API | Service bookings after quote accepted |
| `portfolios` | Client | Provider portfolio items |
| `notifications` | Client | User notifications |
| `reviews` | Client | Provider reviews |

---

## STEP 7: Create the First Admin Account

Since admin accounts cannot be self-registered (by design):

1. Register normally through the app (choose any role temporarily)
2. Firebase Console → **Firestore Database** → **users** collection
3. Find the document for your user (by UID or email)
4. Click the document → Edit field `role` → change value to `"admin"`
5. Sign out of the app and sign back in — the admin dashboard will appear

---

## STEP 8: Test Firebase Connection

Start the backend server:
```bash
cd artifacts/api-server
pnpm install
pnpm dev
```

Verify it connects to Firebase:
```
[INFO] Firebase Admin SDK initialized successfully
[INFO] Server listening on port 3000
```

Test the health endpoint:
```bash
curl http://localhost:3000/api/healthz
# Expected: {"status":"ok"}
```

---

## STEP 9: Android Build — Pre-Checklist

Before running `pnpm android`:

- [ ] `android/app/google-services.json` exists (not the placeholder)
- [ ] `pnpm install` has been run (to install `babel-plugin-module-resolver`, `express-rate-limit`)
- [ ] Android SDK 34 installed via Android Studio
- [ ] A device or emulator is running (check `adb devices`)
- [ ] Backend server is running on port 3000

Build command:
```bash
pnpm android
```

---

## STEP 10: Verify the Full Flow

After the app launches on device:

1. **Splash → Login**: see the SRN splash screen, tap "Get Started"
2. **Register**: enter email + password (min 8 chars, 1 uppercase, 1 number)
3. **Onboarding**: choose a role (Business, Customer, Digital, or Local)
4. **Dashboard**: role-specific dashboard loads with bottom tabs
5. **Post Requirement** (Business/Customer): fill form, tap Post
6. **Browse Requirements** (Digital/Local): should see posted requirements
7. **Search**: search for providers
8. **Chat**: tap chat icon → send a message → verify it appears

---

## Firebase Collections Seed Data (Optional for Testing)

If you want to populate test data manually:

**Test User Document** (create in `users` collection):
```json
{
  "uid": "test123",
  "name": "Test Business",
  "email": "test@business.com",
  "role": "business",
  "createdAt": 1748947200000,
  "companyName": "Acme Corp",
  "industry": "Technology",
  "postedRequirementsCount": 0,
  "aiTrustScore": 85,
  "isVerified": false,
  "isPremium": false
}
```

**Test Requirement** (create in `requirements` collection):
```json
{
  "id": "req001",
  "creatorId": "test123",
  "title": "Build a React Native App",
  "category": "Mobile App",
  "description": "Need a skilled React Native developer for a 2-month project.",
  "minBudget": 5000,
  "maxBudget": 15000,
  "status": "open",
  "createdAt": 1748947200000
}
```
