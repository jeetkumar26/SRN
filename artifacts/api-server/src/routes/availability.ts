/**
 * PROVIDER AVAILABILITY CALENDAR — MODULE 22
 *
 * Algorithm:
 *  1. Provider sets weekly working hours (e.g. Mon-Fri 9am-6pm)
 *  2. Provider can block specific dates (holidays, vacations)
 *  3. When booking is created, it occupies a time slot
 *  4. Conflict detection: new bookings checked against existing confirmed bookings
 *  5. "isAvailable" field is a global toggle (quick enable/disable)
 *
 * Time slots:
 *  - granularity: 30 min slots
 *  - timezone: provider's declared timezone (stored in user profile)
 *  - bookings can span multiple slots
 *
 * Data structures:
 *  - working_hours/{userId}  — weekly schedule
 *  - blocked_dates/{userId}  — specific blocked days
 *  - bookings                — confirmed occupations (existing)
 */

import { Router } from "express";
import { db } from "../lib/firebase";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/authMiddleware";

const router = Router();

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

interface WorkingHours {
  userId: string;
  timezone: string;
  schedule: Partial<Record<DayOfWeek, { start: string; end: string } | null>>;
  updatedAt: number;
}

interface BlockedDate {
  id: string;
  userId: string;
  date: string; // "YYYY-MM-DD"
  reason?: string;
  createdAt: number;
}

interface TimeSlot {
  date: string;       // "YYYY-MM-DD"
  startTime: string;  // "HH:mm"
  endTime: string;
  available: boolean;
  bookingId?: string;
}

function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0] || undefined;
  return undefined;
}

