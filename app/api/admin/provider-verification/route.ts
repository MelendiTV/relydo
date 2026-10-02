import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  hasAdminPermission,
  isAdminRole,
} from "../../../lib/adminPermissions";
import { getProviderRequirements } from "../../../lib/providerRequirements";
import { sendRelydoNotification } from "../../../lib/serverNotifications";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

type VerificationStatus = "verified" | "rejected";

type ProviderRow = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
  state: string | null;
  license_required: boolean | null;
  insured: boolean | null;
  bonded: boolean | null;
  license_expiration: string | null;
  insurance_expiration: string | null;
};

type ProviderDocumentRow = {
  id: string;
  document_type: string | null;
  status: string | null;
  expiration_date: string | null;
  created_at: string | null;
};

type ProviderDocumentRequestRow = {
  id: string;
  status: string | null;
};

function fechaDocumentoVencida(
  fecha: string | null | undefined
) {
  const valor = String(fecha || "").trim();

  if (!valor) {
    return false;
  }

  const fechaObj =
    /^\d{4}-\d{2}-\d{2}$/.test(valor)
      ? new Date(`${valor}T23:59:59.999`)
      : new Date(valor);

  if (Number.isNaN(fechaObj.getTime())) {
    return false;
  }

  return fechaObj.getTime() < Date.now();
}

function vencimientoDocumentoBase(
  doc: ProviderDocumentRow,
  provider: ProviderRow
) {
  if (doc.expiration_date) {
    return doc.expiration_date;
  }

  if (doc.document_type === "license") {
    return provider.license_expiration;
  }

  if (doc.document_type === "insurance") {
    return provider.insurance_expiration;
  }

  return null;
}

function documentoAprobadoYVigente(
  doc: ProviderDocumentRow,
  provider: ProviderRow
) {
  if (doc.status !== "approved") {
    return false;
  }

  const vencimiento =
    vencimientoDocumentoBase(doc, provider);

  return !fechaDocumentoVencida(vencimiento);
}

function tieneDocumentoAprobadoYVigente(
  documentos: ProviderDocumentRow[],
  provider: ProviderRow,
  tipo: "license" | "insurance" | "bond"
) {
  return documentos.some(
    (doc) =>
      doc.document_type === tipo &&
      documentoAprobadoYVigente(doc, provider)
  );
}

