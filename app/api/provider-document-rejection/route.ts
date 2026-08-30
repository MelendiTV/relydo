import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type NotificationLanguage = "es" | "en";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeLanguage(
  value: unknown
): NotificationLanguage {
  const raw =
    String(value || "")
      .trim()
      .toLowerCase();

  return raw.startsWith("en")
    ? "en"
    : "es";
}

function documentLabel(
  type: string | null,
  language: NotificationLanguage
) {
  if (language === "en") {
    if (type === "license") {
      return "professional/trade license";
    }

    if (type === "insurance") {
      return "proof of insurance";
    }

    if (type === "bond") {
      return "bond";
    }

    if (type === "other") {
      return "additional document";
    }

    return "document";
  }

  if (type === "license") {
    return "licencia profesional / del oficio";
  }

  if (type === "insurance") {
    return "comprobante de seguro";
  }

  if (type === "bond") {
    return "fianza / bond";
  }

  if (type === "other") {
    return "documento adicional";
  }

  return "documento";
}

async function sendRejectionEmail({
  to,
  businessName,
  documentName,
  rejectionReason,
  uploadUrl,
  language,
}: {
  to: string;
  businessName: string;
  documentName: string;
  rejectionReason: string;
  uploadUrl: string;
  language: NotificationLanguage;
}) {
  const apiKey =
    process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      sent: false,
      error:
        "RESEND_API_KEY no está configurada.",
    };
  }

  const from =
    process.env.RELYDO_EMAIL_FROM ||
    "RELYDO <notifications@relydo.co>";

  const safeBusiness =
    escapeHtml(businessName);

  const safeDocument =
    escapeHtml(documentName);

  const safeReason =
    escapeHtml(
      rejectionReason
    ).replaceAll(
      "\n",
      "<br />"
    );

  const copy =
    language === "en"
      ? {
          subject:
            `RELYDO: ${documentName} was rejected`,
          title:
            "Document rejected",
          hello:
            "Hello",
          intro:
            "Our verification team reviewed this document and could not approve it. Please correct the issue below and upload a new copy.",
          document:
            "Rejected document",
          reason:
            "Reason for rejection",
          button:
            "Upload corrected document",
          security:
            "For security, you will need to sign in with your professional account. Your verification will remain pending until the corrected document is reviewed.",
        }
      : {
          subject:
            `RELYDO: ${documentName} fue rechazado`,
          title:
            "Documento rechazado",
          hello:
            "Hola",
          intro:
            "Nuestro equipo de verificación revisó este documento y no pudo aprobarlo. Corrige el problema indicado a continuación y sube una nueva copia.",
          document:
            "Documento rechazado",
          reason:
            "Motivo del rechazo",
          button:
            "Subir documento corregido",
          security:
            "Por seguridad tendrás que iniciar sesión con tu cuenta profesional. Tu verificación continuará pendiente hasta que revisemos el documento corregido.",
        };

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${apiKey}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject:
            copy.subject,
          html: `
            <div style="margin:0;background:#f1f5f9;padding:32px;font-family:Arial,sans-serif;color:#0f172a">
              <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #fecaca">
                <div style="background:#b91c1c;padding:28px 32px;color:white">
                  <div style="font-size:24px;font-weight:800">RELYDO</div>
                  <div style="font-size:28px;font-weight:800;margin-top:8px">${copy.title}</div>
                </div>

                <div style="padding:32px">
                  <p style="font-size:16px;line-height:1.7;margin-top:0">
                    ${copy.hello} ${safeBusiness},
                  </p>

                  <p style="font-size:16px;line-height:1.7">
                    ${copy.intro}
                  </p>

                  <div style="margin:24px 0;padding:18px;border-radius:14px;background:#fef2f2;border:1px solid #fecaca">
                    <div style="font-weight:800;margin-bottom:8px">${copy.document}</div>
                    <div>${safeDocument}</div>

                    <div style="font-weight:800;margin:18px 0 8px">${copy.reason}</div>
                    <div style="line-height:1.6">${safeReason}</div>
                  </div>

                  <a href="${uploadUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:12px">
                    ${copy.button}
                  </a>

                  <p style="font-size:13px;line-height:1.6;color:#64748b;margin-top:24px">
                    ${copy.security}
                  </p>
                </div>
              </div>
            </div>
          `,
        }),
      }
    );

  const body =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (!response.ok) {
    return {
      sent: false,
      error:
        body?.message ||
        body?.error ||
        "Resend rechazó el envío.",
    };
  }

  return {
    sent: true,
    id:
      body?.id ||
      null,
  };
}

