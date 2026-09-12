import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  createClient,
  type User,
} from "@supabase/supabase-js";

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!
);

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

const MAX_INTENTOS = 3;
const RETRY_DELAYS = [250, 600];

function esperar(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function obtenerStatusError(
  error: unknown
) {
  if (
    typeof error === "object" &&
    error !== null
  ) {
    const value = error as {
      status?: unknown;
      statusCode?: unknown;
    };

    if (
      typeof value.status === "number"
    ) {
      return value.status;
    }

    if (
      typeof value.statusCode === "number"
    ) {
      return value.statusCode;
    }
  }

  return null;
}

function obtenerMensajeError(
  error: unknown
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    const message = (
      error as {
        message?: unknown;
      }
    ).message;

    if (
      typeof message === "string"
    ) {
      return message;
    }
  }

  return "Error desconocido.";
}

async function esperarReintento(
  intento: number
) {
  if (
    intento >=
    MAX_INTENTOS - 1
  ) {
    return;
  }

  const delay =
    RETRY_DELAYS[
      Math.min(
        intento,
        RETRY_DELAYS.length - 1
      )
    ];

  await esperar(delay);
}

export async function GET(
  request: NextRequest
) {
  try {
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
            "No encontramos una sesión válida.",
        },
        {
          status: 401,
        }
      );
    }

    const accessToken =
      authorization
        .replace(
          "Bearer ",
          ""
        )
        .trim();

    /*
      1. VALIDAR SESIÓN

      Un 401 real sí significa sesión inválida.
      Errores temporales de Supabase NO deben
      convertirse en 401.
    */

    let user: User | null =
      null;

    let ultimoAuthError:
      unknown = null;

    for (
      let intento = 0;
      intento < MAX_INTENTOS;
      intento++
    ) {
      const {
        data,
        error,
      } =
        await supabaseAdmin.auth.getUser(
          accessToken
        );

      if (
        !error &&
        data.user
      ) {
        user = data.user;
        ultimoAuthError = null;
        break;
      }

      if (
        !error &&
        !data.user
      ) {
        return NextResponse.json(
          {
            error:
              "Tu sesión no es válida o expiró.",
          },
          {
            status: 401,
          }
        );
      }

      const status =
        obtenerStatusError(
          error
        );

      if (
        status === 401
      ) {
        return NextResponse.json(
          {
            error:
              "Tu sesión no es válida o expiró.",
          },
          {
            status: 401,
          }
        );
      }

      ultimoAuthError =
        error;

      console.warn(
        `RELYDO Stripe status auth temporary failure (${intento + 1}/${MAX_INTENTOS}):`,
        error
      );

      await esperarReintento(
        intento
      );
    }

    if (
      !user
    ) {
      console.error(
        "RELYDO Stripe status auth failed after retries:",
        ultimoAuthError
      );

      return NextResponse.json(
        {
          error:
            "No pudimos verificar tu sesión en este momento. Inténtalo nuevamente.",
        },
        {
          status: 500,
        }
      );
    }

    /*
      2. VERIFICAR QUE SEA PROFESIONAL
    */

    let baseProfile:
      {
        id: string;
        role: string | null;
      } | null = null;

    let ultimoProfileError:
      unknown = null;

    for (
      let intento = 0;
      intento < MAX_INTENTOS;
      intento++
    ) {
      const {
        data,
        error,
      } = await supabaseAdmin
        .from("profiles")
        .select(`
          id,
          role
        `)
        .eq(
          "id",
          user.id
        )
        .maybeSingle();

      if (!error) {
        baseProfile =
          data;
        ultimoProfileError =
          null;
        break;
      }

      ultimoProfileError =
        error;

      console.warn(
        `RELYDO Stripe status profile temporary failure (${intento + 1}/${MAX_INTENTOS}):`,
        error
      );

      await esperarReintento(
        intento
      );
    }

    if (
      ultimoProfileError
    ) {
      console.error(
        "RELYDO Stripe status profile failed after retries:",
        ultimoProfileError
      );

      return NextResponse.json(
        {
          error:
            "No pudimos verificar tu cuenta profesional en este momento. Inténtalo nuevamente.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !baseProfile ||
      baseProfile.role !==
        "provider"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta cuenta no pertenece a un profesional.",
        },
        {
          status: 403,
        }
      );
    }

    /*
      3. CARGAR PERFIL PROFESIONAL
    */

    let providerProfile:
      {
        user_id: string;
        stripe_account_id:
          string | null;
      } | null = null;

    let ultimoProviderError:
      unknown = null;

    for (
      let intento = 0;
      intento < MAX_INTENTOS;
      intento++
    ) {
      const {
        data,
        error,
      } = await supabaseAdmin
        .from(
          "provider_profiles"
        )
        .select(`
          user_id,
          stripe_account_id
        `)
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

      if (!error) {
        providerProfile =
          data;
        ultimoProviderError =
          null;
        break;
      }

      ultimoProviderError =
        error;

      console.warn(
        `RELYDO Stripe status provider profile temporary failure (${intento + 1}/${MAX_INTENTOS}):`,
        error
      );

      await esperarReintento(
        intento
      );
    }

    if (
      ultimoProviderError
    ) {
      console.error(
        "RELYDO Stripe status provider profile failed after retries:",
        ultimoProviderError
      );

      return NextResponse.json(
        {
          error:
            "No pudimos consultar tu perfil profesional en este momento. Inténtalo nuevamente.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !providerProfile
    ) {
      return NextResponse.json(
        {
          error:
            "No encontramos tu perfil profesional.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      !providerProfile.stripe_account_id
    ) {
      return NextResponse.json({
        success: true,

        connected: false,

        readyForPayments:
          false,

        onboardingComplete:
          false,

        chargesEnabled:
          false,

        payoutsEnabled:
          false,

        detailsSubmitted:
          false,

        transfersCapability:
          null,

        disabledReason:
          null,

        currentlyDue: [],

        eventuallyDue: [],

        pastDue: [],

        pendingVerification: [],

        requirementErrors: [],

        futureCurrentlyDue: [],

        futureEventuallyDue: [],

        futurePastDue: [],

        futurePendingVerification: [],
      });
    }

    /*
      4. CONSULTAR STRIPE

      También reintentamos fallos temporales
      de Stripe/red. Un error persistente sigue
      devolviendo 500, nunca "disconnected".
    */

    let account:
      Stripe.Account | null =
      null;

    let ultimoStripeError:
      unknown = null;

    for (
      let intento = 0;
      intento < MAX_INTENTOS;
      intento++
    ) {
      try {
        account =
          await stripe.accounts.retrieve(
            providerProfile.stripe_account_id
          );

        ultimoStripeError =
          null;
        break;
      } catch (error) {
        ultimoStripeError =
          error;

        const status =
          obtenerStatusError(
            error
          );

        /*
          Si Stripe dice que la cuenta no existe
          o la solicitud es inválida, repetir no
          ayudará. Para errores temporales/red,
          sí reintentamos.
        */

        const esErrorNoReintentable =
          status !== null &&
          status >= 400 &&
          status < 500 &&
          status !== 429;

        if (
          esErrorNoReintentable
        ) {
          break;
        }

        console.warn(
          `RELYDO Stripe status Stripe temporary failure (${intento + 1}/${MAX_INTENTOS}):`,
          error
        );

        await esperarReintento(
          intento
        );
      }
    }

    if (
      !account
    ) {
      console.error(
        "RELYDO Stripe status Stripe lookup failed:",
        ultimoStripeError
      );

      return NextResponse.json(
        {
          error:
            `No pudimos consultar Stripe en este momento: ${obtenerMensajeError(
              ultimoStripeError
            )}`,
        },
        {
          status: 500,
        }
      );
    }

    const chargesEnabled =
      account.charges_enabled ===
      true;

    const payoutsEnabled =
      account.payouts_enabled ===
      true;

    const detailsSubmitted =
      account.details_submitted ===
      true;

    const transfersCapability =
      account.capabilities?.transfers ||
      null;

    const currentlyDue =
      account.requirements?.currently_due ||
      [];

    const eventuallyDue =
      account.requirements?.eventually_due ||
      [];

    const pastDue =
      account.requirements?.past_due ||
      [];

    const pendingVerification =
      account.requirements?.pending_verification ||
      [];

    const disabledReason =
      account.requirements?.disabled_reason ||
      null;

    const requirementErrors =
      account.requirements?.errors ||
      [];

    const futureCurrentlyDue =
      account.future_requirements?.currently_due ||
      [];

    const futureEventuallyDue =
      account.future_requirements?.eventually_due ||
      [];

    const futurePastDue =
      account.future_requirements?.past_due ||
      [];

    const futurePendingVerification =
      account.future_requirements?.pending_verification ||
      [];

    const onboardingComplete =
      detailsSubmitted ===
        true &&
      currentlyDue.length ===
        0 &&
      pastDue.length ===
        0 &&
      pendingVerification.length ===
        0;

    const readyForPayments =
      onboardingComplete ===
        true &&
      payoutsEnabled ===
        true &&
      transfersCapability ===
        "active";

    /*
      5. SINCRONIZAR ESTADO EN RELYDO

      Si Stripe respondió bien pero esta actualización
      falla temporalmente, NO convertimos un estado
      válido de Stripe en un 500 para el usuario.
    */

    let updateExitoso =
      false;

    let ultimoUpdateError:
      unknown = null;

    for (
      let intento = 0;
      intento < MAX_INTENTOS;
      intento++
    ) {
      const {
        error,
      } = await supabaseAdmin
        .from(
          "provider_profiles"
        )
        .update({
          stripe_onboarding_complete:
            onboardingComplete,

          stripe_charges_enabled:
            chargesEnabled,

          stripe_payouts_enabled:
            payoutsEnabled,
        })
        .eq(
          "user_id",
          user.id
        );

      if (!error) {
        updateExitoso =
          true;
        ultimoUpdateError =
          null;
        break;
      }

      ultimoUpdateError =
        error;

      console.warn(
        `RELYDO Stripe status sync temporary failure (${intento + 1}/${MAX_INTENTOS}):`,
        error
      );

      await esperarReintento(
        intento
      );
    }

    if (
      !updateExitoso &&
      ultimoUpdateError
    ) {
      console.error(
        "RELYDO Stripe status sync failed after retries:",
        ultimoUpdateError
      );
    }

    return NextResponse.json({
      success: true,

      connected: true,

      readyForPayments,

      stripeAccountId:
        account.id,

      onboardingComplete,

      chargesEnabled,

      payoutsEnabled,

      detailsSubmitted,

      transfersCapability,

      disabledReason,

      currentlyDue,

      eventuallyDue,

      pastDue,

      pendingVerification,

      requirementErrors,

      futureCurrentlyDue,

      futureEventuallyDue,

      futurePastDue,

      futurePendingVerification,
    });
  } catch (error) {
    console.error(
      "Error consultando estado Stripe:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No pudimos consultar el estado de Stripe en este momento. Inténtalo nuevamente.",
      },
      {
        status: 500,
      }
    );
  }
}