export async function POST(request: NextRequest) {
  try {
    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No estás autenticado." },
        { status: 401 }
      );
    }

    const accessToken = authorization
      .slice("Bearer ".length)
      .trim();

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "No pudimos verificar tu sesión." },
        { status: 401 }
      );
    }

    const {
      data: adminProfile,
      error: adminError,
    } = await supabaseAdmin
      .from("profiles")
      .select("role, admin_role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      adminError ||
      !adminProfile ||
      adminProfile.role !== "admin" ||
      !isAdminRole(adminProfile.admin_role) ||
      !hasAdminPermission(
        adminProfile.admin_role,
        "providers"
      )
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permiso para revisar profesionales.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const providerId = String(
      body?.providerId || ""
    ).trim();

    const status = String(
      body?.status || ""
    ).trim() as VerificationStatus;

    const reason = String(
      body?.reason || ""
    ).trim();

    if (
      !providerId ||
      (status !== "verified" &&
        status !== "rejected")
    ) {
      return NextResponse.json(
        {
          error:
            "La decisión de verificación no es válida.",
        },
        { status: 400 }
      );
    }

    if (
      status === "rejected" &&
      reason.length < 5
    ) {
      return NextResponse.json(
        {
          error:
            "Escribe una razón de rechazo clara antes de continuar.",
        },
        { status: 400 }
      );
    }

    const {
      data: providerData,
      error: providerError,
    } = await supabaseAdmin
      .from("provider_profiles")
     .select(`
  user_id,
  business_name,
  trade,
  state,
  license_required,
  insured,
  bonded,
  license_expiration,
  insurance_expiration
`)
      .eq("user_id", providerId)
      .maybeSingle();

    if (providerError || !providerData) {
      return NextResponse.json(
        {
          error:
            "No encontramos este profesional.",
        },
        { status: 404 }
      );
    }

    const provider: ProviderRow = {
  user_id: providerData.user_id,
  business_name: providerData.business_name,
  trade: providerData.trade,
  state: providerData.state,
  license_required: providerData.license_required,
  insured: providerData.insured,
  bonded: providerData.bonded,
  license_expiration: providerData.license_expiration,
  insurance_expiration: providerData.insurance_expiration,
};


    /*
      SERVER-SIDE APPROVAL GATE

      Repite en el servidor las condiciones críticas
      que usa Admin antes de permitir "verified".
    */
    if (status === "verified") {
      const requisitos =
        getProviderRequirements({
          trade: provider.trade,
          state: provider.state,
          declaredLicenseRequired:
            provider.license_required,
          declaredInsured:
            provider.insured,
          declaredBonded:
            provider.bonded,
        });

      if (
        requisitos.manualReview === true &&
        adminProfile.admin_role !== "super_admin"
      ) {
        return NextResponse.json(
          {
            error:
              "Este oficio requiere revisión manual. Solo el Super Admin puede aprobar manualmente este expediente después de revisar sus requisitos.",
          },
          { status: 403 }
        );
      }

      const [
        documentosResult,
        solicitudesResult,
      ] = await Promise.all([
        supabaseAdmin
          .from("provider_documents")
          .select(
            "id, document_type, status, expiration_date, created_at"
          )
          .eq("user_id", providerId),

        supabaseAdmin
          .from("provider_document_requests")
          .select("id, status")
          .eq("user_id", providerId),
      ]);

      if (documentosResult.error) {
        return NextResponse.json(
          {
            error:
              "No pudimos validar los documentos del profesional.",
          },
          { status: 500 }
        );
      }

      if (solicitudesResult.error) {
        return NextResponse.json(
          {
            error:
              "No pudimos validar las solicitudes de documentación del profesional.",
          },
          { status: 500 }
        );
      }

      const documentos =
        (documentosResult.data ||
          []) as ProviderDocumentRow[];

      const solicitudes =
        (solicitudesResult.data ||
          []) as ProviderDocumentRequestRow[];

      const requeridos: Array<
        "license" | "insurance" | "bond"
      > = [];

      if (
        requisitos.effectiveLicenseRequired
      ) {
        requeridos.push("license");
      }

      if (
        requisitos.effectiveInsuranceRequired
      ) {
        requeridos.push("insurance");
      }

      if (
        requisitos.effectiveBondRequired
      ) {
        requeridos.push("bond");
      }

      const requeridosFaltantes =
        requeridos.filter(
          (tipo) =>
            !tieneDocumentoAprobadoYVigente(
              documentos,
              provider,
              tipo
            )
        );

      if (requeridosFaltantes.length > 0) {
        return NextResponse.json(
          {
            error:
              `Faltan documentos obligatorios aprobados: ${requeridosFaltantes.join(
                ", "
              )}.`,
          },
          { status: 409 }
        );
      }

      const documentosPendientes =
        documentos.filter(
          (doc) =>
            doc.status === "pending" ||
            doc.status === "submitted"
        );

      if (documentosPendientes.length > 0) {
        return NextResponse.json(
          {
            error:
              "Todavía hay documentos pendientes de revisión. Apruébalos o recházalos antes de aprobar al profesional.",
          },
          { status: 409 }
        );
      }

      const solicitudesAbiertas =
        solicitudes.filter(
          (solicitud) =>
            solicitud.status === "pending" ||
            solicitud.status === "submitted"
        );

      if (solicitudesAbiertas.length > 0) {
        return NextResponse.json(
          {
            error:
              "Todavía hay solicitudes de documentación abiertas. Complétalas antes de aprobar al profesional.",
          },
          { status: 409 }
        );
      }
    }

    const verified =
      status === "verified";

    const { error: updateError } =
      await supabaseAdmin
        .from("provider_profiles")
        .update({
          verification_status: status,
          verified,
          active: verified,
        })
        .eq("user_id", providerId);

    if (updateError) {
      return NextResponse.json(
        {
          error:
            `No se pudo actualizar el profesional: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    if (verified) {
      await sendRelydoNotification({
        userId: providerId,
        type: "provider_verification_approved",
        title:
          "✅ Cuenta profesional aprobada",
        message:
          "Tu cuenta profesional fue aprobada. Ya puedes acceder a las oportunidades disponibles en RELYDO.",
        titleEn:
          "✅ Professional account approved",
        messageEn:
          "Your professional account was approved. You can now access available opportunities on RELYDO.",
        url: "/login-profesional",
      });
    } else {
      await sendRelydoNotification({
        userId: providerId,
        type: "provider_verification_rejected",
        title:
          "⚠️ Verificación profesional no aprobada",
        message: `Razón: ${reason}`,
        titleEn:
          "⚠️ Professional verification not approved",
        messageEn: `Reason: ${reason}`,
        url: "/login-profesional",
      });
    }

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error(
      "Error actualizando verificación profesional:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error actualizando la verificación.",
      },
      { status: 500 }
    );
  }
}