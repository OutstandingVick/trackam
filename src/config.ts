import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  baseUrl: (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  databaseUrl: required(
    "DATABASE_URL",
    "postgres://trackam:trackam@localhost:5432/trackam"
  ),
  jwtSecret: required("JWT_SECRET", "dev-insecure-secret-change-me"),
  heartbeatTimeoutSeconds: Number(process.env.HEARTBEAT_TIMEOUT_SECONDS ?? 900),
};

export const isProd = config.nodeEnv === "production";
