import { Router } from "express";
import {
  SESSION_COOKIE,
  hashPassword,
  requireSession,
  signSession,
  verifyPassword,
} from "../auth.js";
import { query } from "../db.js";
import { isProd } from "../config.js";

export const accountRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/",
  };
}

accountRouter.post("/signup", async (req, res) => {
  const { email, username, password } = req.body ?? {};

  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: "Username must be 3-32 chars: letters, numbers, _ or -",
    });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  const passwordHash = await hashPassword(password);

  try {
    const { rows } = await query<{
      id: string;
      email: string;
      username: string;
      api_key: string;
    }>(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, api_key`,
      [email.toLowerCase(), username, passwordHash]
    );
    const user = rows[0];
    const token = signSession({
      id: user.id,
      email: user.email,
      username: user.username,
    });
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    return res.status(201).json({
      id: user.id,
      email: user.email,
      username: user.username,
      api_key: user.api_key,
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      return res
        .status(409)
        .json({ error: "That email or username is already taken" });
    }
    throw err;
  }
});

accountRouter.post("/login", async (req, res) => {
  const { login, password } = req.body ?? {};
  if (typeof login !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Login and password are required" });
  }

  const { rows } = await query<{
    id: string;
    email: string;
    username: string;
    password_hash: string;
  }>(
    `SELECT id, email, username, password_hash
     FROM users
     WHERE email = $1 OR username = $2`,
    [login.toLowerCase(), login]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const user = rows[0];
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signSession({
    id: user.id,
    email: user.email,
    username: user.username,
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  return res.json({
    id: user.id,
    email: user.email,
    username: user.username,
  });
});

accountRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

accountRouter.get("/me", requireSession, async (req, res) => {
  const { rows } = await query<{
    id: string;
    email: string;
    username: string;
    api_key: string;
    created_at: string;
  }>(
    "SELECT id, email, username, api_key, created_at FROM users WHERE id = $1",
    [req.user!.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json(rows[0]);
});

// Rotate the API key (in case it leaks).
accountRouter.post("/regenerate-key", requireSession, async (req, res) => {
  const { rows } = await query<{ api_key: string }>(
    "UPDATE users SET api_key = gen_random_uuid() WHERE id = $1 RETURNING api_key",
    [req.user!.id]
  );
  return res.json({ api_key: rows[0].api_key });
});
