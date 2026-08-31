"use client";

import { useEffect, useRef, useState } from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Trabajo = {
  id: string;
  title: string;
  description: string;
  address_line1: string | null;
  city: string;
  state: string;
  zip_code: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  job_stage: string | null;
  customer_name: string | null;
  customer_id: string;
  preferred_provider_id: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  completion_review_status: "pending" | "approved" | null;
  submitted_for_review_at: string | null;
  completion_approved_at: string | null;
};

type FotoTrabajo = {
  id: string;
  request_id: string;
  file_url: string;
};

type EvidenciaFinal = {
  id: string;
  request_id: string;
  provider_id: string;
  file_type: "image" | "video";
  file_path: string;
  file_url: string | null;
  created_at: string;
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
  created_at: string;
};

type Pago = {
  id: string;
  request_id: string;
  offer_id: string | null;
  provider_id: string;
  job_amount: number;
  provider_commission_percent: number;
  provider_commission_amount: number;
  provider_net_amount: number;
  status: string;
  paid_at: string | null;
  cancellation_stage: string | null;
  cancellation_penalty_percent: number | null;
  cancellation_penalty_amount: number | null;
  cancellation_provider_amount: number | null;
  cancellation_platform_amount: number | null;
  cancellation_processed_at: string | null;
};

