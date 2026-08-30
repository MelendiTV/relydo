import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  sendRelydoNotification,
} from "../../../lib/serverNotifications";

export const runtime =
  "nodejs";

const supabaseAdmin =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

type EventName =
  | "provider_stage_changed"
  | "job_completed"
  | "provider_released_job"
  | "change_order_requested"
  | "change_order_answered"
  | "claim_created"
  | "claim_provider_responded";

type RequestBody = {
  event?: EventName;
  requestId?: string;
  stage?: string;
  changeOrderId?: string;
  claimId?: string;
};

function getBearerToken(
  request: NextRequest
) {
  const authorization =
    request.headers.get(
      "authorization"
    );

  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  return authorization
    .slice(
      "Bearer ".length
    )
    .trim();
}

export async function POST(
  request: NextRequest
) {
  try {
    const token =
      getBearerToken(
        request
      );

    if (!token) {
      return NextResponse.json(
        {
          error:
            "No autorizado.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: {
        user,
      },
      error:
        userError,
    } =
      await supabaseAdmin.auth.getUser(
        token
      );

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "Sesión no válida.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      (await request.json()) as RequestBody;

    const event =
      body.event;

    const requestId =
      String(
        body.requestId || ""
      ).trim();

    if (
      !event ||
      !requestId
    ) {
      return NextResponse.json(
        {
          error:
            "Faltan el evento o el ID del trabajo.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data:
        serviceRequest,
      error:
        requestError,
    } =
      await supabaseAdmin
        .from(
          "service_requests"
        )
        .select(`
          id,
          title,
          customer_id,
          preferred_provider_id,
          status,
          job_stage
        `)
        .eq(
          "id",
          requestId
        )
        .maybeSingle();

    if (
      requestError ||
      !serviceRequest
    ) {
      return NextResponse.json(
        {
          error:
            "Trabajo no encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const jobTitle =
      serviceRequest.title ||
      "Trabajo RELYDO";

    /*
      CAMBIO DE ETAPA DEL PROFESIONAL
    */

    if (
      event ===
      "provider_stage_changed"
    ) {
      const stage =
        String(
          body.stage || ""
        ).trim();

      const {
        data: customerProfile,
      } = await supabaseAdmin
        .from("profiles")
        .select("preferred_language")
        .eq("id", serviceRequest.customer_id)
        .maybeSingle();

      const customerLanguage =
        customerProfile?.preferred_language === "es"
          ? "es"
          : "en";

      const config:
        Record<
          string,
          {
            type: string;
            titleEs: string;
            titleEn: string;
            messageEs: string;
            messageEn: string;
          }
        > = {
        on_the_way: {
          type:
            "provider_on_the_way",
          titleEs:
            "El profesional va en camino",
          titleEn:
            "The professional is on the way",
          messageEs:
            "Tu profesional ya va en camino hacia la dirección del servicio.",
          messageEn:
            "Your professional is on the way to the service address.",
        },
        arrived: {
          type:
            "provider_arrived",
          titleEs:
            "El profesional llegó",
          titleEn:
            "The professional has arrived",
          messageEs:
            "Tu profesional indicó que ya llegó al lugar del servicio.",
          messageEn:
            "Your professional indicated that they have arrived at the service location.",
        },
        working: {
          type:
            "job_started",
          titleEs:
            "El trabajo comenzó",
          titleEn:
            "The job has started",
          messageEs:
            "Tu profesional indicó que el trabajo ya comenzó.",
          messageEn:
            "Your professional indicated that the job has started.",
        },
      };

      if (
        !config[stage] ||
        serviceRequest.status !==
          "in_progress" ||
        serviceRequest.preferred_provider_id !==
          user.id ||
        serviceRequest.job_stage !==
          stage
      ) {
        return NextResponse.json(
          {
            error:
              "No puedes notificar esta etapa del trabajo.",
          },
          {
            status: 403,
          }
        );
      }

      const selected =
        config[stage];

      const result =
        await sendRelydoNotification({
          userId:
            serviceRequest.customer_id,
          type:
            selected.type,
          title:
            customerLanguage === "es"
              ? selected.titleEs
              : selected.titleEn,
          message:
            `${jobTitle}: ${
              customerLanguage === "es"
                ? selected.messageEs
                : selected.messageEn
            }`,
          requestId,
          url:
            `/mis-solicitudes/${requestId}`,
        });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    /*
      TRABAJO COMPLETADO
    */

    if (
      event ===
      "job_completed"
    ) {
      if (
        serviceRequest.preferred_provider_id !==
          user.id ||
        serviceRequest.status !==
          "completed"
      ) {
        return NextResponse.json(
          {
            error:
              "No puedes notificar la finalización de este trabajo.",
          },
          {
            status: 403,
          }
        );
      }

      const result =
        await sendRelydoNotification({
          userId:
            serviceRequest.customer_id,
          type:
            "job_completed",
          title:
            "Trabajo completado",
          message:
            `${jobTitle}: el profesional marcó el servicio como terminado.`,
          requestId,
          url:
            `/mis-solicitudes/${requestId}`,
        });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    /*
      PROFESIONAL LIBERA EL TRABAJO
    */

    if (
      event ===
      "provider_released_job"
    ) {
      const {
        data:
          releasedRecord,
        error:
          releasedError,
      } =
        await supabaseAdmin
          .from(
            "provider_released_jobs"
          )
          .select("request_id, provider_id")
          .eq(
            "request_id",
            requestId
          )
          .eq(
            "provider_id",
            user.id
          )
          .maybeSingle();

      if (
        releasedError ||
        !releasedRecord ||
        serviceRequest.status !==
          "open"
      ) {
        return NextResponse.json(
          {
            error:
              "No pudimos validar que liberaste este trabajo.",
          },
          {
            status: 403,
          }
        );
      }

      const result =
        await sendRelydoNotification({
          userId:
            serviceRequest.customer_id,
          type:
            "provider_released_job",
          title:
            "Buscando un nuevo profesional",
          message:
            `${jobTitle}: el profesional anterior ya no está disponible. Tu solicitud volvió a quedar abierta.`,
          requestId,
          url:
            `/mis-solicitudes/${requestId}`,
        });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    /*
      CHANGE ORDER SOLICITADO
    */

    if (
      event ===
      "change_order_requested"
    ) {
      const changeOrderId =
        String(
          body.changeOrderId || ""
        ).trim();

      if (!changeOrderId) {
        return NextResponse.json(
          {
            error:
              "Falta changeOrderId.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data:
          changeOrder,
        error:
          changeOrderError,
      } =
        await supabaseAdmin
          .from(
            "change_orders"
          )
          .select(`
            id,
            request_id,
            provider_id,
            customer_id,
            additional_amount,
            new_total_amount,
            status
          `)
          .eq(
            "id",
            changeOrderId
          )
          .eq(
            "request_id",
            requestId
          )
          .maybeSingle();

      if (
        changeOrderError ||
        !changeOrder ||
        changeOrder.provider_id !==
          user.id ||
        changeOrder.status !==
          "pending"
      ) {
        return NextResponse.json(
          {
            error:
              "No pudimos validar el cambio de presupuesto.",
          },
          {
            status: 403,
          }
        );
      }

      const result =
        await sendRelydoNotification({
          userId:
            changeOrder.customer_id,
          type:
            "change_order_requested",
          title:
            "Cambio de presupuesto solicitado",
          message:
            `${jobTitle}: el profesional solicita $${Number(
              changeOrder.additional_amount || 0
            ).toFixed(
              2
            )} adicionales. Nuevo total: $${Number(
              changeOrder.new_total_amount || 0
            ).toFixed(
              2
            )}.`,
          requestId,
          url:
            `/mis-solicitudes/${requestId}`,
        });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    /*
      CLIENTE ACEPTA / RECHAZA CHANGE ORDER
    */

    if (
      event ===
      "change_order_answered"
    ) {
      const changeOrderId =
        String(
          body.changeOrderId || ""
        ).trim();

      if (!changeOrderId) {
        return NextResponse.json(
          {
            error:
              "Falta changeOrderId.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data:
          changeOrder,
        error:
          changeOrderError,
      } =
        await supabaseAdmin
          .from(
            "change_orders"
          )
          .select(`
            id,
            request_id,
            provider_id,
            customer_id,
            additional_amount,
            status
          `)
          .eq(
            "id",
            changeOrderId
          )
          .eq(
            "request_id",
            requestId
          )
          .maybeSingle();

      if (
        changeOrderError ||
        !changeOrder ||
        changeOrder.customer_id !==
          user.id ||
        (
          changeOrder.status !==
            "accepted" &&
          changeOrder.status !==
            "rejected"
        )
      ) {
        return NextResponse.json(
          {
            error:
              "No pudimos validar la decisión del cambio de presupuesto.",
          },
          {
            status: 403,
          }
        );
      }

      const accepted =
        changeOrder.status ===
        "accepted";

      const result =
        await sendRelydoNotification({
          userId:
            changeOrder.provider_id,
          type:
            accepted
              ? "change_order_accepted"
              : "change_order_rejected",
          title:
            accepted
              ? "Cambio de presupuesto aceptado"
              : "Cambio de presupuesto rechazado",
          message:
            accepted
              ? `${jobTitle}: el cliente aceptó el cambio de presupuesto de $${Number(
                  changeOrder.additional_amount || 0
                ).toFixed(2)}. El pago adicional queda pendiente de confirmación.`
              : `${jobTitle}: el cliente rechazó el cambio de presupuesto de $${Number(
                  changeOrder.additional_amount || 0
                ).toFixed(2)}.`,
          requestId,
          url:
            `/trabajos/${requestId}`,
        });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    /*
      CLIENTE ABRE RECLAMO
    */

    if (
      event ===
      "claim_created"
    ) {
      const claimId =
        String(
          body.claimId || ""
        ).trim();

      if (!claimId) {
        return NextResponse.json(
          {
            error:
              "Falta claimId.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data:
          claim,
        error:
          claimError,
      } =
        await supabaseAdmin
          .from(
            "job_claims"
          )
          .select(`
            id,
            request_id,
            customer_id,
            provider_id,
            reason,
            status
          `)
          .eq(
            "id",
            claimId
          )
          .eq(
            "request_id",
            requestId
          )
          .maybeSingle();

      if (
        claimError ||
        !claim ||
        claim.customer_id !==
          user.id ||
        (
          claim.status !==
            "open" &&
          claim.status !==
            "reviewing"
        )
      ) {
        return NextResponse.json(
          {
            error:
              "No pudimos validar el reclamo.",
          },
          {
            status: 403,
          }
        );
      }

      const result =
        await sendRelydoNotification({
          userId:
            claim.provider_id,
          type:
            "claim_opened",
          title:
            "Nuevo reclamo del cliente",
          message:
            `${jobTitle}: el cliente abrió un reclamo. Revisa el caso y envía tu respuesta dentro del plazo disponible.`,
          requestId,
          url:
            `/trabajos/${requestId}`,
        });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    /*
      PROFESIONAL RESPONDE AL RECLAMO
    */

    if (
      event ===
      "claim_provider_responded"
    ) {
      const claimId =
        String(
          body.claimId || ""
        ).trim();

      if (!claimId) {
        return NextResponse.json(
          {
            error:
              "Falta claimId.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data:
          claim,
        error:
          claimError,
      } =
        await supabaseAdmin
          .from(
            "job_claims"
          )
          .select(`
            id,
            request_id,
            customer_id,
            provider_id,
            provider_response,
            provider_responded_at,
            status
          `)
          .eq(
            "id",
            claimId
          )
          .eq(
            "request_id",
            requestId
          )
          .maybeSingle();

      if (
        claimError ||
        !claim ||
        claim.provider_id !==
          user.id ||
        !claim.provider_responded_at
      ) {
        return NextResponse.json(
          {
            error:
              "No pudimos validar la respuesta del profesional.",
          },
          {
            status: 403,
          }
        );
      }

      const result =
        await sendRelydoNotification({
          userId:
            claim.customer_id,
          type:
            "claim_provider_responded",
          title:
            "El profesional respondió al reclamo",
          message:
            `${jobTitle}: el profesional envió su respuesta y evidencia para revisión de RELYDO.`,
          requestId,
          url:
            `/mis-solicitudes/${requestId}`,
        });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    return NextResponse.json(
      {
        error:
          "Evento no soportado.",
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "Error procesando evento de notificación:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo procesar la notificación.",
      },
      {
        status: 500,
      }
    );
  }
}