import { NextRequest, NextResponse } from "next/server";
import { authenticCheckrBody, checkrRequest, checkrReport, checkrIdentityStatus } from "@/app/lib/checkr";
import { screeningDb } from "@/app/lib/providerScreening";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (!authenticCheckrBody(raw, request.headers.get("x-checkr-signature"))) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    const event = JSON.parse(raw);
    const object = event.data?.object;
    if (typeof event.id !== "string" || typeof event.type !== "string" || !Number.isFinite(Date.parse(event.created_at)) || !object) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    if (!event.type.startsWith("report.") && !event.type.startsWith("invitation.")) return NextResponse.json({ received: true });
    const db = screeningDb();
    const invitationEvent = event.type.startsWith("invitation.");
    if (typeof object.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(object.id)) return NextResponse.json({ error: "Invalid object" }, { status: 400 });
    const current = invitationEvent ? await checkrRequest(`invitations/${encodeURIComponent(object.id)}`) : await checkrReport(object.id);
    const { data: row, error } = await db.from("provider_screenings").select("id,checkr_candidate_id,checkr_report_id,checkr_invitation_id,payment_status").eq("checkr_candidate_id", current.candidate_id).maybeSingle();
    if (error) throw new Error("Lookup failed");
    if (!row) return NextResponse.json({ error: "Candidate not reconciled" }, { status: 503 });
    if (row.payment_status !== "paid" || (invitationEvent && row.checkr_invitation_id && row.checkr_invitation_id !== current.id) || (!invitationEvent && row.checkr_report_id && row.checkr_report_id !== current.id)) return NextResponse.json({ error: "Object mismatch" }, { status: 409 });
    const reportId = invitationEvent ? (current.report_id || row.checkr_report_id) : current.id;
    let report = invitationEvent ? null : current;
    if (reportId && !report) report = await checkrReport(reportId);
    if (report && (report.candidate_id !== row.checkr_candidate_id || report.id !== reportId)) throw new Error("Report mismatch");
    const background = report ? (report.status === "complete" && !report.cancellation_reason && !report.includes_canceled && ["clear", "consider"].includes(report.result) ? report.result : "pending") : null;
    const identity = report?.identity_verification;
    const identityStatus = report ? checkrIdentityStatus(identity) : null;
    const result = await db.rpc("apply_provider_screening_event", { p_id: row.id, p_event: event.id, p_type: event.type, p_at: event.created_at, p_report: reportId || null, p_invitation_status: invitationEvent ? String(current.status) : null, p_background: background, p_identity: identityStatus });
    if (result.error) throw new Error("Projection failed");
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed; retry required" }, { status: 503 });
  }
}
