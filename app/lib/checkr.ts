import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Direct-account API, not the OAuth partner API (which uses client_secret).
export function checkrConfig() {
  if (process.env.PROVIDER_SCREENING_ENABLED !== "true") throw new Error("Screening disabled");
  const key = process.env.CHECKR_API_KEY;
  const base = new URL(process.env.CHECKR_API_BASE_URL || "https://api.checkr.com/v1/");
  const packageSlug = process.env.CHECKR_PACKAGE_SLUG;
  if (!key || !packageSlug || base.protocol !== "https:" || base.username || base.password || base.search || base.hash || !["api.checkr.com", "api.checkr-staging.com"].includes(base.hostname) || base.pathname.replace(/\/$/, "") !== "/v1") throw new Error("Invalid Checkr configuration");
  return { key, base: base.href.replace(/\/$/, "") + "/", packageSlug };
}

export async function checkrRequest(path: string, body?: Record<string, unknown>, idempotencyKey?: string) {
  const config = checkrConfig();
  const response = await fetch(new URL(path, config.base), {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Basic ${Buffer.from(config.key + ":").toString("base64")}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  // Never log/return Checkr error bodies or full reports: they can contain PII.
  if (!response.ok) throw new Error(`Checkr request failed (${response.status})`);
  return response.json();
}

export function authenticCheckrBody(raw: string, signature: string | null) {
  const { key } = checkrConfig();
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", key).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}


export function checkrReport(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid report ID");
  return checkrRequest(`reports/${encodeURIComponent(id)}?include=identity_verification`);
}
export function checkrIdentityStatus(identity: unknown): "pending" | "verified" | "unverified" {
  if (!identity || typeof identity !== "object") return "pending";
  const value = identity as { status?: string; result?: string; cancellation_reason?: string };
  if (value.cancellation_reason || ["canceled", "cancelled", "suspended"].includes(value.status || "")) return "unverified";
  if (["complete", "completed", "clear", "consider", "verified", "unverified"].includes(value.status || "")) {
    if (["clear", "verified"].includes(value.result || "")) return "verified";
    return "unverified";
  }
  return "pending";
}
