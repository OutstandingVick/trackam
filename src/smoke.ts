import assert from "node:assert";
import { computeDuration } from "./utils/duration.js";
import { parseUserAgent } from "./utils/useragent.js";

// --- duration: a continuous session ---
// heartbeats every 2 min for 10 min = 5 gaps of 120s = 600s total.
const base = 1_700_000_000;
const cont = [0, 120, 240, 360, 480, 600].map((o) => ({
  time: base + o,
  project: "trackam",
  language: "TypeScript",
  editor: "vscode",
  operating_system: "macOS",
}));
const r1 = computeDuration(cont, 900);
assert.strictEqual(r1.total_seconds, 600, "continuous total should be 600s");
assert.strictEqual(r1.projects[0].name, "trackam");
assert.strictEqual(r1.projects[0].total_seconds, 600);

// --- duration: a long idle gap should break the session ---
const withGap = [
  { time: base, project: "a", language: "Go", editor: "vim", operating_system: "Linux" },
  { time: base + 120, project: "a", language: "Go", editor: "vim", operating_system: "Linux" },
  // 1 hour idle gap (> 900s timeout) -> not counted
  { time: base + 120 + 3600, project: "a", language: "Go", editor: "vim", operating_system: "Linux" },
  { time: base + 120 + 3600 + 120, project: "a", language: "Go", editor: "vim", operating_system: "Linux" },
];
const r2 = computeDuration(withGap, 900);
assert.strictEqual(r2.total_seconds, 240, "gap should split sessions -> 240s");

// --- duration: split across two projects ---
const r3 = computeDuration(
  [
    { time: base, project: "x", language: "JS", editor: "vscode", operating_system: "macOS" },
    { time: base + 100, project: "y", language: "JS", editor: "vscode", operating_system: "macOS" },
    { time: base + 200, project: "y", language: "JS", editor: "vscode", operating_system: "macOS" },
  ],
  900
);
// interval 1 (100s) -> x, interval 2 (100s) -> y
assert.strictEqual(r3.total_seconds, 200);
const x = r3.projects.find((p) => p.name === "x")!;
const y = r3.projects.find((p) => p.name === "y")!;
assert.strictEqual(x.total_seconds, 100);
assert.strictEqual(y.total_seconds, 100);

// --- user agent parsing ---
const ua1 = parseUserAgent(
  "wakatime/v1.73.0 (darwin-24.0.0-arm64) go1.22.0 vscode/1.90.0 vscode-wakatime/24.4.0"
);
assert.strictEqual(ua1.editor, "vscode");
assert.strictEqual(ua1.operatingSystem, "macOS");

const ua2 = parseUserAgent(
  "wakatime/v1.70.0 (linux-6.5.0-generic-x86_64) go1.21 nvim/0.10 vim-wakatime/11.0.0"
);
assert.strictEqual(ua2.editor, "vim");
assert.strictEqual(ua2.operatingSystem, "Linux");

console.log("All smoke checks passed ✅");
