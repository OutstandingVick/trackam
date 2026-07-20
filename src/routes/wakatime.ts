import { Router } from "express";
import { requireApiKey } from "../auth.js";
import { query } from "../db.js";
import { parseUserAgent } from "../utils/useragent.js";
import { computeDuration, humanReadable } from "../utils/duration.js";

/**
 * WakaTime-compatible API surface consumed by the official editor plugins.
 * Mounted under /api/v1, so the CLI's `api_url` should be:
 *   https://your-host/api/v1
 */
export const wakatimeRouter = Router();

interface IncomingHeartbeat {
  entity?: string;
  type?: string;
  category?: string;
  time?: number;
  project?: string;
  branch?: string;
  language?: string;
  dependencies?: string[] | string;
  lines?: number;
  lineno?: number;
  cursorpos?: number;
  is_write?: boolean;
  machine?: string;
  editor?: string;
  operating_system?: string;
  user_agent?: string;
}

async function storeHeartbeats(
  userId: string,
  heartbeats: IncomingHeartbeat[],
  userAgentHeader: string | undefined,
  machineHeader: string | undefined
) {
  const agent = parseUserAgent(userAgentHeader);
  const stored: Array<{ id: number }> = [];

  for (const hb of heartbeats) {
    const time = typeof hb.time === "number" ? hb.time : Date.now() / 1000;
    const dependencies = Array.isArray(hb.dependencies)
      ? hb.dependencies.join(",")
      : hb.dependencies ?? null;

    const editor = hb.editor ?? parseUserAgent(hb.user_agent).editor ?? agent.editor;
    const operatingSystem =
      hb.operating_system ??
      parseUserAgent(hb.user_agent).operatingSystem ??
      agent.operatingSystem;

    const { rows } = await query<{ id: number }>(
      `INSERT INTO heartbeats
        (user_id, time, entity, type, category, project, branch, language,
         dependencies, lines, lineno, cursorpos, is_write, editor,
         operating_system, machine)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (user_id, time, entity, type) DO NOTHING
       RETURNING id`,
      [
        userId,
        time,
        hb.entity ?? null,
        hb.type ?? null,
        hb.category ?? null,
        hb.project ?? null,
        hb.branch ?? null,
        hb.language ?? null,
        dependencies,
        hb.lines ?? null,
        hb.lineno ?? null,
        hb.cursorpos ?? null,
        hb.is_write ?? null,
        editor,
        operatingSystem,
        hb.machine ?? machineHeader ?? null,
      ]
    );
    stored.push({ id: rows[0]?.id ?? 0 });
  }
  return stored;
}

// Bulk + single heartbeat ingestion. wakatime-cli POSTs a JSON array here.
async function handleHeartbeats(req: import("express").Request, res: import("express").Response) {
  const body = req.body;
  const list: IncomingHeartbeat[] = Array.isArray(body) ? body : [body];

  if (list.length === 0) {
    return res.status(400).json({ error: "No heartbeats provided" });
  }

  const stored = await storeHeartbeats(
    req.user!.id,
    list,
    req.header("user-agent"),
    req.header("x-machine-name")
  );

  // WakaTime bulk response shape: { responses: [ [ {data}, statusCode ], ... ] }
  const responses = stored.map((s) => [{ id: String(s.id) }, 201]);
  return res.status(201).json({ responses });
}

wakatimeRouter.post(
  "/users/current/heartbeats.bulk",
  requireApiKey,
  handleHeartbeats
);
wakatimeRouter.post("/users/current/heartbeats", requireApiKey, handleHeartbeats);
// Some plugins use the users/{user}/heartbeats form.
wakatimeRouter.post("/users/:user/heartbeats.bulk", requireApiKey, handleHeartbeats);
wakatimeRouter.post("/users/:user/heartbeats", requireApiKey, handleHeartbeats);

function startOfToday(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime() / 1000;
}

// Editor status bar polls this to show "today" total.
async function handleStatusBar(
  req: import("express").Request,
  res: import("express").Response
) {
  const start = startOfToday();
  const end = Date.now() / 1000;

  const { rows } = await query<{
    time: number;
    project: string | null;
    language: string | null;
    editor: string | null;
    operating_system: string | null;
  }>(
    `SELECT time, project, language, editor, operating_system
     FROM heartbeats
     WHERE user_id = $1 AND time >= $2 AND time <= $3
     ORDER BY time ASC`,
    [req.user!.id, start, end]
  );

  const result = computeDuration(rows);

  return res.json({
    data: {
      grand_total: {
        seconds: result.total_seconds % 60,
        minutes: Math.floor((result.total_seconds % 3600) / 60),
        hours: Math.floor(result.total_seconds / 3600),
        total_seconds: result.total_seconds,
        text: humanReadable(result.total_seconds),
        digital: formatDigital(result.total_seconds),
      },
      categories: [],
      projects: result.projects.map((p) => ({
        name: p.name,
        total_seconds: p.total_seconds,
        text: humanReadable(p.total_seconds),
      })),
      languages: result.languages.map((l) => ({
        name: l.name,
        total_seconds: l.total_seconds,
        text: humanReadable(l.total_seconds),
      })),
      range: {
        start: new Date(start * 1000).toISOString(),
        end: new Date(end * 1000).toISOString(),
      },
    },
  });
}

function formatDigital(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

wakatimeRouter.get(
  "/users/current/statusbar/today",
  requireApiKey,
  handleStatusBar
);
wakatimeRouter.get(
  "/users/:user/statusbar/today",
  requireApiKey,
  handleStatusBar
);
