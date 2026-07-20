import { Router } from "express";
import { requireSession } from "../auth.js";
import { query } from "../db.js";
import {
  computeDuration,
  humanReadable,
  type DurationHeartbeat,
} from "../utils/duration.js";

export const statsRouter = Router();

type RangeKey = "today" | "week" | "month";

function rangeStart(range: RangeKey): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (range === "today") return now.getTime() / 1000;
  if (range === "week") return now.getTime() / 1000 - 6 * 86400;
  return now.getTime() / 1000 - 29 * 86400; // month = last 30 days
}

function dayKey(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

statsRouter.get("/stats", requireSession, async (req, res) => {
  const rangeParam = (req.query.range as string) ?? "today";
  const range: RangeKey = ["today", "week", "month"].includes(rangeParam)
    ? (rangeParam as RangeKey)
    : "today";

  const start = rangeStart(range);
  const end = Date.now() / 1000;

  const { rows } = await query<
    DurationHeartbeat & { entity: string | null }
  >(
    `SELECT time, project, language, editor, operating_system, entity
     FROM heartbeats
     WHERE user_id = $1 AND time >= $2 AND time <= $3
     ORDER BY time ASC`,
    [req.user!.id, start, end]
  );

  const overall = computeDuration(rows);

  // Per-day series (duration computed within each day bucket).
  const byDay = new Map<string, DurationHeartbeat[]>();
  for (const hb of rows) {
    const key = dayKey(hb.time);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(hb);
  }

  const days: Array<{ date: string; total_seconds: number; text: string }> = [];
  const numDays = range === "today" ? 1 : range === "week" ? 7 : 30;
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400 * 1000);
    const key = dayKey(d.getTime() / 1000);
    const hbs = byDay.get(key) ?? [];
    const dur = computeDuration(hbs);
    days.push({
      date: key,
      total_seconds: dur.total_seconds,
      text: humanReadable(dur.total_seconds),
    });
  }

  const dailyAverage =
    days.length > 0
      ? Math.round(days.reduce((a, d) => a + d.total_seconds, 0) / days.length)
      : 0;

  return res.json({
    range,
    start: new Date(start * 1000).toISOString(),
    end: new Date(end * 1000).toISOString(),
    grand_total: {
      total_seconds: overall.total_seconds,
      text: humanReadable(overall.total_seconds),
    },
    daily_average: {
      total_seconds: dailyAverage,
      text: humanReadable(dailyAverage),
    },
    heartbeat_count: rows.length,
    projects: overall.projects.map(withText),
    languages: overall.languages.map(withText),
    editors: overall.editors.map(withText),
    operating_systems: overall.operating_systems.map(withText),
    days,
  });
});

function withText(b: { name: string; total_seconds: number }) {
  return { ...b, text: humanReadable(b.total_seconds) };
}
