"use client";

import { orderFinancialSummary } from "../orderFinancialSummary";
import { EstadoAdmin } from "@/app/admin/_components/EstadoAdmin";
import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabaseBrowser";
import { useParams, useRouter } from "next/navigation";
import {
  hasAdminPermission,
  isAdminRole,
} from "@/app/lib/adminPermissions";


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
  updated_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  released_at: string | null;
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

const etapasSeguimiento = [
  { valor: "hired", etiqueta: "Contratado" },
  { valor: "on_the_way", etiqueta: "En camino" },
  { valor: "arrived", etiqueta: "Llegó" },
  { valor: "working", etiqueta: "Trabajo iniciado" },
  { valor: "completed", etiqueta: "Completado" },
];

export default function AdminTrabajoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [oferta, setOferta] = useState<Offer | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [errorCambios, setErrorCambios] = useState("");
  const [claims, setClaims] = useState<JobClaim[]>([]);
  const [evidencias, setEvidencias] = useState<CompletionEvidence[]>([]);
  const [errorEvidencias, setErrorEvidencias] = useState("");
  const [mensajesChat, setMensajesChat] = useState<JobMessage[]>([]);
  const [chatRealtime, setChatRealtime] = useState(false);
  const [ordenRealtime, setOrdenRealtime] = useState(false);
  const [ultimaConsulta, setUltimaConsulta] = useState<string | null>(null);
  const [errorSeguimiento, setErrorSeguimiento] = useState(false);
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

  // Iniciar después de la carga autorizada; nunca recargar datos financieros.
  const ordenSeguida = !loading && solicitud?.id === id ? id : null;

  useEffect(() => {
    if (!ordenSeguida) return;

    let activo = true;
    let consultando = false;
    let revision = 0;
    const controller = new AbortController();
    setOrdenRealtime(false);
    setUltimaConsulta(null);
    setErrorSeguimiento(false);

    async function consultarEstado() {
      if (!activo || document.visibilityState === "hidden") return;
      revision += 1;
      if (consultando) return;
      consultando = true;
      const revisionConsulta = revision;

      try {
        const { data, error: consultaError } = await supabase
          .from("service_requests")
          .select("id,status,job_stage,cancellation_reason,cancelled_at")
          .eq("id", ordenSeguida)
          .abortSignal(controller.signal)
          .maybeSingle();

        if (!activo || revisionConsulta !== revision) return;
        if (consultaError || !data) {
          setErrorSeguimiento(true);
          return;
        }

        setSolicitud((actual) =>
          actual?.id === ordenSeguida ? { ...actual, ...data } : actual
        );
        setUltimaConsulta(new Date().toISOString());
        setErrorSeguimiento(false);
      } catch {
        if (activo && revisionConsulta === revision) setErrorSeguimiento(true);
      } finally {
        consultando = false;
        // Un evento durante la consulta exige una nueva lectura, no aplicar datos viejos.
        if (activo && revisionConsulta !== revision) void consultarEstado();
      }
    }

    const canalOrden = supabase
      .channel(`admin-estado-orden-${ordenSeguida}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `id=eq.${ordenSeguida}`,
        },
        () => { void consultarEstado(); }
      )
      .subscribe((status) => {
        if (!activo) return;
        setOrdenRealtime(status === "SUBSCRIBED");
        // Recuperar cambios anteriores a la suscripción o durante una desconexión.
        if (status === "SUBSCRIBED") void consultarEstado();
      });

    void consultarEstado();
    // También cubre publicaciones Realtime ausentes y eventos perdidos.
    const intervalo = window.setInterval(() => { void consultarEstado(); }, 15000);
    const alVolver = () => { void consultarEstado(); };
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      activo = false;
      controller.abort();
      window.clearInterval(intervalo);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
      void supabase.removeChannel(canalOrden);
    };
  }, [ordenSeguida]);

  async function cargarTodo() {
    setLoading(true);
    setError("");
    setErrorEvidencias("");
    setErrorCambios("");
    setChangeOrders([]);
    setPayment(null);

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

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Sesión no válida.");
        const response = await fetch(
          `/api/admin/orders/change-orders?request_id=${encodeURIComponent(solicitudActual.id)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setChangeOrders(result.changeOrders as ChangeOrder[]);
      } catch {
        setErrorCambios("No se pudieron cargar los cambios de presupuesto. Recarga el expediente para intentar nuevamente.");
      }

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
        setErrorEvidencias(
          "No se pudieron cargar las evidencias finales. Intenta nuevamente."
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

  // El estado terminal prevalece; no deducir avances de etapas inconsistentes.
  const etapaActual = solicitud.status === "completed"
    ? "completed"
    : solicitud.status === "in_progress" && solicitud.job_stage !== "completed"
      ? solicitud.job_stage ?? "hired"
      : null;
  const indiceEtapaActual = etapasSeguimiento.findIndex(
    (etapa) => etapa.valor === etapaActual
  );
  const cancelado = solicitud.status === "cancelled";

  const resumen = payment && solicitud ? orderFinancialSummary(payment, changeOrders, solicitud.id) : null;
  const baseConfiable = !errorCambios && resumen?.baseConfirmed === true;
  const cambiosCronologicos = [...changeOrders].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );

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
            </div>
          </div>

          <section aria-labelledby="seguimiento-titulo" className="border-b border-slate-200 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="seguimiento-titulo" className="text-2xl font-black text-slate-950">
                  Seguimiento en vivo
                </h2>
                <div className="mt-3" role="status" aria-atomic="true">
                  <EstadoAdmin
                    status={solicitud.status}
                    jobStage={solicitud.job_stage}
                    contexto="orden"
                  />
                </div>
              </div>
              <p role="status" className={
                "rounded-full px-3 py-2 text-sm font-bold " +
                (ordenRealtime ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")
              }>
                <span aria-hidden="true">● </span>
                {ordenRealtime ? "En vivo" : "Reconectando"}
              </p>
            </div>

            {errorSeguimiento && (
              <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                No se pudo verificar el estado. Reintentando automáticamente; se muestra el último estado conocido.
              </p>
            )}

            {cancelado ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
                <p className="font-black">Trabajo cancelado</p>
                <p className="mt-2 break-words">
                  {solicitud.cancellation_reason || "No se registró un motivo."}
                </p>
                {solicitud.cancelled_at && (
                  <p className="mt-2 text-sm">
                    Cancelación registrada: {formatearFecha(solicitud.cancelled_at)}
                  </p>
                )}
              </div>
            ) : (
              <>
                <ol aria-label="Etapas del trabajo" className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-5">
                  {etapasSeguimiento.map((etapa, indice) => {
                    const actual = indice === indiceEtapaActual;
                    const anterior = indiceEtapaActual >= 0 && indice < indiceEtapaActual;
                    return (
                      <li
                        key={etapa.valor}
                        aria-current={actual ? "step" : undefined}
                        className={"min-w-0 rounded-2xl border p-3 " + (
                          actual
                            ? "border-blue-700 bg-blue-700 text-white ring-2 ring-blue-200"
                            : anterior
                              ? "border-blue-200 bg-blue-50 text-blue-900"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                        )}
                      >
                        <span aria-hidden="true" className="text-xs font-bold">{indice + 1}</span>
                        <p className="mt-1 break-words text-sm font-black">{etapa.etiqueta}</p>
                        {actual && <p className="mt-1 text-xs font-bold">Etapa actual</p>}
                      </li>
                    );
                  })}
                </ol>
                {indiceEtapaActual < 0 && (
                  <p className="mt-3 text-sm text-slate-600">
                    El estado registrado no permite situar el trabajo en esta progresión.
                  </p>
                )}
              </>
            )}

            <dl className="mt-5 grid grid-cols-1 gap-4 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="font-bold text-slate-500">Cliente</dt>
                <dd className="mt-1 break-words font-black text-slate-950">{solicitud.customer_name || "Nombre no disponible"}</dd>
                {solicitud.customer_email && <dd className="mt-1 break-words text-slate-600">{solicitud.customer_email}</dd>}
              </div>
              <div className="min-w-0">
                <dt className="font-bold text-slate-500">Profesional</dt>
                <dd className="mt-1 break-words font-black text-slate-950">{provider?.business_name || "Nombre no disponible"}</dd>
                {provider?.trade && <dd className="mt-1 break-words text-slate-600">{nombreOficio(provider.trade)}</dd>}
              </div>
              <div className="min-w-0">
                <dt className="font-bold text-slate-500">Servicio</dt>
                <dd className="mt-1 break-words font-black text-slate-950">{solicitud.title || "No disponible"}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-1 text-xs leading-5 text-slate-500">
              <p>Última consulta: {ultimaConsulta ? formatearFecha(ultimaConsulta) : "Pendiente de verificación"}. Verificación automática cada 15 s.</p>
              <p>La progresión representa el estado actual; no hay historial horario de etapas. La última consulta no indica la hora del cambio.</p>
              <p>Los datos del expediente se consultan con Actualizar expediente.</p>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 p-7 md:grid-cols-2">
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
            Informe financiero
          </h2>

          <h3 className="mt-6 font-black uppercase tracking-wide text-emerald-700">PAGO INICIAL</h3>
          {payment ? (
            <>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Monto titulo="Valor del servicio original" valor={errorCambios ? null : resumen!.original} />
                <Monto titulo="Tarifa cliente original" valor={baseConfiable ? payment.customer_fee_amount : null} />
                <Monto titulo="Total pagado cliente original" valor={errorCambios ? null : resumen!.originalCustomer} />
                <Monto titulo="Comisión profesional original" valor={baseConfiable ? payment.provider_commission_amount : null} />
                <Monto titulo="Neto profesional original" valor={baseConfiable ? payment.provider_net_amount : null} />
                <Monto titulo="Ingreso RELYDO original" valor={baseConfiable ? payment.platform_revenue_amount : null} />
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                <Dato titulo="Estado del pago original" valor={payment.status} secundario={payment.released_at ? `Liberado ${formatearFecha(payment.released_at)}` : "Todavía no liberado"} />
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
          <div className="mt-6 border-t border-slate-200 pt-6">
            {errorCambios ? (
              <p role="alert" className="mt-5 rounded-2xl bg-red-50 p-5 font-bold text-red-700">{errorCambios}</p>
            ) : cambiosCronologicos.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-slate-50 p-5 font-bold text-slate-500">
                No hubo cambios de presupuesto.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {cambiosCronologicos.map((item, index) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-purple-200 bg-purple-50 p-5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-black text-purple-950">CAMBIO DE PRESUPUESTO #{index + 1}</h3>
                        <p className="mt-2 break-words text-sm text-purple-900">Motivo: {item.reason || "No disponible"}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-purple-900">
                          Descripción: {item.description || "No disponible"}
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-black text-purple-700">
                        Estado: {item.status} · Pago: {item.payment_status}
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
                      <Monto titulo="Tarifa cliente adicional" valor={item.additional_customer_fee_amount} />
                      <Monto titulo="Pago adicional cliente" valor={item.additional_customer_total_amount} />
                      <Monto titulo="Comisión profesional adicional" valor={item.additional_provider_commission_amount} />
                      <Monto titulo="Neto profesional adicional" valor={item.additional_provider_net_amount} />
                      <Monto titulo="Ingreso RELYDO adicional" valor={item.additional_platform_revenue_amount} />
                    </div>
                    <p className="mt-4 break-words text-xs text-purple-900">Cambio ID: {item.id}</p>
                    <p className="mt-2 text-xs text-purple-900">Creado: {formatearFecha(item.created_at)} · Actualizado: {formatearFecha(item.updated_at)}</p>
                    {item.accepted_at && <p className="mt-2 text-xs text-purple-900">Aceptado: {formatearFecha(item.accepted_at)}</p>}
                    {item.rejected_at && <p className="mt-2 text-xs text-purple-900">Rechazado: {formatearFecha(item.rejected_at)}</p>}
                    {item.paid_at && <p className="mt-2 text-xs text-purple-900">Pagado: {formatearFecha(item.paid_at)}</p>}
                    {item.released_at && <p className="mt-2 text-xs text-purple-900">Liberado: {formatearFecha(item.released_at)}</p>}
                  </article>
                ))}
              </div>
            )}
          </div>
          <div className="mt-6 border-t border-slate-200 pt-6">
            <h3 className="font-black uppercase tracking-wide text-emerald-700">TOTALES DE LA ORDEN</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Monto titulo="Valor actual del servicio" valor={errorCambios ? null : resumen?.serviceTotal ?? null} />
              <Monto titulo="Total pagado cliente" valor={errorCambios ? null : resumen?.customerTotal ?? null} />
              <Monto titulo="Comisión profesional total" valor={errorCambios ? null : resumen?.commission ?? null} />
              <Monto titulo="Neto profesional total" valor={errorCambios ? null : resumen?.net ?? null} />
              <Monto titulo="Ingreso RELYDO total" valor={errorCambios ? null : resumen?.revenue ?? null} />
              <Monto titulo="Tarifa cliente total" valor={errorCambios ? null : resumen?.fee ?? null} />
            </div>
            {!errorCambios && resumen && Object.values(resumen).some(value => value === null) && (
              <p className="mt-5 rounded-2xl bg-amber-50 p-5 text-sm text-amber-900">
                {resumen.baseConfirmed ? "Faltan importes registrados del pago o de los cambios pagados para completar las cifras no disponibles." : "El importe del pago registrado no coincide con el presupuesto original. No se sumaron adicionales a ese pago para evitar duplicarlos; falta identificar el cobro base separado."}
              </p>
            )}
          </div>
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

          {errorEvidencias ? (
            <p role="alert" className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-6 text-center font-bold text-red-700">
              {errorEvidencias}
            </p>
          ) : evidencias.length === 0 ? (
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
  valor: number | null;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <p className="text-sm font-bold text-slate-500">
        {titulo}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-950">
        {valor == null || !Number.isFinite(Number(valor)) ? "No disponible" : `${Number(valor).toFixed(2)}`}
      </p>
    </div>
  );
}