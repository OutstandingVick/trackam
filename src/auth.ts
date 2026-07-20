import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { query } from "./db.js";

export interface AuthedUser {
  id: string;
  email: string;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export const SESSION_COOKIE = "trackam_session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSession(user: AuthedUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "30d" });
}

/**
 * Dashboard auth: reads the signed session cookie set at login.
 */
export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthedUser & {
      iat: number;
      exp: number;
    };
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}

/**
 * Extract the API key from a request the way wakatime-cli sends it.
 *
 * The CLI uses HTTP Basic auth with the api key base64-encoded, e.g.
 *   Authorization: Basic <base64(api_key)>
 * We also accept a plain `Bearer <key>` and an `?api_key=` query param.
 */
function extractApiKey(req: Request): string | null {
  const header = req.header("authorization");
  if (header) {
    const [scheme, value] = header.split(" ");
    if (scheme && value) {
      if (scheme.toLowerCase() === "basic") {
        const decoded = Buffer.from(value, "base64").toString("utf8");
        // Value may be "apikey" or "apikey:" (basic auth username form).
        return decoded.replace(/:$/, "").trim() || null;
      }
      if (scheme.toLowerCase() === "bearer") {
        return value.trim() || null;
      }
    }
  }
  const queryKey = req.query.api_key;
  if (typeof queryKey === "string" && queryKey) {
    return queryKey.trim();
  }
  return null;
}

/**
 * WakaTime-compatible API-key auth used by the ingestion endpoints.
 */
export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  // api_key is a UUID column; reject anything that isn't shaped like one
  // before hitting the DB to avoid noisy cast errors.
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(apiKey)) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const { rows } = await query<AuthedUser>(
    "SELECT id, email, username FROM users WHERE api_key = $1",
    [apiKey]
  );
  if (rows.length === 0) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  req.user = rows[0];
  next();
}
