"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams, useRouter } from "next/navigation";
import {
  hasAdminPermission,
  isAdminRole,
} from "@/app/lib/adminPermissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);


type Solicitud = {
  id: string;
  customer_id: string | null;
  title: string;
  description: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string;
  state: string;
  zip_code: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  job_stage: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  preferred_provider_id: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
};

type Provider = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
  years_experience: number | null;
  average_rating: number | null;
  completed_jobs: number | null;
  verified: boolean | null;
  active: boolean | null;
};

type Offer = {
  id: string;
  request_id: string;
  professional_id: string;
  price: number;
  arrival_minutes: number | null;
  estimated_job_minutes: number | null;
  message: string | null;
  status: string;
  created_at: string;
};

type Payment = {
  id: string;
  request_id: string;
  offer_id: string | null;
  customer_id: string;
  provider_id: string;
  job_amount: number;
  customer_fee_percent: number;
  customer_fee_amount: number;
  customer_total_amount: number;
  provider_commission_percent: number;
  provider_commission_amount: number;
  provider_net_amount: number;
  platform_revenue_amount: number;
  refunded_amount: number | null;
  refunded_at: string | null;
  released_at: string | null;
  currency: string;
  status: string;
  created_at?: string | null;
};

type ChangeOrder = {
  id: string;
  request_id: string;
  provider_id: string;
  customer_id: string;
  reason: string;
  description: string | null;
  original_amount: number;
  additional_amount: number;
  new_total_amount: number;
  status: string;
  payment_status: string;
  additional_customer_fee_amount: number | null;
  additional_customer_total_amount: number | null;
  additional_provider_commission_amount: number | null;
  additional_provider_net_amount: number | null;
  additional_platform_revenue_amount: number | null;
  paid_at: string | null;
  created_at: string;
};

type JobClaim = {
  id: string;
  request_id: string;
  customer_id: string;
  provider_id: string;
  reason: string;
  description: string | null;
  customer_evidence_note: string | null;
  provider_response: string | null;
  provider_response_deadline: string | null;
  provider_responded_at: string | null;
  status: string;
  resolution_type: string | null;
  resolution_notes: string | null;
  provider_award_amount: number | null;
  customer_refund_amount: number | null;
  resolved_at: string | null;
  created_at: string;
};

type CompletionEvidence = {
  id: string;
  request_id: string;
  provider_id: string;
  file_type: "image" | "video";
  file_path: string;
  file_url: string | null;
  created_at: string;
  signed_url: string | null;
};

type JobMessage = {
  id: string;
  request_id: string;
  sender_id: string;
  sender_role: "customer" | "provider" | "admin";
  message: string;
  read_at: string | null;
  created_at: string;
};

function nombreOficio(trade: string | null) {
  const nombres: Record<string, string> = {
    plumbing: "Plomería",
    electrical: "Electricidad",
    hvac: "HVAC / Aire acondicionado",
    carpentry: "Carpintería",
    painting: "Pintura",
    landscaping: "Jardinería",
    cleaning: "Limpieza",
    moving: "Mudanzas",
    other: "Otros servicios",
  };

  return trade ? nombres[trade] || trade : "No indicado";
}

