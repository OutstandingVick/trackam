import { config } from "../config.js";

export interface DurationHeartbeat {
  time: number; // epoch seconds
  project: string | null;
  language: string | null;
  editor: string | null;
  operating_system: string | null;
}

export interface Breakdown {
  name: string;
  total_seconds: number;
}

export interface DurationResult {
  total_seconds: number;
  projects: Breakdown[];
  languages: Breakdown[];
  editors: Breakdown[];
  operating_systems: Breakdown[];
}

function toSortedList(map: Map<string, number>): Breakdown[] {
  return [...map.entries()]
    .map(([name, total_seconds]) => ({ name, total_seconds }))
    .sort((a, b) => b.total_seconds - a.total_seconds);
}

/**
 * Compute total coding time (and per-category breakdowns) from a set of
 * heartbeats using WakaTime's approach: sum the gaps between consecutive
 * heartbeats, but treat any gap larger than the timeout as a break between
 * coding sessions (so idle time is not counted).
 *
 * Each interval's duration is attributed to the category of the heartbeat
 * that starts it.
 */
export function computeDuration(
  heartbeats: DurationHeartbeat[],
  timeoutSeconds = config.heartbeatTimeoutSeconds
): DurationResult {
  const sorted = [...heartbeats].sort((a, b) => a.time - b.time);

  let total = 0;
  const projects = new Map<string, number>();
  const languages = new Map<string, number>();
  const editors = new Map<string, number>();
  const operatingSystems = new Map<string, number>();

  const add = (map: Map<string, number>, key: string | null, secs: number) => {
    const name = key && key.trim() ? key : "Unknown";
    map.set(name, (map.get(name) ?? 0) + secs);
  };

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const delta = sorted[i].time - prev.time;
    if (delta > 0 && delta < timeoutSeconds) {
      total += delta;
      add(projects, prev.project, delta);
      add(languages, prev.language, delta);
      add(editors, prev.editor, delta);
      add(operatingSystems, prev.operating_system, delta);
    }
  }

  return {
    total_seconds: Math.round(total),
    projects: toSortedList(projects),
    languages: toSortedList(languages),
    editors: toSortedList(editors),
    operating_systems: toSortedList(operatingSystems),
  };
}

export function humanReadable(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} hrs ${minutes} mins`;
  return `${minutes} mins`;
}
