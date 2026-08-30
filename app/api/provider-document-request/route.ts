import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePhone(value: string | null | undefined) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  if (raw.startsWith("+")) {
    return `+${raw.slice(1).replace(/\D/g, "")}`;
  }

  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return raw;
}

type NotificationLanguage = "es" | "en";

function normalizeLanguage(value: unknown): NotificationLanguage {
  const raw = String(value || "").trim().toLowerCase();
  return raw.startsWith("en") ? "en" : "es";
}

async function sendResendEmail({
  to,
  businessName,
  documentName,
  message,
  uploadUrl,
  language,
  notificationType = "request",
}: {
  to: string;
  businessName: string;
  documentName: string;
  message: string;
  uploadUrl: string;
  language: NotificationLanguage;
  notificationType?: "request" | "rejection";
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      sent: false,
      error: "RESEND_API_KEY no está configurada.",
    };
  }

  const from =
    process.env.RELYDO_EMAIL_FROM ||
    "RELYDO <notifications@relydo.co>";

  const safeBusiness =
    escapeHtml(businessName);

  const safeDocument =
    escapeHtml(documentName);

  const safeMessage =
    escapeHtml(message).replaceAll("\n", "<br />");

  const isRejection =
    notificationType === "rejection";

  const copy =
    language === "en"
      ? isRejection
        ? {
            subject: `RELYDO: ${documentName} was rejected`,
            title: "Document rejected",
            hello: "Hello",
            intro:
              "Our verification team reviewed this document and could not approve it. Please correct the issue below and upload a new copy.",
            requestedDocument: "Rejected document",
            relydoMessage: "Reason for rejection",
            uploadDocument: "Upload corrected document",
            security:
              "For security, you will need to sign in with your professional account. Your verification will remain pending until the corrected document is reviewed.",
          }
        : {
            subject: "RELYDO needs additional documentation",
            title: "Documentation required",
            hello: "Hello",
            intro:
              "Our team needs additional documentation to complete the verification of your professional account.",
            requestedDocument: "Requested document",
            relydoMessage: "Message from RELYDO",
            uploadDocument: "Upload document",
            security:
              "For security, you will need to sign in with your professional account. While your account remains under review, you can view and upload the requested documentation.",
          }
      : isRejection
        ? {
            subject: `RELYDO: ${documentName} fue rechazado`,
            title: "Documento rechazado",
            hello: "Hola",
            intro:
              "Nuestro equipo de verificación revisó este documento y no pudo aprobarlo. Corrige el problema indicado a continuación y sube una nueva copia.",
            requestedDocument: "Documento rechazado",
            relydoMessage: "Motivo del rechazo",
            uploadDocument: "Subir documento corregido",
            security:
              "Por seguridad tendrás que iniciar sesión con tu cuenta profesional. Tu verificación continuará pendiente hasta que revisemos el documento corregido.",
          }
        : {
            subject: "RELYDO necesita documentación adicional",
            title: "Documentación requerida",
            hello: "Hola",
            intro:
              "Nuestro equipo necesita documentación adicional para completar la verificación de tu cuenta profesional.",
            requestedDocument: "Documento solicitado",
            relydoMessage: "Mensaje de RELYDO",
            uploadDocument: "Subir documento",
            security:
              "Por seguridad tendrás que iniciar sesión con tu cuenta profesional. Aunque tu cuenta continúe en revisión, podrás ver y subir la documentación solicitada.",
          };

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: copy.subject,
        html: `
          <div style="margin:0;background:#f1f5f9;padding:32px;font-family:Arial,sans-serif;color:#0f172a">
            <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbeafe">
              <div style="background:#1d4ed8;padding:28px 32px;color:white">
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

                <div style="margin:24px 0;padding:18px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0">
                  <div style="font-weight:800;margin-bottom:8px">${copy.requestedDocument}</div>
                  <div>${safeDocument}</div>

                  <div style="font-weight:800;margin:18px 0 8px">${copy.relydoMessage}</div>
                  <div style="line-height:1.6">${safeMessage}</div>
                </div>

                <a href="${uploadUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:12px">
                  ${copy.uploadDocument}
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
    await response.json().catch(() => ({}));

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
    id: body?.id || null,
  };
}

async function sendTwilioSms({
  to,
  documentName,
  uploadUrl,
  language,
}: {
  to: string;
  documentName: string;
  uploadUrl: string;
  language: NotificationLanguage;
}) {
  const accountSid =
    process.env.TWILIO_ACCOUNT_SID;

  const authToken =
    process.env.TWILIO_AUTH_TOKEN;

  const from =
    process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    return {
      sent: false,
      error:
        "Twilio no está configurado en las variables de entorno.",
    };
  }

  const normalized =
    normalizePhone(to);

  if (!normalized) {
    return {
      sent: false,
      error:
        "El profesional no tiene un teléfono válido.",
    };
  }

  const body = new URLSearchParams({
    To: normalized,
    From: from,
    Body:
      language === "en"
        ? `RELYDO: we need ${documentName} to complete your verification. Sign in and upload it here: ${uploadUrl}`
        : `RELYDO: necesitamos ${documentName} para completar tu verificación. Inicia sesión y súbelo aquí: ${uploadUrl}`,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Basic ${Buffer.from(
            `${accountSid}:${authToken}`
          ).toString("base64")}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  const result =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      sent: false,
      error:
        result?.message ||
        "Twilio rechazó el SMS.",
    };
  }

  return {
    sent: true,
    sid: result?.sid || null,
  };
}

function documentLabel(
  type: string | null,
  language: NotificationLanguage
) {
  if (language === "en") {
    if (type === "license") return "professional/trade license";
    if (type === "insurance") return "proof of insurance";
    if (type === "bond") return "bond";
    if (type === "other") return "an additional document";
    return "additional documentation";
  }

  if (type === "license") return "la licencia profesional / del oficio";
  if (type === "insurance") return "el comprobante de seguro";
  if (type === "bond") return "la fianza / bond";
  if (type === "other") return "un documento adicional";
  return "documentación adicional";
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
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
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

    const supabase = createClient(
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
          persistSession: false,
          autoRefreshToken: false,
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
      await supabase.auth.getUser(
        token
      );

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

    const requestId =
      String(
        payload?.requestId ||
          ""
      ).trim();

    const providerIdFromPayload =
      String(
        payload?.providerId ||
          ""
      ).trim();

    const sendEmail =
      payload?.sendEmail ===
      true;

    const sendSms =
      payload?.sendSms ===
      true;

    const notificationType =
      payload?.notificationType ===
      "rejection"
        ? "rejection"
        : "request";

    const rejectionReason =
      String(
        payload?.rejectionReason ||
          ""
      ).trim();

    const rejectedDocumentType =
      String(
        payload?.documentType ||
          ""
      ).trim();

    if (
      notificationType ===
        "rejection" &&
      !rejectionReason
    ) {
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

    if (
      notificationType ===
        "request" &&
      !requestId
    ) {
      return NextResponse.json(
        {
          error:
            "Falta el ID de la solicitud.",
        },
        {
          status: 400,
        }
      );
    }

    let documentRequest:
      | {
          id: string;
          provider_id: string;
          document_type: string | null;
          message: string;
          status: string;
        }
      | null = null;

    if (requestId) {
      const {
        data:
          documentRequestData,
        error:
          documentRequestError,
      } =
        await supabase
          .from(
            "provider_document_requests"
          )
          .select(`
            id,
            provider_id,
            document_type,
            message,
            status
          `)
          .eq(
            "id",
            requestId
          )
          .maybeSingle();

      if (
        documentRequestError ||
        !documentRequestData
      ) {
        return NextResponse.json(
          {
            error:
              "No encontramos la solicitud de documentación.",
          },
          {
            status: 404,
          }
        );
      }

      documentRequest =
        documentRequestData;

      if (
        notificationType ===
          "request" &&
        documentRequest.status !==
          "pending"
      ) {
        return NextResponse.json(
          {
            error:
              "La solicitud ya no está pendiente.",
          },
          {
            status: 409,
          }
        );
      }
    }

    const providerId =
      notificationType ===
        "rejection"
        ? providerIdFromPayload ||
          documentRequest?.provider_id ||
          ""
        : documentRequest?.provider_id ||
          "";

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
          phone,
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

    const businessName =
      providerProfile?.business_name ||
      contactProfile?.full_name ||
      "profesional";

    const email =
      String(
        contactProfile?.email ||
          ""
      ).trim();

    const phone =
      String(
        contactProfile?.phone ||
          ""
      ).trim();

    const language =
      normalizeLanguage(contactProfile?.preferred_language);

    const siteUrl =
      (
        process.env.NEXT_PUBLIC_SITE_URL ||
        "https://www.relydo.co"
      ).replace(/\/+$/, "");

    const uploadUrl =
      `${siteUrl}/login-profesional?documentos=1`;

    const documentName =
      documentLabel(
        notificationType ===
          "rejection" &&
        rejectedDocumentType
          ? rejectedDocumentType
          : documentRequest?.document_type ||
            null,
        language
      );

    const notificationMessage =
      notificationType ===
        "rejection"
        ? rejectionReason
        : documentRequest?.message ||
          "";

    const emailResult =
      sendEmail
        ? email
          ? await sendResendEmail({
              to: email,
              businessName,
              documentName,
              message:
                notificationMessage,
              uploadUrl,
              language,
              notificationType,
            })
          : {
              sent: false,
              error:
                "El profesional no tiene correo registrado.",
            }
        : {
            sent: false,
            skipped: true,
          };

    const smsResult =
      sendSms
        ? phone
          ? await sendTwilioSms({
              to: phone,
              documentName,
              uploadUrl,
              language,
            })
          : {
              sent: false,
              error:
                "El profesional no tiene teléfono registrado.",
            }
        : {
            sent: false,
            skipped: true,
          };

    return NextResponse.json({
      ok: true,
      requestId:
        requestId || null,
      providerId,
      email: emailResult,
      sms: smsResult,
      destination: {
        email:
          email || null,
        phone:
          phone || null,
      },
      uploadUrl,
    });
  } catch (error) {
    console.error(
      "provider-document-request error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo enviar la notificación.",
      },
      {
        status: 500,
      }
    );
  }
}
