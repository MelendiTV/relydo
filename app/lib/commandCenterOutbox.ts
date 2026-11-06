import { createHmac } from "node:crypto";

export const operationalTypes = ["request.created", "request.status_changed", "request.stage_changed", "request.review_changed", "offer.created", "offer.status_changed"] as const;
export const operationalStatuses = ["open", "quoted", "assigned", "in_progress", "completed", "cancelled", "pending", "accepted", "rejected", "hired", "on_the_way", "arrived", "working", "approved", "unknown"] as const;
export type OperationalEvent = { version: 2; project: "hnflxuqxsyzwfhdylzpp" | "aictsnrpbabdlakxmnxg"; eventId: string; requestId: string;
  event: typeof operationalTypes[number]; status: typeof operationalStatuses[number]; occurredAt: string; sourceVersion: string };
export function eventGate(env = process.env, now = Date.now()) {
  const expires = Date.parse(env.RELYDO_MARKETPLACE_EVENTS_APPROVED_UNTIL ?? "");
  return env.RELYDO_MARKETPLACE_EVENTS_ENABLED === "true" && env.RELYDO_MARKETPLACE_EVENTS_APPROVED_PROJECT === "hnflxuqxsyzwfhdylzpp" &&
    env.NEXT_PUBLIC_SUPABASE_URL === "https://hnflxuqxsyzwfhdylzpp.supabase.co" &&
    (env.RELYDO_MARKETPLACE_EVENTS_APPROVAL === "persistent" || (expires > now && expires <= now + 86400000)) &&
    /^[a-f0-9]{64}$/.test(env.RELYDO_MARKETPLACE_EVENTS_SECRET ?? "");
}
type Row = {event_id: string; request_id: string; event_type: OperationalEvent["event"]; status: OperationalEvent["status"]; occurred_at: string; source_version: string; lease_token: string};
type RPC = (name: string, args?: Record<string, unknown>) => PromiseLike<{data: unknown; error: unknown}>;
export function testEventGate(env=process.env) {
  return env.RELYDO_TEST_EVENTS_ENABLED==="true" && env.RELYDO_TEST_PROJECT_REF==="aictsnrpbabdlakxmnxg" &&
    env.RELYDO_TEST_URL==="https://aictsnrpbabdlakxmnxg.supabase.co" && /^[a-f0-9]{64}$/.test(env.RELYDO_TEST_EVENTS_SECRET??"");
}
/** Only committed DB rows are publishable. Lease expiry recovers crashes; failed acknowledgements are retried with the same event ID. */
export async function drainOperationalOutbox(rpc: RPC, env = process.env, transport: typeof fetch = fetch, now = Date.now(), source:"marketplace"|"test"="marketplace") {
  const test=source==="test";
  if (!(test?testEventGate(env):eventGate(env, now))) return {disabled: true, delivered: 0, pending: 0};
  const target = new URL((test?env.RELYDO_TEST_COMMAND_CENTER_EVENTS_URL:env.RELYDO_COMMAND_CENTER_EVENTS_URL) ?? (test?"http://127.0.0.1:3106/api/integrations/marketplace/events":"http://127.0.0.1:3105/api/integrations/marketplace/events"));
  if (target.username || target.password || target.search || target.hash || target.pathname !== "/api/integrations/marketplace/events" ||
    !(target.protocol === "https:" || (target.protocol === "http:" && target.hostname === "127.0.0.1" && target.port === (test?"3106":"3105")))) throw Error("EVENT_TARGET_INVALID");
  // One bounded reconciliation before claiming; DB enforces a shared 30s quota.
  // Failure must not prevent delivery of events already committed to the outbox.
  let recovery: {status: "ok" | "skipped" | "failed"; recovered: number} = {status: "failed", recovered: 0};
  try {
    const result = await rpc("recover_director_events");
    const value = result.data as {status?: unknown; recovered?: unknown} | null;
    if (!result.error && value && (value.status === "ok" || value.status === "skipped") &&
      typeof value.recovered === "number" && Number.isInteger(value.recovered) && value.recovered >= 0 && value.recovered <= 100) {
      recovery = {status: value.status, recovered: value.recovered};
    }
  } catch { /* Fixed status only; never log DB errors, credentials or request data. */ }
  const claimed = await rpc("claim_director_events");
  if (claimed.error || !Array.isArray(claimed.data)) throw Error("OUTBOX_CLAIM_FAILED");
  let delivered = 0, pending = 0;
  for (const row of claimed.data as Row[]) {
    // Explicit projection: transport can never serialize other DB columns.
    const event: OperationalEvent = {version: 2, project: test?"aictsnrpbabdlakxmnxg":"hnflxuqxsyzwfhdylzpp", eventId: row.event_id, requestId: row.request_id,
      event: row.event_type, status: row.status, occurredAt: row.occurred_at, sourceVersion: row.source_version};
    const raw = JSON.stringify(event), stamp = String(Date.now());
    let accepted = false;
    try {
      const response = await transport(target.toString(), {method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000),
        headers: {"content-type": "application/json", "x-relydo-timestamp": stamp,...(test?{"x-relydo-project":"aictsnrpbabdlakxmnxg"}:{}),
          "x-relydo-signature": createHmac("sha256", (test?env.RELYDO_TEST_EVENTS_SECRET:env.RELYDO_MARKETPLACE_EVENTS_SECRET)!).update(stamp + "." + raw).digest("hex")}, body: raw});
      const receipt = response.ok ? await response.json() : null;
      accepted = receipt?.accepted === true && receipt?.eventId === event.eventId && receipt?.caseId === event.eventId && receipt?.modelCalls === 0;
    } catch { /* Keep durable row; retry uses the same immutable payload. */ }
    const ack = await rpc("ack_director_event", {p_event_id: row.event_id, p_lease_token: row.lease_token, p_accepted: accepted});
    if (ack.error || ack.data !== true) throw Error("OUTBOX_ACK_FAILED");
    if (accepted) delivered++; else pending++;
  }
  return {disabled: false, delivered, pending, recovery};
}
