import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUser } from "@/app/lib/serverAuth";
import { screeningDb, screeningColumns, revalidateScreeningPayment } from "@/app/lib/providerScreening";
import { checkrConfig, checkrRequest } from "@/app/lib/checkr";
import { hasAdminPermission, isAdminRole } from "@/app/lib/adminPermissions";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  if (process.env.PROVIDER_SCREENING_ENABLED !== "true") return NextResponse.json({ enabled: false, screening: null }, { headers: { "Cache-Control": "no-store" } });
  const db = screeningDb();
  const providerId = request.nextUrl.searchParams.get("providerId") || auth.user.id;
  if (providerId !== auth.user.id) {
    const { data, error } = await db.from("profiles").select("role,admin_role").eq("id", auth.user.id).single();
    if (error || data?.role !== "admin" || !isAdminRole(data.admin_role) || !hasAdminPermission(data.admin_role, "providers")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { data, error } = await db.from("provider_screenings").select("payment_status,amount,currency,invitation_status,background_status,identity_status,decision_state,updated_at").eq("provider_id", providerId).maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo consultar la verificación" }, { status: 503 });
  return NextResponse.json({ enabled: process.env.PROVIDER_SCREENING_ENABLED === "true", screening: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  try {
    const config = checkrConfig();
    const db = screeningDb();
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", auth.user.id).single();
    const { data: provider, error: providerError } = await db.from("provider_profiles").select("user_id,verification_status").eq("user_id", auth.user.id).single();
    if (profileError || providerError || profile?.role !== "provider" || !provider || provider.verification_status === "rejected") return NextResponse.json({ error: "Perfil profesional en proceso requerido" }, { status: 403 });
    const { action } = await request.json();
    if (action !== "pay" && action !== "start") return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    const amount = Number(process.env.PROVIDER_VERIFICATION_AMOUNT_CENTS);
    const currency = process.env.PROVIDER_VERIFICATION_CURRENCY || "usd";
    if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[a-z]{3}$/.test(currency)) throw new Error("Invalid fee");
    if (action === "pay") {
      const inserted = await db.from("provider_screenings").upsert({ provider_id: auth.user.id, amount, currency, package_slug: config.packageSlug }, { onConflict: "provider_id", ignoreDuplicates: true });
      if (inserted.error) throw new Error("Reservation failed");
    }
    const { data: row, error } = await db.from("provider_screenings").select(screeningColumns).eq("provider_id", auth.user.id).single();
    if (error || !row) return NextResponse.json({ error: "Primero confirma el pago" }, { status: 409 });
    if (action === "pay") {
      if (row.payment_status !== "unpaid") return NextResponse.json({ error: "Pago ya registrado; no repetir" }, { status: 409 });
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Test Stripe key required for skeleton");
      let session;
      if (row.stripe_session_id) session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
      else {
        // Reserve a durable retry window before any external side effect.
        const now = new Date().toISOString();
        if (!row.payment_started_at) {
          const reserved = await db.from("provider_screenings").update({ payment_started_at: now }).eq("id", row.id).is("payment_started_at", null).select("payment_started_at").maybeSingle();
          if (reserved.error || !reserved.data) return NextResponse.json({ error: "Pago en preparación; actualiza" }, { status: 409 });
          row.payment_started_at = now;
        }
        if (Date.now() - Date.parse(row.payment_started_at) > 23 * 3600000) return NextResponse.json({ error: "Requiere conciliación administrativa; no repetir cobro" }, { status: 409 });
        const origin = new URL(process.env.RELYDO_BASE_URL || "");
        if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Trusted origin required");
        const metadata = { payment_type: "provider_verification", screening_id: row.id, provider_id: auth.user.id };
        session = await stripe.checkout.sessions.create({ mode: "payment", payment_method_types: ["card"], client_reference_id: auth.user.id, metadata, payment_intent_data: { metadata }, line_items: [{ price_data: { currency: row.currency, unit_amount: row.amount, product_data: { name: "Verificación profesional RELYDO" } }, quantity: 1 }], success_url: `${origin.origin}/completar-verificacion?screening=returned`, cancel_url: `${origin.origin}/completar-verificacion?screening=cancelled` }, { idempotencyKey: `provider-verification:${row.id}` });
        const saved = await db.from("provider_screenings").update({ stripe_session_id: session.id }).eq("id", row.id);
        if (saved.error) throw new Error("Session persistence failed");
      }
      if (session.status !== "open" || !session.url) return NextResponse.json({ error: "Pago cerrado o pendiente de conciliación; no repetir" }, { status: 409 });
      return NextResponse.json({ url: session.url });
    }
    if (row.payment_status !== "paid" || !auth.user.email) return NextResponse.json({ error: "Pago confirmado requerido" }, { status: 409 });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Test Stripe key required");
    if (!(await revalidateScreeningPayment(stripe, row))) return NextResponse.json({ error: "Pago reembolsado, disputado o inválido" }, { status: 409 });
    if (row.checkr_invitation_id) return NextResponse.json({ success: true, message: "Revisa tu email para completar la invitación de Checkr" });
    if (!row.checkr_started_at) {
      const now = new Date().toISOString();
      const reservation = await db.from("provider_screenings").update({ checkr_started_at: now }).eq("id", row.id).is("checkr_started_at", null).select("checkr_started_at").maybeSingle();
      if (reservation.error || !reservation.data) return NextResponse.json({ error: "Invitación en preparación; actualiza" }, { status: 409 });
      row.checkr_started_at = now;
    }
    if (Date.now() - Date.parse(row.checkr_started_at) > 23 * 3600000) return NextResponse.json({ error: "Requiere conciliación Checkr; no repetir la orden" }, { status: 409 });
    if (!row.checkr_candidate_id) {
      const candidate = await checkrRequest("candidates", { email: auth.user.email }, row.candidate_key);
      if (typeof candidate.id !== "string") throw new Error("Invalid candidate");
      const saved = await db.from("provider_screenings").update({ checkr_candidate_id: candidate.id }).eq("id", row.id);
      if (saved.error) throw new Error("Candidate persistence failed");
      row.checkr_candidate_id = candidate.id;
    }
    if (!(await revalidateScreeningPayment(stripe, row))) return NextResponse.json({ error: "Pago inválido; no se iniciará Checkr" }, { status: 409 });
    const invitation = await checkrRequest("invitations", { candidate_id: row.checkr_candidate_id, package: row.package_slug }, row.invitation_key);
    if (typeof invitation.id !== "string") throw new Error("Invalid invitation");
    const saved = await db.from("provider_screenings").update({ checkr_invitation_id: invitation.id, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (saved.error) throw new Error("Invitation persistence failed");
    // Preserve webhook progress, including updates received during invitation creation.
    const initialized = await db.from("provider_screenings").update({ invitation_status: "pending" }).eq("id", row.id).is("invitation_status", null);
    if (initialized.error) throw new Error("Invitation status persistence failed");
    return NextResponse.json({ success: true, message: "Checkr enviará la invitación a tu email" });
  } catch {
    return NextResponse.json({ error: "Verificación no disponible; no repitas pagos. Actualiza o contacta soporte." }, { status: 503 });
  }
}