export async function POST(
  request: NextRequest
) {
  try {
    const authHeader =
      request.headers.get(
        "authorization"
      );

    const token =
      authHeader?.startsWith(
        "Bearer "
      )
        ? authHeader.slice(7)
        : "";

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Sesión de administrador no disponible.",
        },
        {
          status: 401,
        }
      );
    }

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (
      !supabaseUrl ||
      !supabaseKey
    ) {
      return NextResponse.json(
        {
          error:
            "Falta la configuración de Supabase.",
        },
        {
          status: 500,
        }
      );
    }

    const supabase =
      createClient(
        supabaseUrl,
        supabaseKey,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          },
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        }
      );

    const {
      data: {
        user,
      },
      error:
        userError,
    } =
      await supabase.auth
        .getUser(token);

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "No se pudo validar la sesión.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data:
        adminProfile,
      error:
        adminError,
    } =
      await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();

    if (
      adminError ||
      adminProfile?.role !==
        "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta acción requiere permisos de administrador.",
        },
        {
          status: 403,
        }
      );
    }

    const payload =
      await request.json();

    const providerId =
      String(
        payload?.providerId ||
          ""
      ).trim();

    const documentType =
      String(
        payload?.documentType ||
          ""
      ).trim();

    const rejectionReason =
      String(
        payload?.rejectionReason ||
          ""
      ).trim();

    if (!providerId) {
      return NextResponse.json(
        {
          error:
            "Falta el ID del profesional.",
        },
        {
          status: 400,
        }
      );
    }

    if (!rejectionReason) {
      return NextResponse.json(
        {
          error:
            "Falta el motivo del rechazo.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data:
        providerProfile,
    } =
      await supabase
        .from(
          "provider_profiles"
        )
        .select(`
          user_id,
          business_name
        `)
        .eq(
          "user_id",
          providerId
        )
        .maybeSingle();

    const {
      data:
        contactProfile,
      error:
        contactError,
    } =
      await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          email,
          preferred_language
        `)
        .eq(
          "id",
          providerId
        )
        .maybeSingle();

    if (contactError) {
      return NextResponse.json(
        {
          error:
            `No se pudo leer el contacto del profesional: ${contactError.message}`,
        },
        {
          status: 500,
        }
      );
    }

    const email =
      String(
        contactProfile?.email ||
          ""
      ).trim();

    if (!email) {
      return NextResponse.json(
        {
          error:
            "El profesional no tiene correo registrado.",
        },
        {
          status: 400,
        }
      );
    }

    const businessName =
      providerProfile
        ?.business_name ||
      contactProfile
        ?.full_name ||
      "profesional";

    const language =
      normalizeLanguage(
        contactProfile
          ?.preferred_language
      );

    const siteUrl =
      (
        process.env
          .NEXT_PUBLIC_SITE_URL ||
        "https://www.relydo.co"
      ).replace(/\/+$/, "");

    const uploadUrl =
      `${siteUrl}/login-profesional?documentos=1`;

    const documentName =
      documentLabel(
        documentType ||
          null,
        language
      );

    const emailResult =
      await sendRejectionEmail({
        to:
          email,
        businessName,
        documentName,
        rejectionReason,
        uploadUrl,
        language,
      });

    if (!emailResult.sent) {
      return NextResponse.json(
        {
          error:
            emailResult.error ||
            "No se pudo enviar el correo de rechazo.",
          email:
            emailResult,
        },
        {
          status: 502,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      providerId,
      email:
        emailResult,
      destination: {
        email,
      },
      uploadUrl,
    });
  } catch (error) {
    console.error(
      "provider-document-rejection error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof
          Error
            ? error.message
            : "No se pudo enviar la notificación de rechazo.",
      },
      {
        status: 500,
      }
    );
  }
}
