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

export const runtime = "nodejs";

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

type Body = {
  requestId?: string;
  offerId?: string;
};

export async function POST(
  request: NextRequest
) {
  try {
    /*
      1. VALIDAR SESIÓN DEL CLIENTE
    */

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

    const accessToken =
      authorization.replace(
        "Bearer ",
        ""
      );

    const supabaseUser =
      createClient(
        process.env
          .NEXT_PUBLIC_SUPABASE_URL!,
        process.env
          .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

    const {
      data: { user },
      error: userError,
    } =
      await supabaseUser.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "No encontramos una sesión válida.",
        },
        {
          status: 401,
        }
      );
    }

    /*
      2. LEER IDS
    */

    const body =
      (await request.json()) as Body;

    const requestId =
      body.requestId?.trim();

    const offerId =
      body.offerId?.trim();

    if (
      !requestId ||
      !offerId
    ) {
      return NextResponse.json(
        {
          error:
            "Faltan requestId u offerId.",
        },
        {
          status: 400,
        }
      );
    }

    /*
      3. COMPROBAR QUE LA SOLICITUD
         PERTENECE AL CLIENTE
    */

    const {
      data: serviceRequest,
      error: requestError,
    } = await supabaseAdmin
      .from(
        "service_requests"
      )
      .select(`
        id,
        title,
        customer_id,
        status
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
            "No encontramos la solicitud.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      serviceRequest.customer_id !==
      user.id
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permiso para modificar esta solicitud.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      serviceRequest.status !==
      "open"
    ) {
      return NextResponse.json(
        {
          error:
            "La solicitud ya no está abierta.",
        },
        {
          status: 409,
        }
      );
    }

    /*
      4. BUSCAR EL PRESUPUESTO
    */

    const {
      data: offer,
      error: offerError,
    } = await supabaseAdmin
      .from(
        "offers"
      )
      .select(`
        id,
        request_id,
        professional_id,
        status
      `)
      .eq(
        "id",
        offerId
      )
      .eq(
        "request_id",
        requestId
      )
      .maybeSingle();

    if (
      offerError ||
      !offer
    ) {
      return NextResponse.json(
        {
          error:
            "No encontramos este presupuesto.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      offer.status !==
      "pending"
    ) {
      return NextResponse.json(
        {
          error:
            "Este presupuesto ya no está disponible.",
        },
        {
          status: 409,
        }
      );
    }

    /*
      5. RECHAZAR ÚNICAMENTE
         ESTE PRESUPUESTO
    */

    const {
      data: updatedOffer,
      error: updateError,
    } = await supabaseAdmin
      .from(
        "offers"
      )
      .update({
        status: "rejected",
      })
      .eq(
        "id",
        offerId
      )
      .eq(
        "request_id",
        requestId
      )
      .eq(
        "status",
        "pending"
      )
      .select(`
        id,
        request_id,
        professional_id,
        status
      `)
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        {
          error:
            updateError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!updatedOffer) {
      return NextResponse.json(
        {
          error:
            "Este presupuesto ya no está disponible.",
        },
        {
          status: 409,
        }
      );
    }

    /*
      6. NOTIFICAR AL PROFESIONAL

      IMPORTANTE:
      Si la notificación falla,
      NO deshacemos el rechazo.
    */

    let notificationResult:
      unknown = null;

    try {
      const {
        data: providerLanguageProfile,
      } = await supabaseAdmin
        .from("profiles")
        .select("preferred_language")
        .eq(
          "id",
          updatedOffer.professional_id
        )
        .maybeSingle();

      const providerLanguage =
        providerLanguageProfile?.preferred_language === "es"
          ? "es"
          : "en";

      const notificationTitle =
        providerLanguage === "es"
          ? "Presupuesto rechazado"
          : "Quote rejected";

      const jobTitle =
        serviceRequest.title ||
        (providerLanguage === "es"
          ? "Trabajo RELYDO"
          : "RELYDO job");

      const notificationMessage =
        providerLanguage === "es"
          ? `${jobTitle}: el cliente rechazó tu presupuesto. Puedes seguir revisando otros trabajos disponibles.`
          : `${jobTitle}: the customer rejected your quote. You can continue reviewing other available jobs.`;

      notificationResult =
        await sendRelydoNotification({
          userId:
            updatedOffer.professional_id,

          type:
            "offer_rejected",

          title:
            notificationTitle,

          message:
            notificationMessage,

          requestId,

          url:
            `/trabajos/${requestId}`,
        });
    } catch (
      notificationError
    ) {
      console.warn(
        "RELYDO: el presupuesto fue rechazado, pero no pudimos notificar al profesional:",
        notificationError
      );
    }

    /*
      7. RESPUESTA
    */

    return NextResponse.json({
      success: true,

      offer:
        updatedOffer,

      notification:
        notificationResult,
    });
  } catch (error) {
    console.error(
      "Error rechazando presupuesto:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo rechazar el presupuesto.",
      },
      {
        status: 500,
      }
    );
  }
}