import { fetchWithTimeout } from "../lib/httpFetch.js";

// Minimal robots.txt parser: checks whether our user-agent (or "*") disallows
// a given path. Cached per-origin for the life of the process to avoid
// refetching robots.txt on every single page request.

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

const cache = new Map<string, Promise<RobotsRules | null>>();

async function loadRobots(origin: string): Promise<RobotsRules | null> {
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, {}, 5000);
    if (!res.ok) return { disallow: [], allow: [] }; // no robots.txt = allow
    const text = await res.text();
    return parseRobots(text);
  } catch {
    // If robots.txt is unreachable, err on the side of caution but don't block
    // entirely - treat as no explicit rules.
    return { disallow: [], allow: [] };
  }
}

function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  let applies = false;
  const disallow: string[] = [];
  const allow: string[] = [];

  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      applies = value === "*" || value.toLowerCase().includes("productimagefinderbot");
    } else if (applies && key === "disallow" && value) {
      disallow.push(value);
    } else if (applies && key === "allow" && value) {
      allow.push(value);
    }
  }
  return { disallow, allow };
}

export async function isAllowedByRobots(targetUrl: string): Promise<boolean> {
  try {
    const u = new URL(targetUrl);
    const origin = u.origin;
    if (!cache.has(origin)) cache.set(origin, loadRobots(origin));
    const rules = await cache.get(origin);
    if (!rules) return true;

    const path = u.pathname + u.search;
    const matchingDisallow = rules.disallow
      .filter((p) => path.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    const matchingAllow = rules.allow
      .filter((p) => path.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];

    if (!matchingDisallow) return true;
    if (matchingAllow && matchingAllow.length >= matchingDisallow.length) return true;
    return false;
  } catch {
    return true;
  }
}
