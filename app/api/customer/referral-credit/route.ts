import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { getAuthenticatedUser } from "../../../lib/serverAuth";
import { reconcileReferralCheckouts, returnReferralCheckout, type ReferralCheckout } from "../../../lib/referralCheckout";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    await reconcileReferralCheckouts(db, stripe, auth.user.id);
    const { data, error } = await db.rpc("referral_credit_balance", { p_customer_id: auth.user.id });
    if (error) throw error;
    const requestId = request.nextUrl.searchParams.get("requestId");
    let checkoutEligible = true;
    if (requestId) {
      const job = await db.from("service_requests").select("id").eq("id", requestId).eq("customer_id", auth.user.id).maybeSingle();
      if (job.error || !job.data) return NextResponse.json({ error: "Request unavailable" }, { status: 404 });
      const reassignment = await db.from("payment_reassignments").select("id").eq("request_id", requestId).in("status", ["available", "pending_replacement"]).limit(1).maybeSingle();
      if (reassignment.error) throw reassignment.error;
      checkoutEligible = !reassignment.data;
    }
    return NextResponse.json({ availableCents: Number(data), currency: "USD", checkoutEligible }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No pudimos consultar tu crédito / Could not load your credit" }, { status: 503 });
  }
}
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { requestId } = await request.json();
    const { data, error } = await db.from("referral_credit_checkouts").select("*").eq("customer_id", auth.user.id).eq("request_id", requestId).eq("state", "reserved").maybeSingle();
    if (error) throw error;
    const returned = !data || await returnReferralCheckout(db, stripe, data as ReferralCheckout, true);
    return NextResponse.json({ returned }, { status: returned ? 200 : 409 });
  } catch {
    return NextResponse.json({ error: "Could not safely cancel checkout; retry required" }, { status: 503 });
  }
}
