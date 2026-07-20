-- Trackam database schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    -- API key used by the WakaTime editor plugins (Basic auth).
    api_key       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS heartbeats (
    id           BIGSERIAL PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Epoch seconds (with fractional part) as sent by wakatime-cli.
    time         DOUBLE PRECISION NOT NULL,
    entity       TEXT,
    type         TEXT,
    category     TEXT,
    project      TEXT,
    branch       TEXT,
    language     TEXT,
    dependencies TEXT,
    lines        INTEGER,
    lineno       INTEGER,
    cursorpos    INTEGER,
    is_write     BOOLEAN,
    editor       TEXT,
    operating_system TEXT,
    machine      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups for a user's heartbeats within a time window.
CREATE INDEX IF NOT EXISTS idx_heartbeats_user_time
    ON heartbeats (user_id, time);

-- Avoid duplicate heartbeats if the CLI retries a bulk send.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_heartbeat
    ON heartbeats (user_id, time, entity, type);
