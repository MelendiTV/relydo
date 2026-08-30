"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type ProviderProfile = {
  user_id: string;
  business_name: string | null;
  verification_status: string | null;
  verified: boolean | null;
  active: boolean | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
};


type PaymentRow = {
  id: string;
  request_id: string;
  provider_id: string;
  job_amount: number | string | null;
  customer_total_amount: number | string | null;
  provider_commission_percent: number | string | null;
  provider_commission_amount: number | string | null;
  provider_net_amount: number | string | null;
  refunded_amount: number | string | null;
  currency: string | null;
  status: string | null;
  paid_at: string | null;
  completed_at: string | null;
  release_due_at: string | null;
  released_at: string | null;
  stripe_transfer_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RequestSummary = {
  id: string;
  title: string | null;
  status: string | null;
};

export default function PagosProfesionalPage() {
  const router = useRouter();
  const { language } = useLanguage();

  const T = (es: string, en: string) =>
    language === "es" ? es : en;

  const [profile, setProfile] =
    useState<ProviderProfile | null>(null);


  const [loading, setLoading] =
    useState(true);


  const [actualizando, setActualizando] =
    useState(false);

  const [error, setError] =
    useState("");


  const [payments, setPayments] =
    useState<PaymentRow[]>([]);

  const [requestsMap, setRequestsMap] =
    useState<Record<string, RequestSummary>>({});

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarPagos(providerId: string) {
    const { data: paymentRows, error: paymentError } =
      await supabase
        .from("payments")
        .select(`
          id,
          request_id,
          provider_id,
          job_amount,
          customer_total_amount,
          provider_commission_percent,
          provider_commission_amount,
          provider_net_amount,
          refunded_amount,
          currency,
          status,
          paid_at,
          completed_at,
          release_due_at,
          released_at,
          stripe_transfer_id,
          created_at,
          updated_at
        `)
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false });

    if (paymentError) {
      throw new Error(
        `${T("No pudimos cargar tu historial de pagos", "We could not load your payment history")}: ${paymentError.message}`
      );
    }

    const rows = (paymentRows || []) as PaymentRow[];

    const requestIds = [
      ...new Set(rows.map((row) => row.request_id).filter(Boolean)),
    ];

    if (requestIds.length === 0) {
      setPayments([]);
      setRequestsMap({});
      return;
    }

    const { data: requestRows, error: requestError } =
      await supabase
        .from("service_requests")
        .select(`
          id,
          title,
          status
        `)
        .in("id", requestIds);

    if (requestError) {
      console.error(
        "No pudimos cargar títulos de trabajos:",
        requestError
      );
      return;
    }

    const nextMap: Record<string, RequestSummary> = {};

    for (const request of requestRows || []) {
      nextMap[request.id] = request;
    }

    const visiblePayments = rows.filter((payment) => {
      const request = nextMap[payment.request_id];
      const trabajoTerminado = request?.status === "completed";
      const dineroYaLiberado =
        payment.status === "paid_out" ||
        Boolean(payment.released_at) ||
        Boolean(payment.stripe_transfer_id);

      return trabajoTerminado || dineroYaLiberado;
    });

    setPayments(visiblePayments);
    setRequestsMap(nextMap);
  }

  async function cargarDatos() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !user
      ) {
        router.replace(
          "/login-profesional"
        );

        return;
      }

      const {
        data: baseProfile,
        error: baseProfileError,
      } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (
        baseProfileError ||
        !baseProfile
      ) {
        throw new Error(
          T("No encontramos tu cuenta en RELYDO.", "We could not find your RELYDO account.")
        );
      }

      if (
        baseProfile.role !==
        "provider"
      ) {
        throw new Error(
          T("Esta cuenta no pertenece a un profesional.", "This account does not belong to a professional.")
        );
      }

      const {
        data: providerProfile,
        error: providerError,
      } = await supabase
        .from(
          "provider_profiles"
        )
        .select(`
          user_id,
          business_name,
          verification_status,
          verified,
          active,
          stripe_account_id,
          stripe_onboarding_complete,
          stripe_charges_enabled,
          stripe_payouts_enabled
        `)
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

      if (
        providerError
      ) {
        throw new Error(
          `${T("No pudimos cargar tu información de pagos", "We could not load your payment information")}: ${providerError.message}`
        );
      }

      if (
        !providerProfile
      ) {
        throw new Error(
          T("No encontramos tu perfil profesional.", "We could not find your professional profile.")
        );
      }

      const perfilInicial =
        providerProfile as ProviderProfile;

      setProfile(
        perfilInicial
      );

      await cargarPagos(
        perfilInicial.user_id
      );
    } catch (err) {
      console.error(
        "Error cargando pagos:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("Ocurrió un error inesperado.", "An unexpected error occurred.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function actualizarEstado() {
    if (!profile) return;

    setActualizando(true);
    setError("");

    try {
      await cargarPagos(profile.user_id);
    } catch (err) {
      console.error("Error actualizando pagos:", err);
      setError(
        err instanceof Error
          ? err.message
          : T("No pudimos actualizar los pagos.", "We could not refresh payments.")
      );
    } finally {
      setActualizando(false);
    }
  }

  const resumen = useMemo(() => {
    const retenidos = payments.filter(
      (payment) => payment.status === "ready_for_payout"
    );

    const pagados = payments.filter(
      (payment) => payment.status === "paid_out"
    );

    const reembolsados = payments.filter(
      (payment) =>
        payment.status === "refunded" ||
        payment.status === "partially_refunded"
    );

    const retenidoTotal = retenidos.reduce(
      (total, payment) =>
        total + dinero(payment.provider_net_amount),
      0
    );

    const pagadoTotal = pagados.reduce(
      (total, payment) =>
        total + dinero(payment.provider_net_amount),
      0
    );

    return {
      retenidos: retenidos.length,
      pagados: pagados.length,
      reembolsados: reembolsados.length,
      retenidoTotal,
      pagadoTotal,
    };
  }, [payments]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">

        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-lg">

          <p className="font-bold text-slate-700">
            {T("Consultando tu información de pagos...", "Checking your payment information...")}
          </p>

        </div>

      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">

        <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl">

          <h1 className="text-2xl font-black text-red-700">
            {T("No pudimos abrir tus pagos", "We couldn’t open your payments")}
          </h1>

          <p className="mt-4 text-slate-600">
            {error ||
              T("No encontramos tu perfil profesional.", "We could not find your professional profile.")}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/panel-profesional"
              )
            }
            className="mt-6 w-full rounded-xl bg-blue-700 px-5 py-3 font-black text-white hover:bg-blue-800"
          >
            {T("Volver al panel", "Back to dashboard")}
          </button>

        </div>

      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 md:py-10">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() => router.push("/panel-profesional")}
          className="font-bold text-blue-700 hover:underline"
        >
          ← {T("Volver al panel profesional", "Back to professional dashboard")}
        </button>

        <section className="mt-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-xl md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                {T("Pagos", "Payments")}
              </p>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                {T("Tus ganancias", "Your earnings")}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {T(
                  "Consulta cuánto ganaste por cada trabajo y el estado de cada pago.",
                  "See how much you earned from each job and the status of each payment."
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={actualizarEstado}
              disabled={actualizando}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              {actualizando ? T("Actualizando...", "Updating...") : T("Actualizar", "Refresh")}
            </button>
          </div>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {payments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
                <p className="font-black text-slate-800">
                  {T("Todavía no tienes pagos registrados.", "You don’t have any payments yet.")}
                </p>
              </div>
            ) : (
              payments.map((payment) => {
                const request = requestsMap[payment.request_id];
                const estado = obtenerEstadoPago(payment, language);

                return (
                  <article
                    key={payment.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${estado.badgeClass}`}>
                            {estado.label}
                          </span>
                          <span className="text-xs font-bold text-slate-400">
                            {T("Trabajo", "Job")} #{payment.request_id.slice(0, 8).toUpperCase()}
                          </span>
                        </div>

                        <h2 className="mt-2 truncate text-lg font-black text-slate-950">
                          {request?.title || T("Trabajo RELYDO", "RELYDO Job")}
                        </h2>

                        {payment.status === "ready_for_payout" && payment.release_due_at && (
                          <p className="mt-1 text-xs font-bold text-amber-700">
                            {language === "es"
                              ? `Liberación prevista: ${formatearFecha(payment.release_due_at, language)}`
                              : `Expected release: ${formatearFecha(payment.release_due_at, language)}`}
                          </p>
                        )}

                        {payment.status === "paid_out" && payment.released_at && (
                          <p className="mt-1 text-xs font-bold text-emerald-700">
                            {language === "es"
                              ? `Pagado: ${formatearFecha(payment.released_at, language)}`
                              : `Paid: ${formatearFecha(payment.released_at, language)}`}
                          </p>
                        )}

                        {(payment.status === "refunded" || payment.status === "partially_refunded") && (
                          <p className="mt-1 text-xs font-bold text-blue-700">
                            {T("Reembolsado al cliente", "Refunded to customer")}:{" "}
                            {formatearDinero(dinero(payment.refunded_amount))}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 sm:text-right">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          {T("Ganaste", "You earned")}
                        </p>
                        <p className="mt-1 text-2xl font-black text-slate-950">
                          {formatearDinero(dinero(payment.provider_net_amount))}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/trabajos/${payment.request_id}`)}
                        className="text-sm font-black text-blue-700 hover:underline"
                      >
                        {T("Ver trabajo →", "View job →")}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}


function obtenerEstadoPago(
  payment: PaymentRow,
  language: "es" | "en"
) {
  const es = language === "es";

  if (payment.status === "paid_out") {
    return {
      label: es ? "Pagado" : "Paid",
      descripcion: es
        ? "RELYDO ya liberó este pago al profesional."
        : "RELYDO has released this payment to the professional.",
      badgeClass: "bg-emerald-100 text-emerald-800",
    };
  }

  if (payment.status === "ready_for_payout") {
    return {
      label: es ? "Retenido" : "Held",
      descripcion: es
        ? "El pago está protegido por RELYDO hasta que venza el período de seguridad."
        : "The payment is protected by RELYDO until the security period ends.",
      badgeClass: "bg-amber-100 text-amber-800",
    };
  }

  if (payment.status === "partially_refunded") {
    return {
      label: es ? "Resolución parcial" : "Partial resolution",
      descripcion: es
        ? "RELYDO resolvió este pago parcialmente."
        : "RELYDO partially resolved this payment.",
      badgeClass: "bg-violet-100 text-violet-800",
    };
  }

  if (payment.status === "refunded") {
    return {
      label: es ? "Reembolsado" : "Refunded",
      descripcion: es
        ? "El pago fue reembolsado al cliente."
        : "The payment was refunded to the customer.",
      badgeClass: "bg-blue-100 text-blue-800",
    };
  }

  if (payment.status === "cancelled") {
    return {
      label: es ? "Cancelado" : "Cancelled",
      descripcion: es
        ? "Este pago corresponde a un trabajo cancelado."
        : "This payment belongs to a cancelled job.",
      badgeClass: "bg-red-100 text-red-800",
    };
  }

  if (payment.status === "paid") {
    return {
      label: es ? "Pago recibido" : "Payment received",
      descripcion: es
        ? "El pago del cliente fue confirmado."
        : "The customer's payment was confirmed.",
      badgeClass: "bg-sky-100 text-sky-800",
    };
  }

  return {
    label: payment.status || (es ? "Pendiente" : "Pending"),
    descripcion: es
      ? "Movimiento registrado en RELYDO."
      : "Transaction recorded in RELYDO.",
    badgeClass: "bg-slate-100 text-slate-700",
  };
}

function dinero(valor: number | string | null) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? numero : 0;
}

function formatearDinero(valor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(valor);
}

function formatearFecha(valor: string, language: "es" | "en") {
  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return valor;
  }

  return fecha.toLocaleString(language === "es" ? "es-US" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
