// Best-effort parsing of the User-Agent string sent by wakatime-cli, e.g.
//   "wakatime/v1.73.0 (darwin-24.0.0-arm64) go1.22.0 vscode/1.90.0 vscode-wakatime/24.4.0"
// We extract the editor name and a coarse operating system.

export interface ParsedAgent {
  editor: string | null;
  operatingSystem: string | null;
}

const OS_MAP: Record<string, string> = {
  darwin: "macOS",
  win: "Windows",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
};

export function parseUserAgent(ua: string | undefined): ParsedAgent {
  if (!ua) return { editor: null, operatingSystem: null };

  let operatingSystem: string | null = null;
  const osMatch = ua.match(/\(([^)]+)\)/);
  if (osMatch) {
    const osToken = osMatch[1].split("-")[0].toLowerCase();
    operatingSystem = OS_MAP[osToken] ?? osToken;
  }

  // Editor is usually the token right before "-wakatime/..".
  let editor: string | null = null;
  const editorMatch = ua.match(/([a-zA-Z0-9._-]+)-wakatime\//);
  if (editorMatch) {
    editor = editorMatch[1];
  } else {
    // Fall back to the last "name/version" token that isn't wakatime/go.
    const tokens = ua.split(/\s+/).filter(Boolean);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const [name] = tokens[i].split("/");
      if (name && !/^(wakatime|go\d|go)/i.test(name) && tokens[i].includes("/")) {
        editor = name;
        break;
      }
    }
  }

  return { editor, operatingSystem };
}
