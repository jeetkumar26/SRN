import { Router, type IRouter } from "express";

// Core
import healthRouter from "./health";
import usersRouter from "./users";
import authRouter from "./auth";
import requirementsRouter from "./requirements";
import messagesRouter from "./messages";
import quotesRouter from "./quotes";

// Marketplace
import reviewsRouter from "./reviews";
import bookingsRouter from "./bookings";
import portfolioRouter from "./portfolio";
import notificationsRouter from "./notifications";

// Uploads & Search
import uploadsRouter from "./uploads";
import searchRouter from "./search";

// Provider features
import analyticsRouter from "./analytics";
import availabilityRouter from "./availability";

// Payments & KYC
import subscriptionsRouter from "./subscriptions";
import verificationRouter from "./verification";

// Trust & Safety
import disputesRouter from "./disputes";
import blockingRouter from "./blocking";

// Growth
import referralsRouter from "./referrals";

// Platform
import presenceRouter from "./presence";
import offlineRouter from "./offline";
import appConfigRouter from "./appConfig";
import gdprRouter from "./gdpr";

// Admin
import adminRouter from "./admin";

const router: IRouter = Router();

// Authentication (social login + logout + email check)
router.use(authRouter);

// Core platform
router.use(healthRouter);
router.use(usersRouter);
router.use(requirementsRouter);
router.use(messagesRouter);
router.use(quotesRouter);

// Marketplace transactions
router.use(reviewsRouter);
router.use(bookingsRouter);
router.use(portfolioRouter);
router.use(notificationsRouter);

// Files & Discovery
router.use(uploadsRouter);
router.use(searchRouter);

// Provider tools
router.use(analyticsRouter);
router.use(availabilityRouter);

// Monetisation & Identity
router.use(subscriptionsRouter);
router.use(verificationRouter);

// Trust & Safety
router.use(disputesRouter);
router.use(blockingRouter);

// Growth
router.use(referralsRouter);

// Platform & Mobile
router.use(presenceRouter);
router.use(offlineRouter);
router.use(appConfigRouter);

// GDPR / Privacy
router.use(gdprRouter);

// Admin (last — most specific prefix)
router.use(adminRouter);

export default router;
