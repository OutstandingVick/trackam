import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import { config, isProd } from "./config.js";
import { pool } from "./db.js";
import { wakatimeRouter } from "./routes/wakatime.js";
import { accountRouter } from "./routes/account.js";
import { statsRouter } from "./routes/stats.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Health check for load balancers / uptime monitors.
app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "db_unavailable" });
  }
});

// WakaTime-compatible ingestion API (used by editor plugins).
app.use("/api/v1", wakatimeRouter);

// Dashboard account + stats APIs.
app.use("/api/account", accountRouter);
app.use("/api", statsRouter);

// Static frontend.
app.use(express.static(publicDir));

// SPA-style fallback to the dashboard shell for unknown non-API GETs.
app.get(/^\/(?!api|healthz).*/, (_req, res) => {
  res.sendFile(join(publicDir, "index.html"));
});

// Centralized error handler.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
);

app.listen(config.port, () => {
  console.log(
    `Trackam running on http://localhost:${config.port} (${config.nodeEnv})`
  );
  if (!isProd && config.jwtSecret === "dev-insecure-secret-change-me") {
    console.warn("⚠  Using the insecure default JWT_SECRET. Set one in .env!");
  }
});