type ReclamoTrabajo = {
  id: string;
  request_id: string;
  customer_id: string;
  provider_id: string;
  reason: string;
  description: string | null;
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

type EvidenciaReclamo = {
  id: string;
  claim_id: string;
  uploaded_by: string;
  uploaded_by_role: "customer" | "provider";
  file_type: "image" | "video";
  file_path: string;
  created_at: string;
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
  status: "pending" | "accepted" | "rejected" | "cancelled";
  accepted_at: string | null;
  rejected_at: string | null;
  payment_status: "unpaid" | "paid" | string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  additional_customer_fee_percent: number | null;
  additional_customer_fee_amount: number | null;
  additional_customer_total_amount: number | null;
  additional_provider_commission_percent: number | null;
  additional_provider_commission_amount: number | null;
  additional_provider_net_amount: number | null;
  additional_platform_revenue_amount: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
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

function mostrarMinutos(
  minutos: number | null,
  language: "es" | "en"
) {
  if (
    minutos === null ||
    minutos === undefined
  ) {
    return language === "es"
      ? "No indicado"
      : "Not specified";
  }

  if (minutos < 60) {
    return `${minutos} min`;
  }

  const horas =
    Math.floor(
      minutos / 60
    );

  const restantes =
    minutos % 60;

  if (restantes === 0) {
    return language === "es"
      ? `${horas} ${horas === 1 ? "hora" : "horas"}`
      : `${horas} ${horas === 1 ? "hour" : "hours"}`;
  }

  return `${horas} h ${restantes} min`;
}

function formatearFecha(
  fecha: string | null,
  language: "es" | "en"
) {
  if (!fecha) {
    return language === "es"
      ? "Flexible"
      : "Flexible";
  }

  const date =
    new Date(
      `${fecha}T12:00:00`
    );

  return new Intl.DateTimeFormat(
    language === "es"
      ? "es-US"
      : "en-US",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}

function formatearFechaHora(
  fecha: string,
  language: "es" | "en"
) {
  return new Intl.DateTimeFormat(
    language === "es"
      ? "es-US"
      : "en-US",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(
    new Date(fecha)
  );
}

function calcularTiempoRestante(
  deadline: string | null,
  language: "es" | "en"
) {
  if (!deadline) {
    return {
      vencido: false,
      texto:
        language === "es"
          ? "24 horas"
          : "24 hours",
    };
  }

  const diferencia =
    new Date(deadline).getTime() -
    Date.now();

  if (diferencia <= 0) {
    return {
      vencido: true,
      texto:
        language === "es"
          ? "Plazo vencido"
          : "Deadline expired",
    };
  }

  const totalMinutos =
    Math.floor(
      diferencia / 60000
    );

  const horas =
    Math.floor(
      totalMinutos / 60
    );

  const minutos =
    totalMinutos % 60;

  return {
    vencido: false,
    texto:
      horas > 0
        ? `${horas} h ${minutos} min`
        : `${minutos} min`,
  };
}


function resolutionNoteText(
  language: "es" | "en",
  note: string | null
) {
  if (!note || language !== "en") {
    return note || "";
  }

  return note
    .replaceAll("[RESOLUCIÓN PARCIAL]", "[PARTIAL RESOLUTION]")
    .replaceAll("[RESOLUCIÓN CLIENTE]", "[CUSTOMER RESOLUTION]")
    .replaceAll("[RESOLUCIÓN PROFESIONAL]", "[PROFESSIONAL RESOLUTION]")
    .replaceAll("[RESOLUCIÓN TOTAL]", "[FULL RESOLUTION]")
    .replace(/^Profesional:/gm, "Professional:")
    .replace(/^Cliente:/gm, "Customer:");
}

function formatearHoraChat(
  fecha: string,
  language: "es" | "en"
) {
  return new Intl.DateTimeFormat(
    language === "es"
      ? "es-US"
      : "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    }
  ).format(
    new Date(fecha)
  );
}

export default function TrabajoDetallePage() {
  const params =
    useParams<{
      id: string;
    }>();

  const router =
    useRouter();

  const { language } =
    useLanguage();

  const T = (
    es: string,
    en: string
  ) =>
    language === "es"
      ? es
      : en;

  const id =
    params.id;

  const [
    trabajo,
    setTrabajo,
  ] =
    useState<Trabajo | null>(
      null
    );

  const [
    fotos,
    setFotos,
  ] =
    useState<FotoTrabajo[]>([]);

  const [
    oferta,
    setOferta,
  ] =
    useState<Oferta | null>(
      null
    );

  const [
    pago,
    setPago,
  ] =
    useState<Pago | null>(
      null
    );

  const [
    providerId,
    setProviderId,
  ] =
    useState<string | null>(
      null
    );

  const [
    cargando,
    setCargando,
  ] =
    useState(true);

  const [
    enviando,
    setEnviando,
  ] =
    useState(false);

  const [
    pagosConfigurados,
    setPagosConfigurados,
  ] =
    useState<boolean | null>(
      null
    );

  const [
    cambiandoEstado,
    setCambiandoEstado,
  ] =
    useState(false);

  const [
    completando,
    setCompletando,
  ] =
    useState(false);

  const [
    evidenciasFinales,
    setEvidenciasFinales,
  ] =
    useState<EvidenciaFinal[]>([]);

  const [
    archivosEvidenciaFinal,
    setArchivosEvidenciaFinal,
  ] =
    useState<File[]>([]);

  const [
    subiendoEvidenciaFinal,
    setSubiendoEvidenciaFinal,
  ] =
    useState(false);

  const [
    liberandoTrabajo,
    setLiberandoTrabajo,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    mensaje,
    setMensaje,
  ] =
    useState("");

  const [
    reclamo,
    setReclamo,
  ] =
    useState<ReclamoTrabajo | null>(
      null
    );

  const [
    evidenciasReclamo,
    setEvidenciasReclamo,
  ] =
    useState<EvidenciaReclamo[]>(
      []
    );

  const [
    archivosReclamo,
    setArchivosReclamo,
  ] =
    useState<File[]>(
      []
    );

  const [
    subiendoEvidencia,
    setSubiendoEvidencia,
  ] =
    useState(false);

  const [
    explicacionEvidencia,
    setExplicacionEvidencia,
  ] =
    useState("");

  const [
    ahora,
    setAhora,
  ] =
    useState(
      Date.now()
    );

  const [
    cambiosPresupuesto,
    setCambiosPresupuesto,
  ] =
    useState<ChangeOrder[]>(
      []
    );

  const [
    mostrarCambioPresupuesto,
    setMostrarCambioPresupuesto,
  ] =
    useState(false);

  const [
    enviandoCambioPresupuesto,
    setEnviandoCambioPresupuesto,
  ] =
    useState(false);

  const [
    motivoCambioPresupuesto,
    setMotivoCambioPresupuesto,
  ] =
    useState("");

  const [
    descripcionCambioPresupuesto,
    setDescripcionCambioPresupuesto,
  ] =
    useState("");

  const [
    montoAdicional,
    setMontoAdicional,
  ] =
    useState("");

  const [
    archivosCambioPresupuesto,
    setArchivosCambioPresupuesto,
  ] =
    useState<File[]>(
      []
    );

  const [
    usuarioChatId,
    setUsuarioChatId,
  ] = useState<string | null>(null);

  const [
    mensajesChat,
    setMensajesChat,
  ] = useState<JobMessage[]>([]);

  const [
    mensajeChat,
    setMensajeChat,
  ] = useState("");

  const [
    cargandoChat,
    setCargandoChat,
  ] = useState(true);

  const [
    enviandoMensajeChat,
    setEnviandoMensajeChat,
  ] = useState(false);

  const [
    chatRealtimeConectado,
    setChatRealtimeConectado,
  ] = useState(false);

  const finalChatRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const ofertaRechazadaPorCliente =
    oferta?.status === "rejected" &&
    trabajo?.preferred_provider_id !== providerId;

  /*
    CARGA INICIAL
    + REALTIME
  */

  useEffect(() => {
    if (!id) {
      return;
    }

    let mounted = true;

    cargarTodo();

    const channel = supabase
      .channel(
        `trabajo-detalle-${id}`
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log(
            "Cambio recibido en trabajo:",
            payload
          );

          if (!mounted) {
            return;
          }

          const nuevo =
            payload.new as Trabajo;

          setTrabajo(
            (actual) => {
              if (!actual) {
                return nuevo;
              }

              return {
                ...actual,
                ...nuevo,
              };
            }
          );

          if (
            nuevo.status ===
            "cancelled"
          ) {
            setMensaje("");
            setError("");
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "change_orders",
          filter: `request_id=eq.${id}`,
        },
        () => {
          if (!mounted) {
            return;
          }

          window.setTimeout(
            () => {
              cargarTodo();
            },
            250
          );
        }
      )
      .subscribe(
        (status) => {
          console.log(
            "Realtime trabajo:",
            status
          );
        }
      );

    return () => {
      mounted = false;

      supabase.removeChannel(
        channel
      );
    };
  }, [id]);

  /*
    CHAT PRIVADO RELYDO
  */

  useEffect(() => {
    if (!id) {
      return;
    }

    let activo = true;

    async function iniciarChat() {
      setCargandoChat(true);

      try {
        const {
          data: { user },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !user ||
          !activo
        ) {
          return;
        }

        setUsuarioChatId(
          user.id
        );

        const {
          data,
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
            "Error cargando chat:",
            mensajesError
          );
        } else if (activo) {
          setMensajesChat(
            (data || []) as JobMessage[]
          );
        }
      } finally {
        if (activo) {
          setCargandoChat(false);
        }
      }
    }

    iniciarChat();

    const canalChat =
      supabase
        .channel(
          `chat-profesional-${id}`
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
            setChatRealtimeConectado(
              status === "SUBSCRIBED"
            );
          }
        );

    return () => {
      activo = false;

      supabase.removeChannel(
        canalChat
      );
    };
  }, [id]);

  useEffect(() => {
    finalChatRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [mensajesChat.length]);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setAhora(
            Date.now()
          );
        },
        60 * 1000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, []);


  async function notificarEventoTrabajo(
    event: string,
    extra: Record<string, unknown> = {}
  ) {
    try {
      const {
        data: {
          session,
        },
      } =
        await supabase.auth.getSession();

      const accessToken =
        session?.access_token;

      if (!accessToken) {
        console.warn(
          "RELYDO: no encontramos access token para notificar el evento.",
          event
        );
        return;
      }

      const response =
        await fetch(
          "/api/notifications/job-event",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${accessToken}`,
            },
            body:
              JSON.stringify({
                event,
                requestId: id,
                ...extra,
              }),
          }
        );

      const result =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        console.warn(
          "RELYDO: el evento ocurrió, pero la notificación no pudo enviarse:",
          event,
          result
        );
        return;
      }

      console.log(
        "RELYDO: notificación enviada:",
        event,
        result
      );
    } catch (notificationError) {
      console.warn(
        "RELYDO: error enviando notificación del evento:",
        event,
        notificationError
      );
    }
  }

  async function cargarTodo() {
    setCargando(true);
    setError("");

    try {
      /*
        USUARIO ACTUAL
      */

      const {
        data: {
          user,
        },
        error:
          userError,
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

      /*
        PERFIL PROFESIONAL
      */

      const {
        data: provider,
        error:
          providerError,
      } = await supabase
        .from(
          "provider_profiles"
        )
        .select(`
          verification_status,
          verified,
          active
        `)
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

      if (
        providerError ||
        !provider
      ) {
        throw new Error(
          T("No se encontró tu perfil profesional.", "We could not find your professional profile.")
        );
      }

      if (
        provider.verification_status !==
          "verified" ||
        provider.verified !==
          true ||
        provider.active !==
          true
      ) {
        throw new Error(
          T("Tu cuenta debe estar verificada y activa para acceder a trabajos.", "Your account must be verified and active to access jobs.")
        );
      }

      setProviderId(
        user.id
      );

      /*
        ESTADO DE PAGOS DEL PROFESIONAL

        El profesional puede ver el trabajo aunque Stripe todavía
        no esté configurado. Esta comprobación solo decide si puede
        enviar un presupuesto.
      */

      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData.session
      ) {
        setPagosConfigurados(false);
      } else {
        try {
          const stripeStatusResponse =
            await fetch(
              "/api/stripe/connect/status",
              {
                method: "GET",
                headers: {
                  Authorization:
                    `Bearer ${sessionData.session.access_token}`,
                },
                cache: "no-store",
              }
            );

          const stripeStatus =
            await stripeStatusResponse
              .json()
              .catch(() => null);

          const pagosListos =
            stripeStatusResponse.ok &&
            stripeStatus?.connected === true &&
            stripeStatus?.onboardingComplete === true &&
            stripeStatus?.payoutsEnabled === true &&
            stripeStatus?.transfersCapability === "active";

          setPagosConfigurados(
            pagosListos
          );
        } catch (stripeError) {
          console.error(
            "Error comprobando Stripe Connect:",
            stripeError
          );

          // Si no podemos verificar Stripe, no permitimos enviar
          // presupuestos hasta poder confirmar el estado.
          setPagosConfigurados(false);
        }
      }

      /*
        ACCESO HISTÓRICO DEL PROFESIONAL

        Antes de cargar el trabajo comprobamos si este profesional
        ya envió un presupuesto para esta solicitud. Esto permite
        que un presupuesto rechazado siga abriendo su detalle en
        modo historial, aunque el trabajo haya sido asignado a otro
        profesional.
      */

      const {
        data: ofertaAcceso,
        error: ofertaAccesoError,
      } = await supabase
        .from("offers")
        .select(`
          id,
          status
        `)
        .eq("request_id", id)
        .eq("professional_id", user.id)
        .maybeSingle();

      if (ofertaAccesoError) {
        console.error(
          "Error comprobando acceso histórico del profesional:",
          ofertaAccesoError
        );
      }

      const tieneAccesoHistorico =
        Boolean(ofertaAcceso);

      /*
        TRABAJO
      */

      const resultadoDirecto = await supabase
        .from(
          "service_requests"
        )
        .select(`
          id,
          title,
          description,
          address_line1,
          city,
          state,
          zip_code,
          preferred_date,
          preferred_time,
          status,
          job_stage,
          customer_name,
          customer_id,
          preferred_provider_id,
          cancellation_reason,
          completed_at,
          completion_review_status,
          submitted_for_review_at,
          completion_approved_at
        `)
        .eq(
          "id",
          id
        )
        .maybeSingle();

      let trabajoData =
        resultadoDirecto.data as Trabajo | null;

      /*
        Un trabajo abierto puede aparecer correctamente en /trabajos mediante
        get_provider_open_requests_safe y, al mismo tiempo, quedar oculto por
        RLS en una lectura directa de service_requests. En ese caso usamos la
        misma RPC segura de la lista para abrir solamente los datos públicos
        del trabajo. La dirección exacta y el customer_id NO se exponen aquí.
      */
      if (!trabajoData) {
        const {
          data: trabajosAbiertosSeguros,
          error: trabajosAbiertosError,
        } = await supabase.rpc(
          "get_provider_open_requests_safe"
        );

        if (trabajosAbiertosError) {
          console.error(
            "Error cargando trabajo abierto mediante RPC segura:",
            trabajosAbiertosError
          );
        }

        let trabajosAbiertosNormalizados: Array<Record<string, unknown>> = [];

        if (Array.isArray(trabajosAbiertosSeguros)) {
          trabajosAbiertosNormalizados =
            trabajosAbiertosSeguros as Array<Record<string, unknown>>;
        } else if (typeof trabajosAbiertosSeguros === "string") {
          try {
            const parsed = JSON.parse(trabajosAbiertosSeguros);

            if (Array.isArray(parsed)) {
              trabajosAbiertosNormalizados =
                parsed as Array<Record<string, unknown>>;
            }
          } catch (parseError) {
            console.error(
              "Error interpretando respuesta de get_provider_open_requests_safe:",
              parseError
            );
          }
        } else if (
          trabajosAbiertosSeguros &&
          typeof trabajosAbiertosSeguros === "object"
        ) {
          trabajosAbiertosNormalizados = [
            trabajosAbiertosSeguros as Record<string, unknown>,
          ];
        }

        const trabajoAbiertoSeguro =
          trabajosAbiertosNormalizados.find(
            (item) =>
              String(item.id || "") === String(id)
          ) as
            | {
                id: string;
                title: string;
                description: string;
                city: string;
                state: string;
                zip_code: string;
                preferred_date: string | null;
                preferred_time: string | null;
                status: string;
                customer_name: string | null;
                preferred_provider_id: string | null;
              }
            | undefined;

        if (trabajoAbiertoSeguro) {
          trabajoData = {
            id: trabajoAbiertoSeguro.id,
            title: trabajoAbiertoSeguro.title,
            description: trabajoAbiertoSeguro.description,
            address_line1: null,
            city: trabajoAbiertoSeguro.city,
            state: trabajoAbiertoSeguro.state,
            zip_code: trabajoAbiertoSeguro.zip_code,
            preferred_date: trabajoAbiertoSeguro.preferred_date,
            preferred_time: trabajoAbiertoSeguro.preferred_time,
            status: trabajoAbiertoSeguro.status,
            job_stage: null,
            customer_name: trabajoAbiertoSeguro.customer_name,
            customer_id: "",
            preferred_provider_id:
              trabajoAbiertoSeguro.preferred_provider_id,
            cancellation_reason: null,
            completed_at: null,
            completion_review_status: null,
            submitted_for_review_at: null,
            completion_approved_at: null,
          };
        }
      }

      if (!trabajoData) {
        throw new Error(
          T("Este trabajo no existe o no tienes permiso para verlo.", "This job does not exist or you do not have permission to view it.")
        );
      }

      /*
        CONTROL DE ACCESO
      */

      if (
        trabajoData.status !==
          "open" &&
        trabajoData.preferred_provider_id &&
        trabajoData.preferred_provider_id !==
          user.id &&
        !tieneAccesoHistorico
      ) {
        throw new Error(
          T("Este trabajo fue asignado a otro profesional.", "This job was assigned to another professional.")
        );
      }

      if (
        trabajoData.status ===
          "open" &&
        trabajoData.preferred_provider_id &&
        trabajoData.preferred_provider_id !==
          user.id &&
        !tieneAccesoHistorico
      ) {
        throw new Error(
          T("Esta solicitud está dirigida a otro profesional.", "This request is directed to another professional.")
        );
      }

      setTrabajo(
        trabajoData as Trabajo
      );

      /*
        FOTOS
      */

      const {
        data:
          fotosData,
        error:
          fotosError,
      } = await supabase
        .from(
          "request_photos"
        )
        .select(`
          id,
          request_id,
          file_url
        `)
        .eq(
          "request_id",
          id
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

      if (
        fotosError
      ) {
        console.error(
          fotosError
        );

        setFotos([]);
      } else {
        setFotos(
          fotosData ||
            []
        );
      }

      /*
        EVIDENCIA FINAL DEL TRABAJO
      */

      const {
        data: evidenciaFinalData,
        error: evidenciaFinalError,
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
        .eq("provider_id", user.id)
        .order("created_at", {
          ascending: true,
        });

      if (evidenciaFinalError) {
        console.error(
          "Error cargando evidencia final:",
          evidenciaFinalError
        );
        setEvidenciasFinales([]);
      } else {
        setEvidenciasFinales(
          (evidenciaFinalData || []) as EvidenciaFinal[]
        );
      }

      /*
        PRESUPUESTO
      */

      const {
        data:
          ofertaData,
        error:
          ofertaError,
      } = await supabase
        .from(
          "offers"
        )
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
        .eq(
          "request_id",
          id
        )
        .eq(
          "professional_id",
          user.id
        )
        .maybeSingle();

      if (
        ofertaError
      ) {
        console.error(
          ofertaError
        );
      }

      setOferta(
        ofertaData as Oferta | null
      );


      /*
        PAGO DEL PROFESIONAL
      */

      const {
        data:
          pagoData,
        error:
          pagoError,
      } = await supabase
        .from(
          "payments"
        )
        .select(`
          id,
          request_id,
          offer_id,
          provider_id,
          job_amount,
          provider_commission_percent,
          provider_commission_amount,
          provider_net_amount,
          status,
          paid_at,
          cancellation_stage,
          cancellation_penalty_percent,
          cancellation_penalty_amount,
          cancellation_provider_amount,
          cancellation_platform_amount,
          cancellation_processed_at
        `)
        .eq(
          "request_id",
          id
        )
        .eq(
          "provider_id",
          user.id
        )
        .order(
          "updated_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

      if (
        pagoError
      ) {
        console.error(
          "Error cargando pago del profesional:",
          pagoError
        );

        setPago(null);
      } else {
        setPago(
          pagoData as Pago | null
        );
      }


      /*
        CAMBIOS DE PRESUPUESTO
      */

      const {
        data: cambiosData,
        error: cambiosError,
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
          accepted_at,
          rejected_at,
          payment_status,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          additional_customer_fee_percent,
          additional_customer_fee_amount,
          additional_customer_total_amount,
          additional_provider_commission_percent,
          additional_provider_commission_amount,
          additional_provider_net_amount,
          additional_platform_revenue_amount,
          paid_at,
          created_at,
          updated_at
        `)
        .eq("request_id", id)
        .eq("provider_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (cambiosError) {
        console.error(
          "Error cargando cambios de presupuesto:",
          cambiosError
        );
        setCambiosPresupuesto([]);
      } else {
        setCambiosPresupuesto(
          (cambiosData || []) as ChangeOrder[]
        );
      }


      /*
        RECLAMO DEL TRABAJO
      */

      const {
        data: reclamoData,
        error: reclamoError,
      } = await supabase
        .from("job_claims")
        .select(`
          id,
          request_id,
          customer_id,
          provider_id,
          reason,
          description,
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
        .eq(
          "request_id",
          id
        )
        .eq(
          "provider_id",
          user.id
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

      if (
        reclamoError
      ) {
        console.error(
          "Error cargando reclamo del trabajo:",
          reclamoError
        );

        setReclamo(null);
        setEvidenciasReclamo([]);
      } else {
        const reclamoActual =
          reclamoData as ReclamoTrabajo | null;

        setReclamo(
          reclamoActual
        );

        if (
          reclamoActual
        ) {
          const {
            data: evidenciasData,
            error: evidenciasError,
          } = await supabase
            .from(
              "claim_evidence"
            )
            .select(`
              id,
              claim_id,
              uploaded_by,
              uploaded_by_role,
              file_type,
              file_path,
              created_at
            `)
            .eq(
              "claim_id",
              reclamoActual.id
            )
            .eq(
              "uploaded_by",
              user.id
            )
            .eq(
              "uploaded_by_role",
              "provider"
            )
            .order(
              "created_at",
              {
                ascending: true,
              }
            );

          if (
            evidenciasError
          ) {
            console.error(
              "Error cargando evidencia del profesional:",
              evidenciasError
            );

            setEvidenciasReclamo(
              []
            );
          } else {
            setEvidenciasReclamo(
              (evidenciasData ||
                []) as EvidenciaReclamo[]
            );
          }
        } else {
          setEvidenciasReclamo(
            []
          );
        }
      }
    } catch (err) {
      console.error(
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("Ocurrió un error inesperado.", "An unexpected error occurred.")
      );
    } finally {
      setCargando(
        false
      );
    }
  }

  /*
    ENVIAR PRESUPUESTO
  */

  async function enviarOferta(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      !providerId ||
      !trabajo ||
      trabajo.status !==
        "open" ||
      oferta
    ) {
      return;
    }

    setEnviando(true);
    setError("");
    setMensaje("");

    try {
      const form =
        e.currentTarget;

      const formData =
        new FormData(
          form
        );

      const price =
        Number(
          formData.get(
            "price"
          )
        );

      const arrivalMinutes =
        Number(
          formData.get(
            "arrival_minutes"
          )
        );

      const estimatedJobMinutes =
        Number(
          formData.get(
            "estimated_job_minutes"
          )
        );

      const message =
        String(
          formData.get(
            "message"
          ) || ""
        ).trim();

      if (
        !Number.isFinite(
          price
        ) ||
        price <= 0
      ) {
        throw new Error(
          T("Introduce un precio válido.", "Enter a valid price.")
        );
      }

      if (
        !Number.isInteger(
          arrivalMinutes
        ) ||
        arrivalMinutes < 0
      ) {
        throw new Error(
          T("Introduce un tiempo de llegada válido.", "Enter a valid arrival time.")
        );
      }

      if (
        !Number.isInteger(
          estimatedJobMinutes
        ) ||
        estimatedJobMinutes <=
          0
      ) {
        throw new Error(
          T("Introduce una duración estimada válida.", "Enter a valid estimated duration.")
        );
      }

      if (!message) {
        throw new Error(
          T("Escribe un mensaje para el cliente.", "Write a message for the customer.")
        );
      }

      /*
        BARRERA REAL DE STRIPE CONNECT

        Aunque alguien intentara saltarse la interfaz, volvemos a
        comprobar Stripe justo antes de guardar el presupuesto.
      */

      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData.session
      ) {
        throw new Error(
          T(
            "No pudimos verificar tu sesión para comprobar tus pagos.",
            "We could not verify your session to check your payments."
          )
        );
      }

      const stripeStatusResponse =
        await fetch(
          "/api/stripe/connect/status",
          {
            method: "GET",
            headers: {
              Authorization:
                `Bearer ${sessionData.session.access_token}`,
            },
            cache: "no-store",
          }
        );

      const stripeStatus =
        await stripeStatusResponse
          .json()
          .catch(() => null);

      if (!stripeStatusResponse.ok) {
        throw new Error(
          stripeStatus?.error ||
            T(
              "No pudimos comprobar tu configuración de pagos.",
              "We could not verify your payment setup."
            )
        );
      }

      const pagosListos =
        stripeStatus?.connected === true &&
        stripeStatus?.onboardingComplete === true &&
        stripeStatus?.payoutsEnabled === true &&
        stripeStatus?.transfersCapability === "active";

      setPagosConfigurados(
        pagosListos
      );

      if (!pagosListos) {
        throw new Error(
          T(
            "Antes de enviar presupuestos debes configurar tus pagos con Stripe Connect desde tu Panel Profesional.",
            "Before sending quotes, you must set up Stripe Connect payments from your Professional Dashboard."
          )
        );
      }

      const {
        data:
          nuevaOferta,
        error:
          insertError,
      } = await supabase
        .from(
          "offers"
        )
        .insert({
          request_id:
            trabajo.id,

          professional_id:
            providerId,

          price,

          arrival_minutes:
            arrivalMinutes,

          estimated_job_minutes:
            estimatedJobMinutes,

          message,

          status:
            "pending",
        })
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
        .single();

      if (
        insertError
      ) {
        throw new Error(
          insertError.message
        );
      }

      setOferta(
        nuevaOferta as Oferta
      );

      /*
        PUSH AL CLIENTE:
        NUEVO PRESUPUESTO RECIBIDO

        Si el Push falla, el presupuesto
        sigue guardado correctamente.
      */

      try {
        const {
          data: {
            session,
          },
        } =
          await supabase.auth.getSession();

        const accessToken =
          session?.access_token;

        if (accessToken) {
          const pushResponse =
            await fetch(
              "/api/push/new-offer",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  Authorization:
                    `Bearer ${accessToken}`,
                },

                body:
                  JSON.stringify({
                    offerId:
                      nuevaOferta.id,
                  }),
              }
            );

          const pushResult =
            await pushResponse
              .json()
              .catch(() => null);

          if (!pushResponse.ok) {
            console.warn(
              "El presupuesto se guardó, pero el Push al cliente no pudo enviarse:",
              pushResult
            );
          } else {
            console.log(
              "Push nuevo presupuesto:",
              pushResult
            );
          }
        } else {
          console.warn(
            "El presupuesto se guardó, pero no encontramos access token para enviar Push."
          );
        }
      } catch (pushError) {
        console.warn(
          "El presupuesto se guardó, pero ocurrió un error enviando Push al cliente:",
          pushError
        );
      }

      form.reset();

      setMensaje(
        T("Presupuesto enviado correctamente.", "Quote sent successfully.")
      );
    } catch (err) {
      console.error(
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo enviar el presupuesto.", "The quote could not be sent.")
      );
    } finally {
      setEnviando(
        false
      );
    }
  }

  /*
    CAMBIAR ETAPA
  */

  async function cambiarEtapa(
    nuevaEtapa: string
  ) {
    if (
      !trabajo ||
      !providerId
    ) {
      return;
    }

    /*
      PROTECCIÓN CANCELACIÓN
    */

    if (
      trabajo.status ===
      "cancelled"
    ) {
      setError(
        T("Este trabajo fue cancelado. Ya no puedes actualizar su estado.", "This job was cancelled. You can no longer update its status.")
      );

      return;
    }

    if (
      trabajo.status !==
        "in_progress" ||
      trabajo.preferred_provider_id !==
        providerId
    ) {
      setError(
        T("No puedes cambiar el estado de este trabajo.", "You cannot change the status of this job.")
      );

      return;
    }

    setCambiandoEstado(
      true
    );

    setError("");
    setMensaje("");

    try {
      /*
        REVISAR ESTADO ACTUAL
        ANTES DE MODIFICAR
      */

      const {
        data:
          estadoActual,
        error:
          estadoError,
      } = await supabase
        .from(
          "service_requests"
        )
        .select(
          "status, preferred_provider_id"
        )
        .eq(
          "id",
          trabajo.id
        )
        .single();

      if (
        estadoError
      ) {
        throw new Error(
          estadoError.message
        );
      }

      if (
        estadoActual.status ===
        "cancelled"
      ) {
        setTrabajo(
          (actual) =>
            actual
              ? {
                  ...actual,
                  status:
                    "cancelled",
                }
              : actual
        );

        throw new Error(
          T("Este trabajo fue cancelado. Ya no puedes continuar.", "This job was cancelled. You can no longer continue.")
        );
      }

      if (
        estadoActual.status !==
          "in_progress" ||
        estadoActual.preferred_provider_id !==
          providerId
      ) {
        throw new Error(
          T("Este trabajo ya no está disponible para actualizar.", "This job is no longer available to update.")
        );
      }

      const {
        error:
          stageError,
      } = await supabase.rpc(
        "update_job_stage",
        {
          p_request_id:
            trabajo.id,

          p_job_stage:
            nuevaEtapa,
        }
      );

      if (
        stageError
      ) {
        throw new Error(
          stageError.message
        );
      }

      setTrabajo(
        (
          actual
        ) => {
          if (!actual) {
            return actual;
          }

          return {
            ...actual,
            job_stage:
              nuevaEtapa,
          };
        }
      );

      await notificarEventoTrabajo(
        "provider_stage_changed",
        {
          stage:
            nuevaEtapa,
        }
      );

      const textos:
        Record<
          string,
          string
        > = {
        on_the_way:
          T("El cliente ya puede ver que vas en camino.", "The customer can now see that you are on the way."),
        arrived:
          T("El cliente ya puede ver que llegaste.", "The customer can now see that you arrived."),
        working:
          T("El trabajo aparece ahora como iniciado.", "The job now appears as started."),
      };

      setMensaje(
        textos[
          nuevaEtapa
        ] ||
          T("Estado actualizado.", "Status updated.")
      );
    } catch (err) {
      console.error(
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo actualizar el trabajo.", "The job could not be updated.")
      );
    } finally {
      setCambiandoEstado(
        false
      );
    }
  }

  /*
    EVIDENCIA FINAL DEL TRABAJO
  */

  function seleccionarEvidenciaFinal(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const nuevos = Array.from(
      event.target.files || []
    );

    if (nuevos.length === 0) {
      return;
    }

    const permitidos = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    if (
      nuevos.some(
        (file) => !permitidos.includes(file.type)
      )
    ) {
      setError(
        T("Solo puedes subir fotos JPG, PNG o WEBP y videos MP4, WEBM o MOV.", "You can only upload JPG, PNG, or WEBP photos and MP4, WEBM, or MOV videos.")
      );
      event.target.value = "";
      return;
    }

    if (
      nuevos.some(
        (file) => file.size > 50 * 1024 * 1024
      )
    ) {
      setError(
        T("Cada foto o video debe pesar 50 MB o menos.", "Each photo or video must be 50 MB or less.")
      );
      event.target.value = "";
      return;
    }

    const combinadosSinFiltrar = [
      ...archivosEvidenciaFinal,
      ...nuevos,
    ];

    // Evita seleccionar dos veces el mismo archivo en el mismo lote.
    const archivosUnicos = new Map<string, File>();

    for (const file of combinadosSinFiltrar) {
      const clave = `${file.name}-${file.size}-${file.lastModified}-${file.type}`;

      if (!archivosUnicos.has(clave)) {
        archivosUnicos.set(clave, file);
      }
    }

    const combinados = Array.from(archivosUnicos.values());

    const fotosSeleccionadas =
      combinados.filter((file) =>
        file.type.startsWith("image/")
      ).length;

    const videosSeleccionados =
      combinados.filter((file) =>
        file.type.startsWith("video/")
      ).length;

    const fotosGuardadas =
      evidenciasFinales.filter(
        (item) => item.file_type === "image"
      ).length;

    const videosGuardados =
      evidenciasFinales.filter(
        (item) => item.file_type === "video"
      ).length;

    if (
      fotosGuardadas + fotosSeleccionadas > 10
    ) {
      setError(
        T("Puedes guardar un máximo de 10 fotos como evidencia final.", "You can save a maximum of 10 photos as final evidence.")
      );
      event.target.value = "";
      return;
    }

    if (
      videosGuardados + videosSeleccionados > 2
    ) {
      setError(
        T("Puedes guardar un máximo de 2 videos como evidencia final.", "You can save a maximum of 2 videos as final evidence.")
      );
      event.target.value = "";
      return;
    }

    setArchivosEvidenciaFinal(combinados);
    setError("");
    event.target.value = "";
  }

  function quitarEvidenciaFinalSeleccionada(
    index: number
  ) {
    setArchivosEvidenciaFinal(
      (actuales) =>
        actuales.filter((_, i) => i !== index)
    );
  }

  async function guardarEvidenciaFinal() {
    if (!trabajo || !providerId) {
      return false;
    }

    if (
      trabajo.status !== "in_progress" ||
      trabajo.job_stage !== "working" ||
      trabajo.preferred_provider_id !== providerId
    ) {
      setError(
        T("Solo puedes subir evidencia final mientras el trabajo está iniciado y asignado a tu cuenta.", "You can only upload final evidence while the job is started and assigned to your account.")
      );
      return false;
    }

    if (archivosEvidenciaFinal.length === 0) {
      setError(
        T("Selecciona al menos una foto del trabajo terminado.", "Select at least one photo of the completed work.")
      );
      return false;
    }

    const totalFotos =
      evidenciasFinales.filter(
        (item) => item.file_type === "image"
      ).length +
      archivosEvidenciaFinal.filter((file) =>
        file.type.startsWith("image/")
      ).length;

    if (totalFotos < 1) {
      setError(
        T("Para completar el trabajo debes guardar al menos 1 foto. Los videos son opcionales.", "To complete the job, you must save at least 1 photo. Videos are optional.")
      );
      return false;
    }

    setSubiendoEvidenciaFinal(true);
    setError("");
    setMensaje("");

    const guardadas: EvidenciaFinal[] = [];

    try {
      for (
        const [index, file] of
        archivosEvidenciaFinal.entries()
      ) {
        const nombreSeguro = file.name
          .replace(/[^a-zA-Z0-9._-]/g, "-")
          .slice(0, 80);

        const ruta =
          `${trabajo.id}/${providerId}/${Date.now()}-${index}-${nombreSeguro}`;

        const { error: uploadError } =
          await supabase.storage
            .from("job-completion-evidence")
            .upload(ruta, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type,
            });

        if (uploadError) {
          throw new Error(
            `${T("No pudimos subir", "We could not upload")} "${file.name}": ${uploadError.message}`
          );
        }

        const fileType: "image" | "video" =
          file.type.startsWith("video/")
            ? "video"
            : "image";

        const {
          data: evidenciaData,
          error: evidenciaError,
        } = await supabase
          .from("job_completion_evidence")
          .insert({
            request_id: trabajo.id,
            provider_id: providerId,
            file_type: fileType,
            file_path: ruta,
            file_url: ruta,
          })
          .select(`
            id,
            request_id,
            provider_id,
            file_type,
            file_path,
            file_url,
            created_at
          `)
          .single();

        if (evidenciaError) {
          await supabase.storage
            .from("job-completion-evidence")
            .remove([ruta]);

          throw new Error(
            `${T("El archivo subió, pero no pudimos registrarlo", "The file was uploaded, but we could not register it")}: ${evidenciaError.message}`
          );
        }

        const evidenciaGuardada =
          evidenciaData as EvidenciaFinal;

        guardadas.push(evidenciaGuardada);

        // Registrar inmediatamente cada archivo que sí terminó correctamente.
        // Si un archivo posterior falla, los ya guardados desaparecen de la
        // cola pendiente y un reintento no vuelve a insertarlos.
        setEvidenciasFinales((actuales) =>
          actuales.some(
            (item) => item.id === evidenciaGuardada.id
          )
            ? actuales
            : [...actuales, evidenciaGuardada]
        );

        setArchivosEvidenciaFinal((actuales) =>
          actuales.filter((item) => item !== file)
        );
      }

      // Cada evidencia se añadió al estado inmediatamente después de
      // confirmarse en la base de datos. Al llegar aquí, la cola pendiente
      // debe quedar vacía.
      setArchivosEvidenciaFinal([]);

      setMensaje(
        guardadas.length === 1
          ? T("Evidencia final guardada. Ya puedes pasar el trabajo a revisión.", "Final evidence saved. You can now submit the job for review.")
          : language === "es"
            ? `${guardadas.length} archivos de evidencia final guardados. Ya puedes pasar el trabajo a revisión.`
            : `${guardadas.length} final evidence files saved. You can now submit the job for review.`
      );

      return true;
    } catch (err) {
      console.error(
        "Error guardando evidencia final:",
        err
      );
      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo guardar la evidencia final.", "The final evidence could not be saved.")
      );
      return false;
    } finally {
      setSubiendoEvidenciaFinal(false);
    }
  }

  /*
    COMPLETAR
  */

  async function pasarARevision() {
    if (!trabajo || !providerId) return;

    if (reclamoActivo) {
      setError(T("Este trabajo tiene un reclamo activo. No puede pasar a revisión.", "This job has an active claim. It cannot be submitted for review."));
      return;
    }

    if (
      trabajo.status !== "in_progress" ||
      trabajo.job_stage !== "working" ||
      trabajo.preferred_provider_id !== providerId
    ) {
      setError(T("Este trabajo no puede pasar a revisión.", "This job cannot be submitted for review."));
      return;
    }

    if (trabajo.completion_review_status === "pending") return;

    const tieneFotoFinal = evidenciasFinales.some((item) => item.file_type === "image");
    if (!tieneFotoFinal) {
      setError(T("Antes de pasar a revisión debes guardar al menos 1 foto como evidencia final.", "Before submitting for review, you must save at least 1 photo as final evidence."));
      return;
    }

    if (!window.confirm(T("¿Confirmas que terminaste el trabajo y deseas enviarlo al cliente para revisión?", "Do you confirm the job is finished and want to send it to the customer for review?"))) return;

    setCompletando(true);
    setError("");
    setMensaje("");

    try {
      const { error: reviewError } = await supabase.rpc("submit_job_for_completion_review", {
        p_request_id: trabajo.id,
      });
      if (reviewError) throw new Error(reviewError.message);

      setTrabajo((actual) => actual ? {
        ...actual,
        completion_review_status: "pending",
        submitted_for_review_at: actual.submitted_for_review_at || new Date().toISOString(),
      } : actual);

      await cargarTodo();
      setMensaje(T("Trabajo enviado al cliente para revisión.", "Job sent to the customer for review."));
    } catch (err) {
      setError(err instanceof Error ? err.message : T("No se pudo pasar el trabajo a revisión.", "The job could not be submitted for review."));
      await cargarTodo();
    } finally {
      setCompletando(false);
    }
  }

  /*
    LIBERAR TRABAJO
    POR EL PROFESIONAL

    La solicitud vuelve a quedar abierta
    para que otro profesional pueda
    enviar un presupuesto.
  */

  async function liberarTrabajo() {
    if (
      !trabajo ||
      !providerId
    ) {
      return;
    }

    if (
      trabajo.status !==
        "in_progress" ||
      trabajo.preferred_provider_id !==
        providerId
    ) {
      setError(
        T("Este trabajo ya no está asignado a tu cuenta.", "This job is no longer assigned to your account.")
      );

      return;
    }

    if (
      trabajo.job_stage ===
      "working"
    ) {
      setError(
        T("No puedes liberar el trabajo después de haberlo iniciado.", "You cannot release the job after it has been started.")
      );

      return;
    }

    const confirmar =
      window.confirm(
        T("¿Seguro que no puedes realizar este trabajo?\n\nLa solicitud volverá a estar disponible para que otro profesional pueda atender al cliente.", "Are you sure you cannot perform this job?\n\nThe request will become available again so another professional can help the customer.")
      );

    if (!confirmar) {
      return;
    }

    setLiberandoTrabajo(
      true
    );

    setError("");
    setMensaje("");

    try {
      /*
        COMPROBAR EL ESTADO ACTUAL
        JUSTO ANTES DE LIBERARLO
      */

      const {
        data:
          estadoActual,
        error:
          estadoError,
      } = await supabase
        .from(
          "service_requests"
        )
        .select(`
          status,
          job_stage,
          preferred_provider_id
        `)
        .eq(
          "id",
          trabajo.id
        )
        .single();

      if (
        estadoError
      ) {
        throw new Error(
          estadoError.message
        );
      }

      if (
        estadoActual.status ===
        "cancelled"
      ) {
        setTrabajo(
          (actual) =>
            actual
              ? {
                  ...actual,
                  status:
                    "cancelled",
                }
              : actual
        );

        throw new Error(
          T("Este trabajo fue cancelado antes de que pudieras liberarlo.", "This job was cancelled before you could release it.")
        );
      }

      if (
        estadoActual.status !==
          "in_progress" ||
        estadoActual.preferred_provider_id !==
          providerId
      ) {
        throw new Error(
          T("Este trabajo ya no está asignado a tu cuenta.", "This job is no longer assigned to your account.")
        );
      }

      if (
        estadoActual.job_stage ===
        "working"
      ) {
        throw new Error(
          T("El trabajo ya fue iniciado y no puede liberarse de esta manera.", "The job has already started and cannot be released this way.")
        );
      }

      /*
        RPC SEGURA EN SUPABASE
      */

      const {
        error:
          releaseError,
      } = await supabase.rpc(
        "release_job_by_provider",
        {
          p_request_id:
            trabajo.id,
        }
      );

      if (
        releaseError
      ) {
        throw new Error(
          releaseError.message
        );
      }

      /*
        La función SQL:
        - vuelve status a open
        - borra preferred_provider_id
        - borra job_stage
        - rechaza la oferta de este profesional
        - registra este trabajo en provider_released_jobs
      */

      await notificarEventoTrabajo(
        "provider_released_job"
      );

      router.replace(
        "/panel-profesional"
      );
    } catch (err) {
      console.error(
        "Error liberando trabajo:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo liberar el trabajo.", "The job could not be released.")
      );
    } finally {
      setLiberandoTrabajo(
        false
      );
    }
  }

  /*
    EVIDENCIA DEL PROFESIONAL EN RECLAMOS
  */

  function seleccionarArchivosReclamo(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const nuevos =
      Array.from(
        event.target.files ||
        []
      );

    if (
      nuevos.length === 0
    ) {
      return;
    }

    const permitidos = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    const invalidos =
      nuevos.filter(
        (file) =>
          !permitidos.includes(
            file.type
          )
      );

    if (
      invalidos.length > 0
    ) {
      setError(
        T("Solo puedes adjuntar fotos JPG, PNG o WEBP y videos MP4, WEBM o MOV.", "You can only attach JPG, PNG, or WEBP photos and MP4, WEBM, or MOV videos.")
      );
      event.target.value = "";
      return;
    }

    const grandes =
      nuevos.filter(
        (file) =>
          file.size >
          50 * 1024 * 1024
      );

    if (
      grandes.length > 0
    ) {
      setError(
        T("Cada foto o video debe pesar 50 MB o menos.", "Each photo or video must be 50 MB or less.")
      );
      event.target.value = "";
      return;
    }

    const existentesImagenes =
      evidenciasReclamo.filter(
        (item) =>
          item.file_type ===
          "image"
      ).length;

    const existentesVideos =
      evidenciasReclamo.filter(
        (item) =>
          item.file_type ===
          "video"
      ).length;

    const combinados = [
      ...archivosReclamo,
      ...nuevos,
    ];

    const nuevasImagenes =
      combinados.filter(
        (file) =>
          file.type.startsWith(
            "image/"
          )
      ).length;

    const nuevosVideos =
      combinados.filter(
        (file) =>
          file.type.startsWith(
            "video/"
          )
      ).length;

    if (
      existentesImagenes +
        nuevasImagenes >
      10
    ) {
      setError(
        T("Puedes adjuntar un máximo total de 10 fotos en este reclamo.", "You can attach a maximum total of 10 photos to this claim.")
      );
      event.target.value = "";
      return;
    }

    if (
      existentesVideos +
        nuevosVideos >
      2
    ) {
      setError(
        T("Puedes adjuntar un máximo total de 2 videos en este reclamo.", "You can attach a maximum total of 2 videos to this claim.")
      );
      event.target.value = "";
      return;
    }

    setArchivosReclamo(
      combinados
    );

    setError("");
    event.target.value = "";
  }

  function quitarArchivoReclamo(
    index: number
  ) {
    setArchivosReclamo(
      (actuales) =>
        actuales.filter(
          (_, i) =>
            i !== index
        )
    );
  }

  async function subirEvidenciaReclamo() {
    if (
      !reclamo ||
      !providerId
    ) {
      setError(
        T("No encontramos un reclamo activo para este trabajo.", "We could not find an active claim for this job.")
      );
      return;
    }

    if (
      reclamo.status !== "open" &&
      reclamo.status !== "reviewing"
    ) {
      setError(
        T("Este reclamo ya está cerrado y no admite nueva evidencia.", "This claim is already closed and does not accept new evidence.")
      );
      return;
    }

    if (
      reclamo.provider_response ||
      reclamo.provider_responded_at ||
      evidenciasReclamo.length > 0
    ) {
      setError(
        T("Ya enviaste tu respuesta y evidencia para este reclamo. No se pueden hacer cambios después de enviarla.", "You already submitted your response and evidence for this claim. Changes cannot be made after submission.")
      );
      return;
    }

    const tiempoRespuesta =
      calcularTiempoRestante(
        reclamo.provider_response_deadline,
        language
      );

    if (
      tiempoRespuesta.vencido
    ) {
      setError(
        T("El plazo de 24 horas para responder este reclamo ya venció.", "The 24-hour deadline to respond to this claim has expired.")
      );
      return;
    }

    if (
      archivosReclamo.length ===
      0
    ) {
      setError(
        T("Selecciona al menos una foto o video.", "Select at least one photo or video.")
      );
      return;
    }

    if (
      !explicacionEvidencia.trim()
    ) {
      setError(
        T("Escribe una explicación de la evidencia antes de enviarla.", "Write an explanation of the evidence before submitting it.")
      );
      return;
    }

    setSubiendoEvidencia(
      true
    );

    setError("");
    setMensaje("");

    try {
      // Confirmar contra la base de datos que el profesional no haya
      // respondido ya desde otra pestaña, dispositivo o intento anterior.
      const {
        data: reclamoActualDb,
        error: reclamoActualError,
      } = await supabase
        .from("job_claims")
        .select(`
          id,
          provider_response,
          provider_responded_at
        `)
        .eq("id", reclamo.id)
        .eq("provider_id", providerId)
        .maybeSingle();

      if (reclamoActualError) {
        throw new Error(
          `No pudimos comprobar el estado actual del reclamo: ${reclamoActualError.message}`
        );
      }

      const {
        data: evidenciaExistenteDb,
        error: evidenciaExistenteError,
      } = await supabase
        .from("claim_evidence")
        .select("id")
        .eq("claim_id", reclamo.id)
        .eq("uploaded_by", providerId)
        .eq("uploaded_by_role", "provider")
        .limit(1);

      if (evidenciaExistenteError) {
        throw new Error(
          `No pudimos comprobar la evidencia ya enviada: ${evidenciaExistenteError.message}`
        );
      }

      if (
        reclamoActualDb?.provider_response ||
        reclamoActualDb?.provider_responded_at ||
        (evidenciaExistenteDb && evidenciaExistenteDb.length > 0)
      ) {
        await cargarTodo();
        throw new Error(
          "Ya enviaste tu respuesta y evidencia para este reclamo. No se permiten segundos envíos."
        );
      }

      const {
        error: respuestaError,
      } = await supabase
        .from("job_claims")
        .update({
          provider_response:
            explicacionEvidencia.trim(),
          provider_responded_at:
            new Date().toISOString(),
        })
        .eq("id", reclamo.id)
        .eq(
          "provider_id",
          providerId
        );

      if (
        respuestaError
      ) {
        throw new Error(
          `${T("No pudimos guardar tu explicación", "We could not save your explanation")}: ${respuestaError.message}`
        );
      }

      const nuevasEvidencias:
        EvidenciaReclamo[] =
        [];

      for (
        const [
          index,
          file,
        ] of archivosReclamo.entries()
      ) {
        const nombreSeguro =
          file.name
            .replace(
              /[^a-zA-Z0-9._-]/g,
              "-"
            )
            .slice(
              0,
              80
            );

        const ruta =
          `${reclamo.id}/${providerId}/${Date.now()}-${index}-${nombreSeguro}`;

        const {
          error:
            uploadError,
        } =
          await supabase.storage
            .from(
              "claim-evidence"
            )
            .upload(
              ruta,
              file,
              {
                cacheControl:
                  "3600",
                upsert: false,
                contentType:
                  file.type,
              }
            );

        if (
          uploadError
        ) {
          throw new Error(
            `${T("No pudimos subir", "We could not upload")} "${file.name}": ${uploadError.message}`
          );
        }

        const fileType:
          "image" | "video" =
          file.type.startsWith(
            "video/"
          )
            ? "video"
            : "image";

        const {
          data:
            evidenciaData,
          error:
            evidenciaError,
        } =
          await supabase
            .from(
              "claim_evidence"
            )
            .insert({
              claim_id:
                reclamo.id,
              uploaded_by:
                providerId,
              uploaded_by_role:
                "provider",
              file_type:
                fileType,
              file_url:
                ruta,
              file_path:
                ruta,
            })
            .select(`
              id,
              claim_id,
              uploaded_by,
              uploaded_by_role,
              file_type,
              file_path,
              created_at
            `)
            .single();

        if (
          evidenciaError
        ) {
          await supabase.storage
            .from(
              "claim-evidence"
            )
            .remove([
              ruta,
            ]);

          throw new Error(
            `${T("El archivo subió, pero no pudimos registrarlo", "The file was uploaded, but we could not register it")}: ${evidenciaError.message}`
          );
        }

        nuevasEvidencias.push(
          evidenciaData as EvidenciaReclamo
        );
      }

      setEvidenciasReclamo(
        (actuales) => [
          ...actuales,
          ...nuevasEvidencias,
        ]
      );

      setArchivosReclamo(
        []
      );

      setReclamo(
        (actual) =>
          actual
            ? {
                ...actual,
                provider_response:
                  explicacionEvidencia.trim(),
                provider_responded_at:
                  new Date().toISOString(),
              }
            : actual
      );

      setExplicacionEvidencia(
        ""
      );

      await notificarEventoTrabajo(
        "claim_provider_responded",
        {
          claimId:
            reclamo.id,
        }
      );

      setMensaje(
        nuevasEvidencias.length ===
        1
          ? "Respuesta y evidencia enviadas correctamente. El envío quedó cerrado para revisión de RELYDO."
          : `${nuevasEvidencias.length} archivos de evidencia y tu respuesta fueron enviados. El envío quedó cerrado para revisión de RELYDO.`
      );
    } catch (err) {
      console.error(
        "Error subiendo evidencia del profesional:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo subir la evidencia.", "The evidence could not be uploaded.")
      );
    } finally {
      setSubiendoEvidencia(
        false
      );
    }
  }

  /*
    CAMBIO DE PRESUPUESTO
  */

  function seleccionarArchivosCambioPresupuesto(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const nuevos =
      Array.from(
        event.target.files || []
      );

    if (nuevos.length === 0) {
      return;
    }

    const permitidos = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    const invalidos =
      nuevos.filter(
        (file) =>
          !permitidos.includes(
            file.type
          )
      );

    if (invalidos.length > 0) {
      setError(
        T("Solo puedes adjuntar fotos JPG, PNG o WEBP y videos MP4, WEBM o MOV.", "You can only attach JPG, PNG, or WEBP photos and MP4, WEBM, or MOV videos.")
      );
      event.target.value = "";
      return;
    }

    const grandes =
      nuevos.filter(
        (file) =>
          file.size >
          50 * 1024 * 1024
      );

    if (grandes.length > 0) {
      setError(
        T("Cada foto o video debe pesar 50 MB o menos.", "Each photo or video must be 50 MB or less.")
      );
      event.target.value = "";
      return;
    }

    const combinados = [
      ...archivosCambioPresupuesto,
      ...nuevos,
    ];

    const imagenes =
      combinados.filter(
        (file) =>
          file.type.startsWith(
            "image/"
          )
      );

    const videos =
      combinados.filter(
        (file) =>
          file.type.startsWith(
            "video/"
          )
      );

    if (imagenes.length > 10) {
      setError(
        "Puedes adjuntar un máximo de 10 fotos."
      );
      event.target.value = "";
      return;
    }

    if (videos.length > 2) {
      setError(
        "Puedes adjuntar un máximo de 2 videos."
      );
      event.target.value = "";
      return;
    }

    setArchivosCambioPresupuesto(
      combinados
    );
    setError("");
    event.target.value = "";
  }

  function quitarArchivoCambioPresupuesto(
    index: number
  ) {
    setArchivosCambioPresupuesto(
      (actuales) =>
        actuales.filter(
          (_, i) => i !== index
        )
    );
  }

  async function enviarCambioPresupuesto(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      !trabajo ||
      !providerId ||
      !oferta
    ) {
      setError(
        "No encontramos los datos necesarios del trabajo o del presupuesto."
      );
      return;
    }

    if (
      trabajo.status !== "in_progress" ||
      trabajo.job_stage !== "working" ||
      trabajo.preferred_provider_id !== providerId
    ) {
      setError(
        "Solo puedes solicitar un cambio de presupuesto después de iniciar un trabajo que esté asignado a tu cuenta."
      );
      return;
    }

    if (reclamoActivo) {
      setError(
        "No puedes solicitar un cambio de presupuesto mientras exista un reclamo activo."
      );
      return;
    }

    const pendiente =
      cambiosPresupuesto.find(
        (cambio) =>
          cambio.status === "pending"
      );

    if (pendiente) {
      setError(
        "Ya tienes un cambio de presupuesto pendiente de respuesta del cliente."
      );
      return;
    }

    const adicional =
      Number(montoAdicional);

    if (
      !Number.isFinite(adicional) ||
      adicional <= 0
    ) {
      setError(
        "Introduce un monto adicional válido."
      );
      return;
    }

    if (!motivoCambioPresupuesto.trim()) {
      setError(
        "Selecciona el motivo del cambio de presupuesto."
      );
      return;
    }

    if (
      descripcionCambioPresupuesto
        .trim()
        .length < 5
    ) {
      setError(
        "Explica brevemente por qué es necesario aumentar el presupuesto."
      );
      return;
    }

    const ultimoAceptadoPagado =
      cambiosPresupuesto.find(
        (cambio) =>
          cambio.status === "accepted" &&
          cambio.payment_status === "paid"
      );

    const montoOriginal =
      Number(
        ultimoAceptadoPagado?.new_total_amount ??
        pago?.job_amount ??
        oferta.price ??
        0
      );

    const nuevoTotal =
      Math.round(
        (montoOriginal +
          adicional +
          Number.EPSILON) *
          100
      ) / 100;

    setEnviandoCambioPresupuesto(
      true
    );
    setError("");
    setMensaje("");

    try {
      const {
        data: nuevoCambio,
        error: cambioError,
      } = await supabase
        .from("change_orders")
        .insert({
          request_id: trabajo.id,
          provider_id: providerId,
          customer_id:
            trabajo.customer_id,
          reason:
            motivoCambioPresupuesto.trim(),
          description:
            descripcionCambioPresupuesto.trim(),
          original_amount:
            montoOriginal,
          additional_amount:
            adicional,
          new_total_amount:
            nuevoTotal,
          status: "pending",
        })
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
          accepted_at,
          rejected_at,
          payment_status,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          additional_customer_fee_percent,
          additional_customer_fee_amount,
          additional_customer_total_amount,
          additional_provider_commission_percent,
          additional_provider_commission_amount,
          additional_provider_net_amount,
          additional_platform_revenue_amount,
          paid_at,
          created_at,
          updated_at
        `)
        .single();

      if (cambioError) {
        throw new Error(
          cambioError.message
        );
      }

      const cambio =
        nuevoCambio as ChangeOrder;

      for (
        const [
          index,
          file,
        ] of archivosCambioPresupuesto.entries()
      ) {
        const nombreSeguro =
          file.name
            .replace(
              /[^a-zA-Z0-9._-]/g,
              "-"
            )
            .slice(0, 80);

        const ruta =
          `${cambio.id}/${providerId}/${Date.now()}-${index}-${nombreSeguro}`;

        const {
          error: uploadError,
        } =
          await supabase.storage
            .from(
              "change-order-evidence"
            )
            .upload(
              ruta,
              file,
              {
                cacheControl:
                  "3600",
                upsert: false,
                contentType:
                  file.type,
              }
            );

        if (uploadError) {
          throw new Error(
            `El cambio de presupuesto fue creado, pero no pudimos subir "${file.name}": ${uploadError.message}`
          );
        }

        const fileType:
          "image" | "video" =
          file.type.startsWith(
            "video/"
          )
            ? "video"
            : "image";

        const {
          error: evidenciaError,
        } =
          await supabase
            .from(
              "change_order_evidence"
            )
            .insert({
              change_order_id:
                cambio.id,
              uploaded_by:
                providerId,
              uploaded_by_role:
                "provider",
              file_type:
                fileType,
              file_path:
                ruta,
              file_url:
                ruta,
            });

        if (evidenciaError) {
          throw new Error(
            `${T("El archivo subió, pero no pudimos registrarlo", "The file was uploaded, but we could not register it")}: ${evidenciaError.message}`
          );
        }
      }

      setCambiosPresupuesto(
        (actuales) => [
          cambio,
          ...actuales,
        ]
      );

      setMostrarCambioPresupuesto(
        false
      );
      setMotivoCambioPresupuesto(
        ""
      );
      setDescripcionCambioPresupuesto(
        ""
      );
      setMontoAdicional(
        ""
      );
      setArchivosCambioPresupuesto(
        []
      );

      await notificarEventoTrabajo(
        "change_order_requested",
        {
          changeOrderId:
            cambio.id,
        }
      );

      setMensaje(
        `Cambio de presupuesto enviado. Solicitaste $${adicional.toFixed(
          2
        )} adicionales. El nuevo total propuesto es $${nuevoTotal.toFixed(
          2
        )}.`
      );
    } catch (err) {
      console.error(
        "Error creando cambio de presupuesto:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el cambio de presupuesto."
      );

      await cargarTodo();
    } finally {
      setEnviandoCambioPresupuesto(
        false
      );
    }
  }


  /*
    DIRECCIÓN
  */

  function abrirDireccion() {
    if (!trabajo) {
      return;
    }

    const direccion =
      [
        trabajo.address_line1,
        trabajo.city,
        trabajo.state,
        trabajo.zip_code,
      ]
        .filter(Boolean)
        .join(", ");

    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        direccion
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  /*
    PROGRESO
  */

  function numeroEtapa() {
    if (
      trabajo?.status ===
      "completed"
    ) {
      return 6;
    }

    if (trabajo?.completion_review_status === "pending") {
      return 5;
    }

    if (
      trabajo?.job_stage ===
      "working"
    ) {
      return 4;
    }

    if (
      trabajo?.job_stage ===
      "arrived"
    ) {
      return 3;
    }

    if (
      trabajo?.job_stage ===
      "on_the_way"
    ) {
      return 2;
    }

    return 1;
  }

  const reclamoActivoChat =
    Boolean(
      reclamo &&
        (
          reclamo.status === "open" ||
          reclamo.status === "reviewing" ||
          reclamo.status === "in_review"
        )
    );

  /*
    Si RELYDO ya resolvió el reclamo, el chat NO vuelve a abrirse.
    La resolución administrativa tiene prioridad sobre la ventana normal
    de 12 horas que existe después de completar un trabajo sin reclamo.
  */
  const reclamoResueltoChat =
    Boolean(
      reclamo &&
        !reclamoActivoChat &&
        (
          Boolean(reclamo.resolved_at) ||
          reclamo.status === "resolved" ||
          reclamo.status === "closed"
        )
    );

  const chatDentroDe12Horas =
    Boolean(
      trabajo?.status ===
        "completed" &&
        trabajo.completed_at &&
        ahora -
          new Date(
            trabajo.completed_at
          ).getTime() <
          12 * 60 * 60 * 1000
    );

  const chatPuedeEnviar =
    Boolean(
      trabajo &&
        !reclamoActivoChat &&
        !reclamoResueltoChat &&
        (
          trabajo.status ===
            "in_progress" ||
          chatDentroDe12Horas
        )
    );

  function motivoChatBloqueado() {
    if (reclamoActivoChat) {
      return T("Chat bloqueado porque existe un reclamo activo. RELYDO Admin gestiona el caso desde este momento.", "Chat is blocked because there is an active claim. RELYDO Admin is managing the case from this point forward.");
    }

    if (reclamoResueltoChat) {
      return T("Este reclamo ya fue resuelto por RELYDO. La comunicación de este trabajo quedó cerrada permanentemente.", "This claim has already been resolved by RELYDO. Communication for this job is now permanently closed.");
    }

    if (
      trabajo?.status ===
        "completed"
    ) {
      if (!trabajo.completed_at) {
        return T("El trabajo está completado y el chat ya está cerrado.", "The job is completed and the chat is now closed.");
      }

      return T("El período de 12 horas después de completar el trabajo terminó. El historial permanece disponible.", "The 12-hour period after job completion has ended. The chat history remains available.");
    }

    if (
      trabajo?.status ===
        "cancelled"
    ) {
      return T("Este trabajo fue cancelado. El chat está cerrado.", "This job was cancelled. The chat is closed.");
    }

    return T("El chat estará disponible cuando seas el profesional contratado.", "Chat will be available when you are the hired professional.");
  }

  async function enviarMensajeChat() {
    const texto =
      mensajeChat.trim();

    if (
      !texto ||
      !usuarioChatId ||
      !trabajo ||
      !chatPuedeEnviar
    ) {
      return;
    }

    setEnviandoMensajeChat(true);
    setError("");

    try {
      const {
        data,
        error: insertError,
      } = await supabase
        .from("job_messages")
        .insert({
          request_id:
            trabajo.id,
          sender_id:
            usuarioChatId,
          sender_role:
            "provider",
          message:
            texto,
        })
        .select(`
          id,
          request_id,
          sender_id,
          sender_role,
          message,
          read_at,
          created_at
        `)
        .single();

      if (insertError) {
        throw new Error(
          `${T("No se pudo enviar el mensaje", "The message could not be sent")}: ${insertError.message}`
        );
      }

      setMensajeChat("");

      if (data) {
        const nuevo =
          data as JobMessage;

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
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo enviar el mensaje.", "The message could not be sent.")
      );
    } finally {
      setEnviandoMensajeChat(false);
    }
  }

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white px-8 py-6 font-bold text-slate-700 shadow-xl">
          {T("Cargando trabajo...", "Loading job...")}
        </div>
      </main>
    );
  }

  if (
    error &&
    !trabajo
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl">
          <h1 className="text-2xl font-black text-red-700">
            {T("Trabajo no disponible", "Job unavailable")}
          </h1>

          <p className="mt-4 text-slate-600">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/panel-profesional"
              )
            }
            className="mt-6 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white"
          >
            {T("Volver al panel", "Back to dashboard")}
          </button>
        </div>
      </main>
    );
  }

  if (!trabajo) {
    return null;
  }

  const cambiosPresupuestoPagados =
    cambiosPresupuesto.filter(
      (cambio) =>
        cambio.status === "accepted" &&
        cambio.payment_status === "paid"
    );

  const adicionalServicioPagado =
    Math.round(
      (
        cambiosPresupuestoPagados.reduce(
          (total, cambio) =>
            total +
            Number(
              cambio.additional_amount ||
                0
            ),
          0
        ) +
        Number.EPSILON
      ) *
        100
    ) / 100;

  const comisionAdicionalProfesional =
    Math.round(
      (
        cambiosPresupuestoPagados.reduce(
          (total, cambio) =>
            total +
            Number(
              cambio.additional_provider_commission_amount ||
                0
            ),
          0
        ) +
        Number.EPSILON
      ) *
        100
    ) / 100;

  const netoAdicionalProfesional =
    Math.round(
      (
        cambiosPresupuestoPagados.reduce(
          (total, cambio) =>
            total +
            Number(
              cambio.additional_provider_net_amount ||
                0
            ),
          0
        ) +
        Number.EPSILON
      ) *
        100
    ) / 100;

  const valorServicioProfesional =
    Math.round(
      (
        Number(
          pago?.job_amount ||
            oferta?.price ||
            0
        ) +
        adicionalServicioPagado +
        Number.EPSILON
      ) *
        100
    ) / 100;

  const comisionTotalProfesional =
    Math.round(
      (
        Number(
          pago?.provider_commission_amount ||
            0
        ) +
        comisionAdicionalProfesional +
        Number.EPSILON
      ) *
        100
    ) / 100;

  const netoTotalProfesional =
    Math.round(
      (
        Number(
          pago?.provider_net_amount ||
            0
        ) +
        netoAdicionalProfesional +
        Number.EPSILON
      ) *
        100
    ) / 100;

  const etapaActual =
    numeroEtapa();

  const cancelado =
    trabajo.status ===
    "cancelled";

  const motivoCancelacion =
    trabajo.cancellation_reason || "";

  const canceladoPorRelydo =
    cancelado &&
    motivoCancelacion
      .toLowerCase()
      .includes("reclamo resuelto");

  const contratado =
    trabajo.status ===
      "in_progress" &&
    trabajo.preferred_provider_id ===
      providerId;

  const cambioPresupuestoPendiente =
    cambiosPresupuesto.find(
      (cambio) =>
        cambio.status === "pending"
    ) || null;

  const ultimoCambioPresupuesto =
    cambiosPresupuesto[0] || null;

  const reclamoActivo =
    !!reclamo &&
    (
      reclamo.status === "open" ||
      reclamo.status === "reviewing" ||
      reclamo.status === "in_review"
    );

  const profesionalYaRespondio =
    !!reclamo &&
    Boolean(
      reclamo.provider_response ||
      reclamo.provider_responded_at ||
      evidenciasReclamo.length > 0
    );

  const puedeSolicitarCambioPresupuesto =
    contratado &&
    trabajo.job_stage === "working" &&
    !reclamoActivo &&
    trabajo.completion_review_status !== "pending" &&
    !cambioPresupuestoPendiente;

  const reclamoResuelto =
    reclamo?.status === "resolved";

  const compensacionPorReclamo =
    reclamoResuelto
      ? Number(
          reclamo?.provider_award_amount || 0
        )
      : 0;

  const reembolsoClientePorReclamo =
    reclamoResuelto
      ? Number(
          reclamo?.customer_refund_amount || 0
        )
      : 0;

  const compensacionMostrada =
    canceladoPorRelydo &&
    reclamoResuelto
      ? compensacionPorReclamo
      : Number(
          pago?.cancellation_provider_amount || 0
        );

  const tiempoRespuestaReclamo =
    reclamo
      ? calcularTiempoRestante(
          reclamo.provider_response_deadline,
          language
        )
      : {
          vencido: false,
          texto: "",
        };

  void ahora;

  const etapas = [
    {
      numero: 1,
      icono: "🤝",
      titulo: T("Contratado", "Hired"),
      texto:
        T("Aceptaste el trabajo", "You accepted the job"),
    },
    {
      numero: 2,
      icono: "🚗",
      titulo: T("En camino", "On the way"),
      texto:
        T("Vas rumbo al lugar", "You are heading to the location"),
    },
    {
      numero: 3,
      icono: "📍",
      titulo: T("Llegué", "Arrived"),
      texto:
        T("Has llegado al lugar", "You arrived at the location"),
    },
    {
      numero: 4,
      icono: "🛠️",
      titulo:
        T("Trabajo iniciado", "Work started"),
      texto:
        T("Comenzaste el trabajo", "You started the job"),
    },
    {
      numero: 5,
      icono: "🔎",
      titulo: T("En revisión", "Under review"),
      texto: T("Esperando aprobación del cliente", "Waiting for customer approval"),
    },
    {
      numero: 6,
      icono: "✅",
      titulo: T("Completado", "Completed"),
      texto: T("Trabajo terminado", "Job finished"),
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50">

      {/* BARRA SUPERIOR */}

      <header className="bg-gradient-to-r from-blue-950 via-blue-900 to-blue-800 text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl">
              🔧
            </div>

            <div>
              <p className="text-2xl font-black tracking-tight">
                RELYDO
              </p>

              <p className="text-xs font-semibold text-blue-200">
                {T("Panel profesional", "Professional dashboard")}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs text-blue-200">
              {T("Profesional", "Professional")}
            </p>

            <p className="font-bold">
              {T("Mi cuenta", "My account")}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">

        {/* VOLVER */}

        <button
          type="button"
          onClick={() =>
            router.push(
              "/panel-profesional"
            )
          }
          className="mb-6 flex items-center gap-2 font-bold text-blue-700 transition hover:text-blue-900"
        >
          ← {T("Volver al panel", "Back to dashboard")}
        </button>

        {/* AVISO CANCELADO */}

        {cancelado && (
          <section className="mb-6 rounded-3xl border-2 border-red-300 bg-red-50 p-7 shadow-lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-red-600 text-3xl text-white">
                ✕
              </div>

              <div>
                <p className="text-sm font-black uppercase tracking-wider text-red-700">
                  {T("Trabajo cancelado", "Job cancelled")}
                </p>

                <h2 className="mt-1 text-2xl font-black text-red-950">
                  {canceladoPorRelydo
                    ? T("Trabajo cancelado por resolución de RELYDO", "Job cancelled by RELYDO resolution")
                    : T("El cliente canceló este trabajo", "The customer cancelled this job")}
                </h2>

                <p className="mt-2 leading-6 text-red-800">
                  {canceladoPorRelydo
                    ? T("RELYDO resolvió el reclamo y cerró este trabajo. Ya no puedes continuar, actualizar el estado ni marcar el trabajo como completado.", "RELYDO resolved the claim and closed this job. You can no longer continue, update the status, or mark the job as completed.")
                    : T("Esta solicitud ya no está activa. No puedes continuar, actualizar el estado ni marcar el trabajo como completado.", "This request is no longer active. You cannot continue, update the status, or mark the job as completed.")}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* AVISO RECLAMO ACTIVO */}

        {reclamoActivo && (
          <section
            className={`mb-6 rounded-3xl border-2 p-7 shadow-lg ${
              profesionalYaRespondio
                ? "border-emerald-300 bg-emerald-50"
                : "border-amber-300 bg-amber-50"
            }`}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl text-white ${
                    profesionalYaRespondio
                      ? "bg-emerald-600"
                      : "bg-amber-500"
                  }`}
                >
                  {profesionalYaRespondio ? "✅" : "⚠️"}
                </div>

                <div>
                  <p
                    className={`text-sm font-black uppercase tracking-[0.16em] ${
                      profesionalYaRespondio
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {profesionalYaRespondio
                      ? T("Respuesta enviada", "Response submitted")
                      : T("Reclamo activo", "Active claim")}
                  </p>

                  <h2
                    className={`mt-1 text-2xl font-black ${
                      profesionalYaRespondio
                        ? "text-emerald-950"
                        : "text-amber-950"
                    }`}
                  >
                    {profesionalYaRespondio
                      ? T("Tu respuesta ya fue enviada a RELYDO", "Your response was submitted to RELYDO")
                      : T("El cliente reportó un problema con este trabajo", "The customer reported a problem with this job")}
                  </h2>

                  <p
                    className={`mt-2 max-w-3xl leading-7 ${
                      profesionalYaRespondio
                        ? "text-emerald-900"
                        : "text-amber-900"
                    }`}
                  >
                    {profesionalYaRespondio
                      ? T("Tu respuesta y evidencia quedaron registradas. El pago permanece retenido mientras RELYDO revisa el caso y toma una decisión.", "Your response and evidence were recorded. The payment remains held while RELYDO reviews the case and makes a decision.")
                      : T("El pago permanece retenido mientras RELYDO revisa el caso. No puedes marcar el trabajo como completado hasta que el reclamo sea resuelto.", "The payment remains held while RELYDO reviews the case. You cannot mark the job as completed until the claim is resolved.")}
                  </p>

                  {!profesionalYaRespondio && (
                    <p className="mt-3 font-bold text-amber-900">
                      {language === "es"
                        ? `Tienes ${tiempoRespuestaReclamo.texto} para responder y adjuntar tu evidencia.`
                        : `You have ${tiempoRespuestaReclamo.texto} to respond and attach your evidence.`}
                    </p>
                  )}

                  {profesionalYaRespondio &&
                    reclamo?.provider_responded_at && (
                      <p className="mt-3 text-sm font-bold text-emerald-800">
                        {T("Respuesta enviada", "Response submitted")}{" "}
                        {formatearFechaHora(
                          reclamo.provider_responded_at,
                          language
                        )}
                      </p>
                    )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const seccion =
                    document.getElementById(
                      "reclamo-profesional"
                    );

                  if (seccion) {
                    seccion.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }
                }}
                className={`shrink-0 rounded-xl px-6 py-3.5 font-black text-white transition ${
                  profesionalYaRespondio
                    ? "bg-emerald-700 hover:bg-emerald-800"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {profesionalYaRespondio
                  ? T("Ver reclamo", "View claim")
                  : T("Ver y responder reclamo", "View and respond to claim")}
              </button>
            </div>
          </section>
        )}

        {/* CABECERA */}

        <section
          className={`rounded-3xl border bg-white p-7 shadow-lg md:p-8 ${
            cancelado
              ? "border-red-200"
              : "border-slate-200"
          }`}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">

                <span
                  className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wide ${
                    oferta?.status === "rejected"
                      ? "bg-slate-200 text-slate-700"
                      : cancelado
                      ? "bg-red-600 text-white"
                      : trabajo.status ===
                        "completed"
                      ? "bg-green-100 text-green-800"
                      : trabajo.status ===
                        "in_progress"
                      ? "bg-green-600 text-white"
                      : "bg-blue-700 text-white"
                  }`}
                >
                  {oferta?.status === "rejected"
                    ? T(
                        "Presupuesto rechazado por el cliente",
                        "Quote rejected by the customer"
                      )
                    : cancelado
                    ? T("Cancelado", "Cancelled")
                    : trabajo.status ===
                      "completed"
                    ? T("Completado", "Completed")
                    : trabajo.status ===
                      "in_progress"
                    ? T("En progreso", "In progress")
                    : T("Abierto", "Open")}
                </span>

                {contratado && (
                  <span className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-xs font-black uppercase text-amber-800">
                    Contratado
                  </span>
                )}
              </div>

              <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                {trabajo.title}
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                {trabajo.description}
              </p>

              <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">

                <Info
                  icono="📍"
                  titulo={T("Ubicación", "Location")}
                  valor={`${trabajo.city}, ${trabajo.state} ${trabajo.zip_code}`}
                />

                <Info
                  icono="📅"
                  titulo={T("Fecha preferida", "Preferred date")}
                  valor={formatearFecha(
                    trabajo.preferred_date,
                    language
                  )}
                />

                <Info
                  icono="🕐"
                  titulo={T("Hora preferida", "Preferred time")}
                  valor={
                    trabajo.preferred_time ||
                    "Flexible"
                  }
                />

                <Info
                  icono="👤"
                  titulo={T("Cliente", "Customer")}
                  valor={
                    trabajo.customer_name ||
                    T("Cliente RELYDO", "RELYDO Customer")
                  }
                />
              </div>
            </div>

            <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:w-72">
              <p className="text-center text-sm text-slate-500">
                {T("ID del trabajo", "Job ID")}
              </p>

              <p className="mt-2 text-center font-black text-slate-900">
                #
                {trabajo.id
                  .slice(0, 10)
                  .toUpperCase()}
              </p>

              <button
                type="button"
                onClick={() =>
                  window.scrollTo({
                    top:
                      document.body
                        .scrollHeight,
                    behavior:
                      "smooth",
                  })
                }
                className="mt-5 w-full rounded-xl bg-blue-700 px-4 py-3 font-extrabold text-white transition hover:bg-blue-800"
              >
                {T("Ver detalle completo", "View full details")}
              </button>
            </div>
          </div>
        </section>

        {/* GRID PRINCIPAL */}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* IZQUIERDA */}

          <div className="space-y-6">

            {/* SEGUIMIENTO */}

            {trabajo.status !==
              "open" &&
              !ofertaRechazadaPorCliente && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">

                <h2 className="flex items-center gap-3 text-xl font-black text-slate-950">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                    📋
                  </span>
                  {T("Seguimiento del trabajo", "Job tracking")}
                </h2>

                {cancelado ? (
                  <div className="mt-6 rounded-2xl border-2 border-red-200 bg-red-50 p-6 text-center">
                    <div className="text-5xl">
                      🚫
                    </div>

                    <h3 className="mt-4 text-2xl font-black text-red-900">
                      {T("Trabajo cancelado", "Job cancelled")}
                    </h3>

                    <p className="mt-2 text-red-700">
                      {canceladoPorRelydo
                        ? T("RELYDO canceló el trabajo como resultado de la resolución del reclamo. El seguimiento ha sido detenido.", "RELYDO cancelled the job as a result of the claim resolution. Tracking has been stopped.")
                        : T("El cliente canceló la solicitud y el seguimiento ha sido detenido.", "The customer cancelled the request and tracking has been stopped.")}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mt-8 grid grid-cols-5 gap-1">
                      {etapas.map(
                        (etapa) => {
                          const activo =
                            etapa.numero <=
                            etapaActual;

                          return (
                            <div
                              key={
                                etapa.numero
                              }
                              className="relative text-center"
                            >
                              {etapa.numero <
                                5 && (
                                <div
                                  className={`absolute left-1/2 top-5 h-1 w-full ${
                                    etapa.numero <
                                    etapaActual
                                      ? "bg-blue-600"
                                      : "bg-slate-200"
                                  }`}
                                />
                              )}

                              <div
                                className={`relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-black ${
                                  activo
                                    ? "border-blue-700 bg-blue-700 text-white"
                                    : "border-slate-300 bg-white text-slate-500"
                                }`}
                              >
                                {
                                  etapa.numero
                                }
                              </div>

                              <div className="relative z-10 mt-3 text-xl">
                                {
                                  etapa.icono
                                }
                              </div>

                              <p className="mt-1 text-xs font-black text-slate-900 sm:text-sm">
                                {
                                  etapa.titulo
                                }
                              </p>

                              <p className="mt-1 hidden text-xs text-slate-500 sm:block">
                                {
                                  etapa.texto
                                }
                              </p>
                            </div>
                          );
                        }
                      )}
                    </div>

                    {contratado && (
                      <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-6">

                        <div className="flex items-start gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xl text-white">
                            i
                          </div>

                          <div>
                            <h3 className="text-xl font-black text-blue-950">
                              {etapaActual ===
                              1
                                ? T("Trabajo contratado", "Job hired")
                                : etapaActual ===
                                  2
                                ? T("Vas en camino", "You are on the way")
                                : etapaActual ===
                                  3
                                ? T("Ya llegaste", "You arrived")
                                : etapaActual === 4
                                ? T("Trabajo iniciado", "Work started")
                                : etapaActual === 5
                                ? T("Trabajo en revisión", "Job under review")
                                : T("Trabajo completado", "Job completed")}
                            </h3>

                            <p className="mt-1 text-sm leading-6 text-blue-900">
                              {T("El cliente puede ver el avance del servicio en tiempo real.", "The customer can see the service progress in real time.")}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">

                          {etapaActual ===
                            1 && (
                            <button
                              type="button"
                              disabled={
                                cambiandoEstado
                              }
                              onClick={() =>
                                cambiarEtapa(
                                  "on_the_way"
                                )
                              }
                              className="rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white transition hover:bg-blue-800 disabled:opacity-50"
                            >
                              🚗 Estoy en camino
                            </button>
                          )}

                          {etapaActual ===
                            2 && (
                            <button
                              type="button"
                              disabled={
                                cambiandoEstado
                              }
                              onClick={() =>
                                cambiarEtapa(
                                  "arrived"
                                )
                              }
                              className="rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white transition hover:bg-blue-800 disabled:opacity-50"
                            >
                              {T("📍 Ya llegué", "📍 I arrived")}
                            </button>
                          )}

                          {etapaActual ===
                            3 && (
                            <button
                              type="button"
                              disabled={
                                cambiandoEstado
                              }
                              onClick={() =>
                                cambiarEtapa(
                                  "working"
                                )
                              }
                              className="rounded-xl bg-amber-500 px-5 py-3 font-extrabold text-white transition hover:bg-amber-600 disabled:opacity-50"
                            >
                              {T("🛠️ Iniciar trabajo", "🛠️ Start job")}
                            </button>
                          )}

                          {etapaActual === 4 && !reclamoActivo && trabajo.status === "in_progress" && (
                            <div className="sm:col-span-2 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
                              <div className="grid min-w-0 grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                                <div className="min-w-0 p-5 md:p-6">
                                  <div className="flex min-w-0 items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-2xl">
                                      📷
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <h3 className="text-lg font-black text-slate-950">
                                        {T("Evidencia final (obligatoria)", "Final evidence (required)")}
                                      </h3>
                                      <p className="mt-1 text-sm font-semibold text-slate-700">
                                        {T("Sube al menos 1 foto del trabajo terminado.", "Upload at least 1 photo of the completed work.")}
                                      </p>
                                      <p className="mt-1 text-sm text-slate-500">
                                        {T("1 foto obligatoria · hasta 10 fotos y 2 videos", "1 photo required · up to 10 photos and 2 videos")}
                                      </p>

                                      {evidenciasFinales.length > 0 && (
                                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                          <p className="text-sm font-black text-emerald-800">
                                            {language === "es"
                                              ? `✓ Evidencia guardada: ${evidenciasFinales.filter((item) => item.file_type === "image").length} foto(s) · ${evidenciasFinales.filter((item) => item.file_type === "video").length} {T("video(s)", "video(s)")}`
                                              : `✓ Evidence saved: ${evidenciasFinales.filter((item) => item.file_type === "image").length} photo(s) · ${evidenciasFinales.filter((item) => item.file_type === "video").length} {T("video(s)", "video(s)")}`}
                                          </p>
                                        </div>
                                      )}

                                      <div className="mt-5">
                                        <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-blue-300 bg-white px-4 py-3 font-extrabold text-blue-700 transition hover:bg-blue-50">
                                          {T("📷 Abrir cámara", "📷 Open camera")}
                                          <input
                                            type="file"
                                            accept="image/*,video/*"
                                            capture="environment"
                                            onChange={seleccionarEvidenciaFinal}
                                            className="hidden"
                                          />
                                        </label>

                                        <p className="mt-2 text-xs leading-5 text-slate-500">
                                          {T("La evidencia final debe capturarse desde la cámara del dispositivo para reducir el uso de fotos o videos de otros trabajos.", "Final evidence must be captured with the device camera to reduce the use of photos or videos from other jobs.")}
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  {archivosEvidenciaFinal.length > 0 && (
                                    <div className="mt-5 space-y-2 border-t border-slate-100 pt-5">
                                      {archivosEvidenciaFinal.map((file, index) => (
                                        <div
                                          key={`${file.name}-${index}`}
                                          className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"
                                        >
                                          <p className="min-w-0 truncate text-sm font-bold text-slate-800">
                                            {file.type.startsWith("video/") ? "🎥" : "📷"} {file.name}
                                          </p>
                                          <button
                                            type="button"
                                            onClick={() => quitarEvidenciaFinalSeleccionada(index)}
                                            className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1 text-sm font-bold text-red-700 hover:bg-red-50"
                                          >
                                            Quitar
                                          </button>
                                        </div>
                                      ))}

                                      <button
                                        type="button"
                                        disabled={subiendoEvidenciaFinal}
                                        onClick={guardarEvidenciaFinal}
                                        className="w-full rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {subiendoEvidenciaFinal ? T("Guardando evidencia...", "Saving evidence...") : T("Guardar evidencia", "Save evidence")}
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 border-t border-slate-100 bg-slate-50/70 p-5 xl:border-l xl:border-t-0 md:p-6">
                                  <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-xl">🛡️</span>
                                    <h3 className="font-black text-slate-950">{T("Consejo RELYDO", "RELYDO tip")}</h3>
                                  </div>
                                  <p className="mt-4 text-sm leading-7 text-slate-600">
                                    {T("La evidencia protege tanto al cliente como a ti. Asegúrate de mostrar claramente el resultado final.", "The evidence protects both the customer and you. Make sure the final result is clearly shown.")}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {etapaActual === 4 && (
                            <button
                              type="button"
                              disabled={!puedeSolicitarCambioPresupuesto}
                              onClick={() => {
                                setMostrarCambioPresupuesto(true);
                                setError("");
                                setMensaje("");
                              }}
                              className={`sm:col-span-2 flex w-full items-center justify-between rounded-2xl border-2 px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                cambioPresupuestoPendiente || reclamoActivo
                                  ? "border-slate-200 bg-slate-100 text-slate-500"
                                  : "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"
                              }`}
                            >
                              <span className="flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-xl">💰</span>
                                <span>
                                  <span className="block font-black">
                                    {cambioPresupuestoPendiente
                                      ? T("Cambio de presupuesto pendiente", "Budget change pending")
                                      : reclamoActivo
                                      ? T("Cambio bloqueado por reclamo", "Change blocked by claim")
                                      : T("Solicitar cambio de presupuesto", "Request budget change")}
                                  </span>
                                  {!cambioPresupuestoPendiente && !reclamoActivo && (
                                    <span className="mt-0.5 block text-sm font-medium text-slate-600">
                                      {T("Si el trabajo requiere algo adicional", "If the job requires additional work")}
                                    </span>
                                  )}
                                </span>
                              </span>
                              <span className="text-2xl">›</span>
                            </button>
                          )}

                          {etapaActual === 4 && trabajo.completion_review_status !== "pending" && (
                            <button
                              type="button"
                              disabled={
                                completando ||
                                reclamoActivo ||
                                !evidenciasFinales.some((item) => item.file_type === "image")
                              }
                              onClick={pasarARevision}
                              className={`rounded-2xl border-2 px-5 py-4 font-extrabold transition disabled:cursor-not-allowed ${
                                reclamoActivo || !evidenciasFinales.some((item) => item.file_type === "image")
                                  ? "border-slate-200 bg-slate-200 text-slate-500"
                                  : "border-green-600 bg-green-600 text-white hover:bg-green-700"
                              }`}
                            >
                              {reclamoActivo
                                ? T("🔒 Bloqueado por reclamo", "🔒 Blocked by claim")
                                : !evidenciasFinales.some((item) => item.file_type === "image")
                                ? T("🔒 Pasar a revisión\nSube y guarda al menos 1 foto para habilitar", "🔒 Submit for review\nUpload and save at least 1 photo to enable")
                                : completando
                                ? T("Enviando a revisión...", "Submitting for review...")
                                : T("✓ Pasar a revisión", "✓ Submit for review")}
                            </button>
                          )}

                          {trabajo.completion_review_status === "pending" && (
                            <div className="sm:col-span-2 rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
                              <p className="font-black text-amber-900">{T("⏳ Trabajo en revisión del cliente", "⏳ Job under customer review")}</p>
                              <p className="mt-1 text-sm text-amber-800">{T("Ya enviaste la evidencia final. El cliente debe aprobar el trabajo o reportar un problema.", "You already submitted the final evidence. The customer must approve the job or report a problem.")}</p>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              document
                                .getElementById(
                                  "chat-relydo"
                                )
                                ?.scrollIntoView({
                                  behavior:
                                    "smooth",
                                  block:
                                    "start",
                                })
                            }
                            className="rounded-2xl border-2 border-blue-300 bg-white px-5 py-4 font-extrabold text-blue-700 transition hover:bg-blue-50"
                          >
                            {T("💬 Chat con el cliente", "💬 Chat with customer")}
                          </button>

                          <button
                            type="button"
                            onClick={abrirDireccion}
                            className="sm:col-span-2 rounded-2xl border-2 border-blue-300 bg-white px-5 py-4 font-extrabold text-blue-700 transition hover:bg-blue-50"
                          >
                            {T("📍 Ver dirección en el mapa", "📍 View address on map")}
                          </button>

                          {etapaActual <
                            4 && (
                            <div className="sm:col-span-2 mt-2 rounded-2xl border border-red-200 bg-red-50 p-4">

                              <p className="text-sm font-bold text-red-900">
                                {T("¿Tuviste un problema y ya no puedes realizar este trabajo?", "Did you have a problem and can no longer perform this job?")}
                              </p>

                              <p className="mt-1 text-xs leading-5 text-red-700">
                                {T("Puedes liberarlo para que la solicitud vuelva a estar disponible para otro profesional.", "You can release it so the request becomes available to another professional.")}
                              </p>

                              <button
                                type="button"
                                disabled={
                                  liberandoTrabajo ||
                                  cambiandoEstado ||
                                  completando
                                }
                                onClick={
                                  liberarTrabajo
                                }
                                className="mt-4 w-full rounded-xl border-2 border-red-600 bg-white px-5 py-3 font-extrabold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {liberandoTrabajo
                                  ? T("Liberando trabajo...", "Releasing job...")
                                  : T("⚠️ No puedo realizar este trabajo", "⚠️ I can’t perform this job")}
                              </button>

                            </div>
                          )}
                        </div>

                        {cambioPresupuestoPendiente && (
                          <div className="mt-6 rounded-2xl border-2 border-violet-200 bg-violet-50 p-5">
                            <p className="text-sm font-black uppercase tracking-wide text-violet-700">
                              {T("⏳ Cambio de presupuesto pendiente", "⏳ Budget change pending")}
                            </p>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div className="rounded-xl bg-white p-4">
                                <p className="text-xs font-bold text-slate-500">
                                  Total anterior
                                </p>
                                <p className="mt-1 text-xl font-black text-slate-950">
                                  ${Number(
                                    cambioPresupuestoPendiente.original_amount
                                  ).toFixed(2)}
                                </p>
                              </div>

                              <div className="rounded-xl bg-white p-4">
                                <p className="text-xs font-bold text-slate-500">
                                  {T("Adicional solicitado", "Additional amount requested")}
                                </p>
                                <p className="mt-1 text-xl font-black text-violet-700">
                                  +${Number(
                                    cambioPresupuestoPendiente.additional_amount
                                  ).toFixed(2)}
                                </p>
                              </div>

                              <div className="rounded-xl bg-white p-4">
                                <p className="text-xs font-bold text-slate-500">
                                  Nuevo total propuesto
                                </p>
                                <p className="mt-1 text-xl font-black text-slate-950">
                                  ${Number(
                                    cambioPresupuestoPendiente.new_total_amount
                                  ).toFixed(2)}
                                </p>
                              </div>
                            </div>

                            <p className="mt-4 text-sm leading-6 text-violet-900">
                              {T("El cliente debe aceptar o rechazar este cambio antes de que puedas enviar otro.", "The customer must accept or reject this change before you can send another one.")}
                            </p>
                          </div>
                        )}

                        {!cambioPresupuestoPendiente &&
                          ultimoCambioPresupuesto &&
                          ultimoCambioPresupuesto.status !== "pending" && (
                          <div className={`mt-6 rounded-2xl border p-5 ${
                            ultimoCambioPresupuesto.status === "accepted"
                              ? "border-emerald-200 bg-emerald-50"
                              : ultimoCambioPresupuesto.status === "rejected"
                              ? "border-red-200 bg-red-50"
                              : "border-slate-200 bg-slate-50"
                          }`}>
                            <p className={`font-black ${
                              ultimoCambioPresupuesto.status === "accepted"
                                ? "text-emerald-900"
                                : ultimoCambioPresupuesto.status === "rejected"
                                ? "text-red-900"
                                : "text-slate-900"
                            }`}>
                              {ultimoCambioPresupuesto.status === "accepted" &&
                              ultimoCambioPresupuesto.payment_status === "paid"
                                ? T("✓ Último cambio aceptado y pagado", "✓ Latest change accepted and paid")
                                : ultimoCambioPresupuesto.status === "accepted"
                                ? T("⏳ Último cambio aceptado · pendiente de pago", "⏳ Latest change accepted · payment pending")
                                : ultimoCambioPresupuesto.status === "rejected"
                                ? T("✕ Último cambio rechazado por el cliente", "✕ Latest change rejected by the customer")
                                : T("Último cambio de presupuesto cancelado", "Latest budget change cancelled")}
                            </p>

                            <p className="mt-2 text-sm text-slate-700">
                              Adicional: ${Number(
                                ultimoCambioPresupuesto.additional_amount
                              ).toFixed(2)} · Nuevo total: ${Number(
                                ultimoCambioPresupuesto.new_total_amount
                              ).toFixed(2)}
                            </p>

                            {ultimoCambioPresupuesto.status === "accepted" &&
                              ultimoCambioPresupuesto.payment_status === "paid" && (
                              <p className="mt-2 text-sm font-bold text-emerald-800">
                                {T("Pago adicional confirmado por Stripe. Neto adicional para ti:", "Additional payment confirmed by Stripe. Additional net amount for you:")} $
                                {Number(
                                  ultimoCambioPresupuesto.additional_provider_net_amount ||
                                    0
                                ).toFixed(2)}.
                              </p>
                            )}

                            {ultimoCambioPresupuesto.status === "accepted" &&
                              ultimoCambioPresupuesto.payment_status !== "paid" && (
                              <p className="mt-2 text-sm font-bold text-amber-700">
                                {T("El cliente aceptó el cambio, pero el pago adicional todavía no está confirmado.", "The customer accepted the change, but the additional payment has not been confirmed yet.")}
                              </p>
                            )}
                          </div>
                        )}

                        {mostrarCambioPresupuesto &&
                          etapaActual === 4 &&
                          !cambioPresupuestoPendiente && (
                          <form
                            onSubmit={
                              enviarCambioPresupuesto
                            }
                            className="mt-6 rounded-2xl border-2 border-violet-300 bg-white p-5"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-black uppercase tracking-wide text-violet-700">
                                  {T("💰 Cambio de presupuesto", "💰 Budget change")}
                                </p>

                                <h3 className="mt-1 text-xl font-black text-slate-950">
                                  {T("Solicitar un monto adicional", "Request an additional amount")}
                                </h3>

                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                  {T("Explica qué cambió. El cliente verá el total anterior, el adicional y el nuevo total antes de decidir.", "Explain what changed. The customer will see the previous total, the additional amount, and the new total before deciding.")}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setMostrarCambioPresupuesto(
                                    false
                                  );
                                  setError("");
                                }}
                                className="rounded-lg px-3 py-2 font-black text-slate-500 hover:bg-slate-100"
                              >
                                ✕
                              </button>
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div>
                                <label className="text-sm font-black text-slate-800">
                                  Motivo
                                </label>

                                <select
                                  value={
                                    motivoCambioPresupuesto
                                  }
                                  onChange={(e) =>
                                    setMotivoCambioPresupuesto(
                                      e.target.value
                                    )
                                  }
                                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 outline-none focus:border-violet-500"
                                >
                                  <option value="">
                                    Selecciona un motivo
                                  </option>
                                  <option value="problema_mayor">
                                    El problema es mayor de lo esperado
                                  </option>
                                  <option value="trabajo_adicional">
                                    {T("Se necesita trabajo adicional", "Additional work is needed")}
                                  </option>
                                  <option value="materiales_adicionales">
                                    Se necesitan materiales adicionales
                                  </option>
                                  <option value="otro">
                                    Otro motivo
                                  </option>
                                </select>
                              </div>

                              <div>
                                <label className="text-sm font-black text-slate-800">
                                  {T("Monto adicional", "Additional amount")}
                                </label>

                                <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-violet-500">
                                  <span className="flex items-center bg-slate-50 px-4 font-black text-slate-600">
                                    $
                                  </span>

                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={
                                      montoAdicional
                                    }
                                    onChange={(e) =>
                                      setMontoAdicional(
                                        e.target.value
                                      )
                                    }
                                    placeholder="0.00"
                                    className="w-full px-4 py-3 font-bold text-slate-950 outline-none"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="mt-4">
                              <label className="text-sm font-black text-slate-800">
                                {T("Explicación", "Explanation")}
                              </label>

                              <textarea
                                value={
                                  descripcionCambioPresupuesto
                                }
                                onChange={(e) =>
                                  setDescripcionCambioPresupuesto(
                                    e.target.value
                                  )
                                }
                                rows={4}
                                placeholder={T("Explica qué descubriste, qué trabajo adicional hace falta y por qué cambia el precio.", "Explain what you discovered, what additional work is needed, and why the price changes.")}
                                className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-violet-500"
                              />
                            </div>

                            <div className="mt-4">
                              <label className="text-sm font-black text-slate-800">
                                Fotos o videos (opcional)
                              </label>

                              <input
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                                onChange={
                                  seleccionarArchivosCambioPresupuesto
                                }
                                className="mt-2 block w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm"
                              />

                              <p className="mt-2 text-xs text-slate-500">
                                {T("Máximo 10 fotos y 2 videos. Cada archivo debe pesar 50 MB o menos.", "Maximum 10 photos and 2 videos. Each file must be 50 MB or less.")}
                              </p>
                            </div>

                            {archivosCambioPresupuesto.length > 0 && (
                              <div className="mt-4 space-y-2">
                                {archivosCambioPresupuesto.map(
                                  (file, index) => (
                                    <div
                                      key={`${file.name}-${index}`}
                                      className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-slate-800">
                                          {file.type.startsWith("video/")
                                            ? "🎥"
                                            : "📷"}{" "}
                                          {file.name}
                                        </p>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          quitarArchivoCambioPresupuesto(
                                            index
                                          )
                                        }
                                        className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-black text-red-700 hover:bg-red-50"
                                      >
                                        Quitar
                                      </button>
                                    </div>
                                  )
                                )}
                              </div>
                            )}

                            <div className="mt-5 rounded-2xl bg-violet-50 p-4">
                              <div className="flex items-center justify-between gap-4">
                                <span className="font-bold text-violet-900">
                                  {T("Precio actual", "Current price")}
                                </span>
                                <strong className="text-violet-950">
                                  ${Number(
                                    cambiosPresupuesto.find(
                                      (cambio) =>
                                        cambio.status === "accepted"
                                    )?.new_total_amount ??
                                    pago?.job_amount ??
                                    oferta?.price ??
                                    0
                                  ).toFixed(2)}
                                </strong>
                              </div>

                              <div className="mt-2 flex items-center justify-between gap-4">
                                <span className="font-bold text-violet-900">
                                  {T("Adicional solicitado", "Additional amount requested")}
                                </span>
                                <strong className="text-violet-700">
                                  +${Number(
                                    montoAdicional || 0
                                  ).toFixed(2)}
                                </strong>
                              </div>

                              <div className="mt-3 border-t border-violet-200 pt-3">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="font-black text-violet-950">
                                    Nuevo total propuesto
                                  </span>
                                  <strong className="text-xl text-violet-950">
                                    ${(
                                      Number(
                                        cambiosPresupuesto.find(
                                          (cambio) =>
                                            cambio.status === "accepted"
                                        )?.new_total_amount ??
                                        pago?.job_amount ??
                                        oferta?.price ??
                                        0
                                      ) +
                                      Number(
                                        montoAdicional || 0
                                      )
                                    ).toFixed(2)}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={
                                enviandoCambioPresupuesto
                              }
                              className="mt-5 w-full rounded-xl bg-violet-600 px-5 py-3.5 font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {enviandoCambioPresupuesto
                                ? T("Enviando cambio...", "Sending change...")
                                : T("Enviar cambio al cliente", "Send change to customer")}
                            </button>

                            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                              {T("El precio no cambia automáticamente. El cliente debe aceptar la solicitud antes de que RELYDO pueda cobrar el monto adicional.", "The price does not change automatically. The customer must accept the request before RELYDO can charge the additional amount.")}
                            </p>
                          </form>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* INFORMACION */}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">

              <h2 className="flex items-center gap-3 text-xl font-black text-slate-950">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                  📝
                </span>
                {T("Información del trabajo", "Job information")}
              </h2>

              <div className="mt-5 rounded-2xl border border-slate-200 p-5">

                <p className="font-black text-slate-900">
                  {T("Descripción del problema", "Problem description")}
                </p>

                <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-600">
                  {trabajo.description}
                </p>

                {trabajo.address_line1 && (
                  <>
                    <div className="my-5 border-t border-slate-200" />

                    <p className="font-black text-slate-900">
                      {T("Dirección del servicio", "Service address")}
                    </p>

                    <p className="mt-2 text-slate-600">
                      {
                        trabajo.address_line1
                      }
                      ,{" "}
                      {
                        trabajo.city
                      }
                      ,{" "}
                      {
                        trabajo.state
                      }{" "}
                      {
                        trabajo.zip_code
                      }
                    </p>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* DERECHA */}

          <div className="space-y-6">

            {/* FOTOS */}

            {fotos.length >
              0 && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">

                <h2 className="flex items-center gap-3 text-xl font-black text-slate-950">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                    📷
                  </span>

                  {T("Fotos del problema", "Problem photos")}

                  <span className="text-slate-500">
                    ({fotos.length})
                  </span>
                </h2>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {fotos
                    .slice(
                      0,
                      3
                    )
                    .map(
                      (
                        foto,
                        index
                      ) => (
                        <a
                          key={
                            foto.id
                          }
                          href={
                            foto.file_url
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                        >
                          <img
                            src={
                              foto.file_url
                            }
                            alt={`${T("Foto", "Photo")} ${
                              index +
                              1
                            }`}
                            className="h-44 w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        </a>
                      )
                    )}
                </div>

                <div className="mt-5 text-center">
                  <a
                    href={
                      fotos[0]
                        .file_url
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded-xl border border-slate-300 px-5 py-3 font-bold text-blue-700 transition hover:bg-blue-50"
                  >
                    {T("Ver fotos en tamaño completo", "View full-size photos")}
                  </a>
                </div>
              </section>
            )}

            {/* COMPROBANTE / PRESUPUESTO */}

            {oferta && (
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
                <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm ring-1 ring-slate-200">
                          🧾
                        </span>
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                            RELYDO
                          </p>
                          <h2 className="text-xl font-black text-slate-950">
                            {pago
                              ? cancelado
                                ? canceladoPorRelydo
                                  ? T("Resolución financiera de RELYDO", "RELYDO financial resolution")
                                  : T("Compensación por cancelación", "Cancellation compensation")
                                : T("Comprobante del servicio", "Service receipt")
                              : T("Resumen de tu presupuesto", "Your quote summary")}
                          </h2>
                        </div>
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {T("Trabajo", "Job")}
                      </p>
                      <p className="mt-1 font-mono text-sm font-bold text-slate-700">
                        #{trabajo.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatearFechaHora(oferta.created_at, language)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {pago ? (
                    cancelado ? (
                      <>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">
                            {canceladoPorRelydo
                              ? T("Trabajo cancelado por resolución de RELYDO", "Job cancelled by RELYDO resolution")
                              : T("Trabajo cancelado por el cliente", "Job cancelled by the customer")}
                          </p>

                          <div className="mt-4 flex items-end justify-between gap-4 rounded-xl bg-white p-5 ring-1 ring-amber-200">
                            <div>
                              <p className="text-sm font-black uppercase tracking-wide text-slate-500">
                                {canceladoPorRelydo
                                  ? T("Compensación definida por RELYDO", "Compensation determined by RELYDO")
                                  : T("Compensación por cancelación", "Cancellation compensation")}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {canceladoPorRelydo
                                  ? T("Importe asignado al profesional en la resolución final del reclamo.", "Amount assigned to the professional in the final claim resolution.")
                                  : T("Importe que te corresponde por la etapa alcanzada antes de la cancelación.", "Amount owed to you based on the stage reached before cancellation.")}
                              </p>
                            </div>

                            <p className="text-3xl font-black tracking-tight text-emerald-700">
                              ${compensacionMostrada.toFixed(2)}
                            </p>
                          </div>

                          {canceladoPorRelydo &&
                            reclamoResuelto && (
                              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                                <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                                  {T("Resultado del reclamo", "Claim result")}
                                </p>

                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div className="rounded-lg bg-white p-3">
                                    <p className="text-xs font-bold text-slate-500">
                                      {T("Tu compensación", "Your compensation")}
                                    </p>
                                    <p className="mt-1 text-lg font-black text-emerald-700">
                                      ${compensacionPorReclamo.toFixed(2)}
                                    </p>
                                  </div>

                                  <div className="rounded-lg bg-white p-3">
                                    <p className="text-xs font-bold text-slate-500">
                                      {T("Reembolso al cliente", "Customer refund")}
                                    </p>
                                    <p className="mt-1 text-lg font-black text-blue-800">
                                      ${reembolsoClientePorReclamo.toFixed(2)}
                                    </p>
                                  </div>
                                </div>

                                {reclamo?.resolution_notes && (
                                  <div className="mt-3 rounded-lg bg-white p-3">
                                    <p className="text-xs font-bold text-slate-500">
                                      {T("Resolución de RELYDO", "RELYDO resolution")}
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                                      {resolutionNoteText(language, reclamo.resolution_notes)}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                          {Number(pago.cancellation_penalty_percent || 0) > 0 && (
                            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-white px-4 py-3">
                              <span className="text-sm font-semibold text-slate-600">
                                {T("Etapa de cancelación", "Cancellation stage")}
                              </span>
                              <span className="text-sm font-black text-slate-900">
                                {pago.cancellation_stage === "on_the_way"
                                  ? T("En camino", "On the way")
                                  : pago.cancellation_stage === "arrived"
                                  ? "Llegaste al lugar"
                                  : T("Antes de iniciar", "Before starting")}
                              </span>
                            </div>
                          )}
                        </div>

                        {cambiosPresupuestoPagados.length > 0 && (
                            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                              <p className="text-sm font-black text-violet-900">
                                {T("Cambio de presupuesto incluido", "Budget change included")}
                              </p>
                              <p className="mt-1 text-xs font-bold leading-5 text-violet-700">
                                {language === "es"
                                  ? `Este comprobante incluye ${cambiosPresupuestoPagados.length} cambio${cambiosPresupuestoPagados.length === 1 ? "" : "s"} pagado${cambiosPresupuestoPagados.length === 1 ? "" : "s"}`
                                  : `This receipt includes ${cambiosPresupuestoPagados.length} paid budget change${cambiosPresupuestoPagados.length === 1 ? "" : "s"}`} por ${adicionalServicioPagado.toFixed(2)} adicionales. Tu neto adicional es ${netoAdicionalProfesional.toFixed(2)}.
                              </p>
                            </div>
                          )}

                          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm">
                              ✓
                            </span>
                            <div>
                              <p className="text-sm font-black text-emerald-900">
                                {T("Compensación procesada", "Compensation processed")}
                              </p>
                              <p className="text-xs text-emerald-700">
                                {T("Este es el importe final correspondiente a esta cancelación.", "This is the final amount for this cancellation.")}
                              </p>
                            </div>
                          </div>

                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                            Procesado
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-2">
                          <div className="flex items-center justify-between gap-4 border-b border-dashed border-slate-300 py-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-600">
                                {T("Valor del servicio", "Service value")}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {T("Presupuesto aceptado por el cliente", "Quote accepted by the customer")}
                              </p>
                            </div>
                            <p className="text-lg font-black text-slate-950">
                              ${valorServicioProfesional.toFixed(2)}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-4 border-b border-dashed border-slate-300 py-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-600">
                                {T("Tarifa de servicio RELYDO", "RELYDO service fee")}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {Number(pago.provider_commission_percent).toFixed(2)}% del valor del servicio
                              </p>
                            </div>
                            <p className="font-bold text-slate-700">
                              ${comisionTotalProfesional.toFixed(2)}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-4 py-5">
                            <div>
                              <p className="text-sm font-black uppercase tracking-wide text-slate-500">
                                Total a recibir
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {T("Neto después de la tarifa RELYDO", "Net after RELYDO fee")}
                              </p>
                            </div>
                            <p className="text-3xl font-black tracking-tight text-slate-950">
                              ${netoTotalProfesional.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm">
                              ✓
                            </span>
                            <div>
                              <p className="text-sm font-black text-emerald-900">
                                {T("Pago del cliente registrado", "Customer payment recorded")}
                              </p>
                              <p className="text-xs text-emerald-700">
                                {T("Tu importe neto ya está calculado.", "Your net amount has already been calculated.")}
                              </p>
                            </div>
                          </div>

                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                            Registrado
                          </span>
                        </div>
                      </>
                    )
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-600">
                            {T("Precio estimado", "Estimated price")}
                          </p>
                          <p
                            className={`mt-1 text-xs font-bold ${
                              oferta.status === "rejected"
                                ? "text-red-600"
                                : oferta.status === "selected"
                                ? "text-green-600"
                                : "text-slate-400"
                            }`}
                          >
                            {oferta.status === "rejected"
                              ? T(
                                  "Rechazado por el cliente",
                                  "Rejected by customer"
                                )
                              : oferta.status === "selected"
                              ? T(
                                  "Aceptado por el cliente",
                                  "Accepted by customer"
                                )
                              : T(
                                  "Pendiente de aceptación del cliente",
                                  "Pending customer acceptance"
                                )}
                          </p>
                        </div>
                        <p className="text-2xl font-black text-slate-950">
                          ${Number(oferta.price).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-6">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                      {T("Detalles del servicio", "Service details")}
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold text-slate-500">
                          Tiempo para llegar
                        </p>
                        <p className="mt-1 font-black text-slate-900">
                          {mostrarMinutos(oferta.arrival_minutes, language)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold text-slate-500">
                          {T("Duración estimada", "Estimated duration")}
                        </p>
                        <p className="mt-1 font-black text-slate-900">
                          {mostrarMinutos(oferta.estimated_job_minutes, language)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200 p-5">
                    <p className="text-sm font-black text-slate-800">
                      {T("Mensaje para el cliente", "Message to customer")}
                    </p>
                    <div className="mt-3 rounded-xl bg-slate-50 p-4 leading-6 text-slate-700">
                      {oferta.message || T("Sin mensaje adicional.", "No additional message.")}
                    </div>
                  </div>

                  {cancelado ? (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
                      ❌{" "}
                      {canceladoPorRelydo
                        ? T(
                            "Trabajo cancelado por resolución de RELYDO.",
                            "Job cancelled by RELYDO resolution."
                          )
                        : T(
                            "El cliente canceló este trabajo.",
                            "The customer cancelled this job."
                          )}
                    </div>
                  ) : !pago ? (
                    oferta.status === "rejected" ? (
                      <div className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50 p-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-xl">
                            ❌
                          </div>

                          <div>
                            <p className="text-base font-black text-red-900">
                              {T(
                                "Presupuesto rechazado",
                                "Quote rejected"
                              )}
                            </p>

                            <p className="mt-1 text-sm font-semibold leading-6 text-red-700">
                              {T(
                                "El cliente rechazó tu presupuesto.",
                                "The customer rejected your quote."
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`mt-4 rounded-xl border p-4 text-sm font-bold ${
                          oferta.status === "selected"
                            ? "border-green-200 bg-green-50 text-green-800"
                            : "border-blue-200 bg-blue-50 text-blue-800"
                        }`}
                      >
                        {oferta.status === "selected"
                          ? T(
                              "✅ Presupuesto aceptado por el cliente.",
                              "✅ Quote accepted by the customer."
                            )
                          : T(
                              "✓ Presupuesto enviado. Esperando decisión del cliente.",
                              "✓ Quote sent. Waiting for the customer’s decision."
                            )}
                      </div>
                    )
                  ) : null}

                  {pago && (
                    <p className="mt-5 text-center text-xs leading-5 text-slate-400">
                      {T("Este comprobante resume el valor del servicio y el importe neto correspondiente al profesional.", "This receipt summarizes the service value and the professional’s net amount.")}
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* CHAT PRIVADO RELYDO */}

        {trabajo.status !==
          "open" &&
          trabajo.preferred_provider_id ===
            providerId && (
            <section
              id="chat-relydo"
              className="mt-6 scroll-mt-6 overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-xl"
            >
              <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-blue-300">
                      {T("🔒 Comunicación protegida", "🔒 Protected communication")}
                    </p>

                    <h2 className="mt-1 text-2xl font-black">
                      Chat con{" "}
                      {trabajo.customer_name ||
                        T("el cliente", "the customer")}
                    </h2>

                    <p className="mt-1 text-sm text-slate-300">
                      {T("RELYDO mantiene privado el número real del cliente.", "RELYDO keeps the customer’s real phone number private.")}
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${
                      chatRealtimeConectado
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-700 text-slate-200"
                    }`}
                  >
                    {chatRealtimeConectado
                      ? "● En tiempo real"
                      : "Conectando..."}
                  </span>
                </div>
              </div>

              <div className="max-h-[430px] min-h-[260px] overflow-y-auto bg-slate-50 p-5">
                {cargandoChat ? (
                  <div className="flex min-h-[220px] items-center justify-center text-sm font-bold text-slate-500">
                    {T("Cargando conversación...", "Loading conversation...")}
                  </div>
                ) : mensajesChat.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                    <div className="text-4xl">
                      💬
                    </div>

                    <p className="mt-3 font-black text-slate-800">
                      {T("Todavía no hay mensajes", "There are no messages yet")}
                    </p>

                    <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                      {T("Coordina el servicio aquí sin pedir ni mostrar números personales.", "Coordinate the service here without asking for or displaying personal phone numbers.")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mensajesChat.map(
                      (item) => {
                        const mio =
                          item.sender_id ===
                          usuarioChatId;

                        return (
                          <div
                            key={item.id}
                            className={`flex ${
                              mio
                                ? "justify-end"
                                : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[86%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] ${
                                mio
                                  ? "rounded-br-md bg-blue-700 text-white"
                                  : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                              }`}
                            >
                              <p
                                className={`text-xs font-black ${
                                  mio
                                    ? "text-blue-100"
                                    : "text-blue-700"
                                }`}
                              >
                                {mio
                                  ? T("Tú", "You")
                                  : item.sender_role ===
                                    "admin"
                                  ? "RELYDO Admin"
                                  : trabajo.customer_name ||
                                    T("Cliente", "Customer")}
                              </p>

                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                                {item.message}
                              </p>

                              <p
                                className={`mt-1 text-right text-[11px] ${
                                  mio
                                    ? "text-blue-200"
                                    : "text-slate-400"
                                }`}
                              >
                                {formatearHoraChat(
                                  item.created_at,
                                  language
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      }
                    )}

                    <div
                      ref={finalChatRef}
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 bg-white p-5">
                {chatPuedeEnviar ? (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <textarea
                        value={mensajeChat}
                        onChange={(e) =>
                          setMensajeChat(
                            e.target.value
                          )
                        }
                        onKeyDown={(e) => {
                          if (
                            e.key ===
                              "Enter" &&
                            !e.shiftKey
                          ) {
                            e.preventDefault();
                            enviarMensajeChat();
                          }
                        }}
                        rows={2}
                        maxLength={1500}
                        placeholder={T("Escribe un mensaje...", "Write a message...")}
                        className="min-h-[52px] flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
                      />

                      <button
                        type="button"
                        disabled={
                          enviandoMensajeChat ||
                          !mensajeChat.trim()
                        }
                        onClick={
                          enviarMensajeChat
                        }
                        className="rounded-2xl bg-blue-700 px-6 py-3.5 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {enviandoMensajeChat
                          ? T("Enviando...", "Sending...")
                          : T("Enviar", "Send")}
                      </button>
                    </div>

                    {trabajo.status ===
                      "completed" &&
                      trabajo.completed_at && (
                        <p className="mt-2 text-xs font-bold text-amber-700">
                          {T("⏳ El chat permanecerá abierto hasta 12 horas después de que se completó el trabajo.", "⏳ The chat will remain open for up to 12 hours after the job is completed.")}
                        </p>
                      )}

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {T("🔒 Los números personales no se muestran. Usa este chat para coordinar el trabajo dentro de RELYDO.", "🔒 Personal phone numbers are not displayed. Use this chat to coordinate the job within RELYDO.")}
                    </p>
                  </>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-black text-amber-950">
                      🔒 Chat bloqueado
                    </p>

                    <p className="mt-1 text-sm leading-6 text-amber-900">
                      {motivoChatBloqueado()}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

        {/* RECLAMO / EVIDENCIA DEL PROFESIONAL */}

        {reclamo && (
          <section
            id="reclamo-profesional"
            className="mt-6 rounded-3xl border-2 border-rose-200 bg-white p-6 shadow-lg md:p-7"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-rose-700">
                  {T("⚠️ Reclamo del cliente", "⚠️ Customer claim")}
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  {profesionalYaRespondio
                    ? T("Respuesta enviada al reclamo", "Claim response submitted")
                    : reclamo.status === "open" ||
                      reclamo.status === "reviewing" ||
                      reclamo.status === "in_review"
                    ? T("Adjuntar evidencia al reclamo", "Attach evidence to claim")
                    : T("Historial del reclamo", "Claim history")}
                </h2>

                <p className="mt-2 max-w-3xl text-slate-600">
                  {profesionalYaRespondio
                    ? T("Tu respuesta quedó registrada. Ya no puedes agregar, quitar ni modificar información de este reclamo.", "Your response was recorded. You can no longer add, remove, or modify information for this claim.")
                    : reclamo.status === "open" ||
                      reclamo.status === "reviewing" ||
                      reclamo.status === "in_review"
                    ? T("Puedes enviar una sola respuesta con fotos o videos para que RELYDO tenga evidencia de ambas partes antes de resolver el reclamo.", "You can submit one response with photos or videos so RELYDO has evidence from both parties before resolving the claim.")
                    : T("Consulta los detalles, la evidencia y la resolución final de este reclamo.", "Review the details, evidence, and final resolution of this claim.")}
                </p>
              </div>

              <span
                className={`w-fit rounded-full px-4 py-2 text-sm font-black ${
                  reclamo.status === "open"
                    ? "bg-red-100 text-red-800"
                    : reclamo.status === "reviewing"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {reclamo.status === "open"
                  ? T("Abierto", "Open")
                  : reclamo.status === "reviewing"
                  ? T("En revisión", "Under review")
                  : "Cerrado"}
              </span>
            </div>

            {(reclamo.status === "open" ||
              reclamo.status === "reviewing" ||
              reclamo.status === "in_review") &&
              !profesionalYaRespondio && (
              <div
                className={`mt-5 rounded-2xl border p-5 ${
                  tiempoRespuestaReclamo.vencido
                    ? "border-red-300 bg-red-50"
                    : "border-amber-300 bg-amber-50"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p
                      className={`text-sm font-black uppercase tracking-wide ${
                        tiempoRespuestaReclamo.vencido
                          ? "text-red-700"
                          : "text-amber-700"
                      }`}
                    >
                      Tiempo para responder
                    </p>

                    <p
                      className={`mt-1 text-2xl font-black ${
                        tiempoRespuestaReclamo.vencido
                          ? "text-red-950"
                          : "text-amber-950"
                      }`}
                    >
                      {tiempoRespuestaReclamo.texto}
                    </p>

                    <p
                      className={`mt-2 text-sm ${
                        tiempoRespuestaReclamo.vencido
                          ? "text-red-800"
                          : "text-amber-800"
                      }`}
                    >
                      {tiempoRespuestaReclamo.vencido
                        ? T("Ya no puedes enviar nueva evidencia desde el panel. Admin revisará el reclamo con la información disponible.", "You can no longer submit new evidence from the dashboard. Admin will review the claim using the available information.")
                        : T("Tienes 24 horas desde que se abrió el reclamo para enviar tu respuesta, fotos o videos.", "You have 24 hours from when the claim was opened to submit your response, photos, or videos.")}
                    </p>
                  </div>

                  {reclamo.provider_response_deadline && (
                    <div className="rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
                      <p className="font-bold text-slate-500">
                        {T("Fecha límite", "Deadline")}
                      </p>
                      <p className="mt-1 font-black text-slate-900">
                        {formatearFechaHora(
                          reclamo.provider_response_deadline,
                          language
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-5">
              <p className="text-sm font-bold text-rose-700">
                {T("Motivo del cliente", "Customer reason")}
              </p>

              <p className="mt-2 font-black text-rose-950">
                {reclamo.reason}
              </p>

              {reclamo.description && (
                <p className="mt-3 whitespace-pre-wrap leading-7 text-rose-900">
                  {reclamo.description}
                </p>
              )}
            </div>

            {evidenciasReclamo.length > 0 && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="font-black text-slate-900">
                  {T("Evidencia que ya enviaste", "Evidence you already submitted")}
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  {evidenciasReclamo.filter(
                    (item) =>
                      item.file_type === "image"
                  ).length}{" "}
                  {T("foto(s)", "photo(s)")} ·{" "}
                  {evidenciasReclamo.filter(
                    (item) =>
                      item.file_type === "video"
                  ).length}{" "}
                  {T("video(s)", "video(s)")}
                </p>
              </div>
            )}

            {(reclamo.status === "open" ||
              reclamo.status === "reviewing") &&
              !profesionalYaRespondio &&
              !tiempoRespuestaReclamo.vencido && (
              <>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-black text-slate-900">
                        Fotos o videos
                      </p>

                      <p className="mt-1 text-sm text-slate-600">
                        {T("Hasta 10 fotos y 2 videos en total. Máximo 50 MB por archivo.", "Up to 10 photos and 2 videos total. Maximum 50 MB per file.")}
                      </p>
                    </div>

                    <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border-2 border-blue-700 bg-white px-5 py-3 font-extrabold text-blue-700 transition hover:bg-blue-50">
                      📎 Adjuntar archivos

                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                        onChange={
                          seleccionarArchivosReclamo
                        }
                        disabled={
                          subiendoEvidencia
                        }
                        className="hidden"
                      />
                    </label>
                  </div>

                  {archivosReclamo.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {archivosReclamo.map(
                        (file, index) => (
                          <div
                            key={`${file.name}-${file.size}-${index}`}
                            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-900">
                                {file.type.startsWith(
                                  "video/"
                                )
                                  ? "🎥"
                                  : "🖼️"}{" "}
                                {file.name}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {(file.size /
                                  1024 /
                                  1024).toFixed(
                                  2
                                )}{" "}
                                MB
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={
                                subiendoEvidencia
                              }
                              onClick={() =>
                                quitarArchivoReclamo(
                                  index
                                )
                              }
                              className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-extrabold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Quitar
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
                  <label className="mb-2 block font-black text-slate-900">
                    {T("Explicación de la evidencia *", "Evidence explanation *")}
                  </label>

                  <p className="mb-3 text-sm text-slate-600">
                    {T("Describe qué muestran las fotos o videos y qué debe considerar RELYDO al revisar este reclamo.", "Describe what the photos or videos show and what RELYDO should consider when reviewing this claim.")}
                  </p>

                  <textarea
                    value={explicacionEvidencia}
                    onChange={(e) =>
                      setExplicacionEvidencia(
                        e.target.value
                      )
                    }
                    rows={5}
                    maxLength={1500}
                    disabled={subiendoEvidencia}
                    placeholder={T("Ejemplo: Estas fotos muestran que el trabajo sí fue terminado y que el daño reportado por el cliente ya existía antes de comenzar...", "Example: These photos show that the work was completed and that the damage reported by the customer already existed before the job started...")}
                    className="w-full resize-none rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100"
                  />

                  <p className="mt-2 text-right text-sm text-slate-500">
                    {explicacionEvidencia.length}/1500
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    subiendoEvidencia ||
                    archivosReclamo.length ===
                      0 ||
                    !explicacionEvidencia.trim()
                  }
                  onClick={
                    subirEvidenciaReclamo
                  }
                  className="mt-5 w-full rounded-xl bg-rose-700 px-6 py-4 text-lg font-black text-white shadow transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {subiendoEvidencia
                    ? T("Subiendo evidencia...", "Uploading evidence...")
                    : T("Enviar evidencia al reclamo", "Submit evidence to claim")}
                </button>

                <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                  {T("Una vez enviada, la evidencia quedará asociada al reclamo para revisión de RELYDO.", "Once submitted, the evidence will be linked to the claim for RELYDO review.")}
                </p>
              </>
            )}

            {!profesionalYaRespondio &&
              tiempoRespuestaReclamo.vencido && (
                <div className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-5">
                  <p className="font-black text-red-900">
                    {T("⏰ Plazo de respuesta vencido", "⏰ Response deadline expired")}
                  </p>

                  <p className="mt-2 text-sm leading-6 text-red-800">
                    {T("Ya no puedes agregar comentarios, fotos o videos a este reclamo. RELYDO lo revisará con la evidencia disponible.", "You can no longer add comments, photos, or videos to this claim. RELYDO will review it using the available evidence.")}
                  </p>
                </div>
              )}

            {profesionalYaRespondio && (
              <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
                <p className="font-black text-emerald-900">
                  {T("✅ Tu respuesta ya fue enviada", "✅ Your response has already been submitted")}
                </p>

                <p className="mt-2 text-sm leading-6 text-emerald-800">
                  {T("La evidencia y tu explicación quedaron registradas para revisión de RELYDO. Por seguridad, ya no puedes agregar, quitar ni modificar información de este reclamo.", "Your evidence and explanation were recorded for RELYDO review. For security, you can no longer add, remove, or modify information for this claim.")}
                </p>

                <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                    {T("Tu explicación", "Your explanation")}
                  </p>

                  <p className="mt-2 whitespace-pre-wrap text-slate-700">
                    {reclamo.provider_response ||
                      T("El profesional envió evidencia para responder al reclamo.", "The professional submitted evidence in response to the claim.")}
                  </p>
                </div>
              </div>
            )}

            {reclamo.status !== "open" &&
              reclamo.status !== "reviewing" &&
              reclamo.status !== "in_review" && (
                <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-5">
                  <p className="font-black text-green-900">
                    {T("✅ Reclamo resuelto", "✅ Claim resolved")}
                  </p>

                  <p className="mt-2 text-sm leading-6 text-green-800">
                    {cancelado
                      ? T(
                          "RELYDO cerró este reclamo y dio por finalizado el trabajo. El servicio no continuará. La resolución financiera indicada es definitiva.",
                          "RELYDO closed this claim and ended the job. The service will not continue. The financial resolution shown is final."
                        )
                      : T(
                          "RELYDO cerró este reclamo. El trabajo fue autorizado para continuar y ya puedes completar el servicio normalmente.",
                          "RELYDO closed this claim. The job was authorized to continue and you can now complete the service normally."
                        )}
                  </p>

                  {reclamo.resolution_notes && (
                    <div className="mt-4 rounded-xl border border-green-200 bg-white p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-green-700">
                        {T("Resolución de RELYDO", "RELYDO resolution")}
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-slate-700">
                        {resolutionNoteText(language, reclamo.resolution_notes)}
                      </p>
                    </div>
                  )}
                </div>
              )}
          </section>
        )}

        {/* MENSAJES */}

        {mensaje && !cancelado && (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5 font-bold text-green-800 shadow-sm">
            ✅ {mensaje}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {/* ENVIAR PRESUPUESTO */}

        {trabajo.status ===
          "open" &&
          oferta?.status !==
            "rejected" && (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg md:p-7">

            <h2 className="flex items-center gap-3 text-2xl font-black text-slate-950">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                💵
              </span>
              {T("Enviar presupuesto", "Send quote")}
            </h2>

            {oferta ? (
              <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-6">

                <p className="text-lg font-black text-green-900">
                  {T("✅ Presupuesto enviado", "✅ Quote sent")}
                </p>

                <p className="mt-2 text-green-800">
                  {T("El cliente ya puede comparar tu presupuesto con otras ofertas.", "The customer can now compare your quote with other offers.")}
                </p>
              </div>
            ) : pagosConfigurados === null ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <p className="font-black text-slate-800">
                  {T(
                    "Comprobando configuración de pagos...",
                    "Checking payment setup..."
                  )}
                </p>
              </div>
            ) : !pagosConfigurados ? (
              <div className="mt-6 rounded-2xl border-2 border-red-300 bg-red-50 p-6">
                <p className="text-lg font-black text-red-800">
                  {T(
                    "🔒 Configura tus pagos para enviar presupuestos",
                    "🔒 Set up your payments to send quotes"
                  )}
                </p>

                <p className="mt-2 leading-7 text-red-700">
                  {T(
                    "Puedes revisar todos los detalles de este trabajo, pero antes de enviar un presupuesto debes completar tu configuración de Stripe Connect.",
                    "You can review all the details of this job, but before sending a quote you must complete your Stripe Connect setup."
                  )}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/panel-profesional"
                    )
                  }
                  className="mt-5 w-full rounded-xl bg-red-600 px-6 py-4 text-lg font-black text-white shadow-md transition hover:bg-red-700"
                >
                  {T(
                    "Configurar pagos",
                    "Set up payments"
                  )}
                </button>
              </div>
            ) : (
              <form
                onSubmit={
                  enviarOferta
                }
                className="mt-6"
              >

                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-800">
                      {T("Precio", "Price")}
                    </label>

                    <div className="flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500">
                      <span className="flex items-center border-r border-slate-300 bg-slate-50 px-4 font-bold text-slate-500">
                        $
                      </span>

                      <input
                        name="price"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        placeholder="Ej. 150.00"
                        className="w-full p-4 text-slate-900 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-800">
                      Minutos para llegar
                    </label>

                    <input
                      name="arrival_minutes"
                      type="number"
                      min="0"
                      step="1"
                      required
                      placeholder="Ej. 30"
                      className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-800">
                      {T("Duración estimada", "Estimated duration")}
                    </label>

                    <input
                      name="estimated_job_minutes"
                      type="number"
                      min="1"
                      step="1"
                      required
                      placeholder="Ej. 60"
                      className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-5">

                  <label className="mb-2 block text-sm font-bold text-slate-800">
                    {T("Mensaje para el cliente", "Message to customer")}
                  </label>

                  <textarea
                    name="message"
                    rows={4}
                    required
                    placeholder={T("Escribe un mensaje para el cliente...", "Write a message for the customer...")}
                    className="w-full resize-none rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={
                    enviando
                  }
                  className="mt-5 w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-black text-white shadow-md transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enviando
                    ? T("Enviando presupuesto...", "Sending quote...")
                    : T("Enviar presupuesto", "Send quote")}
                </button>

                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  {T("💡 El cliente podrá comparar tu precio, tiempo de llegada y duración estimada con otros profesionales.", "💡 The customer can compare your price, arrival time, and estimated duration with other professionals.")}
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

/*
  COMPONENTE INFO
*/

function Info({
  icono,
  titulo,
  valor,
}: {
  icono: string;
  titulo: string;
  valor: string;
}) {
  return (
    <div className="flex items-start gap-3">

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl">
        {icono}
      </div>

      <div>
        <p className="font-extrabold text-slate-900">
          {valor}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {titulo}
        </p>
      </div>
    </div>
  );
}

/*
  FILAS RESUMEN
*/

function FilaResumen({
  titulo,
  valor,
  fuerte = false,
}: {
  titulo: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 last:border-b-0">

      <p className="text-sm text-slate-600">
        {titulo}
      </p>

      <p
        className={
          fuerte
            ? "text-xl font-black text-slate-950"
            : "font-bold text-slate-900"
        }
      >
        {valor}
      </p>
    </div>
  );
}