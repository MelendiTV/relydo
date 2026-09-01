import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRelydoNotification } from "../../../lib/serverNotifications";
import { isAdminRole } from "../../../lib/adminPermissions";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type VerificationStatus = "verified" | "rejected";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No estás autenticado." }, { status: 401 });
    }

    const accessToken = authorization.slice("Bearer ".length).trim();
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "No pudimos verificar tu sesión." }, { status: 401 });
    }

    const { data: adminProfile, error: adminError } = await supabaseAdmin
      .from("profiles")
      .select("role, admin_role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      adminError ||
      !adminProfile ||
      adminProfile.role !== "admin" ||
      !isAdminRole(adminProfile.admin_role)
    ) {
      return NextResponse.json({ error: "No tienes permiso para revisar profesionales." }, { status: 403 });
    }

    const body = await request.json();
    const providerId = String(body?.providerId || "").trim();
    const status = String(body?.status || "").trim() as VerificationStatus;
    const reason = String(body?.reason || "").trim();

    if (!providerId || (status !== "verified" && status !== "rejected")) {
      return NextResponse.json({ error: "La decisión de verificación no es válida." }, { status: 400 });
    }

    if (status === "rejected" && reason.length < 5) {
      return NextResponse.json(
        { error: "Escribe una razón de rechazo clara antes de continuar." },
        { status: 400 }
      );
    }

    const { data: provider, error: providerError } = await supabaseAdmin
      .from("provider_profiles")
      .select("user_id, business_name")
      .eq("user_id", providerId)
      .maybeSingle();

    if (providerError || !provider) {
      return NextResponse.json({ error: "No encontramos este profesional." }, { status: 404 });
    }

    const verified = status === "verified";
    const { error: updateError } = await supabaseAdmin
      .from("provider_profiles")
      .update({
        verification_status: status,
        verified,
        active: verified,
      })
      .eq("user_id", providerId);

    if (updateError) {
      return NextResponse.json(
        { error: `No se pudo actualizar el profesional: ${updateError.message}` },
        { status: 500 }
      );
    }

    if (verified) {
      await sendRelydoNotification({
        userId: providerId,
        type: "provider_verification_approved",
        title: "✅ Cuenta profesional aprobada",
        message: "Tu cuenta profesional fue aprobada. Ya puedes acceder a las oportunidades disponibles en RELYDO.",
        titleEn: "✅ Professional account approved",
        messageEn: "Your professional account was approved. You can now access available opportunities on RELYDO.",
        url: "/login-profesional",
      });
    } else {
      await sendRelydoNotification({
        userId: providerId,
        type: "provider_verification_rejected",
        title: "⚠️ Verificación profesional no aprobada",
        message: `Razón: ${reason}`,
        titleEn: "⚠️ Professional verification not approved",
        messageEn: `Reason: ${reason}`,
        url: "/login-profesional",
      });
    }

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("Error actualizando verificación profesional:", error);
    return NextResponse.json({ error: "Ocurrió un error actualizando la verificación." }, { status: 500 });
  }
}
