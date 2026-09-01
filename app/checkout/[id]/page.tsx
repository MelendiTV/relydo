"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Solicitud = {
  id: string;
  customer_id: string;
  title: string;
  description: string;
  city: string;
  state: string;
  zip_code: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
};

type Oferta = {
  id: string;
  request_id: string;
  professional_id: string;
  price: number;
  arrival_minutes: number | null;
  estimated_job_minutes: number | null;
  message: string | null;
  status: string;
};

type Profesional = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
  average_rating: number | null;
  completed_jobs: number | null;
  verified: boolean | null;
};

type PaymentSettings = {
  id: string;
  provider_commission_percent: number;
  customer_service_fee_percent: number;
  currency: string;
  active: boolean;
};

function redondearDinero(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function calcularMontos(precio: number, settings: PaymentSettings) {
  const jobAmount = redondearDinero(Number(precio) || 0);

  const customerFeePercent = Number(
    settings.customer_service_fee_percent || 0
  );

  const customerFeeAmount = redondearDinero(
    jobAmount * (customerFeePercent / 100)
  );

  const customerTotalAmount = redondearDinero(
    jobAmount + customerFeeAmount
  );

  return {
    jobAmount,
    customerFeePercent,
    customerFeeAmount,
    customerTotalAmount,
  };
}

function mostrarMinutos(
  minutos: number | null,
  language: "es" | "en"
) {
  if (minutos === null || minutos === undefined) {
    return language === "es" ? "No indicado" : "Not specified";
  }

  if (minutos < 60) {
    return `${minutos} min`;
  }

  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;

  if (restantes === 0) {
    if (language === "es") {
      return `${horas} ${horas === 1 ? "hora" : "horas"}`;
    }

    return `${horas} ${horas === 1 ? "hour" : "hours"}`;
  }

  return `${horas} h ${restantes} min`;
}

function nombreOficio(
  trade: string | null,
  language: "es" | "en"
) {
  const nombres =
    language === "es"
      ? {
          plumbing: "Plomería",
          electrical: "Electricidad",
          hvac: "HVAC / Aire acondicionado",
          carpentry: "Carpintería",
          painting: "Pintura",
          landscaping: "Jardinería",
          cleaning: "Limpieza",
          moving: "Mudanzas",
          other: "Otros servicios",
        }
      : {
          plumbing: "Plumbing",
          electrical: "Electrical",
          hvac: "HVAC / Air conditioning",
          carpentry: "Carpentry",
          painting: "Painting",
          landscaping: "Landscaping",
          cleaning: "Cleaning",
          moving: "Moving",
          other: "Other services",
        };

  if (!trade) {
    return language === "es" ? "Profesional" : "Professional";
  }

  return nombres[trade as keyof typeof nombres] || trade;
}

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { language } = useLanguage();

  const text =
    language === "es"
      ? {
          pagoVerificacionInesperada:
            "La verificación del pago devolvió una respuesta inesperada.",
          pagoNoVerificado:
            "Stripe confirmó el regreso, pero RELYDO no pudo verificar el pago.",
          noVerificarPago:
            "No pudimos verificar el pago.",
          faltaCheckout:
            "Falta información necesaria para abrir el checkout.",
          solicitudNoDisponible:
            "No encontramos esta solicitud o no tienes permiso para pagarla.",
          solicitudNoAbierta:
            "Esta solicitud ya no está disponible para un nuevo checkout.",
          ofertaNoEncontrada:
            "No encontramos el presupuesto seleccionado.",
          ofertaNoDisponible:
            "Este presupuesto ya no está disponible.",
          configuracionPago:
            "No pudimos cargar la configuración de pagos de RELYDO.",
          errorInesperado:
            "Ocurrió un error inesperado.",
          profesionalRelydo:
            "Profesional RELYDO",
          noIniciarPago:
            "No pudimos iniciar el pago.",
          stripeSinUrl:
            "Stripe no devolvió una URL de checkout.",
          errorIniciarPago:
            "Ocurrió un error al iniciar el pago.",
          confirmandoPago:
            "Confirmando tu pago con Stripe...",
          preparandoCheckout:
            "Preparando checkout...",
          noAbrirCheckout:
            "No pudimos abrir el checkout",
          volverPresupuesto:
            "Volver al presupuesto",
          checkoutSeguro:
            "Checkout seguro",
          confirmarPagar:
            "Confirmar y pagar",
          revisarServicio:
            "Revisa el servicio antes de continuar al pago.",
          servicio:
            "Servicio",
          profesionalSeleccionado:
            "Profesional seleccionado",
          verificado:
            "Verificado",
          llegadaEstimada:
            "Llegada estimada",
          duracionEstimada:
            "Duración estimada",
          ubicacion:
            "Ubicación",
          fechaHora:
            "Fecha / hora",
          flexible:
            "Flexible",
          resumen:
            "Resumen",
          totalServicio:
            "Total del servicio",
          incluyeTarifa:
            "Incluye la tarifa de servicio de RELYDO.",
          ocultarDesglose:
            "Ocultar desglose",
          verDesglose:
            "Ver desglose",
          servicioProfesional:
            "Servicio profesional",
          tarifaRelydo:
            "Tarifa de servicio RELYDO",
          total:
            "Total",
          pagoProtegido:
            "Pago protegido",
          stripeSeguro:
            "Serás enviado al checkout seguro de Stripe para completar el pago.",
          abriendoPago:
            "Abriendo pago seguro...",
          continuarPago:
            "Continuar al pago",
          modoPrueba:
            "Estás usando Stripe en modo de prueba. No se moverá dinero real.",
        }
      : {
          pagoVerificacionInesperada:
            "Payment verification returned an unexpected response.",
          pagoNoVerificado:
            "Stripe confirmed the return, but RELYDO could not verify the payment.",
          noVerificarPago:
            "We could not verify the payment.",
          faltaCheckout:
            "Information required to open checkout is missing.",
          solicitudNoDisponible:
            "We could not find this request or you do not have permission to pay for it.",
          solicitudNoAbierta:
            "This request is no longer available for a new checkout.",
          ofertaNoEncontrada:
            "We could not find the selected quote.",
          ofertaNoDisponible:
            "This quote is no longer available.",
          configuracionPago:
            "We could not load RELYDO payment settings.",
          errorInesperado:
            "An unexpected error occurred.",
          profesionalRelydo:
            "RELYDO Professional",
          noIniciarPago:
            "We could not start the payment.",
          stripeSinUrl:
            "Stripe did not return a checkout URL.",
          errorIniciarPago:
            "An error occurred while starting the payment.",
          confirmandoPago:
            "Confirming your payment with Stripe...",
          preparandoCheckout:
            "Preparing checkout...",
          noAbrirCheckout:
            "We couldn't open checkout",
          volverPresupuesto:
            "Back to quote",
          checkoutSeguro:
            "Secure checkout",
          confirmarPagar:
            "Confirm and pay",
          revisarServicio:
            "Review the service before continuing to payment.",
          servicio:
            "Service",
          profesionalSeleccionado:
            "Selected professional",
          verificado:
            "Verified",
          llegadaEstimada:
            "Estimated arrival",
          duracionEstimada:
            "Estimated duration",
          ubicacion:
            "Location",
          fechaHora:
            "Date / time",
          flexible:
            "Flexible",
          resumen:
            "Summary",
          totalServicio:
            "Service total",
          incluyeTarifa:
            "Includes the RELYDO service fee.",
          ocultarDesglose:
            "Hide breakdown",
          verDesglose:
            "View breakdown",
          servicioProfesional:
            "Professional service",
          tarifaRelydo:
            "RELYDO service fee",
          total:
            "Total",
          pagoProtegido:
            "Protected payment",
          stripeSeguro:
            "You will be sent to Stripe's secure checkout to complete payment.",
          abriendoPago:
            "Opening secure payment...",
          continuarPago:
            "Continue to payment",
          modoPrueba:
            "You are using Stripe in test mode. No real money will be moved.",
        };

  const requestId = params.id;
  const offerId = searchParams.get("offer");
  const paymentStatus = searchParams.get("payment");
  const sessionId = searchParams.get("session_id");

  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [oferta, setOferta] = useState<Oferta | null>(null);
  const [profesional, setProfesional] =
    useState<Profesional | null>(null);

  const [settings, setSettings] =
    useState<PaymentSettings | null>(null);

  const [mostrarDesglose, setMostrarDesglose] =
    useState(false);

  const [cargando, setCargando] =
    useState(true);

  const [procesandoPago, setProcesandoPago] =
    useState(false);

  const [error, setError] =
    useState("");

  const [mensaje, setMensaje] =
    useState("");

  useEffect(() => {
    if (paymentStatus === "success" && sessionId) {
      verificarPagoExitoso();
      return;
    }

    cargarCheckout();
  }, [requestId, offerId, paymentStatus, sessionId]);

  async function verificarPagoExitoso() {
    setCargando(true);
    setError("");
    setMensaje("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error(text.pagoNoVerificado);
      }

      const response = await fetch(
        "/api/checkout/verify-payment",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            sessionId,
          }),
        }
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        const texto = await response.text();

        throw new Error(
          `${text.pagoVerificacionInesperada} (${response.status}). ${texto.slice(
            0,
            120
          )}`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            text.pagoNoVerificado
        );
      }

      router.replace(
        `/mis-solicitudes/${requestId}?payment=success`
      );
    } catch (err) {
      console.error(
        "Error verificando pago exitoso:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : text.noVerificarPago
      );

      setCargando(false);
    }
  }

  async function cargarCheckout() {
    setCargando(true);
    setError("");
    setMensaje("");

    try {
      if (!requestId || !offerId) {
        throw new Error(
          text.faltaCheckout
        );
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace(
          `/login-cliente?redirect=${encodeURIComponent(
            `/checkout/${requestId}?offer=${offerId}`
          )}`
        );

        return;
      }

      const {
        data: solicitudData,
        error: solicitudError,
      } = await supabase
        .from("service_requests")
        .select(`
          id,
          customer_id,
          title,
          description,
          city,
          state,
          zip_code,
          preferred_date,
          preferred_time,
          status
        `)
        .eq("id", requestId)
        .eq("customer_id", user.id)
        .maybeSingle();

      if (solicitudError || !solicitudData) {
        throw new Error(
          text.solicitudNoDisponible
        );
      }

      if (solicitudData.status !== "open") {
        throw new Error(
          text.solicitudNoAbierta
        );
      }

      const {
        data: ofertaData,
        error: ofertaError,
      } = await supabase
        .from("offers")
        .select(`
          id,
          request_id,
          professional_id,
          price,
          arrival_minutes,
          estimated_job_minutes,
          message,
          status
        `)
        .eq("id", offerId)
        .eq("request_id", requestId)
        .maybeSingle();

      if (ofertaError || !ofertaData) {
        throw new Error(
          text.ofertaNoEncontrada
        );
      }

      if (ofertaData.status !== "pending") {
        throw new Error(
          text.ofertaNoDisponible
        );
      }

      const {
        data: profesionalData,
        error: profesionalError,
      } = await supabase
        .from("provider_profiles")
        .select(`
          user_id,
          business_name,
          trade,
          average_rating,
          completed_jobs,
          verified
        `)
        .eq(
          "user_id",
          ofertaData.professional_id
        )
        .maybeSingle();

      if (profesionalError) {
        console.error(
          "Error cargando profesional:",
          profesionalError
        );
      }

      const {
        data: settingsData,
        error: settingsError,
      } = await supabase
        .from("payment_settings")
        .select(`
          id,
          provider_commission_percent,
          customer_service_fee_percent,
          currency,
          active
        `)
        .eq("active", true)
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (settingsError || !settingsData) {
        throw new Error(
          text.configuracionPago
        );
      }

      setSolicitud(
        solicitudData as Solicitud
      );

      setOferta(
        ofertaData as Oferta
      );

      setProfesional(
        profesionalData
          ? (profesionalData as Profesional)
          : null
      );

      setSettings(
        settingsData as PaymentSettings
      );
    } catch (err) {
      console.error(
        "Error cargando checkout:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : text.errorInesperado
      );
    } finally {
      setCargando(false);
    }
  }

  async function continuarAlPago() {
    if (
      !solicitud ||
      !oferta ||
      !settings
    ) {
      return;
    }

    setProcesandoPago(true);
    setError("");
    setMensaje("");

    try {
      const montos = calcularMontos(
        oferta.price,
        settings
      );

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error(text.errorInesperado);
      }

      const response = await fetch(
        "/api/checkout",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            Authorization: `Bearer ${accessToken}`,
          },

          body: JSON.stringify({
            requestId: solicitud.id,
            offerId: oferta.id,

            serviceTitle:
              solicitud.title,

            professionalName:
              profesional?.business_name ||
              text.profesionalRelydo,

            professionalPrice:
              montos.jobAmount,

            serviceFee:
              montos.customerFeeAmount,

            total:
              montos.customerTotalAmount,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            text.noIniciarPago
        );
      }

      if (!data?.url) {
        throw new Error(
          text.stripeSinUrl
        );
      }

      window.location.href = data.url;
    } catch (err) {
      console.error(
        "Error iniciando Stripe Checkout:",
        err
      );

      setMensaje(
        err instanceof Error
          ? err.message
          : text.errorIniciarPago
      );

      setProcesandoPago(false);
    }
  }

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-lg">
          <p className="font-bold text-slate-700">
            {paymentStatus === "success"
              ? text.confirmandoPago
              : text.preparandoCheckout}
          </p>
        </div>
      </main>
    );
  }

  if (
    error ||
    !solicitud ||
    !oferta ||
    !settings
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <div className="text-4xl">
            ⚠️
          </div>

          <h1 className="mt-4 text-2xl font-black text-slate-950">
            {text.noAbrirCheckout}
          </h1>

          <p className="mt-3 text-slate-600">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/mis-solicitudes/${requestId}`
              )
            }
            className="mt-6 w-full rounded-xl bg-blue-700 px-5 py-3 font-black text-white hover:bg-blue-800"
          >
            {text.volverPresupuesto}
          </button>
        </div>
      </main>
    );
  }

  const montos = calcularMontos(
    oferta.price,
    settings
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 md:py-12">
      <div className="mx-auto max-w-5xl">

        <button
          type="button"
          onClick={() =>
            router.push(
              `/mis-solicitudes/${requestId}`
            )
          }
          className="font-bold text-blue-700 hover:underline"
        >
          ← {text.volverPresupuesto}
        </button>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">

          <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-xl">

            <div className="bg-gradient-to-br from-blue-700 to-indigo-700 p-7 text-white md:p-9">

              <div className="inline-flex rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-blue-100">
                {text.checkoutSeguro}
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
                {text.confirmarPagar}
              </h1>

              <p className="mt-2 text-blue-100">
                {text.revisarServicio}
              </p>

            </div>

            <div className="p-7 md:p-9">

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">

                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  {text.servicio}
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  {solicitud.title}
                </h2>

                <p className="mt-2 text-slate-600">
                  {solicitud.description}
                </p>

              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 p-5">

                <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                  {text.profesionalSeleccionado}
                </p>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                  <div>
                    <p className="text-xl font-black text-slate-950">
                      {profesional?.business_name ||
                        text.profesionalRelydo}
                    </p>

                    <p className="mt-1 font-semibold text-slate-500">
                      {nombreOficio(
                        profesional?.trade || null,
                        language
                      )}
                    </p>
                  </div>

                  {profesional?.verified && (
                    <span className="w-fit rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-black text-emerald-800">
                      ✓ {text.verificado}
                    </span>
                  )}

                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">

                  <div className="rounded-xl bg-slate-50 p-4">

                    <p className="text-xs font-bold uppercase text-slate-400">
                      {text.llegadaEstimada}
                    </p>

                    <p className="mt-1 font-black text-slate-900">
                      {mostrarMinutos(
                        oferta.arrival_minutes,
                        language
                      )}
                    </p>

                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">

                    <p className="text-xs font-bold uppercase text-slate-400">
                      {text.duracionEstimada}
                    </p>

                    <p className="mt-1 font-black text-slate-900">
                      {mostrarMinutos(
                        oferta.estimated_job_minutes,
                        language
                      )}
                    </p>

                  </div>

                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">

                <div className="rounded-2xl border border-slate-200 p-5">

                  <p className="text-xs font-bold uppercase text-slate-400">
                    {text.ubicacion}
                  </p>

                  <p className="mt-1 font-black text-slate-900">
                    {solicitud.city},{" "}
                    {solicitud.state}{" "}
                    {solicitud.zip_code}
                  </p>

                </div>

                <div className="rounded-2xl border border-slate-200 p-5">

                  <p className="text-xs font-bold uppercase text-slate-400">
                    {text.fechaHora}
                  </p>

                  <p className="mt-1 font-black text-slate-900">
                    {solicitud.preferred_date ||
                      text.flexible}

                    {solicitud.preferred_time
                      ? ` · ${solicitud.preferred_time}`
                      : ""}
                  </p>

                </div>

              </div>
            </div>
          </section>

          <aside className="h-fit rounded-[30px] border border-slate-200 bg-white p-7 shadow-xl lg:sticky lg:top-8">

            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
              {text.resumen}
            </p>

            <p className="mt-3 text-sm font-bold text-slate-500">
              {text.totalServicio}
            </p>

            <p className="mt-1 text-5xl font-black tracking-tight text-slate-950">
              $
              {montos.customerTotalAmount.toFixed(
                2
              )}
            </p>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              {text.incluyeTarifa}
            </p>

            <button
              type="button"
              onClick={() =>
                setMostrarDesglose(
                  (actual) => !actual
                )
              }
              className="mt-4 font-black text-blue-700 hover:underline"
            >
              {mostrarDesglose
                ? text.ocultarDesglose
                : text.verDesglose}
            </button>

            {mostrarDesglose && (
              <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-5">

                <div className="flex items-center justify-between gap-4">

                  <span className="text-slate-600">
                    {text.servicioProfesional}
                  </span>

                  <strong className="text-slate-900">
                    $
                    {montos.jobAmount.toFixed(
                      2
                    )}
                  </strong>

                </div>

                <div className="flex items-center justify-between gap-4">

                  <span className="text-slate-600">
                    {text.tarifaRelydo}
                  </span>

                  <strong className="text-slate-900">
                    $
                    {montos.customerFeeAmount.toFixed(
                      2
                    )}
                  </strong>

                </div>

                <div className="border-t border-slate-200 pt-3">

                  <div className="flex items-center justify-between gap-4">

                    <span className="font-black text-slate-950">
                      {text.total}
                    </span>

                    <strong className="text-lg text-slate-950">
                      $
                      {montos.customerTotalAmount.toFixed(
                        2
                      )}
                    </strong>

                  </div>

                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">

              <p className="font-black text-emerald-900">
                🔒 {text.pagoProtegido}
              </p>

              <p className="mt-1 text-sm leading-6 text-emerald-800">
                {text.stripeSeguro}
              </p>

            </div>

            {mensaje && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
                {mensaje}
              </div>
            )}

            <button
              type="button"
              onClick={continuarAlPago}
              disabled={procesandoPago}
              className="mt-6 w-full rounded-2xl bg-emerald-600 px-6 py-4 text-lg font-black text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {procesandoPago
                ? text.abriendoPago
                : `${text.continuarPago} · $${montos.customerTotalAmount.toFixed(
                    2
                  )}`}
            </button>

            <p className="mt-3 text-center text-xs leading-5 text-slate-400">
              {text.modoPrueba}
            </p>

          </aside>

        </div>
      </div>
    </main>
  );
}