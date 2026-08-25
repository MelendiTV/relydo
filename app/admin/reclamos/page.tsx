"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ADMIN_EMAIL = "info@melendivip.com";

type Provider = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
};

type SolicitudAdmin = {
  id: string;
  title: string;
  customer_name: string | null;
  customer_email: string | null;
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
  status: "open" | "reviewing" | "resolved" | "rejected";
  resolution_notes: string | null;
  resolution_type:
    | "pay_provider"
    | "refund_customer"
    | "partial"
    | null;
  provider_award_amount: number | null;
  customer_refund_amount: number | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

type ClaimEvidence = {
  id: string;
  claim_id: string;
  uploaded_by: string;
  uploaded_by_role: "customer" | "provider";
  file_type: "image" | "video";
  file_url: string;
  file_path: string;
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

type Filtro =
  | "todos"
  | "open"
  | "reviewing"
  | "closed";

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

function nombreEstado(status: JobClaim["status"]) {
  if (status === "open") return "Abierto";
  if (status === "reviewing") return "En revisión";
  if (status === "resolved") return "Resuelto";
  return "Rechazado";
}

function estiloEstado(status: JobClaim["status"]) {
  if (status === "open") return "bg-red-100 text-red-800";
  if (status === "reviewing") return "bg-amber-100 text-amber-800";
  if (status === "resolved") return "bg-green-100 text-green-800";
  return "bg-slate-200 text-slate-700";
}

function formatearFecha(fecha: string) {
  return new Intl.DateTimeFormat("es-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(fecha));
}

function estadoPlazo(
  deadline: string | null,
  respondio: boolean
) {
  if (respondio) {
    return {
      vencido: false,
      texto: "Profesional respondió",
    };
  }

  if (!deadline) {
    return {
      vencido: false,
      texto: "Esperando fecha límite",
    };
  }

  const diferencia =
    new Date(deadline).getTime() -
    Date.now();

  if (diferencia <= 0) {
    return {
      vencido: true,
      texto: "Plazo vencido",
    };
  }

  const totalMinutos =
    Math.floor(diferencia / 60000);

  const horas =
    Math.floor(totalMinutos / 60);

  const minutos =
    totalMinutos % 60;

  return {
    vencido: false,
    texto:
      horas > 0
        ? `${horas} h ${minutos} min restantes`
        : `${minutos} min restantes`,
  };
}

export default function AdminReclamosPage() {
  const router = useRouter();

  const [reclamos, setReclamos] = useState<JobClaim[]>([]);
  const [evidencias, setEvidencias] = useState<ClaimEvidence[]>([]);
  const [mensajesChat, setMensajesChat] = useState<JobMessage[]>([]);
  const [errorChat, setErrorChat] = useState("");
  const [solicitudes, setSolicitudes] = useState<SolicitudAdmin[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [reloj, setReloj] = useState(Date.now());

  const [reclamoParcial, setReclamoParcial] =
    useState<JobClaim | null>(null);
  const [totalPagoParcial, setTotalPagoParcial] =
    useState(0);
  const [maxProfesionalParcial, setMaxProfesionalParcial] =
    useState(0);
  const [montoProfesionalParcial, setMontoProfesionalParcial] =
    useState("");
  const [notaParcial, setNotaParcial] =
    useState("");
  const [errorParcial, setErrorParcial] =
    useState("");
  const [cargandoParcial, setCargandoParcial] =
    useState(false);

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setReloj(Date.now()),
      60 * 1000
    );

    return () => window.clearInterval(timer);
  }, []);

  async function cargar() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (
        authError ||
        !user ||
        !user.email ||
        user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
      ) {
        router.replace("/login-profesional");
        return;
      }

      const [
        claimsResp,
        solicitudesResp,
        providersResp,
        evidenceResp,
        chatResp,
      ] = await Promise.all([
        supabase
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
            resolution_notes,
            resolution_type,
            provider_award_amount,
            customer_refund_amount,
            resolved_at,
            resolved_by,
            created_at,
            updated_at
          `)
          .order("created_at", { ascending: false })
          .limit(500),

        supabase
          .from("service_requests")
          .select(`
            id,
            title,
            customer_name,
            customer_email
          `)
          .limit(1000),

        supabase
          .from("provider_profiles")
          .select(`
            user_id,
            business_name,
            trade
          `)
          .limit(2000),

        supabase
          .from("claim_evidence")
          .select(`
            id,
            claim_id,
            uploaded_by,
            uploaded_by_role,
            file_type,
            file_url,
            file_path,
            created_at
          `)
          .order("created_at", { ascending: true })
          .limit(2000),

        supabase
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
          .order("created_at", { ascending: true })
          .limit(5000),
      ]);

      if (claimsResp.error) {
        throw new Error(claimsResp.error.message);
      }

      if (solicitudesResp.error) {
        throw new Error(solicitudesResp.error.message);
      }

      if (providersResp.error) {
        throw new Error(providersResp.error.message);
      }

      setReclamos(
        (claimsResp.data || []) as JobClaim[]
      );

      setSolicitudes(
        (solicitudesResp.data || []) as SolicitudAdmin[]
      );

      setProviders(
        (providersResp.data || []) as Provider[]
      );

      if (chatResp.error) {
        console.error(
          "Error cargando historial del chat:",
          chatResp.error
        );
        setMensajesChat([]);
        setErrorChat(
          "No pudimos cargar el historial del chat. Revisa los permisos de lectura de job_messages para Admin."
        );
      } else {
        setMensajesChat(
          (chatResp.data || []) as JobMessage[]
        );
        setErrorChat("");
      }

      if (evidenceResp.error) {
        console.error(
          "Error cargando evidencias:",
          evidenceResp.error
        );
        setEvidencias([]);
      } else {
        const base =
          (evidenceResp.data || []) as Omit<
            ClaimEvidence,
            "signed_url"
          >[];

        const conUrls =
          await Promise.all(
            base.map(async (item) => {
              const ruta =
                item.file_path ||
                item.file_url;

              const { data, error: signedError } =
                await supabase.storage
                  .from("claim-evidence")
                  .createSignedUrl(
                    ruta,
                    60 * 60
                  );

              if (signedError) {
                console.error(
                  "Error URL evidencia:",
                  signedError
                );
              }

              return {
                ...item,
                signed_url:
                  data?.signedUrl ||
                  null,
              };
            })
          );

        setEvidencias(conUrls);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar los reclamos."
      );
    } finally {
      setLoading(false);
    }
  }

  async function pasarRevision(
    reclamo: JobClaim
  ) {
    setError("");
    setMensaje("");

    if (
      !window.confirm(
        "¿Marcar este reclamo como En revisión? El pago continuará retenido."
      )
    ) {
      return;
    }

    setProcesando(reclamo.id);

    try {
      const { error } = await supabase
        .from("job_claims")
        .update({
          status: "reviewing",
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", reclamo.id);

      if (error) throw new Error(error.message);

      setMensaje(
        "Reclamo marcado como En revisión."
      );
      await cargar();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el reclamo."
      );
    } finally {
      setProcesando(null);
    }
  }

  async function abrirParcial(
    reclamo: JobClaim
  ) {
    setErrorParcial("");
    setNotaParcial("");
    setMontoProfesionalParcial("");
    setCargandoParcial(true);

    try {
      const pago = await supabase
        .from("payments")
        .select(`
          provider_net_amount,
          customer_total_amount
        `)
        .eq("request_id", reclamo.request_id)
        .eq("provider_id", reclamo.provider_id)
        .eq("customer_id", reclamo.customer_id)
        .order("updated_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (pago.error) {
        throw new Error(pago.error.message);
      }

      if (!pago.data) {
        throw new Error(
          "No encontramos el pago relacionado con este reclamo."
        );
      }

      const total =
        Number(
          pago.data.customer_total_amount
        );

      const maxProfesional =
        Number(
          pago.data.provider_net_amount
        );

      if (
        !Number.isFinite(total) ||
        total <= 0 ||
        !Number.isFinite(maxProfesional) ||
        maxProfesional <= 0
      ) {
        throw new Error(
          "Los importes del pago no son válidos."
        );
      }

      setTotalPagoParcial(
        Math.round(
          (total + Number.EPSILON) * 100
        ) / 100
      );

      setMaxProfesionalParcial(
        Math.round(
          (maxProfesional + Number.EPSILON) * 100
        ) / 100
      );

      setReclamoParcial(reclamo);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo abrir la resolución parcial."
      );
    } finally {
      setCargandoParcial(false);
    }
  }

  function montoProNumero() {
    const numero =
      Number(montoProfesionalParcial);

    if (!Number.isFinite(numero)) {
      return 0;
    }

    return Math.round(
      (numero + Number.EPSILON) * 100
    ) / 100;
  }

  function reembolsoNumero() {
    return Math.max(
      0,
      Math.round(
        (
          totalPagoParcial -
          montoProNumero() +
          Number.EPSILON
        ) *
          100
      ) / 100
    );
  }

  async function confirmarParcial() {
    if (!reclamoParcial) return;

    const profesional = montoProNumero();
    const cliente = reembolsoNumero();

    if (!montoProfesionalParcial.trim()) {
      setErrorParcial(
        "Escribe cuánto recibirá el profesional."
      );
      return;
    }

    if (
      profesional < 0 ||
      profesional > maxProfesionalParcial ||
      profesional > totalPagoParcial
    ) {
      setErrorParcial(
        `El profesional puede recibir como máximo $${Math.min(
          maxProfesionalParcial,
          totalPagoParcial
        ).toFixed(2)}.`
      );
      return;
    }

    if (!notaParcial.trim()) {
      setErrorParcial(
        "Escribe una nota explicando la resolución."
      );
      return;
    }

    if (
      !window.confirm(
        `¿Confirmas esta resolución?\n\nProfesional: $${profesional.toFixed(
          2
        )}\nCliente: $${cliente.toFixed(
          2
        )}`
      )
    ) {
      return;
    }

    setErrorParcial("");

    await resolver(
      reclamoParcial,
      "partial",
      {
        notes: notaParcial.trim(),
        providerAwardAmount: profesional,
        customerRefundAmount: cliente,
      }
    );
  }

  async function resolver(
    reclamo: JobClaim,
    action:
      | "pay_provider"
      | "refund_customer"
      | "partial",
    partialData?: {
      notes: string;
      providerAwardAmount: number;
      customerRefundAmount: number;
    }
  ) {
    setError("");
    setMensaje("");

    if (reclamo.status !== "reviewing") {
      setError(
        "Primero debes pasar el reclamo a En revisión antes de tomar una decisión económica."
      );
      return;
    }

    const evidenciasPro =
      evidencias.filter(
        (e) =>
          e.claim_id === reclamo.id &&
          e.uploaded_by_role === "provider"
      );

    const respondio = Boolean(
      reclamo.provider_response ||
        reclamo.provider_responded_at ||
        evidenciasPro.length > 0
    );

    const plazo =
      estadoPlazo(
        reclamo.provider_response_deadline,
        respondio
      );

    let overrideResponseWindow = false;

    if (!respondio && !plazo.vencido) {
      const confirmar =
        window.confirm(
          `El profesional todavía está dentro de su plazo (${plazo.texto}).\n\n¿Deseas resolver el reclamo ahora de todos modos?`
        );

      if (!confirmar) return;

      overrideResponseWindow = true;
    }

    let notes = "";
    let providerAwardAmount:
      number | undefined;
    let customerRefundAmount:
      number | undefined;

    if (action === "pay_provider") {
      const respuesta =
        window.prompt(
          "Escribe una nota explicando por qué el pago debe liberarse al profesional:"
        );

      if (respuesta === null) return;

      notes = respuesta.trim();

      if (!notes) {
        setError(
          "Debes escribir una nota."
        );
        return;
      }

      if (
        !window.confirm(
          "¿Confirmas que deseas liberar el pago al profesional?"
        )
      ) {
        return;
      }
    }

    if (action === "refund_customer") {
      const respuesta =
        window.prompt(
          "Escribe una nota explicando por qué el cliente recibirá un reembolso completo:"
        );

      if (respuesta === null) return;

      notes = respuesta.trim();

      if (!notes) {
        setError(
          "Debes escribir una nota."
        );
        return;
      }

      if (
        !window.confirm(
          "¿Confirmas que deseas reembolsar al cliente?"
        )
      ) {
        return;
      }
    }

    if (action === "partial") {
      if (!partialData) {
        await abrirParcial(reclamo);
        return;
      }

      notes = partialData.notes;
      providerAwardAmount =
        partialData.providerAwardAmount;
      customerRefundAmount =
        partialData.customerRefundAmount;
    }

    setProcesando(reclamo.id);

    try {
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData.session
      ) {
        throw new Error(
          "No pudimos verificar tu sesión de administrador."
        );
      }

      const response =
        await fetch(
          "/api/admin/claims/resolve",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({
              claimId: reclamo.id,
              action,
              notes,
              providerAwardAmount,
              customerRefundAmount,
              overrideResponseWindow,
            }),
          }
        );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudo resolver el reclamo."
        );
      }

      setMensaje(
        "Reclamo resuelto correctamente."
      );

      setReclamoParcial(null);
      setMontoProfesionalParcial("");
      setNotaParcial("");
      setErrorParcial("");

      await cargar();
    } catch (err) {
      const mensajeError =
        err instanceof Error
          ? err.message
          : "No se pudo resolver el reclamo.";

      if (
        action === "partial" &&
        reclamoParcial?.id === reclamo.id
      ) {
        setErrorParcial(mensajeError);
      } else {
        setError(mensajeError);
      }
    } finally {
      setProcesando(null);
    }
  }

  const filtrados = useMemo(() => {
    if (filtro === "open") {
      return reclamos.filter(
        (r) => r.status === "open"
      );
    }

    if (filtro === "reviewing") {
      return reclamos.filter(
        (r) => r.status === "reviewing"
      );
    }

    if (filtro === "closed") {
      return reclamos.filter(
        (r) =>
          r.status === "resolved" ||
          r.status === "rejected"
      );
    }

    return reclamos;
  }, [reclamos, filtro]);

  const abiertos =
    reclamos.filter(
      (r) => r.status === "open"
    ).length;

  const revision =
    reclamos.filter(
      (r) => r.status === "reviewing"
    ).length;

  const cerrados =
    reclamos.filter(
      (r) =>
        r.status === "resolved" ||
        r.status === "rejected"
    ).length;

  void reloj;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 font-bold text-slate-700 shadow">
          Cargando reclamos...
        </div>
      </main>
    );
  }

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
            onClick={cargar}
            className="w-fit rounded-xl border-2 border-red-700 bg-white px-5 py-3 font-extrabold text-red-700 hover:bg-red-50"
          >
            ↻ Actualizar reclamos
          </button>
        </div>

        <section className="mb-8 rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
          <p className="text-sm font-black uppercase tracking-widest text-red-300">
            Protección
          </p>
          <h1 className="mt-2 text-3xl font-black">
            Reclamos de trabajos
          </h1>
          <p className="mt-3 text-slate-300">
            Revisa disputas, evidencias y decisiones económicas de cada caso.
          </p>
        </section>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-5 font-bold text-red-700">
            {error}
          </div>
        )}

        {mensaje && (
          <div className="mb-5 rounded-2xl border border-green-300 bg-green-50 p-5 font-bold text-green-800">
            ✅ {mensaje}
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Resumen
            titulo="Abiertos"
            valor={abiertos}
            activo={filtro === "open"}
            onClick={() => setFiltro("open")}
          />
          <Resumen
            titulo="En revisión"
            valor={revision}
            activo={filtro === "reviewing"}
            onClick={() => setFiltro("reviewing")}
          />
          <Resumen
            titulo="Cerrados"
            valor={cerrados}
            activo={filtro === "closed"}
            onClick={() => setFiltro("closed")}
          />
          <Resumen
            titulo="Total"
            valor={reclamos.length}
            activo={filtro === "todos"}
            onClick={() => setFiltro("todos")}
          />
        </div>

        {filtrados.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow">
            <p className="font-bold text-slate-600">
              No hay reclamos con este filtro.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtrados.map((reclamo) => {
              const trabajo =
                solicitudes.find(
                  (s) =>
                    s.id ===
                    reclamo.request_id
                ) || null;

              const profesional =
                providers.find(
                  (p) =>
                    p.user_id ===
                    reclamo.provider_id
                ) || null;

              const evidenciasCaso =
                evidencias.filter(
                  (e) =>
                    e.claim_id === reclamo.id
                );

              const evidenciasCliente =
                evidenciasCaso.filter(
                  (e) =>
                    e.uploaded_by_role ===
                    "customer"
                );

              const evidenciasPro =
                evidenciasCaso.filter(
                  (e) =>
                    e.uploaded_by_role ===
                    "provider"
                );

              const mensajesCaso =
                mensajesChat.filter(
                  (m) =>
                    m.request_id ===
                    reclamo.request_id
                );

              const respondio =
                Boolean(
                  reclamo.provider_response ||
                  reclamo.provider_responded_at ||
                  evidenciasPro.length > 0
                );

              const plazo =
                estadoPlazo(
                  reclamo.provider_response_deadline,
                  respondio
                );

              const activo =
                reclamo.status === "open" ||
                reclamo.status === "reviewing";

              return (
                <details
                  key={reclamo.id}
                  className={`group rounded-3xl border bg-white shadow ${
                    activo
                      ? "border-red-300"
                      : "border-slate-200"
                  }`}
                >
                  <summary className="cursor-pointer list-none p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-sm font-extrabold ${estiloEstado(
                              reclamo.status
                            )}`}
                          >
                            {nombreEstado(
                              reclamo.status
                            )}
                          </span>

                          {activo && (
                            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold text-red-700">
                              💰 Pago retenido
                            </span>
                          )}
                        </div>

                        <h2 className="mt-3 text-xl font-extrabold text-slate-900">
                          {trabajo?.title ||
                            reclamo.reason}
                        </h2>

                        <p className="mt-2 break-all text-sm font-semibold text-slate-500">
                          Orden: {reclamo.request_id}
                        </p>
                      </div>

                      <span className="w-full shrink-0 rounded-xl bg-blue-700 px-5 py-3 text-center font-extrabold text-white sm:w-auto">
                        <span className="group-open:hidden">
                          🔎 Ver detalles del reclamo
                        </span>
                        <span className="hidden group-open:inline">
                          ↑ Ocultar detalles
                        </span>
                      </span>
                    </div>
                  </summary>

                  <div className="border-t border-slate-200 p-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <Dato
                        titulo="Trabajo"
                        valor={
                          trabajo?.title ||
                          "Trabajo no encontrado"
                        }
                        secundario={reclamo.request_id}
                      />

                      <Dato
                        titulo="Cliente"
                        valor={
                          trabajo?.customer_name ||
                          "Cliente RELYDO"
                        }
                        secundario={
                          trabajo?.customer_email ||
                          "Email no disponible"
                        }
                      />

                      <Dato
                        titulo="Profesional"
                        valor={
                          profesional?.business_name ||
                          "Profesional RELYDO"
                        }
                        secundario={
                          profesional
                            ? nombreOficio(
                                profesional.trade
                              )
                            : "Sin información"
                        }
                      />
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                        <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                          Cliente
                        </p>
                        <h3 className="mt-1 text-lg font-black text-blue-950">
                          Comentario del cliente
                        </h3>
                        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-white p-4 leading-7 text-slate-700">
                          {reclamo.description ||
                            "El cliente no añadió una descripción adicional."}
                        </p>

                        {reclamo.customer_evidence_note && (
                          <div className="mt-3 rounded-xl bg-white p-4">
                            <p className="text-xs font-black uppercase text-blue-700">
                              Explicación de las evidencias
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-slate-700">
                              {reclamo.customer_evidence_note}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                        <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                          Profesional
                        </p>
                        <h3 className="mt-1 text-lg font-black text-emerald-950">
                          Respuesta del profesional
                        </h3>

                        <div className="mt-4 rounded-xl bg-white p-4">
                          <p className="whitespace-pre-wrap leading-7 text-slate-700">
                            {reclamo.provider_response ||
                              (respondio
                                ? "El profesional envió evidencia para responder al reclamo."
                                : "El profesional todavía no ha respondido.")}
                          </p>
                        </div>

                        {!respondio && (
                          <div
                            className={`mt-3 rounded-xl p-4 ${
                              plazo.vencido
                                ? "bg-red-100 text-red-900"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            <p className="font-black">
                              {plazo.vencido
                                ? "⏰ Plazo vencido"
                                : `⏳ ${plazo.texto}`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black uppercase text-slate-500">
                            Evidencias del reclamo
                          </p>
                          <h3 className="mt-1 text-xl font-black text-slate-950">
                            Cliente vs. profesional
                          </h3>
                        </div>

                        <span className="w-fit rounded-full bg-white px-3 py-1 text-sm font-black text-slate-700">
                          {evidenciasCaso.length} archivo
                          {evidenciasCaso.length === 1
                            ? ""
                            : "s"}
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
                        <GrupoEvidencias
                          titulo="Evidencia del cliente"
                          evidencias={evidenciasCliente}
                          clase="border-blue-200 bg-blue-50"
                        />
                        <GrupoEvidencias
                          titulo="Evidencia del profesional"
                          evidencias={evidenciasPro}
                          clase="border-emerald-200 bg-emerald-50"
                        />
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-300 bg-white p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black uppercase text-slate-500">
                            💬 Historial del chat
                          </p>
                          <h3 className="mt-1 text-xl font-black text-slate-950">
                            Conversación del trabajo
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Solo lectura para Admin. Los mensajes se muestran en orden cronológico.
                          </p>
                        </div>

                        <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-700">
                          {mensajesCaso.length} mensaje
                          {mensajesCaso.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {errorChat ? (
                        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                          {errorChat}
                        </div>
                      ) : mensajesCaso.length === 0 ? (
                        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
                          <p className="font-black text-slate-700">
                            No hubo mensajes entre el cliente y el profesional en este trabajo.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          {mensajesCaso.map((item) => {
                            const esCliente =
                              item.sender_role === "customer";
                            const esProfesional =
                              item.sender_role === "provider";

                            const etiqueta =
                              esCliente
                                ? "Cliente"
                                : esProfesional
                                ? "Profesional"
                                : "Admin RELYDO";

                            const claseMensaje =
                              esCliente
                                ? "border-blue-200 bg-blue-50"
                                : esProfesional
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-purple-200 bg-purple-50";

                            const claseEtiqueta =
                              esCliente
                                ? "text-blue-700"
                                : esProfesional
                                ? "text-emerald-700"
                                : "text-purple-700";

                            return (
                              <div
                                key={item.id}
                                className={`rounded-xl border p-4 ${claseMensaje}`}
                              >
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <p className={`text-xs font-black uppercase tracking-wide ${claseEtiqueta}`}>
                                    {etiqueta}
                                  </p>
                                  <p className="text-xs font-semibold text-slate-500">
                                    {formatearFecha(item.created_at)}
                                  </p>
                                </div>

                                <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-slate-800">
                                  {item.message}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {reclamo.resolution_notes && (
                      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
                        <p className="font-black text-blue-900">
                          Notas de resolución
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-blue-800">
                          {reclamo.resolution_notes}
                        </p>
                      </div>
                    )}

                    {reclamo.status === "resolved" && (
                      <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-5">
                        <p className="font-black text-green-900">
                          Resultado económico
                        </p>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Monto
                            titulo="Profesional"
                            valor={
                              reclamo.provider_award_amount ||
                              0
                            }
                          />
                          <Monto
                            titulo="Reembolso cliente"
                            valor={
                              reclamo.customer_refund_amount ||
                              0
                            }
                          />
                        </div>
                      </div>
                    )}

                    {activo && (
                      <div className="mt-5">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          {reclamo.status === "open" && (
                            <button
                              type="button"
                              disabled={
                                procesando ===
                                reclamo.id
                              }
                              onClick={() =>
                                pasarRevision(
                                  reclamo
                                )
                              }
                              className="rounded-xl bg-amber-500 px-5 py-3 font-extrabold text-white disabled:opacity-50"
                            >
                              🔎 Pasar a revisión
                            </button>
                          )}

                          {reclamo.status === "reviewing" && (
                            <>
                              <button
                                type="button"
                                disabled={
                                  procesando ===
                                  reclamo.id
                                }
                                onClick={() =>
                                  resolver(
                                    reclamo,
                                    "pay_provider"
                                  )
                                }
                                className="rounded-xl bg-green-600 px-5 py-3 font-extrabold text-white disabled:opacity-50"
                              >
                                💰 Pagar profesional
                              </button>

                              <button
                                type="button"
                                disabled={
                                  procesando ===
                                  reclamo.id
                                }
                                onClick={() =>
                                  resolver(
                                    reclamo,
                                    "refund_customer"
                                  )
                                }
                                className="rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white disabled:opacity-50"
                              >
                                ↩️ Reembolsar cliente
                              </button>

                              <button
                                type="button"
                                disabled={
                                  procesando ===
                                    reclamo.id ||
                                  cargandoParcial
                                }
                                onClick={() =>
                                  abrirParcial(
                                    reclamo
                                  )
                                }
                                className="rounded-xl bg-purple-700 px-5 py-3 font-extrabold text-white disabled:opacity-50"
                              >
                                ⚖️ Resolución parcial
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="mt-5 text-xs text-slate-400">
                      Reportado {formatearFecha(
                        reclamo.created_at
                      )}
                    </p>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      {reclamoParcial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl">
            <h2 className="text-2xl font-black text-slate-950">
              ⚖️ Resolución parcial
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Decide cuánto recibirá el profesional. El resto se calculará como reembolso al cliente.
            </p>

            {errorParcial && (
              <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 font-bold text-red-700">
                {errorParcial}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Monto
                titulo="Total disponible"
                valor={totalPagoParcial}
              />
              <Monto
                titulo="Máximo profesional"
                valor={maxProfesionalParcial}
              />
            </div>

            <label className="mt-5 block">
              <span className="font-black text-slate-700">
                Profesional recibe
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={montoProfesionalParcial}
                onChange={(e) =>
                  setMontoProfesionalParcial(
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border-2 border-slate-400 bg-white px-4 py-3 font-bold text-slate-950 placeholder:text-slate-500 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-100"
              />
            </label>

            <div className="mt-3 rounded-xl bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-700">
                Reembolso calculado al cliente
              </p>
              <p className="mt-1 text-2xl font-black text-blue-950">
                ${reembolsoNumero().toFixed(2)}
              </p>
            </div>

            <label className="mt-5 block">
              <span className="font-black text-slate-700">
                Nota de resolución
              </span>
              <textarea
                value={notaParcial}
                onChange={(e) =>
                  setNotaParcial(
                    e.target.value
                  )
                }
                rows={4}
                className="mt-2 w-full rounded-xl border-2 border-slate-400 bg-white px-4 py-3 font-semibold text-slate-950 placeholder:text-slate-500 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-100"
              />
            </label>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={Boolean(procesando)}
                onClick={() =>
                  setReclamoParcial(null)
                }
                className="rounded-xl border-2 border-slate-300 bg-white px-5 py-3 font-black text-slate-700"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={Boolean(procesando)}
                onClick={confirmarParcial}
                className="rounded-xl bg-purple-700 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {procesando === reclamoParcial.id
                  ? "Procesando resolución..."
                  : "Confirmar resolución"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Resumen({
  titulo,
  valor,
  activo,
  onClick,
}: {
  titulo: string;
  valor: number;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border bg-white p-5 text-left shadow ${
        activo
          ? "border-blue-500 ring-2 ring-blue-100"
          : "border-slate-200"
      }`}
    >
      <p className="text-sm font-bold text-slate-500">
        {titulo}
      </p>
      <p className="mt-2 text-3xl font-black text-slate-950">
        {valor}
      </p>
    </button>
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
        <p className="mt-1 break-all text-sm text-slate-600">
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
    <div className="rounded-xl bg-white p-4">
      <p className="text-sm font-bold text-slate-500">
        {titulo}
      </p>
      <p className="mt-1 text-xl font-black text-slate-950">
        ${Number(valor || 0).toFixed(2)}
      </p>
    </div>
  );
}

function GrupoEvidencias({
  titulo,
  evidencias,
  clase,
}: {
  titulo: string;
  evidencias: ClaimEvidence[];
  clase: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${clase}`}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-black text-slate-950">
          {titulo}
        </h4>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-slate-700">
          {evidencias.length}
        </span>
      </div>

      {evidencias.length === 0 ? (
        <p className="mt-4 rounded-xl bg-white p-4 text-sm font-semibold text-slate-500">
          No se adjuntó evidencia.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {evidencias.map((item) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-xl bg-white"
            >
              {item.signed_url ? (
                item.file_type === "video" ? (
                  <video
                    src={item.signed_url}
                    controls
                    className="aspect-video w-full bg-black object-contain"
                  />
                ) : (
                  <a
                    href={item.signed_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={item.signed_url}
                      alt="Evidencia del reclamo"
                      className="aspect-video w-full object-cover"
                    />
                  </a>
                )
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-slate-500">
                  Archivo no disponible
                </div>
              )}

              <p className="px-3 py-2 text-sm font-bold text-slate-700">
                {item.file_type === "video"
                  ? "🎥 Video"
                  : "📷 Foto"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}