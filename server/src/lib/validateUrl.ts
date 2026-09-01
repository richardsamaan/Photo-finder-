import net from "node:net";
import dns from "node:dns/promises";

const PRIVATE_HOSTNAMES = new Set(["localhost", "0.0.0.0"]);

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
  }
  return false;
}

/**
 * Validate that a user/scraped-supplied URL is a well-formed http(s) URL and
 * does not resolve to a private/loopback/link-local address, to prevent
 * server-side request forgery via image download or page fetch.
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed.");
  }
  const hostname = url.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(hostname)) {
    throw new Error("URL host is not allowed.");
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error("URL resolves to a private network address.");
  }
  if (!net.isIP(hostname)) {
    try {
      const records = await dns.lookup(hostname, { all: true });
      if (records.some((r) => isPrivateIp(r.address))) {
        throw new Error("URL resolves to a private network address.");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("private network")) throw err;
      // DNS lookup failure - let the fetch itself fail naturally later.
    }
  }
  return url;
}