function formatearFecha(fecha: string | null | undefined) {
  if (!fecha) return "No disponible";

  return new Intl.DateTimeFormat("es-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(fecha));
}

function estadoTrabajo(status: string, stage: string | null) {
  if (status === "completed") return "Completado";
  if (status === "cancelled") return "Cancelado";
  if (status === "open") return "Abierto";
  if (stage === "working") return "Trabajo iniciado";
  if (stage === "arrived") return "Profesional llegó";
  if (stage === "on_the_way") return "Profesional en camino";
  return "Profesional contratado";
}

export default function AdminTrabajoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [oferta, setOferta] = useState<Offer | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [claims, setClaims] = useState<JobClaim[]>([]);
  const [evidencias, setEvidencias] = useState<CompletionEvidence[]>([]);
  const [mensajesChat, setMensajesChat] = useState<JobMessage[]>([]);
  const [chatRealtime, setChatRealtime] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) {
      cargarTodo();
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const canalChatAdmin =
      supabase
        .channel(
          `chat-admin-${id}`
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "job_messages",
            filter:
              `request_id=eq.${id}`,
          },
          (payload) => {
            const nuevo =
              payload.new as JobMessage;

            setMensajesChat(
              (actuales) =>
                actuales.some(
                  (item) =>
                    item.id === nuevo.id
                )
                  ? actuales
                  : [
                      ...actuales,
                      nuevo,
                    ]
            );
          }
        )
        .subscribe(
          (status) => {
            setChatRealtime(
              status === "SUBSCRIBED"
            );
          }
        );

    return () => {
      supabase.removeChannel(
        canalChatAdmin
      );
    };
  }, [id]);

  async function cargarTodo() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (
        authError ||
        !user
      ) {
        router.replace("/login-profesional");
        return;
      }

      const {
        data: adminProfile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("role, admin_role")
        .eq("id", user.id)
        .maybeSingle();

      if (
        profileError ||
        !adminProfile ||
        adminProfile.role !== "admin" ||
        !isAdminRole(adminProfile.admin_role) ||
        !hasAdminPermission(
          adminProfile.admin_role,
          "orders"
        )
      ) {
        router.replace("/admin");
        return;
      }

      const { data: solicitudData, error: solicitudError } =
        await supabase
          .from("service_requests")
          .select(`
            id,
            customer_id,
            title,
            description,
            address_line1,
            address_line2,
            city,
            state,
            zip_code,
            preferred_date,
            preferred_time,
            status,
            job_stage,
            customer_name,
            customer_email,
            customer_phone,
            preferred_provider_id,
            cancellation_reason,
            cancelled_at,
            created_at
          `)
          .eq("id", id)
          .maybeSingle();

      if (solicitudError || !solicitudData) {
        throw new Error(
          solicitudError?.message ||
            "No encontramos este trabajo."
        );
      }

      const solicitudActual =
        solicitudData as Solicitud;

      setSolicitud(solicitudActual);

      if (solicitudActual.preferred_provider_id) {
        const { data: providerData, error: providerError } =
          await supabase
            .from("provider_profiles")
            .select(`
              user_id,
              business_name,
              trade,
              years_experience,
              average_rating,
              completed_jobs,
              verified,
              active
            `)
            .eq(
              "user_id",
              solicitudActual.preferred_provider_id
            )
            .maybeSingle();

        if (providerError) {
          console.error(
            "Error cargando profesional:",
            providerError
          );
        }

        setProvider(
          providerData
            ? (providerData as Provider)
            : null
        );
      } else {
        setProvider(null);
      }

      const { data: ofertaData, error: ofertaError } =
        await supabase
          .from("offers")
          .select(`
            id,
            request_id,
            professional_id,
            price,
            arrival_minutes,
            estimated_job_minutes,
            message,
            status,
            created_at
          `)
          .eq("request_id", id)
          .eq("status", "selected")
          .limit(1)
          .maybeSingle();

      if (ofertaError) {
        console.error(
          "Error cargando oferta seleccionada:",
          ofertaError
        );
      }

      setOferta(
        ofertaData ? (ofertaData as Offer) : null
      );

      const { data: paymentData, error: paymentError } =
        await supabase
          .from("payments")
          .select(`
            id,
            request_id,
            offer_id,
            customer_id,
            provider_id,
            job_amount,
            customer_fee_percent,
            customer_fee_amount,
            customer_total_amount,
            provider_commission_percent,
            provider_commission_amount,
            provider_net_amount,
            platform_revenue_amount,
            refunded_amount,
            refunded_at,
            released_at,
            currency,
            status,
            created_at
          `)
          .eq("request_id", id)
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

      if (paymentError) {
        console.error(
          "Error cargando pago:",
          paymentError
        );
      }

      setPayment(
        paymentData ? (paymentData as Payment) : null
      );

      const {
        data: changeOrdersData,
        error: changeOrdersError,
      } = await supabase
        .from("change_orders")
        .select(`
          id,
          request_id,
          provider_id,
          customer_id,
          reason,
          description,
          original_amount,
          additional_amount,
          new_total_amount,
          status,
          payment_status,
          additional_customer_fee_amount,
          additional_customer_total_amount,
          additional_provider_commission_amount,
          additional_provider_net_amount,
          additional_platform_revenue_amount,
          paid_at,
          created_at
        `)
        .eq("request_id", id)
        .order("created_at", {
          ascending: false,
        });

      if (changeOrdersError) {
        console.error(
          "Error cargando cambios de presupuesto:",
          changeOrdersError
        );
      }

      setChangeOrders(
        (changeOrdersData || []) as ChangeOrder[]
      );

      const { data: claimsData, error: claimsError } =
        await supabase
          .from("job_claims")
          .select(`
            id,
            request_id,
            customer_id,
            provider_id,
            reason,
            description,
            customer_evidence_note,
            provider_response,
            provider_response_deadline,
            provider_responded_at,
            status,
            resolution_type,
            resolution_notes,
            provider_award_amount,
            customer_refund_amount,
            resolved_at,
            created_at
          `)
          .eq("request_id", id)
          .order("created_at", {
            ascending: false,
          });

      if (claimsError) {
        console.error(
          "Error cargando reclamos:",
          claimsError
        );
      }

      setClaims(
        (claimsData || []) as JobClaim[]
      );

      const {
        data: mensajesData,
        error: mensajesError,
      } = await supabase
        .from("job_messages")
        .select(`
          id,
          request_id,
          sender_id,
          sender_role,
          message,
          read_at,
          created_at
        `)
        .eq("request_id", id)
        .order("created_at", {
          ascending: true,
        });

      if (mensajesError) {
        console.error(
          "Error cargando historial del chat:",
          mensajesError
        );
        setMensajesChat([]);
      } else {
        setMensajesChat(
          (mensajesData || []) as JobMessage[]
        );
      }

      const {
        data: evidenceData,
        error: evidenceError,
      } = await supabase
        .from("job_completion_evidence")
        .select(`
          id,
          request_id,
          provider_id,
          file_type,
          file_path,
          file_url,
          created_at
        `)
        .eq("request_id", id)
        .order("created_at", {
          ascending: true,
        });

      if (evidenceError) {
        console.error(
          "Error cargando evidencia final:",
          evidenceError
        );
        setEvidencias([]);
      } else {
        const base =
          (evidenceData || []) as Omit<
            CompletionEvidence,
            "signed_url"
          >[];

        const conUrls = await Promise.all(
          base.map(async (item) => {
            const { data, error: signedError } =
              await supabase.storage
                .from("job-completion-evidence")
                .createSignedUrl(
                  item.file_path,
                  60 * 60
                );

            if (signedError) {
              console.error(
                "Error creando URL firmada:",
                signedError
              );
            }

            return {
              ...item,
              signed_url:
                data?.signedUrl || null,
            };
          })
        );

        setEvidencias(conUrls);
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar el expediente del trabajo."
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 font-bold text-slate-700 shadow-lg">
          Cargando expediente del trabajo...
        </div>
      </main>
    );
  }

  if (!solicitud) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl">
          <h1 className="text-2xl font-black text-red-700">
            No se pudo abrir el trabajo
          </h1>
          <p className="mt-3 text-slate-600">
            {error || "Trabajo no encontrado."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="mt-6 rounded-xl bg-blue-700 px-5 py-3 font-black text-white"
          >
            Volver al Admin
          </button>
        </div>
      </main>
    );
  }

  const totalFotos = evidencias.filter(
    (item) => item.file_type === "image"
  ).length;

  const totalVideos = evidencias.filter(
    (item) => item.file_type === "video"
  ).length;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="w-fit font-black text-blue-700 hover:underline"
          >
            ← Volver al panel Admin
          </button>

          <button
            type="button"
            onClick={cargarTodo}
            className="w-fit rounded-xl border-2 border-blue-700 bg-white px-4 py-2.5 font-black text-blue-700 hover:bg-blue-50"
          >
            ↻ Actualizar expediente
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-5 font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="bg-slate-950 p-7 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-blue-300">
                  Expediente administrativo
                </p>
                <h1 className="mt-2 text-3xl font-black">
                  {solicitud.title}
                </h1>
                <p className="mt-3 max-w-3xl text-slate-300">
                  {solicitud.description}
                </p>
              </div>

              <span className="w-fit rounded-full bg-white/10 px-4 py-2 text-sm font-black">
                {estadoTrabajo(
                  solicitud.status,
                  solicitud.job_stage
                )}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-7 md:grid-cols-2 xl:grid-cols-4">
            <Dato
              titulo="Cliente"
              valor={
                solicitud.customer_name ||
                "Cliente RELYDO"
              }
              secundario={
                solicitud.customer_email ||
                "Email no disponible"
              }
            />
            <Dato
              titulo="Profesional"
              valor={
                provider?.business_name ||
                "Sin profesional asignado"
              }
              secundario={
                provider
                  ? nombreOficio(provider.trade)
                  : "No disponible"
              }
            />
            <Dato
              titulo="Ubicación"
              valor={
                solicitud.address_line1 ||
                "Dirección no indicada"
              }
              secundario={`${solicitud.city}, ${solicitud.state} ${solicitud.zip_code}`}
            />
            <Dato
              titulo="Fecha del servicio"
              valor={
                solicitud.preferred_date ||
                "Flexible"
              }
              secundario={
                solicitud.preferred_time ||
                "Hora flexible"
              }
            />
          </div>

          <div className="border-t border-slate-200 px-7 py-5">
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-lg bg-slate-100 px-3 py-2">
                Request ID: {solicitud.id}
              </span>
              {solicitud.customer_id && (
                <span className="rounded-lg bg-slate-100 px-3 py-2">
                  Customer ID: {solicitud.customer_id}
                </span>
              )}
              {solicitud.preferred_provider_id && (
                <span className="rounded-lg bg-slate-100 px-3 py-2">
                  Provider ID: {solicitud.preferred_provider_id}
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-emerald-700">
            💰 Pagos
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            Resumen financiero
          </h2>

          {payment ? (
            <>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Monto
                  titulo="Valor del servicio"
                  valor={payment.job_amount}
                />
                <Monto
                  titulo="Total pagado cliente"
                  valor={payment.customer_total_amount}
                />
                <Monto
                  titulo="Neto profesional"
                  valor={payment.provider_net_amount}
                />
                <Monto
                  titulo="Ingreso RELYDO"
                  valor={payment.platform_revenue_amount}
                />
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                <Dato
                  titulo="Estado del pago"
                  valor={payment.status}
                  secundario={
                    payment.released_at
                      ? `Liberado ${formatearFecha(payment.released_at)}`
                      : "Todavía no liberado"
                  }
                />
                <Dato
                  titulo="Comisión profesional"
                  valor={`${Number(payment.provider_commission_percent).toFixed(2)}%`}
                  secundario={`$${Number(payment.provider_commission_amount).toFixed(2)}`}
                />
                <Dato
                  titulo="Tarifa cliente"
                  valor={`${Number(payment.customer_fee_percent).toFixed(2)}%`}
                  secundario={`$${Number(payment.customer_fee_amount).toFixed(2)}`}
                />
              </div>

              {Number(payment.refunded_amount || 0) > 0 && (
                <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
                  <p className="font-black text-blue-900">
                    Reembolso registrado: $
                    {Number(
                      payment.refunded_amount || 0
                    ).toFixed(2)}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="mt-5 rounded-2xl bg-slate-50 p-5 font-bold text-slate-500">
              No hay pago registrado para este trabajo.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-blue-700">
                📸 Evidencia final
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">
                Trabajo terminado por el profesional
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Evidencia registrada antes de completar el trabajo.
              </p>
            </div>

            <span className="w-fit rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">
              {totalFotos} foto(s) · {totalVideos} video(s)
            </span>
          </div>

          {evidencias.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center font-bold text-slate-500">
              Este trabajo no tiene evidencia final registrada.
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {evidencias.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                >
                  {item.signed_url ? (
                    item.file_type === "video" ? (
                      <video
                        src={item.signed_url}
                        controls
                        preload="metadata"
                        className="aspect-video w-full bg-black object-contain"
                      />
                    ) : (
                      <a
                        href={item.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block"
                      >
                        <img
                          src={item.signed_url}
                          alt="Evidencia final del trabajo"
                          className="aspect-video w-full object-cover"
                        />
                      </a>
                    )
                  ) : (
                    <div className="flex aspect-video items-center justify-center p-5 text-center text-sm font-bold text-slate-500">
                      No se pudo abrir este archivo.
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-white px-4 py-3 text-sm">
                    <strong>
                      {item.file_type === "video"
                        ? "🎥 Video"
                        : "📷 Foto"}
                    </strong>
                    <span className="text-xs text-slate-500">
                      {formatearFecha(item.created_at)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-purple-700">
            💵 Cambios de presupuesto
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            Change Orders
          </h2>

          {changeOrders.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-slate-50 p-5 font-bold text-slate-500">
              No hubo cambios de presupuesto.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {changeOrders.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-purple-200 bg-purple-50 p-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black text-purple-950">
                        {item.reason}
                      </p>
                      {item.description && (
                        <p className="mt-1 text-sm text-purple-900">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-black text-purple-700">
                      {item.status} · {item.payment_status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Monto
                      titulo="Original"
                      valor={item.original_amount}
                    />
                    <Monto
                      titulo="Adicional"
                      valor={item.additional_amount}
                    />
                    <Monto
                      titulo="Nuevo total"
                      valor={item.new_total_amount}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200 bg-slate-950 px-7 py-6 text-white">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-blue-300">
                  💬 Comunicación protegida
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  Historial del chat
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Conversación completa entre cliente y profesional asociada a esta orden.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="w-fit rounded-full bg-white/10 px-3 py-1.5 text-xs font-black">
                  {mensajesChat.length} mensaje{mensajesChat.length === 1 ? "" : "s"}
                </span>

                <span
                  className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${
                    chatRealtime
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-700 text-slate-200"
                  }`}
                >
                  {chatRealtime
                    ? "● En tiempo real"
                    : "Conectando..."}
                </span>
              </div>
            </div>
          </div>

          <div className="max-h-[520px] overflow-y-auto bg-slate-50 p-6">
            {mensajesChat.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <div className="text-4xl">
                  💬
                </div>

                <p className="mt-3 font-black text-slate-800">
                  No hay conversación registrada
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Si cliente y profesional usan el chat de esta orden, los mensajes aparecerán aquí.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {mensajesChat.map(
                  (item) => {
                    const esCliente =
                      item.sender_role ===
                      "customer";

                    const esAdmin =
                      item.sender_role ===
                      "admin";

                    const nombre =
                      esAdmin
                        ? "RELYDO Admin"
                        : esCliente
                        ? solicitud.customer_name ||
                          "Cliente"
                        : provider?.business_name ||
                          "Profesional";

                    return (
                      <div
                        key={item.id}
                        className={`flex ${
                          esCliente
                            ? "justify-start"
                            : "justify-end"
                        }`}
                      >
                        <div
                          className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] ${
                            esAdmin
                              ? "border border-violet-200 bg-violet-50"
                              : esCliente
                              ? "rounded-bl-md border border-blue-200 bg-white"
                              : "rounded-br-md bg-emerald-700 text-white"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={`text-xs font-black ${
                                esAdmin
                                  ? "text-violet-700"
                                  : esCliente
                                  ? "text-blue-700"
                                  : "text-emerald-100"
                              }`}
                            >
                              {nombre}
                            </p>

                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                                esAdmin
                                  ? "bg-violet-100 text-violet-700"
                                  : esCliente
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-white/15 text-white"
                              }`}
                            >
                              {esAdmin
                                ? "Admin"
                                : esCliente
                                ? "Cliente"
                                : "Profesional"}
                            </span>
                          </div>

                          <p
                            className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${
                              esAdmin
                                ? "text-slate-800"
                                : esCliente
                                ? "text-slate-800"
                                : "text-white"
                            }`}
                          >
                            {item.message}
                          </p>

                          <p
                            className={`mt-2 text-right text-[11px] ${
                              esAdmin
                                ? "text-violet-500"
                                : esCliente
                                ? "text-slate-400"
                                : "text-emerald-100"
                            }`}
                          >
                            {formatearFecha(
                              item.created_at
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white px-7 py-4">
            <p className="text-xs leading-5 text-slate-500">
              🔒 Vista administrativa de solo lectura. El historial permanece disponible aunque el chat esté bloqueado por reclamo, cancelación o por haber vencido las 12 horas después de completar el trabajo.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-red-700">
            ⚠️ Reclamos
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            Historial de disputas
          </h2>

          {claims.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-slate-50 p-5 font-bold text-slate-500">
              Este trabajo no tiene reclamos.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {claims.map((claim) => (
                <article
                  key={claim.id}
                  className="rounded-2xl border border-red-200 bg-red-50 p-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black text-red-950">
                        {claim.reason}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-red-900">
                        {claim.description ||
                          "Sin descripción adicional."}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-black text-red-700">
                      {claim.status}
                    </span>
                  </div>

                  {claim.provider_response && (
                    <div className="mt-4 rounded-xl bg-white p-4">
                      <p className="text-xs font-black uppercase text-emerald-700">
                        Respuesta del profesional
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {claim.provider_response}
                      </p>
                    </div>
                  )}

                  {claim.resolution_notes && (
                    <div className="mt-4 rounded-xl bg-white p-4">
                      <p className="text-xs font-black uppercase text-blue-700">
                        Resolución Admin
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {claim.resolution_notes}
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-slate-500">
            🧾 Oferta seleccionada
          </p>

          {oferta ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Monto
                titulo="Precio"
                valor={oferta.price}
              />
              <Dato
                titulo="Llegada estimada"
                valor={
                  oferta.arrival_minutes !== null
                    ? `${oferta.arrival_minutes} min`
                    : "No indicada"
                }
                secundario="Oferta aceptada"
              />
              <Dato
                titulo="Duración estimada"
                valor={
                  oferta.estimated_job_minutes !== null
                    ? `${oferta.estimated_job_minutes} min`
                    : "No indicada"
                }
                secundario={
                  oferta.message ||
                  "Sin mensaje"
                }
              />
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-slate-50 p-5 font-bold text-slate-500">
              No encontramos una oferta seleccionada.
            </p>
          )}
        </section>

        {solicitud.status === "cancelled" && (
          <section className="mt-6 rounded-3xl border-2 border-red-300 bg-red-50 p-7 shadow-sm">
            <p className="font-black text-red-900">
              🚫 Trabajo cancelado
            </p>
            <p className="mt-2 leading-6 text-red-800">
              {solicitud.cancellation_reason ||
                "No se registró un motivo."}
            </p>
            {solicitud.cancelled_at && (
              <p className="mt-2 text-sm font-bold text-red-700">
                {formatearFecha(
                  solicitud.cancelled_at
                )}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Dato({
  titulo,
  valor,
  secundario,
}: {
  titulo: string;
  valor: string;
  secundario?: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <p className="text-sm font-bold text-slate-500">
        {titulo}
      </p>
      <p className="mt-1 break-words font-black text-slate-950">
        {valor}
      </p>
      {secundario && (
        <p className="mt-1 break-words text-sm text-slate-600">
          {secundario}
        </p>
      )}
    </div>
  );
}

function Monto({
  titulo,
  valor,
}: {
  titulo: string;
  valor: number;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <p className="text-sm font-bold text-slate-500">
        {titulo}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-950">
        ${Number(valor || 0).toFixed(2)}
      </p>
    </div>
  );
}