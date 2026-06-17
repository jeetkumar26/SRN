# SRN — Product Requirements Document (PRD)
## Skill Requirement Network — Complete Feature Specification

**Product:** SRN Mobile Application  
**Platform:** Android (iOS-ready)  
**Version:** 1.0.0  
**Package:** com.onelayer.in  
**Document Date:** 2026-06-18  

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Profiles & Roles](#2-user-profiles--roles)
3. [Authentication & Onboarding](#3-authentication--onboarding)
4. [Customer Profile — All Features](#4-customer-profile--all-features)
5. [Business Profile — All Features](#5-business-profile--all-features)
6. [Digital Provider Profile — All Features](#6-digital-provider-profile--all-features)
7. [Local Provider Profile — All Features](#7-local-provider-profile--all-features)
8. [Admin Profile — All Features](#8-admin-profile--all-features)
9. [Shared Features — All Profiles](#9-shared-features--all-profiles)
10. [Backend & Platform Features](#10-backend--platform-features)
11. [Subscription Plans](#11-subscription-plans)
12. [Notification System](#12-notification-system)
13. [Security & Compliance Features](#13-security--compliance-features)
14. [Feature Matrix — Profile vs Feature](#14-feature-matrix--profile-vs-feature)

---

## 1. Product Overview

SRN (Skill Requirement Network) is a marketplace mobile application that connects **customers and businesses** who need services with **skilled providers** (digital and local) who deliver them. The platform handles the full lifecycle — from posting a requirement, through bidding and booking, to completion, review, and payment — with a complete admin layer for platform governance.

### Core Value Propositions

| For Customers & Businesses | For Providers | For Admins |
|---------------------------|---------------|------------|
| Post requirements and receive multiple competitive bids | Browse and bid on live requirements | Full platform visibility |
| Verified, scored providers only | Earn money per project | User moderation tools |
| Escrow-protected payments | Build a public portfolio | KYC verification queue |
| Real-time chat with providers | Analytics on performance | Dispute resolution center |
| Dispute protection for 7 days post-completion | Subscription tiers for more bids | Fraud detection feed |

---

## 2. User Profiles & Roles

| Role | Description | App Theme Color |
|------|-------------|----------------|
| **Customer** | Individual consumers who post requirements for personal services | Blue `#2563eb` |
| **Business** | Companies/organizations posting requirements at scale | Purple `#7c3aed` |
| **Digital Provider** | Freelancers offering remote/digital services (design, dev, writing, etc.) | Teal `#0d9488` |
| **Local Provider** | On-site service providers (plumbers, electricians, tutors, etc.) | Orange `#ea580c` |
| **Admin** | Platform operators who govern, moderate, and monitor the entire system | Red `#dc2626` |

Each role gets its own isolated bottom-tab navigator with role-specific screens, colors, and permissions.

---

## 3. Authentication & Onboarding

### 3.1 Splash Screen
- Animated brand splash displayed on cold app start
- Auto-transitions to Login or role home based on session state
- No user interaction required

### 3.2 Login Screen
- **Google Sign-In** — one-tap via Firebase Auth SDK + Google OAuth
- **Apple Sign-In** — one-tap via Firebase Auth (iOS-ready)
- **Email & Password** — standard Firebase email/password auth
- **Forgot Password** — triggers Firebase `sendPasswordResetEmail`
- Duplicate account detection: if email already exists under a different provider, accounts are linked instead of creating a duplicate
- Error states shown inline (wrong password, network error, etc.)

### 3.3 Onboarding Screen (Role Selection)
- Shown only once after first sign-in when no role is assigned
- User selects their role: Customer / Business / Digital Provider / Local Provider
- Role is written to Firestore `users/{uid}.role`
- After selection, user is routed to their role-specific home

### 3.4 Session Management
- Firebase ID token stored and refreshed automatically
- Auto-logout when token is revoked
- POST `/api/auth/logout` — revokes FCM token + updates `lastActiveAt`
- POST `/api/auth/deactivate` — soft-deactivates own account

---

## 4. Customer Profile — All Features

**Theme:** Blue `#2563eb`  
**Bottom Tabs:** Home · Discover · Bookings · Notifications · Profile

---

### 4.1 Customer Dashboard (Home)

**My Requirements Section**
- Lists all requirements posted by the customer
- Each card shows: title, status dot (color-coded), budget, category, creation date
- Shows quote count ("X bids received") per requirement
- Tap any requirement → RequirementDetail screen
- Pull-to-refresh to reload

**Quick Actions**
- "Post New Requirement" prominent CTA
- Navigate to Search to discover providers

**Live Stats**
- Active requirements count
- Pending bookings count
- Completed bookings count

---

### 4.2 Post Requirement
- **Title** — free-text input (required)
- **Category** — dropdown picker (technology, design, writing, legal, finance, education, home services, etc.)
- **Description** — multi-line rich text (required, min 50 characters)
- **Budget** — INR amount input (min/max range)
- **Location** — city/area (relevant for local services)
- **Timeline** — urgency selector (flexible / within a week / within a month / urgent)
- **Attachments** — option to add files via upload service (presigned URL)
- Form validation with inline error messages
- Draft saving on back navigation
- Submit → POST `/api/requirements`
- On success: navigates to RequirementDetail

---

### 4.3 Discover / Search Screen
- Full-text search bar for requirements and providers
- Filter by: category, budget range, location, rating
- Real-time results via GET `/api/search`
- Result cards show: provider avatar, name, rating stars, tagline, category, score badge
- Tap result → ProviderProfile screen
- Empty state with helpful prompt

---

### 4.4 Requirement Detail Screen
- Full requirement info: title, description, budget, timeline, category, location, posted date
- Status badge (open / in progress / completed / closed)
- **Quotes / Bids Section** — list of all bids received
  - Each bid card: provider name, avatar, bid amount, duration, preview message
  - Tap bid → QuoteDetail screen
- Edit requirement (if status is open)
- Close / cancel requirement

---

### 4.5 Quote Detail Screen
- Full bid details: amount (₹), duration (days), cover message
- Provider name and rating
- **Accept Quote** button → creates booking, transitions requirement to "in progress"
- **Reject Quote** button → marks quote rejected, provider notified
- Confirmation alert before accepting
- Accepted quote auto-creates a Booking record

---

### 4.6 Bookings Screen
- List of all bookings (active + history)
- Filter tabs: All / Active / Completed / Cancelled
- Each card: provider name, requirement title, amount, status badge, date
- Pull-to-refresh
- Tap → BookingDetail screen

---

### 4.7 Booking Detail Screen
- Full booking info: requirement title, category, parties (client ↔ provider), amount, escrow status, timeline dates
- **Escrow Status Pill** — Pending / Funds in Escrow / Payment Released / In Dispute
- **Status Transitions** (customer can trigger):
  - Confirmed → Mark as Started (sets `in_progress`)
  - In Progress → Mark as Completed (sets `completed`)
- **Cancel Booking** — with confirmation alert (available for confirmed + in_progress)
- **Raise Dispute** button — visible only for completed bookings within 7 days of completion date
- **Leave a Review** button — visible only for completed bookings where review not yet submitted
- "Review submitted" confirmation banner after review

---

### 4.8 Raise Dispute
- Available only: `status === "completed"` AND within 7 calendar days of `completedAt`
- **Reason Grid** — 6 options (tap to select one):
  - Work Not Delivered
  - Quality Below Standard
  - Late Delivery
  - Payment Dispute
  - Fraud / Misrepresentation
  - Other
- **Description TextInput** — minimum 20 characters required, max 2000
- Character counter with error highlight below threshold
- Validation hint banner (yellow) explains why submit is disabled
- `useRef` guard prevents double-submission across Alert confirmation
- Confirmation alert before submission
- POST `/api/disputes` with `{ bookingId, reason, description }`
- Success → toast + navigate back

---

### 4.9 Leave a Review
- Star rating (1–5) tap selector
- Written review text input
- Submit → POST `/api/reviews`
- One review per booking enforced
- Review contributes to provider's score

---

### 4.10 Provider Profile (Public)
- Provider avatar, name, verified badge
- Overall rating (stars + count)
- Provider score (0–100)
- Bio / description
- Category / service type
- Portfolio grid (photo samples)
- Reviews list with ratings
- "Send Message" → opens Chat
- "View Requirements" → filter requirements matching this provider

---

### 4.11 Notifications Screen
- List of all in-app notifications
- Types: quote received, booking confirmed, booking completed, dispute update, message received, review received, system alert
- Unread indicator (blue dot)
- Tap → navigates to relevant screen
- Mark all as read
- Pull-to-refresh

---

## 5. Business Profile — All Features

**Theme:** Purple `#7c3aed`  
**Bottom Tabs:** Home · Post · Search · Messages · Profile

Business profile has all Customer features PLUS the following differences:

---

### 5.1 Business Dashboard (Home)
- Overview stats: active requirements, active bookings, total spend, providers hired
- Recent activity feed (latest bids, bookings, messages)
- Quick action: Post New Requirement
- Active requirements list with bid count per card

### 5.2 Post Requirement (Tab Bar Shortcut)
- Direct access from tab bar (dedicated "Post" tab)
- Same form as Customer with additional fields:
  - **Company Name** — auto-filled from profile
  - **Project Code / Reference** — optional internal reference
  - **Multiple Deliverables** — structured checklist
  - **Team Size Required** — number of providers needed

### 5.3 Search (Tab Bar Access)
- Full provider and requirement search
- Advanced filters: verified only, subscription tier, minimum rating, category
- Result cards same as Customer

### 5.4 Messages (Tab Bar)
- Direct access to all active chat conversations
- Chat list with last message preview, timestamp, unread count

### 5.5 All Shared Features
- Same as Customer: Requirement Detail, Quote Detail, Booking Detail, Dispute, Review, Provider Profile, Notifications, Profile, Settings, Referrals, Phone Verification, Subscription

---

## 6. Digital Provider Profile — All Features

**Theme:** Teal `#0d9488`  
**Bottom Tabs:** Gigs · Earnings · Portfolio · Messages · Profile

---

### 6.1 Digital Provider Dashboard (Gigs)

**Analytics Banner**
- Prominent banner at top: "View Your Analytics" with bar chart icon
- Taps → AnalyticsScreen
- Shows current period summary (bids this month, earnings this week)

**Open Requirements Feed**
- Live feed of requirements matching the provider's skills/category
- Each card: requirement title, budget range, category, client rating, posted time, location
- Sorted by matching score (platform algorithm)
- Filter by category, budget, timeline
- Tap card → RequirementDetail screen
- "Submit Bid" CTA on each card

**Bid Quota Display**
- Shows remaining bids this month (Free: 5/month, Pro: unlimited, Business: unlimited)
- Upgrades to Subscription if quota reached

---

### 6.2 Submit Bid (BidSubmitScreen)
- **Bid Amount (₹)** — INR input with validation (must be ≤ requirement budget)
- **Timeline (days)** — how many days to deliver
- **Cover Message** — pitch text, min 50 characters
- Preview of the requirement being bid on
- Submit → POST `/api/quotes` with `{ requirementId, amount, durationDays, message }`
- Bid deducted from monthly quota (for Free tier)
- Confirmation on success

---

### 6.3 Quote Detail Screen (Outgoing Bid View)
- Status of own bid: Pending / Accepted / Rejected / Expired
- Full bid details sent
- If accepted → navigate to BookingDetail
- If rejected → reason (if provided)
- Expiry countdown if pending

---

### 6.4 Earnings Screen
- **Total Earnings** (lifetime, displayed prominently)
- **This Month** earnings
- **Pending** (escrow held, not yet released)
- Earnings history list: requirement title, client name, amount, date, payment status
- Filter by: this week / this month / last 3 months / all time
- Each transaction shows escrow status
- Export earnings data option

---

### 6.5 Portfolio Screen
- Grid view of all portfolio items (images, titles)
- **Add Portfolio Item:**
  - Upload image from gallery (via `uploadFile()` presigned URL flow)
  - Title input
  - Description input
  - Category tag
  - Submit → POST `/api/portfolio`
- **Delete Portfolio Item** — swipe or long press with confirmation
- Tap item → full-screen image viewer with title/description
- Portfolio visible on public ProviderProfile

---

### 6.6 Analytics Screen
**Period Selector** (chip bar):
- 7 Days · 30 Days · 90 Days · All Time

**Metrics Grid (4 cards):**
- **Total Bids** submitted in period
- **Total Earnings** (₹) in period
- **Bid-to-Booking Funnel** (%) — how many bids converted to bookings
- **Profile Views** — how many clients viewed this provider's profile

**Monthly Bar Chart:**
- Visual bar chart showing earnings per month
- Touch to see exact value per bar

**Data source:** GET `/api/analytics/provider?period=:period`

---

### 6.7 Availability Management
- Calendar view of the current and next month
- **Block a date:** tap date → confirms block → date shown in red
- **Unblock a date:** tap blocked date → remove block
- Blocked dates visible to customers on provider profile
- Prevents bookings for those dates
- GET/POST/DELETE `/api/availability`

---

### 6.8 Bookings (via BookingsScreen)
- Incoming bookings from accepted quotes
- Status tracking: Confirmed → In Progress → Completed
- Update booking status (provider can mark "Mark as Started" and "Mark as Completed")
- View full booking detail

---

### 6.9 KYC / Identity Verification
- Accessible from Profile → Verify Identity
- Upload identity document (PDF, JPEG, PNG, max 20 MB)
- Document types: Aadhaar / PAN / Passport / Driving Licence
- Status tracking: Pending / Under Review / Approved / Rejected
- Approved KYC → "Verified" badge on public profile
- POST `/api/verify/phone/send`, `/api/verify/phone/confirm`
- PATCH `/api/verify/:id/approve` (admin action)

---

## 7. Local Provider Profile — All Features

**Theme:** Orange `#ea580c`  
**Bottom Tabs:** Requests · Bookings · Messages · Notifications · Profile

Local Providers offer on-site/physical services. They have a slightly different tab layout focused on incoming requests and bookings.

---

### 7.1 Local Provider Dashboard (Requests)
- Feed of local requirements near the provider's location
- Location-aware filtering (city / area)
- Each card: service type, client name, area, budget, urgency
- Tap → RequirementDetail + Submit Bid flow (same as Digital Provider)

### 7.2 Bookings (Tab Bar)
- Dedicated tab for viewing all booked jobs
- Status management: confirm arrival, mark job started, mark completed
- Client contact info displayed
- Navigate to Booking Detail

### 7.3 Messages (Tab Bar)
- All active chat conversations with clients
- Real-time unread count badge

### 7.4 Notifications (Tab Bar)
- All platform notifications
- Booking alerts, payment notifications, review received

### 7.5 All Shared Features
Same as Digital Provider except:
- No dedicated Portfolio tab (portfolio accessible via Profile)
- No dedicated Earnings tab (earnings accessible via Profile shortcuts)
- No Analytics banner on dashboard (Analytics accessible via Profile)

---

## 8. Admin Profile — All Features

**Theme:** Red `#dc2626`  
**Bottom Tabs:** Analytics · Users · Alerts · Profile

---

### 8.1 Admin Dashboard (Analytics Tab)

**Stats Grid:**
- Total Users (with role breakdown)
- Active Requirements count
- Active Bookings count
- Disputes Open count
- Revenue (current month, ₹)
- New Signups (last 7 days)

**Quick Action Buttons:**
- **Disputes** → DisputesManagementScreen (red-themed)
- **Verify Queue** → VerificationQueueScreen (green-themed)

**Revenue & Growth Charts:**
- Monthly revenue trend
- User growth curve
- Booking volume trend

---

### 8.2 Users Management Screen
- Full paginated list of all users across all roles
- **Search bar** — search by name or email
- **Filter** — by role: Customer / Business / Digital / Local / All
- Each user card: avatar, name, email, role badge, status, join date
- **Suspend User** action with confirmation alert
  - PATCH `/api/admin/users/:id/suspend`
  - User loses app access immediately
- **Delete User** action with confirmation alert (destructive)
  - DELETE `/api/admin/users/:id`
  - Hard deletes user from system
- Pull-to-refresh

---

### 8.3 Disputes Management Screen
- **Status Filter Tabs:** All · Open · Under Review · Resolved · Dismissed
- Each dispute card: dispute ID, booking reference, raised by (customer name), amount, reason label, date, current status badge
- **Dispute Detail Modal:**
  - Full dispute info: booking details, parties, reason, full description, submission date
  - **Admin Notes** text input — internal ruling notes
  - **Action Buttons:**
    - "Mark Under Review" → status: `under_review`
    - "Mark Resolved" → status: `resolved` (funds released to appropriate party)
    - "Dismiss" → status: `dismissed` (no action taken)
  - PATCH `/api/admin/disputes/:id` with `{ status, adminNotes }`
- Notifications sent to both parties on status change

---

### 8.4 Verification Queue Screen
- List of all pending KYC submissions
- Each card: user avatar, name, email, role, document type, submission date
- **Document Preview** — view uploaded KYC document (image/PDF)
- **Approve** action → PATCH `/api/verify/:id/approve`
  - Grants "Verified" badge to provider
  - User notified via push + email
- **Reject** action → modal for rejection reason → PATCH `/api/verify/:id/reject { reason }`
  - User notified with reason
  - User can resubmit
- Status filter: Pending / Approved / Rejected

---

### 8.5 Alerts Screen (Notifications)
- Platform-wide alerts and system notifications
- Flagged message reports
- Fraud detection alerts
- All notification types viewable by admin

---

### 8.6 Admin API Capabilities (Backend Only — via API calls)
All accessible from admin panel:
- GET `/api/admin/audit-logs` — Full audit trail of all admin actions
- GET `/api/admin/flagged-messages` — Reported chat messages
- GET `/api/admin/feature-flags` — Remote config toggles
- PATCH `/api/admin/feature-flags/:id` — Enable/disable features without deploy
- GET `/api/admin/fraud-detection` — Suspicious activity feed
- GET `/api/admin/revenue` — Revenue analytics
- GET `/api/admin/growth` — User growth metrics

---

## 9. Shared Features — All Profiles

These features are available to every logged-in user regardless of role.

---

### 9.1 Profile Screen

**Profile Header:**
- Avatar (tappable → opens image picker → upload via uploadAvatar())
- Full name
- Role badge
- Verified badge (if KYC approved)
- Subscription tier badge (Free / Pro / Business)
- Provider score (for providers only, 0–100)
- Bio / tagline (editable)

**Shortcuts Card:**
- Referrals & Rewards (gift icon) → ReferralsScreen
- Analytics (bar chart icon) → AnalyticsScreen *(providers only)*
- My Portfolio → PortfolioScreen *(providers only)*
- Availability → AvailabilityScreen *(providers only)*
- Subscription → SubscriptionScreen

**Actions:**
- Edit Profile (name, bio, phone)
- View Public Profile (as others see it)
- PATCH `/api/users/:uid`

---

### 9.2 Settings Screen

**Account Settings:**
- Edit Display Name
- Change Profile Photo

**Privacy & Security:**
- Verify Phone Number → PhoneVerificationScreen
- Change Password (triggers Firebase `sendPasswordResetEmail`)
- Block/Unblock Users → POST/DELETE `/api/blocking`
- Two-Factor (phone OTP)

**Notifications Preferences:**
- Toggle email notifications (per type)
- Toggle push notifications
- Global email opt-out
- Stored in Firestore `notification_preferences/{uid}`

**Subscription:**
- View current plan
- Upgrade → SubscriptionScreen

**Legal:**
- Terms of Service
- Privacy Policy
- Data Export (GDPR) → POST `/api/gdpr/export`

**Danger Zone:**
- Delete Account → POST `/api/gdpr/delete` (30-day grace period, then permanent)
- Deactivate Account → POST `/api/auth/deactivate`

---

### 9.3 Phone Verification Screen

**Step 1 — Phone Entry:**
- INR +91 country code prefix
- Phone number input (10 digits)
- "Send OTP" → POST `/api/verify/phone/send { phoneNumber }`
- Input validation before send

**Step 2 — OTP Entry:**
- 6 individual digit boxes (auto-focus advances on each digit)
- Backspace handling (focus retreats to previous box)
- 60-second countdown resend cooldown
- "Resend OTP" available after cooldown
- Submit → POST `/api/verify/phone/confirm { code }`
- Success → profile marked as phone-verified

---

### 9.4 Real-Time Chat

**Chat List Screen:**
- All active conversations sorted by `lastMessageAt` desc
- Each row: avatar, recipient name, last message preview, timestamp, unread count badge
- Firestore `onSnapshot` for real-time updates (only approved direct DB access)
- Swipe to delete conversation

**Chat Screen:**
- Full message thread with sender/receiver bubbles
- Real-time message delivery via Firestore `onSnapshot`
- **Text message** input with send button
- **Image attachment** — pick from gallery, upload via presigned URL, display inline
- Message timestamps shown
- Read receipts (checkmark indicators)
- Typing indicator
- Back to chat list

---

### 9.5 Referrals & Rewards Screen

**My Referral Code Card:**
- Unique referral code prominently displayed
- **Copy Code** — copies to clipboard (Clipboard.setString)
- **Share** — opens native OS share sheet (Share.share) with pre-written invite text
- GET `/api/referrals/my-code`

**Stats Grid (4 cards):**
- Total Referrals sent
- Successful Referrals (signed up)
- Pending Rewards
- Total Rewards Earned (₹)
- GET `/api/referrals/stats`

**How It Works Section:**
- Step-by-step explanation cards (3 steps)
- Reward amount per referral displayed

**Leaderboard:**
- Top referrers this month
- Rank, name, avatar, referral count
- Current user's rank highlighted
- GET `/api/referrals/leaderboard`

---

### 9.6 Subscription Screen

**Plans Display:**
Three plan cards side by side:

| Feature | Free | Pro (₹499/mo) | Business (₹1499/mo) |
|---------|------|---------------|---------------------|
| Bids / Month | 5 | Unlimited | Unlimited |
| Priority Feed Rank | No | Yes | Yes |
| Verified Badge | No | Yes | Yes |
| Score Boost | 0 | +5 pts | +8 pts |
| Team Members | 1 | 1 | 5 |
| Featured Homepage | No | No | Yes |

**Upgrade Flow:**
1. Tap plan → POST `/api/subscriptions/create-order` → Razorpay order created
2. Razorpay payment sheet opens (`react-native-razorpay`)
3. Payment completes → Razorpay fires webhook → backend activates subscription
4. App polls GET `/api/subscriptions/status` → shows new tier

**Current Plan Display:**
- Active plan badge
- Renewal date
- "Cancel Subscription" → scheduled cancellation at period end

---

### 9.7 Notifications Screen
- All in-app notifications for the user
- Types with icons:
  - Quote received (new bid on your requirement)
  - Quote accepted (your bid was accepted)
  - Booking confirmed
  - Booking status updated
  - Booking completed
  - Dispute update
  - New message
  - Review received
  - Verification approved / rejected
  - Subscription activated / expiring
  - Password reset
  - OTP verification
- Unread dot indicator per notification
- Tap → deep link to relevant screen
- Mark all as read button
- Pull-to-refresh

---

## 10. Backend & Platform Features

### 10.1 Matching Engine
- Algorithm matches provider skills/category against requirement categories
- Score-based ranking of providers per requirement
- Providers with higher `providerScore` ranked higher
- Subscription tier adds score boost (Pro: +5, Business: +8)
- Lead distribution: top-N matching providers notified of new requirements

### 10.2 Provider Scoring System
- Score range: 0–100
- Factors: avg review rating, booking completion rate, on-time delivery, response time, dispute count
- Recalculated every hour by background job
- Score displayed on provider card and public profile

### 10.3 Escrow System
- Funds held in escrow on booking confirmation
- Escrow status: `pending` → `held` → `released` or `disputed`
- Released on booking completion
- Frozen on dispute raised, released per admin ruling

### 10.4 File Upload System (Presigned URL Flow)
- **Step 1:** POST `/api/uploads/presigned` → server returns `{ uploadId, presignedUrl, publicUrl }`
- **Step 2:** Mobile PUT file bytes directly to Firebase Storage via presigned URL (no auth header needed)
- **Step 3:** POST `/api/uploads/confirm { uploadId }` → backend records confirmed upload
- Contexts: `avatar`, `portfolio`, `document`, `evidence`
- Size limits: avatars 10 MB, portfolio 50 MB, KYC/evidence 20 MB
- MIME type validation enforced server-side

### 10.5 Email Queue System
- All outbound emails queued in Firestore `email_queue` collection
- Background job processes queue every 2 minutes (up to 20 emails per run)
- Retry with exponential backoff: 3 attempts max (1 min → 2 min → 4 min)
- Per-user email preference checking before queue (respects opt-outs)
- Delivery via Nodemailer SMTP (Gmail / Brevo / any SMTP)
- Email types: bid received, quote accepted, booking confirmed, booking completed, dispute update, review received, verification approved/rejected, subscription active/expiring, password reset, OTP

### 10.6 Push Notification System
- Firebase Cloud Messaging (FCM) for all push notifications
- FCM token stored on `users/{uid}.fcmToken`
- Token refreshed on each app launch
- Sent via Firebase Admin `admin.messaging().send()`
- Push types mirror in-app notification types

### 10.7 Presence System
- Online/offline status per user
- Real-time presence updated via POST `/api/presence`
- Stale presence markers cleaned up every 5 minutes by background job
- Visible in chat screens (green dot for online)

### 10.8 Offline Queue Sync
- Actions taken while offline are queued locally
- On reconnect, POST `/api/offline` syncs the queue to backend
- Ensures no data loss on intermittent connectivity

### 10.9 Rate Limiting
- **IP-level:** 300 requests per 15 minutes per IP address
- **Per-user:** 300 requests per 15 minutes per Firebase UID (Firestore token bucket)
- Returns HTTP 429 with retry-after header when exceeded

### 10.10 Audit Logging
- All admin actions written to `audit_events` Firestore collection
- Fields: adminId, action, targetId, metadata, createdAt
- Immutable log — no delete or update allowed on audit records
- Viewable via GET `/api/admin/audit-logs`

### 10.11 Feature Flags (Remote Config)
- Feature flags stored in Firestore `feature_flags` collection
- Admin can toggle features live without app deployment
- Rollout percentage support (e.g., enable for 20% of users)
- GET `/api/config` returns active flags to mobile app on startup

### 10.12 GDPR Compliance
- **Data Export:** POST `/api/gdpr/export` → generates JSON export of all user data
- **Account Deletion:** POST `/api/gdpr/delete` → schedules deletion (30-day grace period)
- Background job processes deletion queue every 24 hours
- Includes: profile, requirements, quotes, bookings, messages, reviews

### 10.13 Fraud Detection
- Suspicious activity detection running continuously
- Monitored signals: rapid bids from new accounts, unusual booking patterns, multiple accounts from same device
- Flagged users surfaced in admin fraud detection feed
- GET `/api/admin/fraud-detection`

---

## 11. Subscription Plans

| Feature | Free | Pro | Business |
|---------|------|-----|----------|
| **Monthly Price** | ₹0 | ₹499 | ₹1,499 |
| **Bids Per Month** | 5 | Unlimited | Unlimited |
| **Priority Feed Ranking** | No | Yes | Yes |
| **Verified Badge** | No | Yes | Yes |
| **Provider Score Boost** | +0 pts | +5 pts | +8 pts |
| **Team Members** | 1 | 1 | 5 |
| **Featured on Homepage** | No | No | Yes |
| **Payment Gateway** | — | Razorpay | Razorpay |
| **Cancellation** | — | At period end | At period end |

**Payment flow:** Razorpay order → payment sheet → HMAC-verified webhook → subscription activated in Firestore.  
**Auto-downgrade:** Background job checks expiry every hour and reverts expired subscriptions to Free tier.

---

## 12. Notification System

### Notification Types & Triggers

| Type | Trigger | Channel |
|------|---------|---------|
| `new_requirement_match` | New requirement matches provider skills | Push + In-app |
| `quote_received` | Customer receives a new bid | Push + In-app + Email |
| `quote_accepted` | Provider's bid is accepted | Push + In-app + Email |
| `quote_rejected` | Provider's bid is rejected | Push + In-app |
| `booking_confirmed` | Booking created from accepted quote | Push + In-app + Email |
| `booking_started` | Provider marks job as started | Push + In-app |
| `booking_completed` | Booking marked completed | Push + In-app + Email |
| `booking_reminder` | 24 hours before scheduled booking | Push + Email |
| `dispute_raised` | Dispute submitted on a booking | Push + In-app + Email |
| `dispute_updated` | Admin updates dispute status | Push + In-app + Email |
| `review_received` | Provider receives a new review | Push + In-app |
| `verification_approved` | KYC approved by admin | Push + In-app + Email |
| `verification_rejected` | KYC rejected by admin | Push + In-app + Email |
| `subscription_active` | Subscription payment confirmed | Push + In-app + Email |
| `subscription_expiring` | Subscription expires in 3 days | Push + Email |
| `new_message` | New chat message received | Push + In-app |
| `shortlisted` | Provider shortlisted for a requirement | Push + In-app |
| `password_reset` | Password reset requested | Email only |
| `otp_verification` | Phone OTP sent | Email only |

### User Preferences
- Per-type email opt-out stored in `notification_preferences/{uid}`
- Global email disable toggle
- Push notifications can be disabled at OS level
- Backend checks preferences before queuing any email

---

## 13. Security & Compliance Features

### Authentication Security
- Firebase Admin `verifyIdToken` on every protected API endpoint
- Firestore role lookup on every request (role read from DB, not from token)
- Custom token issuance for Google/Apple sign-in
- Token rotation via POST `/api/auth/refresh`
- Automatic session expiry (1-hour Firebase tokens)

### API Security
- All endpoints behind `authenticateToken` middleware (except `/health`, `/auth/google`, `/auth/apple`, `/subscriptions/webhook`)
- Role-based access: `requireRole("admin")` on all admin routes
- CORS configured (origin whitelist)
- Rate limiting: dual-layer (IP + per-user)
- Input validation via Zod schemas on all routes

### Data Security
- `firebase-service-account.json` never committed to git
- `.env` never committed to git
- Firebase Storage rules: owner-only writes, authenticated reads
- Firestore rules: per-collection access control, no public read/write
- Razorpay webhooks verified with HMAC-SHA256 signature

### Compliance
- GDPR data export and deletion
- Email unsubscribe links on all marketing emails
- User-controlled notification preferences
- Audit log for all admin actions

---

## 14. Feature Matrix — Profile vs Feature

| Feature | Customer | Business | Digital Provider | Local Provider | Admin |
|---------|----------|----------|-----------------|----------------|-------|
| Sign up / Login | ✅ | ✅ | ✅ | ✅ | ✅ |
| Role selection (onboarding) | ✅ | ✅ | ✅ | ✅ | — |
| Dashboard (role-specific) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Post Requirement | ✅ | ✅ | — | — | — |
| View Requirement Feed | — | — | ✅ | ✅ | — |
| Submit Bid / Quote | — | — | ✅ | ✅ | — |
| Accept / Reject Quote | ✅ | ✅ | — | — | — |
| Bookings List | ✅ | ✅ | ✅ | ✅ | — |
| Booking Detail | ✅ | ✅ | ✅ | ✅ | — |
| Update Booking Status | ✅ | ✅ | ✅ | ✅ | — |
| Cancel Booking | ✅ | ✅ | — | — | — |
| Raise Dispute | ✅ | ✅ | — | — | — |
| Manage Disputes | — | — | — | — | ✅ |
| Leave Review | ✅ | ✅ | — | — | — |
| View Provider Profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| Real-time Chat | ✅ | ✅ | ✅ | ✅ | — |
| Chat List | ✅ | ✅ | ✅ | ✅ | — |
| Notifications | ✅ | ✅ | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ | ✅ | — |
| Portfolio Management | — | — | ✅ | ✅ | — |
| Earnings Screen | — | — | ✅ | — | — |
| Analytics Screen | — | — | ✅ | ✅ | ✅ |
| Availability Management | — | — | ✅ | ✅ | — |
| KYC Verification (submit) | — | — | ✅ | ✅ | — |
| KYC Verification (approve/reject) | — | — | — | — | ✅ |
| Subscription Upgrade | — | — | ✅ | ✅ | — |
| Referrals & Rewards | ✅ | ✅ | ✅ | ✅ | — |
| Phone Verification | ✅ | ✅ | ✅ | ✅ | — |
| Profile (view/edit) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ |
| File Upload (avatar/docs) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Users Management | — | — | — | — | ✅ |
| Suspend / Delete Users | — | — | — | — | ✅ |
| Verification Queue | — | — | — | — | ✅ |
| Platform Analytics | — | — | — | — | ✅ |
| Feature Flags | — | — | — | — | ✅ |
| Audit Logs | — | — | — | — | ✅ |
| Fraud Detection | — | — | — | — | ✅ |
| GDPR Export / Deletion | ✅ | ✅ | ✅ | ✅ | — |
| Block / Unblock Users | ✅ | ✅ | ✅ | ✅ | — |

---

*SRN PRD — Version 1.0.0 — Generated 2026-06-18*  
*Total Screens: 33 · Total API Routes: 25 modules · User Profiles: 5 · Background Jobs: 10*