// ---------------------------------------------------------------------------
// GET /availability/:providerId — Get provider's weekly working hours
// ---------------------------------------------------------------------------
router.get(
  "/availability/:providerId",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const providerId = req.params["providerId"] as string;

      const [hoursDoc, userDoc] = await Promise.all([
        db.collection("working_hours").doc(providerId).get(),
        db.collection("users").doc(providerId).get(),
      ]);

      if (!userDoc.exists) { res.status(404).json({ error: "Provider not found." }); return; }

      const user = userDoc.data()!;

      const blockedSnap = await db
        .collection("blocked_dates")
        .where("userId", "==", providerId)
        .orderBy("date")
        .get();

      const blockedDates = blockedSnap.docs.map((d) => ({
        date: d.data().date as string,
        reason: (d.data().reason as string) || undefined,
      }));

      res.json({
        isAvailable: user.isAvailable ?? true,
        timezone: user.timezone ?? "Asia/Kolkata",
        schedule: hoursDoc.exists ? hoursDoc.data()?.schedule : null,
        updatedAt: hoursDoc.exists
          ? new Date(hoursDoc.data()!.updatedAt as number).toISOString()
          : null,
        blockedDates,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /availability/hours — Set or update working hours (provider only)
// ---------------------------------------------------------------------------
router.put(
  "/availability/hours",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== "local" && userRole !== "digital" && userRole !== "admin") {
        res.status(403).json({ error: "Only providers can set working hours." });
        return;
      }

      const { timezone, schedule } = req.body as {
        timezone?: string;
        schedule?: Partial<Record<DayOfWeek, { start: string; end: string } | null>>;
      };

      if (!schedule || typeof schedule !== "object") {
        res.status(400).json({ error: "schedule object is required." });
        return;
      }

      const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      const cleanedSchedule: WorkingHours["schedule"] = {};

      for (const day of DAYS) {
        const daySchedule = schedule[day];
        if (daySchedule === null) {
          cleanedSchedule[day] = null; // explicitly mark as off day
        } else if (daySchedule?.start && daySchedule?.end) {
          // Validate time format HH:mm
          if (!/^\d{2}:\d{2}$/.test(daySchedule.start) || !/^\d{2}:\d{2}$/.test(daySchedule.end)) {
            res.status(400).json({ error: `Invalid time format for ${day}. Use HH:mm.` });
            return;
          }
          if (daySchedule.start >= daySchedule.end) {
            res.status(400).json({ error: `Start time must be before end time for ${day}.` });
            return;
          }
          cleanedSchedule[day] = daySchedule;
        }
      }

      const userId = req.user!.uid;
      const now = Date.now();

      const batch = db.batch();
      batch.set(db.collection("working_hours").doc(userId), {
        userId,
        timezone: timezone ?? "Asia/Kolkata",
        schedule: cleanedSchedule,
        updatedAt: now,
      });

      if (timezone) {
        batch.update(db.collection("users").doc(userId), { timezone });
      }

      await batch.commit();

      res.json({ success: true, schedule: cleanedSchedule, updatedAt: new Date(now).toISOString() });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /availability/block — Block specific dates
// ---------------------------------------------------------------------------
router.post(
  "/availability/block",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== "local" && userRole !== "digital" && userRole !== "admin") {
        res.status(403).json({ error: "Only providers can block dates." });
        return;
      }

      const { dates, reason } = req.body as { dates?: string[]; reason?: string };

      if (!dates || !Array.isArray(dates) || dates.length === 0) {
        res.status(400).json({ error: "dates array is required." });
        return;
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      for (const date of dates) {
        if (!dateRegex.test(date)) {
          res.status(400).json({ error: `Invalid date format: ${date}. Use YYYY-MM-DD.` });
          return;
        }
      }

      const userId = req.user!.uid;
      const now = Date.now();

      const batch = db.batch();
      const blocked: BlockedDate[] = [];

      for (const date of dates) {
        const docRef = db.collection("blocked_dates").doc(`${userId}_${date}`);
        const record: BlockedDate = {
          id: docRef.id,
          userId,
          date,
          reason: reason ?? "",
          createdAt: now,
        };
        batch.set(docRef, record, { merge: true });
        blocked.push(record);
      }

      await batch.commit();

      res.status(201).json({ blocked });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /availability/block/:date — Unblock a specific date
// ---------------------------------------------------------------------------
router.delete(
  "/availability/block/:date",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const date = req.params["date"] as string;
      const userId = req.user!.uid;

      await db.collection("blocked_dates").doc(`${userId}_${date}`).delete();
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /availability/slots/:providerId — Get available time slots for a date range
// Used by clients to see when a provider is available for booking
// ---------------------------------------------------------------------------
router.get(
  "/availability/slots/:providerId",
  authenticateToken,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const providerId = req.params["providerId"] as string;
      const startDate = qs(req.query.startDate) ?? new Date().toISOString().substring(0, 10);
      const endDate = qs(req.query.endDate) ??
        new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString().substring(0, 10);

      const [hoursDoc, blockedSnap, bookingsSnap] = await Promise.all([
        db.collection("working_hours").doc(providerId).get(),
        db.collection("blocked_dates")
          .where("userId", "==", providerId)
          .where("date", ">=", startDate)
          .where("date", "<=", endDate)
          .get(),
        db.collection("bookings")
          .where("providerId", "==", providerId)
          .where("status", "in", ["confirmed", "in_progress"])
          .get(),
      ]);

      const schedule = hoursDoc.data()?.schedule as WorkingHours["schedule"] ?? {};
      const blockedDates = new Set(blockedSnap.docs.map((d) => d.data().date as string));
      const occupiedDates = new Set(
        bookingsSnap.docs
          .map((d) => {
            const b = d.data();
            // Use scheduledDate if set; fall back to rescheduleDate or createdAt
            const dateMs = (b.scheduledDate ?? b.rescheduleDate ?? b.createdAt) as number | null;
            return dateMs ? new Date(dateMs).toISOString().substring(0, 10) : null;
          })
          .filter(Boolean) as string[]
      );

      const slots: TimeSlot[] = [];
      const current = new Date(startDate);
      const end = new Date(endDate);

      const DAY_NAMES: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

      while (current <= end) {
        const dateStr = current.toISOString().substring(0, 10);
        const dayName = DAY_NAMES[current.getDay()] as DayOfWeek;
        const daySchedule = schedule[dayName];
        const isBlocked = blockedDates.has(dateStr);
        const isOccupied = occupiedDates.has(dateStr);

        if (!isBlocked && !isOccupied && daySchedule) {
          // Generate 30-min slots for this day
          const [startH, startM] = daySchedule.start.split(":").map(Number);
          const [endH, endM] = daySchedule.end.split(":").map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;

          for (let min = startMinutes; min < endMinutes; min += 30) {
            const slotStart = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
            const slotEndMin = min + 30;
            const slotEnd = `${String(Math.floor(slotEndMin / 60)).padStart(2, "0")}:${String(slotEndMin % 60).padStart(2, "0")}`;
            slots.push({ date: dateStr, startTime: slotStart, endTime: slotEnd, available: true });
          }
        } else if (isBlocked || isOccupied || !daySchedule) {
          slots.push({
            date: dateStr,
            startTime: "00:00",
            endTime: "23:59",
            available: false,
          });
        }

        current.setDate(current.getDate() + 1);
      }

      res.json({ providerId, startDate, endDate, slots });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
