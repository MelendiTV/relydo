"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import NotificationsBell from "@/app/components/NotificationsBell";
import { AccountModeSwitcher } from "@/app/components/AccountModeSwitcher";
import { useAccountMode } from "@/app/components/AccountModeProvider";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type ProviderProfile = {
  user_id: string;
  business_name: string | null;
  company_logo_url: string | null;
  bio: string | null;
  trade: string | null;
  years_experience: number | null;
  service_radius_miles: number | null;
  license_required: boolean | null;
  license_number: string | null;
  license_state: string | null;
  license_expiration: string | null;
  insured: boolean | null;
  insurance_company: string | null;
  insurance_expiration: string | null;
  bonded: boolean | null;
  verification_status: string | null;
  verified: boolean | null;
  active: boolean | null;
  average_rating: number | null;
  completed_jobs: number | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
};

type StripeConnectStatus = {
  success: boolean;
  connected: boolean;
  stripeAccountId?: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  transfersCapability: string | null;
  disabledReason: string | null;
  currentlyDue: string[];
  eventuallyDue: string[];
  pastDue: string[];
  pendingVerification: string[];
};

type TrabajoContratado = {
  id: string;
  title: string;
  description: string;
  city: string;
  state: string;
  zip_code: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  job_stage: string | null;
  customer_name: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
};

type OfertaAceptada = {
  id?: string;
  request_id: string;
  price: number;
  arrival_minutes: number | null;
  estimated_job_minutes: number | null;
  message: string | null;
  status: string;
  created_at?: string;
};

type OfertaHistorial = {
  id: string;
  request_id: string;
  price: number;
  arrival_minutes: number | null;
  estimated_job_minutes: number | null;
  message: string | null;
  status: string;
  created_at: string;
  trabajo: TrabajoContratado | null;
};

type HistorialProfesionalItem = {
  request_id: string;
  trabajo: TrabajoContratado | null;
  oferta: OfertaHistorial | null;
};

type PagoProfesional = {
  request_id: string;
  job_amount: number;
  provider_commission_percent: number;
  provider_commission_amount: number;
  provider_net_amount: number;
  platform_revenue_amount: number;
  currency: string;
  status: string;
};

type TrabajoConOferta = TrabajoContratado & {
  oferta: OfertaAceptada | null;
  pago: PagoProfesional | null;
};

type ReclamoProfesional = {
  id: string;
  request_id: string;
  provider_id: string;
  reason: string | null;
  description: string | null;
  status: string;
  resolution_notes: string | null;
  created_at: string;
};

type DocumentoProfesional = {
  id: string;
  user_id: string;
  document_type: string;
  file_path: string;
  status: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  expiration_date: string | null;
  approved_at: string | null;
  reviewed_by: string | null;
};

type SolicitudDocumentoProfesional = {
  id: string;
  provider_id: string;
  requested_by: string | null;
  request_type: string;
  document_type: string | null;
  message: string;
  status: string;
  requested_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReassignmentHistory = {
  id: string;
  request_id: string;
  provider_id: string | null;
  action: string;
  reason: string | null;
  created_at: string;
};

type PanelResumen =
  | "active"
  | "completed"
  | "cancelled"
  | "reassigned"
  | "claims"
  | "rating"
  | "history"
  | "documents";


type TemaProfesional = "light" | "dark" | "system";
type ColorProfesional =
  | "blue"
  | "violet"
  | "emerald"
  | "rose"
  | "amber"
  | "cyan";

const PROVIDER_THEME_STORAGE_KEY = "relydo_provider_theme";
const PROVIDER_COLOR_STORAGE_KEY = "relydo_provider_accent";
const SOUND_STORAGE_KEY = "relydo_sound_enabled";

const COLORES_PROFESIONAL: Record<
  ColorProfesional,
  {
    nombreEs: string;
    nombreEn: string;
    hex: string;
    hexOscuro: string;
  }
> = {
  blue: {
    nombreEs: "Azul RELYDO",
    nombreEn: "RELYDO Blue",
    hex: "#1d4ed8",
    hexOscuro: "#3730a3",
  },
  violet: {
    nombreEs: "Violeta",
    nombreEn: "Violet",
    hex: "#7c3aed",
    hexOscuro: "#5b21b6",
  },
  emerald: {
    nombreEs: "Esmeralda",
    nombreEn: "Emerald",
    hex: "#059669",
    hexOscuro: "#047857",
  },
  rose: {
    nombreEs: "Rosa",
    nombreEn: "Rose",
    hex: "#e11d48",
    hexOscuro: "#be123c",
  },
  amber: {
    nombreEs: "Ámbar",
    nombreEn: "Amber",
    hex: "#d97706",
    hexOscuro: "#b45309",
  },
  cyan: {
    nombreEs: "Turquesa",
    nombreEn: "Cyan",
    hex: "#0891b2",
    hexOscuro: "#0e7490",
  },
};

function nombreOficio(trade: string | null, language: "es" | "en") {
  const nombresEs: Record<string, string> = {
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

  const nombresEn: Record<string, string> = {
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

  if (!trade) return language === "es" ? "No indicada" : "Not specified";
  return (language === "es" ? nombresEs : nombresEn)[trade] || trade;
}

function nombreEtapa(
  etapa: string | null,
  status: string,
  language: "es" | "en"
) {
  if (status === "completed") return language === "es" ? "Completado" : "Completed";
  if (status === "cancelled") return language === "es" ? "Cancelado" : "Cancelled";
  if (etapa === "on_the_way") return language === "es" ? "En camino" : "On the way";
  if (etapa === "arrived") return language === "es" ? "Ya llegó" : "Arrived";
  if (etapa === "working") return language === "es" ? "Trabajo iniciado" : "Work started";
  return language === "es" ? "Contratado" : "Hired";
}

function estiloEtapa(etapa: string | null, status: string) {
  if (status === "completed") return "bg-green-100 text-green-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  if (etapa === "working") return "bg-amber-100 text-amber-800";
  if (etapa === "arrived") return "bg-purple-100 text-purple-800";
  if (etapa === "on_the_way") return "bg-blue-100 text-blue-800";
  return "bg-green-100 text-green-800";
}

function mostrarMinutos(minutos: number | null, language: "es" | "en") {
  if (minutos === null || minutos === undefined)
    return language === "es" ? "No indicado" : "Not specified";
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;

  if (restantes === 0) {
    return language === "es"
      ? `${horas} ${horas === 1 ? "hora" : "horas"}`
      : `${horas} ${horas === 1 ? "hour" : "hours"}`;
  }

  return `${horas} h ${restantes} min`;
}

function crearFechaSegura(fecha: string | null | undefined) {
  if (!fecha) return null;

  const valor = String(fecha).trim();

  if (
    !valor ||
    valor.toLowerCase() === "null" ||
    valor.toLowerCase() === "undefined" ||
    valor.toLowerCase() === "invalid date"
  ) {
    return null;
  }

  // Si Supabase devuelve solamente YYYY-MM-DD, usamos mediodía local para
  // evitar cambios de día por zona horaria. Si trae timestamp completo,
  // lo dejamos tal cual.
  const valorNormalizado = /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? `${valor}T12:00:00`
    : valor;

  const fechaParseada = new Date(valorNormalizado);

  if (Number.isNaN(fechaParseada.getTime())) {
    return null;
  }

  return fechaParseada;
}

function formatearFecha(
  fecha: string | null | undefined,
  language: "es" | "en"
) {
  const fechaValida = crearFechaSegura(fecha);

  if (!fechaValida) {
    return language === "es" ? "No disponible" : "Not available";
  }

  try {
    return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(fechaValida);
  } catch {
    return language === "es" ? "No disponible" : "Not available";
  }
}

export default function PanelProfesional() {
  const router = useRouter();
  const { setAccountRole } = useAccountMode();
  const { language } = useLanguage();
  const T = (es: string, en: string) => (language === "es" ? es : en);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [email, setEmail] = useState("");
  const [trabajosContratados, setTrabajosContratados] = useState<TrabajoConOferta[]>([]);
  const [ofertasHistorial, setOfertasHistorial] = useState<OfertaHistorial[]>([]);
  const [reclamos, setReclamos] = useState<ReclamoProfesional[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoProfesional[]>([]);
  const [solicitudesDocumentos, setSolicitudesDocumentos] = useState<SolicitudDocumentoProfesional[]>([]);
  const [historialReasignaciones, setHistorialReasignaciones] = useState<ReassignmentHistory[]>([]);
  const [abriendoDocumento, setAbriendoDocumento] = useState<string | null>(null);
  const [archivosSolicitud, setArchivosSolicitud] = useState<Record<string, File | null>>({});
  const [enviandoSolicitud, setEnviandoSolicitud] = useState<string | null>(null);
  const [mensajeDocumentos, setMensajeDocumentos] = useState("");
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [error, setError] = useState("");
  const [panelActivo, setPanelActivo] = useState<PanelResumen | null>(null);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [esMovil, setEsMovil] = useState(false);

  const [stripeStatus, setStripeStatus] =
    useState<StripeConnectStatus | null>(null);
  const [cargandoStripe, setCargandoStripe] =
    useState(false);
  const [configurandoStripe, setConfigurandoStripe] =
    useState(false);
  const [mensajePagos, setMensajePagos] =
    useState("");
  const [errorPagos, setErrorPagos] =
    useState("");


  const [userId, setUserId] =
    useState<string | null>(null);

  const [mostrarAjustes, setMostrarAjustes] =
    useState(false);

  const [temaProfesional, setTemaProfesional] =
    useState<TemaProfesional>("system");

  const [temaOscuro, setTemaOscuro] =
    useState(false);

  const [colorProfesional, setColorProfesional] =
    useState<ColorProfesional>("blue");

  const [pushDisponible, setPushDisponible] =
    useState(false);

  const [pushActivo, setPushActivo] =
    useState(false);

  const [procesandoPush, setProcesandoPush] =
    useState(false);

  const [sonidoActivo, setSonidoActivo] =
    useState(false);

  const [mensajeAjustes, setMensajeAjustes] =
    useState("");

  const [mostrarEliminarCuenta, setMostrarEliminarCuenta] =
    useState(false);

  const [confirmacionEliminar, setConfirmacionEliminar] =
    useState(false);

  const [eliminandoCuenta, setEliminandoCuenta] =
    useState(false);

  const [mensajeEliminarCuenta, setMensajeEliminarCuenta] =
    useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const temaGuardado =
      localStorage.getItem(
        PROVIDER_THEME_STORAGE_KEY
      ) as TemaProfesional | null;

    const colorGuardado =
      localStorage.getItem(
        PROVIDER_COLOR_STORAGE_KEY
      ) as ColorProfesional | null;

    const sonidoGuardado =
      localStorage.getItem(
        SOUND_STORAGE_KEY
      );

    const temaValido =
      temaGuardado === "light" ||
      temaGuardado === "dark" ||
      temaGuardado === "system"
        ? temaGuardado
        : "system";

    const colorValido =
      colorGuardado &&
      colorGuardado in COLORES_PROFESIONAL
        ? colorGuardado
        : "blue";

    setTemaProfesional(temaValido);
    setColorProfesional(
      colorValido as ColorProfesional
    );
    setSonidoActivo(
      sonidoGuardado === "true"
    );

    const media =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      );

    const aplicarTema = () => {
      const oscuro =
        temaValido === "dark" ||
        (
          temaValido === "system" &&
          media.matches
        );

      setTemaOscuro(oscuro);

      document.documentElement.dataset.relydoProviderTheme =
        oscuro ? "dark" : "light";

      document.documentElement.dataset.relydoProviderAccent =
        colorValido;

      document.documentElement.style.setProperty(
        "--relydo-provider-accent",
        COLORES_PROFESIONAL[
          colorValido as ColorProfesional
        ].hex
      );

      document.documentElement.style.setProperty(
        "--relydo-provider-accent-dark",
        COLORES_PROFESIONAL[
          colorValido as ColorProfesional
        ].hexOscuro
      );
    };

    aplicarTema();

    const listener = () => {
      if (temaValido === "system") {
        aplicarTema();
      }
    };

    media.addEventListener?.(
      "change",
      listener
    );

    return () => {
      media.removeEventListener?.(
        "change",
        listener
      );
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      );

    const oscuro =
      temaProfesional === "dark" ||
      (
        temaProfesional === "system" &&
        media.matches
      );

    setTemaOscuro(oscuro);

    document.documentElement.dataset.relydoProviderTheme =
      oscuro ? "dark" : "light";

    window.dispatchEvent(
      new CustomEvent(
        "relydo-provider-appearance",
        {
          detail: {
            theme: temaProfesional,
            dark: oscuro,
            color: colorProfesional,
          },
        }
      )
    );
  }, [
    temaProfesional,
    colorProfesional,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const colorActual =
      COLORES_PROFESIONAL[
        colorProfesional
      ];

    document.documentElement.dataset.relydoProviderAccent =
      colorProfesional;

    document.documentElement.style.setProperty(
      "--relydo-provider-accent",
      colorActual.hex
    );

    document.documentElement.style.setProperty(
      "--relydo-provider-accent-dark",
      colorActual.hexOscuro
    );
  }, [colorProfesional]);

  useEffect(() => {
    const disponible =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setPushDisponible(disponible);

    if (
      disponible &&
      userId
    ) {
      comprobarPushProfesional();
    }
  }, [userId]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");

    const actualizarModo = () => {
      setEsMovil(media.matches);
    };

    actualizarModo();
    media.addEventListener("change", actualizarModo);

    return () => {
      media.removeEventListener("change", actualizarModo);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    cargarPanel();

    const channel = supabase
      .channel("panel-profesional-service-requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
        },
        async (payload) => {
          console.log("Cambio detectado en service_requests:", payload);

          if (mounted) {
            await cargarPanel(false);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
        },
        async (payload) => {
          console.log("Cambio detectado en payments:", payload);

          if (mounted) {
            await cargarPanel(false);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offers",
        },
        async (payload) => {
          console.log("Cambio detectado en offers:", payload);

          if (mounted) {
            await cargarPanel(false);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_claims",
        },
        async (payload) => {
          console.log("Cambio detectado en job_claims:", payload);

          if (mounted) {
            await cargarPanel(false);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "provider_documents",
        },
        async () => {
          if (mounted) await cargarPanel(false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "provider_document_requests",
        },
        async () => {
          if (mounted) await cargarPanel(false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_reassignment_history",
        },
        async () => {
          if (mounted) await cargarPanel(false);
        }
      )
      .subscribe((status) => {
        console.log("Realtime panel profesional:", status);
      });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  function guardarTemaProfesional(
    tema: TemaProfesional
  ) {
    setTemaProfesional(tema);

    localStorage.setItem(
      PROVIDER_THEME_STORAGE_KEY,
      tema
    );

    setMensajeAjustes(
      T(
        "Preferencias guardadas en este dispositivo.",
        "Preferences saved on this device."
      )
    );
  }

  function guardarColorProfesional(
    color: ColorProfesional
  ) {
    setColorProfesional(color);

    localStorage.setItem(
      PROVIDER_COLOR_STORAGE_KEY,
      color
    );

    setMensajeAjustes(
      T(
        "Preferencias guardadas en este dispositivo.",
        "Preferences saved on this device."
      )
    );
  }

  function cambiarSonido() {
    const siguiente =
      !sonidoActivo;

    setSonidoActivo(
      siguiente
    );

    localStorage.setItem(
      SOUND_STORAGE_KEY,
      String(siguiente)
    );

    window.dispatchEvent(
      new CustomEvent(
        "relydo-sound-preference",
        {
          detail: {
            enabled:
              siguiente,
          },
        }
      )
    );

    setMensajeAjustes(
      T(
        "Preferencias guardadas en este dispositivo.",
        "Preferences saved on this device."
      )
    );
  }

  async function comprobarPushProfesional() {
    try {
      const registration =
        await navigator.serviceWorker.register(
          "/sw.js"
        );

      const ready =
        await navigator.serviceWorker.ready;

      const subscription =
        await ready.pushManager.getSubscription();

      setPushActivo(
        Boolean(subscription)
      );

      if (
        registration &&
        Notification.permission ===
          "denied"
      ) {
        setPushActivo(false);
      }
    } catch (error) {
      console.error(
        "No se pudo comprobar Push profesional:",
        error
      );

      setPushActivo(false);
    }
  }

  function urlBase64AUint8Array(
    base64String: string
  ) {
    const padding =
      "=".repeat(
        (
          4 -
          (base64String.length % 4)
        ) % 4
      );

    const base64 =
      (
        base64String +
        padding
      )
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData =
      window.atob(base64);

    return Uint8Array.from(
      [...rawData].map(
        (character) =>
          character.charCodeAt(0)
      )
    );
  }

  async function activarPushProfesional() {
    if (
      !userId ||
      !pushDisponible
    ) {
      return;
    }

    setProcesandoPush(true);
    setMensajeAjustes("");

    try {
      const publicKey =
        process.env
          .NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!publicKey) {
        throw new Error(
          "Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY."
        );
      }

      const permission =
        await Notification.requestPermission();

      if (
        permission !== "granted"
      ) {
        throw new Error(
          T(
            "El navegador bloqueó las notificaciones. Debes permitirlas desde la configuración del navegador.",
            "The browser blocked notifications. Allow them from your browser settings."
          )
        );
      }

      const registration =
        await navigator.serviceWorker.register(
          "/sw.js"
        );

      await navigator.serviceWorker.ready;

      let subscription =
        await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription =
          await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey:
              urlBase64AUint8Array(
                publicKey
              ),
          });
      }

      const json =
        subscription.toJSON();

      const endpoint =
        subscription.endpoint;

      const p256dh =
        json.keys?.p256dh;

      const auth =
        json.keys?.auth;

      if (
        !endpoint ||
        !p256dh ||
        !auth
      ) {
        throw new Error(
          T(
            "La suscripción Push no devolvió las claves necesarias.",
            "The Push subscription did not return the required keys."
          )
        );
      }

      const {
        error:
          guardarError,
      } = await supabase
        .from(
          "push_subscriptions"
        )
        .upsert(
          {
            user_id:
              userId,
            endpoint,
            p256dh,
            auth,
            user_agent:
              navigator.userAgent,
            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "endpoint",
          }
        );

      if (guardarError) {
        throw new Error(
          guardarError.message
        );
      }

      setPushActivo(true);

      setMensajeAjustes(
        T(
          "Preferencias guardadas en este dispositivo.",
          "Preferences saved on this device."
        )
      );
    } catch (error) {
      console.error(
        "No se pudo activar Push profesional:",
        error
      );

      setMensajeAjustes(
        error instanceof Error
          ? error.message
          : T(
              "Push no disponible en este navegador.",
              "Push is not available in this browser."
            )
      );
    } finally {
      setProcesandoPush(false);
    }
  }

  async function desactivarPushProfesional() {
    if (
      !pushDisponible
    ) {
      return;
    }

    setProcesandoPush(true);
    setMensajeAjustes("");

    try {
      const registration =
        await navigator.serviceWorker.ready;

      const subscription =
        await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint =
          subscription.endpoint;

        await subscription.unsubscribe();

        if (userId) {
          const {
            error:
              deleteError,
          } = await supabase
            .from(
              "push_subscriptions"
            )
            .delete()
            .eq(
              "user_id",
              userId
            )
            .eq(
              "endpoint",
              endpoint
            );

          if (deleteError) {
            console.warn(
              "Push se desactivó en el navegador, pero no se pudo borrar la suscripción guardada:",
              deleteError
            );
          }
        }
      }

      setPushActivo(false);

      setMensajeAjustes(
        T(
          "Preferencias guardadas en este dispositivo.",
          "Preferences saved on this device."
        )
      );
    } catch (error) {
      console.error(
        "No se pudo desactivar Push profesional:",
        error
      );

      setMensajeAjustes(
        error instanceof Error
          ? error.message
          : T(
              "Push no disponible en este navegador.",
              "Push is not available in this browser."
            )
      );
    } finally {
      setProcesandoPush(false);
    }
  }

  async function eliminarCuentaProfesional() {
    if (
      !confirmacionEliminar ||
      eliminandoCuenta
    ) {
      return;
    }

    setEliminandoCuenta(true);
    setMensajeEliminarCuenta("");

    try {
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      const accessToken =
        sessionData.session?.access_token;

      if (
        sessionError ||
        !accessToken
      ) {
        throw new Error(
          T(
            "Tu sesión ya no está disponible.",
            "Your session is no longer available."
          )
        );
      }

      const response =
        await fetch(
          "/api/account/delete",
          {
            method: "DELETE",
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
              "Content-Type":
                "application/json",
            },
          }
        );

      const result =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        if (
          response.status === 409
        ) {
          const details =
            Array.isArray(
              result?.pending
            )
              ? result.pending.join(
                  " · "
                )
              : "";

          throw new Error(
            details
              ? `${T(
                  "No podemos eliminar tu cuenta todavía porque tienes asuntos pendientes.",
                  "We cannot delete your account yet because you have unresolved items."
                )} ${details}`
              : T(
                  "No podemos eliminar tu cuenta todavía porque tienes asuntos pendientes.",
                  "We cannot delete your account yet because you have unresolved items."
                )
          );
        }

        throw new Error(
          result?.error ||
            T(
              "No pudimos eliminar tu cuenta.",
              "We could not delete your account."
            )
        );
      }

      await supabase.auth.signOut();

      window.location.href =
        "/login-profesional?account_deleted=1";
    } catch (error) {
      setMensajeEliminarCuenta(
        error instanceof Error
          ? error.message
          : T(
              "No pudimos eliminar tu cuenta.",
              "We could not delete your account."
            )
      );
    } finally {
      setEliminandoCuenta(false);
    }
  }

  async function consultarEstadoPagos(
    mostrarCargaStripe = true
  ) {
    if (mostrarCargaStripe) {
      setCargandoStripe(true);
    }

    setErrorPagos("");

    try {
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
            "No pudimos verificar tu sesión para consultar Stripe.",
            "We could not verify your session to check Stripe."
          )
        );
      }

      const response = await fetch(
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

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            T(
              "No pudimos consultar el estado de tus pagos.",
              "We could not check your payment status."
            )
        );
      }

      setStripeStatus(
        data as StripeConnectStatus
      );

      return data as StripeConnectStatus;
    } catch (err) {
      console.error(
        "Error consultando Stripe Connect:",
        err
      );

      setErrorPagos(
        err instanceof Error
          ? err.message
          : T(
              "No pudimos consultar Stripe.",
              "We could not check Stripe."
            )
      );

      return null;
    } finally {
      if (mostrarCargaStripe) {
        setCargandoStripe(false);
      }
    }
  }

  async function configurarPagosStripe() {
    setErrorPagos("");
    setMensajePagos("");
    setConfigurandoStripe(true);

    try {
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
            "No pudimos verificar tu sesión.",
            "We could not verify your session."
          )
        );
      }

      const response = await fetch(
        "/api/stripe/connect",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${sessionData.session.access_token}`,
          },
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            T(
              "No se pudo iniciar la configuración de pagos.",
              "Could not start payment setup."
            )
        );
      }

      if (!data?.url) {
        throw new Error(
          T(
            "Stripe no devolvió un enlace de configuración.",
            "Stripe did not return a setup link."
          )
        );
      }

      window.location.href =
        data.url;
    } catch (err) {
      console.error(
        "Error iniciando Stripe Connect:",
        err
      );

      setErrorPagos(
        err instanceof Error
          ? err.message
          : T(
              "No se pudo iniciar Stripe Connect.",
              "Could not start Stripe Connect."
            )
      );

      setConfigurandoStripe(false);
    }
  }

  async function cargarPanel(mostrarCarga = true) {
    if (mostrarCarga) {
      setLoading(true);
    } else {
      setActualizando(true);
    }

    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login-profesional");
        return;
      }

      setUserId(user.id);
      setEmail(user.email || "");

      const { data: baseProfile, error: baseProfileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (baseProfileError || !baseProfile) {
        throw new Error(T("No se encontró tu cuenta en RELYDO.", "We could not find your RELYDO account."));
      }

      if (baseProfile.role === "admin") {
        router.replace("/admin");
        return;
      }

      if (baseProfile.role !== "provider") {
        await supabase.auth.signOut();
        router.replace("/login-profesional");
        return;
      }

      setAccountRole("provider");

      const { data: providerProfile, error: profileError } = await supabase
        .from("provider_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(
          `${T("No se pudo cargar tu perfil profesional", "We could not load your professional profile")}: ${profileError.message}`
        );
      }

      if (!providerProfile) {
        router.replace("/completar-perfil-profesional");
        return;
      }

      setProfile(providerProfile as ProviderProfile);

      const { count: reviewsCount, error: reviewsCountError } = await supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("reviewee_id", user.id);

      if (reviewsCountError) {
        console.error("Error cargando cantidad de calificaciones:", reviewsCountError);
        setRatingCount(0);
      } else {
        setRatingCount(reviewsCount ?? 0);
      }

      await consultarEstadoPagos(false);

      const { data: documentosData, error: documentosError } = await supabase
        .from("provider_documents")
        .select(`
          id,
          user_id,
          document_type,
          file_path,
          status,
          rejection_reason,
          created_at,
          reviewed_at,
          expiration_date,
          approved_at,
          reviewed_by
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (documentosError) {
        console.error("Error cargando documentos del profesional:", documentosError);
        setDocumentos([]);
      } else {
        setDocumentos((documentosData || []) as DocumentoProfesional[]);
      }

      const { data: solicitudesDocsData, error: solicitudesDocsError } = await supabase
        .from("provider_document_requests")
        .select(`
          id,
          provider_id,
          requested_by,
          request_type,
          document_type,
          message,
          status,
          requested_at,
          submitted_at,
          completed_at,
          created_at,
          updated_at
        `)
        .eq("provider_id", user.id)
        .order("requested_at", { ascending: false });

      if (solicitudesDocsError) {
        console.error("Error cargando solicitudes de documentos:", solicitudesDocsError);
        setSolicitudesDocumentos([]);
      } else {
        setSolicitudesDocumentos((solicitudesDocsData || []) as SolicitudDocumentoProfesional[]);
      }

      const estaVerificado =
        providerProfile.verification_status === "verified" &&
        providerProfile.verified === true &&
        providerProfile.active === true;

      if (!estaVerificado) {
        setTrabajosContratados([]);
        setOfertasHistorial([]);
        setReclamos([]);
        setHistorialReasignaciones([]);
        return;
      }

      const { data: reclamosData, error: reclamosError } = await supabase
        .from("job_claims")
        .select(`
          id,
          request_id,
          provider_id,
          reason,
          description,
          status,
          resolution_notes,
          created_at
        `)
        .eq("provider_id", user.id)
        .order("created_at", { ascending: false });

      if (reclamosError) {
        console.error("Error cargando reclamos del profesional:", reclamosError);
        setReclamos([]);
      } else {
        setReclamos((reclamosData || []) as ReclamoProfesional[]);
      }

      const { data: historialReasignacionesData, error: historialReasignacionesError } = await supabase
        .from("job_reassignment_history")
        .select(`
          id,
          request_id,
          provider_id,
          action,
          reason,
          created_at
        `)
        .eq("provider_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (historialReasignacionesError) {
        console.error(
          "Error cargando historial de reasignaciones del profesional:",
          historialReasignacionesError
        );
        setHistorialReasignaciones([]);
      } else {
        setHistorialReasignaciones(
          (historialReasignacionesData || []) as ReassignmentHistory[]
        );
      }

      /*
        HISTORIAL COMPLETO DE PRESUPUESTOS DEL PROFESIONAL

        A diferencia de trabajosContratados, aquí cargamos TODAS las ofertas
        enviadas por este profesional, incluso si quedaron pending/rejected
        y nunca llegó a ser el preferred_provider_id.
      */

      const { data: todasOfertasData, error: todasOfertasError } = await supabase
        .from("offers")
        .select(`
          id,
          request_id,
          price,
          arrival_minutes,
          estimated_job_minutes,
          message,
          status,
          created_at
        `)
        .eq("professional_id", user.id)
        .order("created_at", { ascending: false });

      if (todasOfertasError) {
        console.error(
          "Error cargando historial completo de presupuestos:",
          todasOfertasError
        );
        setOfertasHistorial([]);
      } else {
        const todasOfertas = (todasOfertasData || []) as Array<
          Omit<OfertaHistorial, "trabajo">
        >;

        const idsSolicitudesOfertadas = Array.from(
          new Set(todasOfertas.map((oferta) => oferta.request_id))
        );

        let trabajosOfertados: TrabajoContratado[] = [];

        if (idsSolicitudesOfertadas.length > 0) {
          const {
            data: trabajosOfertadosData,
            error: trabajosOfertadosError,
          } = await supabase
            .from("service_requests")
            .select(`
              id,
              title,
              description,
              city,
              state,
              zip_code,
              preferred_date,
              preferred_time,
              status,
              job_stage,
              customer_name,
              cancellation_reason,
              cancelled_at,
              created_at
            `)
            .in("id", idsSolicitudesOfertadas);

          if (trabajosOfertadosError) {
            console.error(
              "Error cargando trabajos ligados a presupuestos:",
              trabajosOfertadosError
            );
          } else {
            trabajosOfertados =
              (trabajosOfertadosData || []) as TrabajoContratado[];
          }
        }

        setOfertasHistorial(
          todasOfertas.map((oferta) => ({
            ...oferta,
            trabajo:
              trabajosOfertados.find(
                (trabajo) => trabajo.id === oferta.request_id
              ) || null,
          }))
        );
      }

      const { data: trabajosData, error: trabajosError } = await supabase
        .from("service_requests")
        .select(`
          id,
          title,
          description,
          city,
          state,
          zip_code,
          preferred_date,
          preferred_time,
          status,
          job_stage,
          customer_name,
          cancellation_reason,
          cancelled_at,
          created_at
        `)
        .eq("preferred_provider_id", user.id)
        .in("status", ["in_progress", "completed", "cancelled"])
        .order("created_at", { ascending: false });

      if (trabajosError) {
        throw new Error(
          `${T("No se pudieron cargar tus trabajos", "We could not load your jobs")}: ${trabajosError.message}`
        );
      }

      const trabajosBase = (trabajosData || []) as TrabajoContratado[];

      if (trabajosBase.length === 0) {
        setTrabajosContratados([]);
      }

      const requestIds = trabajosBase.map((trabajo) => trabajo.id);

      const { data: ofertasData, error: ofertasError } =
        requestIds.length > 0
          ? await supabase
              .from("offers")
              .select(`
                request_id,
                price,
                arrival_minutes,
                estimated_job_minutes,
                message,
                status
              `)
              .eq("professional_id", user.id)
              .in("request_id", requestIds)
          : { data: [], error: null };

      if (ofertasError) {
        console.error("Error cargando presupuestos:", ofertasError);
      }

      const ofertas = (ofertasData || []) as OfertaAceptada[];

      const { data: pagosData, error: pagosError } =
        requestIds.length > 0
          ? await supabase
              .from("payments")
              .select(`
                request_id,
                job_amount,
                provider_commission_percent,
                provider_commission_amount,
                provider_net_amount,
                platform_revenue_amount,
                currency,
                status
              `)
              .eq("provider_id", user.id)
              .in("request_id", requestIds)
          : { data: [], error: null };

      if (pagosError) {
        console.error("Error cargando pagos del profesional:", pagosError);
      }

      const pagos = (pagosData || []) as PagoProfesional[];

      const combinados = trabajosBase.map((trabajo) => ({
        ...trabajo,
        oferta:
          ofertas.find((oferta) => oferta.request_id === trabajo.id) || null,
        pago:
          pagos.find((pago) => pago.request_id === trabajo.id) || null,
      }));

      setTrabajosContratados(combinados);
    } catch (err) {
      console.error("Error cargando panel:", err);

      setError(
        err instanceof Error ? err.message : T("Ocurrió un error inesperado.", "An unexpected error occurred.")
      );
    } finally {
      if (mostrarCarga) {
        setLoading(false);
      }

      setActualizando(false);
    }
  }

  async function subirLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !profile) return;

    setError("");

    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];

    if (!tiposPermitidos.includes(file.type)) {
      setError(T("El logo debe ser JPG, PNG o WEBP.", "The logo must be JPG, PNG, or WEBP."));
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(T("El logo no puede superar 5 MB.", "The logo cannot exceed 5 MB."));
      event.target.value = "";
      return;
    }

    setSubiendoLogo(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(T("Tu sesión ya no está disponible.", "Your session is no longer available."));
      }

      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const ruta = `${user.id}/company-logo-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("provider-logos")
        .upload(ruta, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`${T("No se pudo subir el logo", "We could not upload the logo")}: ${uploadError.message}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("provider-logos").getPublicUrl(ruta);

      const { error: updateError } = await supabase
        .from("provider_profiles")
        .update({
          company_logo_url: publicUrl,
        })
        .eq("user_id", user.id);

      if (updateError) {
        throw new Error(
          `${T("El logo subió, pero no se pudo guardar en el perfil", "The logo was uploaded, but it could not be saved to your profile")}: ${updateError.message}`
        );
      }

      setProfile((actual) =>
        actual
          ? {
              ...actual,
              company_logo_url: publicUrl,
            }
          : actual
      );
    } catch (err) {
      console.error("Error subiendo logo:", err);
      setError(
        err instanceof Error ? err.message : T("No se pudo subir el logo.", "We could not upload the logo.")
      );
    } finally {
      setSubiendoLogo(false);
      event.target.value = "";
    }
  }

  function irASeccion(id: string) {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function abrirPanel(panel: PanelResumen) {
    const seVaACerrar = panelActivo === panel;
    setPanelActivo(seVaACerrar ? null : panel);

    if (!seVaACerrar) {
      window.setTimeout(() => {
        document.getElementById("contenido-resumen")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    window.location.href = "/login-profesional";
  }

  function nombreTipoDocumento(documentType: string | null) {
    if (!documentType) return T("Varios documentos", "Multiple documents");
    if (documentType === "license") return T("Licencia", "License");
    if (documentType === "insurance") return T("Seguro", "Insurance");
    if (documentType === "bond") return T("Bond / Fianza", "Bond");
    if (documentType === "other") return T("Otro documento", "Other document");
    return documentType;
  }

  function fechaCorta(fecha: string | null | undefined) {
    const fechaValida = crearFechaSegura(fecha);

    if (!fechaValida) {
      return T("Sin registrar", "Not registered");
    }

    try {
      return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(fechaValida);
    } catch {
      return T("Sin registrar", "Not registered");
    }
  }

  function vencimientoDocumento(doc: DocumentoProfesional) {
    if (doc.expiration_date) return doc.expiration_date;
    if (doc.document_type === "license") return profile?.license_expiration || null;
    if (doc.document_type === "insurance") return profile?.insurance_expiration || null;
    return null;
  }

  function diasParaVencer(fecha: string | null | undefined) {
    const vence = crearFechaSegura(fecha);

    if (!vence) return null;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    vence.setHours(0, 0, 0, 0);

    return Math.ceil((vence.getTime() - hoy.getTime()) / 86400000);
  }

  async function abrirDocumento(doc: DocumentoProfesional) {
    setError("");
    setAbriendoDocumento(doc.id);

    try {
      const { data, error: signedUrlError } = await supabase.storage
        .from("provider-documents")
        .createSignedUrl(doc.file_path, 60);

      if (signedUrlError || !data?.signedUrl) {
        throw new Error(
          signedUrlError?.message || T("No se pudo generar el enlace del documento.", "Could not generate the document link.")
        );
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : T("No se pudo abrir el documento.", "Could not open the document."));
    } finally {
      setAbriendoDocumento(null);
    }
  }

  function seleccionarArchivoSolicitud(solicitudId: string, file: File | null) {
    setError("");
    setMensajeDocumentos("");

    if (!file) {
      setArchivosSolicitud((actual) => ({ ...actual, [solicitudId]: null }));
      return;
    }

    const esImagen = file.type.startsWith("image/");
    const esPdf = file.type === "application/pdf";

    if (!esImagen && !esPdf) {
      setError(
        T(
          "El documento debe ser una imagen o un archivo PDF.",
          "The document must be an image or PDF file."
        )
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError(
        T(
          "El documento no puede superar 10 MB.",
          "The document cannot exceed 10 MB."
        )
      );
      return;
    }

    setArchivosSolicitud((actual) => ({ ...actual, [solicitudId]: file }));
  }

  async function enviarDocumentoSolicitado(solicitud: SolicitudDocumentoProfesional) {
    const file = archivosSolicitud[solicitud.id];
    if (!file) {
      setError(T("Selecciona primero una foto o archivo.", "Select a photo or file first."));
      return;
    }

    setError("");
    setMensajeDocumentos("");
    setEnviandoSolicitud(solicitud.id);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(T("Tu sesión ya no está disponible.", "Your session is no longer available."));
      }

      const documentType = solicitud.document_type || "other";
      const extensionOriginal = file.name.split(".").pop()?.toLowerCase();
      const extension =
        extensionOriginal && /^[a-z0-9]{1,8}$/.test(extensionOriginal)
          ? extensionOriginal
          : file.type === "application/pdf"
          ? "pdf"
          : "jpg";

      const ruta = `${user.id}/${documentType}-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("provider-documents")
        .upload(ruta, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          `${T("No se pudo subir el documento", "Could not upload the document")}: ${uploadError.message}`
        );
      }

      const { error: insertError } = await supabase
        .from("provider_documents")
        .insert({
          user_id: user.id,
          document_type: documentType,
          file_path: ruta,
          status: "pending",
          rejection_reason: null,
        });

      if (insertError) {
        await supabase.storage.from("provider-documents").remove([ruta]);
        throw new Error(
          `${T("El archivo subió, pero no se pudo registrar", "The file uploaded, but could not be registered")}: ${insertError.message}`
        );
      }

      const ahora = new Date().toISOString();
      const { error: requestError } = await supabase
        .from("provider_document_requests")
        .update({
          status: "submitted",
          submitted_at: ahora,
          updated_at: ahora,
        })
        .eq("id", solicitud.id)
        .eq("provider_id", user.id);

      if (requestError) {
        throw new Error(
          `${T("El documento se guardó, pero no se pudo actualizar la solicitud", "The document was saved, but the request could not be updated")}: ${requestError.message}`
        );
      }

      setArchivosSolicitud((actual) => ({ ...actual, [solicitud.id]: null }));
      setMensajeDocumentos(
        T(
          "Documento enviado correctamente. RELYDO lo revisará y te notificará cuando termine la revisión.",
          "Document sent successfully. RELYDO will review it and notify you when the review is complete."
        )
      );

      await cargarPanel(false);
      irASeccion("documentacion-profesional");
    } catch (err) {
      console.error("Error enviando documento solicitado:", err);
      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo enviar el documento.", "Could not send the document.")
      );
    } finally {
      setEnviandoSolicitud(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-lg">
          <p className="font-bold text-slate-700">
            {T("Cargando panel profesional...", "Loading professional dashboard...")}
          </p>
        </div>
      </main>
    );
  }

  if (error && !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-extrabold text-red-700">
            {T("No se pudo cargar el panel", "Could not load dashboard")}
          </h1>

          <p className="mt-4 text-slate-700">{error}</p>

          <button
            type="button"
            onClick={cerrarSesion}
            className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3 font-bold text-white hover:bg-slate-700"
          >
            {T("Cerrar sesión", "Sign out")}
          </button>
        </div>
      </main>
    );
  }

  if (!profile) return null;

  const estaRechazado = profile.verification_status === "rejected";

  const estaSuspendido =
    profile.verification_status === "verified" &&
    profile.verified === true &&
    profile.active !== true;

  const estaVerificado =
    !estaRechazado &&
    profile.verification_status === "verified" &&
    profile.verified === true &&
    profile.active === true;

  const pagosConfigurados =
    stripeStatus?.connected === true &&
    stripeStatus.onboardingComplete === true &&
    stripeStatus.payoutsEnabled === true &&
    stripeStatus.transfersCapability === "active";

  function obtenerEstado() {
    if (estaRechazado) {
      return {
        titulo: T("Verificación rechazada", "Verification rejected"),
        descripcion: T(
          "Tu verificación necesita correcciones. Revisa o vuelve a enviar tus documentos.",
          "Your verification needs corrections. Review or resubmit your documents."
        ),
        estilo: "border-red-300 bg-red-50 text-red-900",
        badge: "bg-red-100 text-red-800",
        textoBadge: T("Rechazado", "Rejected"),
      };
    }

    if (estaSuspendido) {
      return {
        titulo: T("Cuenta suspendida", "Account suspended"),
        descripcion: T(
          "Tu cuenta profesional está temporalmente suspendida. No puedes acceder a nuevos trabajos mientras permanezca suspendida.",
          "Your professional account is temporarily suspended. You cannot access new jobs while it remains suspended."
        ),
        estilo: "border-red-300 bg-red-50 text-red-900",
        badge: "bg-red-100 text-red-800",
        textoBadge: T("Suspendido", "Suspended"),
      };
    }

    if (estaVerificado) {
      return {
        titulo: T("Verificado ✅", "Verified ✅"),
        descripcion: T(
          "Tu cuenta ha sido revisada y aprobada por RELYDO.",
          "Your account has been reviewed and approved by RELYDO."
        ),
        estilo: "border-green-300 bg-green-50 text-green-900",
        badge: "bg-green-100 text-green-800",
        textoBadge: T("Verificado", "Verified"),
      };
    }

    return {
      titulo: T("Pendiente de verificación", "Verification pending"),
      descripcion: T(
        "Tu cuenta todavía está pendiente de revisión.",
        "Your account is still pending review."
      ),
      estilo: "border-amber-300 bg-amber-50 text-amber-900",
      badge: "bg-amber-100 text-amber-800",
      textoBadge: T("Pendiente", "Pending"),
    };
  }

  const estado = obtenerEstado();

  const trabajosActivos = trabajosContratados.filter(
    (trabajo) => trabajo.status === "in_progress"
  );

  const trabajosCompletados = trabajosContratados.filter(
    (trabajo) => trabajo.status === "completed"
  );

  const trabajosCancelados = trabajosContratados.filter(
    (trabajo) => trabajo.status === "cancelled"
  );

  const reclamosActivos = reclamos.filter(
    (reclamo) =>
      reclamo.status === "open" ||
      reclamo.status === "reviewing" ||
      reclamo.status === "in_review"
  );

  const idsReasignados = new Set(
    historialReasignaciones.map((item) => item.request_id)
  );

  const reasignadas = idsReasignados.size;

  const historialProfesional: HistorialProfesionalItem[] = (() => {
    const porSolicitud = new Map<string, HistorialProfesionalItem>();

    for (const oferta of ofertasHistorial) {
      porSolicitud.set(oferta.request_id, {
        request_id: oferta.request_id,
        trabajo: oferta.trabajo,
        oferta,
      });
    }

    for (const trabajo of trabajosContratados) {
      const existente = porSolicitud.get(trabajo.id);

      porSolicitud.set(trabajo.id, {
        request_id: trabajo.id,
        trabajo,
        oferta: existente?.oferta || null,
      });
    }

    return Array.from(porSolicitud.values()).sort((a, b) => {
      const fechaA =
        a.oferta?.created_at ||
        a.trabajo?.created_at ||
        "";
      const fechaB =
        b.oferta?.created_at ||
        b.trabajo?.created_at ||
        "";

      return new Date(fechaB).getTime() - new Date(fechaA).getTime();
    });
  })();

  const totalHistorial = historialProfesional.length;

  function nombreEstadoHistorial(item: HistorialProfesionalItem) {
    if (item.oferta?.status === "rejected") {
      return T(
        "Presupuesto rechazado por el cliente",
        "Quote rejected by the customer"
      );
    }

    if (
      item.trabajo &&
      ["in_progress", "completed", "cancelled"].includes(item.trabajo.status)
    ) {
      return nombreEtapa(
        item.trabajo.job_stage,
        item.trabajo.status,
        language
      );
    }

    if (
      item.oferta?.status === "selected" ||
      item.oferta?.status === "accepted"
    ) {
      return T("Presupuesto seleccionado", "Quote selected");
    }

    return T("Presupuesto enviado", "Quote sent");
  }

  function estiloEstadoHistorial(item: HistorialProfesionalItem) {
    if (item.oferta?.status === "rejected") {
      return "bg-red-100 text-red-800";
    }

    if (
      item.trabajo &&
      ["in_progress", "completed", "cancelled"].includes(item.trabajo.status)
    ) {
      return estiloEtapa(
        item.trabajo.job_stage,
        item.trabajo.status
      );
    }

    if (
      item.oferta?.status === "selected" ||
      item.oferta?.status === "accepted"
    ) {
      return "bg-green-100 text-green-800";
    }

    return "bg-blue-100 text-blue-800";
  }

  const solicitudesDocsActivas = solicitudesDocumentos.filter((solicitud) =>
    ["pending", "open", "requested"].includes(solicitud.status)
  );

  const documentosRechazados = documentos.filter((doc) => doc.status === "rejected");
  const documentosVencidos = documentos.filter((doc) => {
    const dias = diasParaVencer(vencimientoDocumento(doc));
    return dias !== null && dias < 0;
  });
  const documentosPorVencer = documentos.filter((doc) => {
    const dias = diasParaVencer(vencimientoDocumento(doc));
    return dias !== null && dias >= 0 && dias <= 30;
  });

  const requiereAccionDocumental =
    solicitudesDocsActivas.length > 0 ||
    documentosRechazados.length > 0 ||
    documentosVencidos.length > 0;

  const estadoDocumentos = requiereAccionDocumental
    ? T("Acción", "Action")
    : documentosPorVencer.length > 0
    ? T("Por vencer", "Expiring")
    : T("Al día", "Up to date");

  const colorActual =
    COLORES_PROFESIONAL[
      colorProfesional
    ];

  const fondoPagina =
    temaOscuro
      ? "#020617"
      : "#f1f5f9";

  const fondoTarjeta =
    temaOscuro
      ? "#0f172a"
      : "#ffffff";

  const textoPrincipal =
    temaOscuro
      ? "#f8fafc"
      : "#0f172a";

  const textoSecundario =
    temaOscuro
      ? "#cbd5e1"
      : "#475569";

  const bordeTarjeta =
    temaOscuro
      ? "#334155"
      : "#e2e8f0";

  return (
    <main
      className={`min-h-screen px-4 pb-28 pt-0 transition-colors duration-300 md:py-10 ${
        temaOscuro
          ? "relydo-provider-dark"
          : "relydo-provider-light"
      }`}
      style={{
        backgroundColor:
          fondoPagina,
        color:
          textoPrincipal,
      }}
    >
      <style jsx global>{`
        .relydo-provider-dark .bg-white {
          background-color: #0f172a !important;
        }
        .relydo-provider-dark .bg-slate-50,
        .relydo-provider-dark .bg-slate-100 {
          background-color: #111827 !important;
        }
        .relydo-provider-dark .text-slate-950,
        .relydo-provider-dark .text-slate-900,
        .relydo-provider-dark .text-slate-800,
        .relydo-provider-dark .text-slate-700 {
          color: #f8fafc !important;
        }
        .relydo-provider-dark .text-slate-600,
        .relydo-provider-dark .text-slate-500,
        .relydo-provider-dark .text-slate-400 {
          color: #cbd5e1 !important;
        }
        .relydo-provider-dark .border-slate-100,
        .relydo-provider-dark .border-slate-200,
        .relydo-provider-dark .border-slate-300 {
          border-color: #334155 !important;
        }
        .relydo-provider-dark .hover\\:bg-blue-50:hover {
          background-color: #172554 !important;
        }
        .relydo-provider-dark .hover\\:bg-slate-50:hover,
        .relydo-provider-dark .hover\\:bg-slate-100:hover {
          background-color: #1e293b !important;
        }
      `}</style>

      {/* BARRA SUPERIOR MÓVIL */}
      <div className="sticky top-0 z-[160] -mx-4 mb-3 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 text-white shadow-lg md:hidden">
        <button type="button" onClick={() => setMenuMovilAbierto(true)} className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl font-black active:bg-white/10" aria-label={T("Abrir menú", "Open menu")}>☰</button>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="text-xl font-black tracking-tight"><span className="text-blue-500">R</span> RELYDO</button>
        <div className="relative z-[170]">
          {esMovil && <NotificationsBell modo="profesional" />}
        </div>
      </div>

      <div className="mx-auto max-w-6xl">

        {/* HEADER */}

        <section
          className="relative z-30 overflow-visible rounded-[32px] border text-white shadow-xl"
          style={{
            borderColor:
              `${colorActual.hex}55`,
            background:
              `linear-gradient(135deg, ${colorActual.hex}, ${colorActual.hexOscuro})`,
            boxShadow:
              `0 16px 36px ${colorActual.hex}20`,
          }}
        >
          <div className="relative px-4 py-5 md:px-10 md:py-10">
            <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 left-10 h-52 w-52 rounded-full bg-cyan-300/10 blur-3xl" />

            <div className="relative flex flex-col gap-7 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-blue-100">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  {T("Panel profesional", "Professional dashboard")}
                </div>

                <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="group relative h-16 w-16 md:h-20 md:w-20 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-lg">
                    {profile.company_logo_url ? (
                      <img
                        src={profile.company_logo_url}
                        alt={`Logo de ${profile.business_name || "la compañía"}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl font-black text-white">
                        {(profile.business_name || "F").charAt(0).toUpperCase()}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={subiendoLogo}
                      onClick={() => logoInputRef.current?.click()}
                      className="absolute inset-x-0 bottom-0 bg-slate-950/75 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
                    >
                      {subiendoLogo ? T("Subiendo...", "Uploading...") : T("Cambiar logo", "Change logo")}
                    </button>
                  </div>

                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={subirLogo}
                    className="hidden"
                  />

                  <div>
                    <h1 className="text-xl font-black tracking-tight sm:text-2xl md:text-5xl">
                      {profile.business_name || T("Profesional RELYDO", "RELYDO Professional")}
                    </h1>

                    <button
                      type="button"
                      disabled={subiendoLogo}
                      onClick={() => logoInputRef.current?.click()}
                      className="mt-2 text-sm font-bold text-blue-100 underline decoration-white/40 underline-offset-4 transition hover:text-white disabled:opacity-60"
                    >
                      {subiendoLogo
                        ? "Subiendo logo..."
                        : profile.company_logo_url
                        ? "Cambiar imagen de la compañía"
                        : "Añadir imagen de la compañía"}
                    </button>
                  </div>
                </div>

                <p className="mt-4 hidden max-w-xl text-base leading-7 text-blue-100 md:block md:text-lg">
                  {T("Administra tus oportunidades, trabajos activos, reputación y estado de cuenta desde un solo lugar.", "Manage your opportunities, active jobs, reputation, and account status from one place.")}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold text-white">
                    {nombreOficio(profile.trade, language)}
                  </span>

                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold text-white">
                    ⭐ {Number(profile.average_rating || 0).toFixed(1)} · {ratingCount} {T(
                      ratingCount === 1 ? "calificación" : "calificaciones",
                      ratingCount === 1 ? "rating" : "ratings"
                    )}
                  </span>

                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold text-white">
                    {profile.completed_jobs ?? 0} {T("trabajos completados", "completed jobs")}
                  </span>
                </div>
              </div>

              <div className="relative z-[100] flex w-full items-start gap-3 md:w-auto md:items-center">
                {!esMovil && (
                  <div className="relative z-[110] hidden md:block">
                    <NotificationsBell modo="profesional" />
                  </div>
                )}

                <div className="w-full rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm md:w-auto md:p-4">
                  {estaVerificado && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-100">
                        <span className="text-emerald-300">✓</span>
                        {T("Verificado", "Verified")}
                      </span>
                    </div>
                  )}

                  <p className="text-xs font-black uppercase tracking-wide text-blue-200">
                    {T("Cuenta", "Account")}
                  </p>
                  <p className="mt-1 max-w-[220px] truncate text-sm font-bold text-white">
                    {email}
                  </p>

                  <div className="mt-3 rounded-xl bg-white/95 p-2 text-slate-900">
                    <AccountModeSwitcher />
                  </div>

                  <button
                    type="button"
                    onClick={cerrarSesion}
                    className="mt-3 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20"
                  >
                    {T("Cerrar sesión", "Sign out")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ACCIONES RÁPIDAS / AJUSTES */}

        <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() =>
              router.push("/trabajos")
            }
            className="rounded-xl px-5 py-3 text-base font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:text-lg"
            style={{
              backgroundColor:
                colorActual.hex,
            }}
          >
            {T(
              "Trabajos disponibles",
              "Available jobs"
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/pagos-profesional")
            }
            className="rounded-xl border-2 px-5 py-3 text-base font-extrabold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:text-lg"
            style={{
              borderColor:
                colorActual.hex,
              backgroundColor:
                fondoTarjeta,
              color:
                colorActual.hex,
            }}
          >
            {T("Pagos", "Payments")}
          </button>

          <button
            type="button"
            onClick={() =>
              setMostrarAjustes(
                (actual) =>
                  !actual
              )
            }
            className="rounded-xl border px-5 py-3 text-base font-extrabold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:text-lg"
            style={{
              borderColor:
                bordeTarjeta,
              backgroundColor:
                fondoTarjeta,
              color:
                textoPrincipal,
            }}
          >
            ⚙️ {T("Ajustes", "Settings")}
          </button>
        </section>

        {mostrarAjustes && (
          <section
            id="ajustes-profesional"
            className="mt-5 overflow-hidden rounded-3xl border shadow-lg"
            style={{
              borderColor:
                bordeTarjeta,
              backgroundColor:
                fondoTarjeta,
            }}
          >
            <div
              className="border-b px-6 py-5 md:px-7"
              style={{
                borderColor:
                  bordeTarjeta,
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p
                    className="text-xs font-black uppercase tracking-[0.16em]"
                    style={{
                      color:
                        colorActual.hex,
                    }}
                  >
                    ⚙️ {T("Ajustes", "Settings")}
                  </p>

                  <h2
                    className="mt-1 text-2xl font-black"
                    style={{
                      color:
                        textoPrincipal,
                    }}
                  >
                    {T(
                      "Personaliza tu experiencia",
                      "Personalize your experience"
                    )}
                  </h2>

                  <p
                    className="mt-1 text-sm"
                    style={{
                      color:
                        textoSecundario,
                    }}
                  >
                    {T(
                      "Configura la apariencia, el color y los avisos de tu experiencia profesional.",
                      "Configure the appearance, color, and alerts for your professional experience."
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setMostrarAjustes(false)
                  }
                  className="w-fit rounded-xl border px-4 py-2 text-sm font-extrabold"
                  style={{
                    borderColor:
                      bordeTarjeta,
                    color:
                      textoPrincipal,
                    backgroundColor:
                      temaOscuro
                        ? "#1e293b"
                        : "#f8fafc",
                  }}
                >
                  {T(
                    "Cerrar ajustes",
                    "Close settings"
                  )}
                </button>
              </div>
            </div>

            <div className="grid gap-5 p-6 md:grid-cols-2 md:p-7 xl:grid-cols-4">
              {/* APARIENCIA */}
              <div
                className="rounded-2xl border p-5"
                style={{
                  borderColor:
                    bordeTarjeta,
                  backgroundColor:
                    temaOscuro
                      ? "#111827"
                      : "#f8fafc",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">
                    ◐
                  </div>

                  <div>
                    <h3
                      className="font-black"
                      style={{
                        color:
                          textoPrincipal,
                      }}
                    >
                      {T(
                        "Apariencia",
                        "Appearance"
                      )}
                    </h3>

                    <p
                      className="mt-1 text-xs leading-5"
                      style={{
                        color:
                          textoSecundario,
                      }}
                    >
                      {T(
                        "Elige cómo quieres ver tu experiencia profesional.",
                        "Choose how you want your professional experience to look."
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {(
                    [
                      [
                        "light",
                        T(
                          "Claro",
                          "Light"
                        ),
                      ],
                      [
                        "dark",
                        T(
                          "Oscuro",
                          "Dark"
                        ),
                      ],
                      [
                        "system",
                        T(
                          "Sistema",
                          "System"
                        ),
                      ],
                    ] as const
                  ).map(
                    ([valor, etiqueta]) => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() =>
                          guardarTemaProfesional(
                            valor
                          )
                        }
                        className="rounded-xl border px-3 py-2.5 text-xs font-black transition"
                        style={{
                          borderColor:
                            temaProfesional ===
                            valor
                              ? colorActual.hex
                              : bordeTarjeta,
                          backgroundColor:
                            temaProfesional ===
                            valor
                              ? `${colorActual.hex}18`
                              : fondoTarjeta,
                          color:
                            temaProfesional ===
                            valor
                              ? colorActual.hex
                              : textoPrincipal,
                        }}
                      >
                        {etiqueta}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* COLOR */}
              <div
                className="rounded-2xl border p-5"
                style={{
                  borderColor:
                    bordeTarjeta,
                  backgroundColor:
                    temaOscuro
                      ? "#111827"
                      : "#f8fafc",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">
                    🎨
                  </div>

                  <div>
                    <h3
                      className="font-black"
                      style={{
                        color:
                          textoPrincipal,
                      }}
                    >
                      {T(
                        "Color principal",
                        "Primary color"
                      )}
                    </h3>

                    <p
                      className="mt-1 text-xs leading-5"
                      style={{
                        color:
                          textoSecundario,
                      }}
                    >
                      {T(
                        "Personaliza los detalles y acciones principales de RELYDO Pro.",
                        "Personalize the main accents and actions in RELYDO Pro."
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  {(
                    Object.keys(
                      COLORES_PROFESIONAL
                    ) as ColorProfesional[]
                  ).map(
                    (color) => {
                      const opcion =
                        COLORES_PROFESIONAL[
                          color
                        ];

                      const seleccionado =
                        colorProfesional ===
                        color;

                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() =>
                            guardarColorProfesional(
                              color
                            )
                          }
                          title={
                            language ===
                            "es"
                              ? opcion.nombreEs
                              : opcion.nombreEn
                          }
                          className="flex flex-col items-center gap-2 rounded-xl border p-3 text-[10px] font-black transition"
                          style={{
                            borderColor:
                              seleccionado
                                ? opcion.hex
                                : bordeTarjeta,
                            backgroundColor:
                              seleccionado
                                ? `${opcion.hex}14`
                                : fondoTarjeta,
                            color:
                              textoPrincipal,
                          }}
                        >
                          <span
                            className="h-7 w-7 rounded-full shadow-sm"
                            style={{
                              backgroundColor:
                                opcion.hex,
                              boxShadow:
                                seleccionado
                                  ? `0 0 0 4px ${opcion.hex}25`
                                  : undefined,
                            }}
                          />

                          <span>
                            {language ===
                            "es"
                              ? opcion.nombreEs
                              : opcion.nombreEn}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* AVISOS */}
              <div
                className="rounded-2xl border p-5 md:col-span-2 xl:col-span-1"
                style={{
                  borderColor:
                    bordeTarjeta,
                  backgroundColor:
                    temaOscuro
                      ? "#111827"
                      : "#f8fafc",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">
                    🔔
                  </div>

                  <div>
                    <h3
                      className="font-black"
                      style={{
                        color:
                          textoPrincipal,
                      }}
                    >
                      {T(
                        "Avisos",
                        "Alerts"
                      )}
                    </h3>

                    <p
                      className="mt-1 text-xs leading-5"
                      style={{
                        color:
                          textoSecundario,
                      }}
                    >
                      {T(
                        "Controla las notificaciones Push y el sonido en este dispositivo.",
                        "Control Push notifications and sound on this device."
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div
                    className="flex items-center justify-between gap-4 rounded-xl border p-3.5"
                    style={{
                      borderColor:
                        bordeTarjeta,
                      backgroundColor:
                        fondoTarjeta,
                    }}
                  >
                    <div>
                      <p
                        className="text-sm font-black"
                        style={{
                          color:
                            textoPrincipal,
                        }}
                      >
                        📲 {T(
                          "Notificaciones Push",
                          "Push notifications"
                        )}
                      </p>

                      <p
                        className="mt-1 text-xs font-bold"
                        style={{
                          color:
                            pushActivo
                              ? "#059669"
                              : textoSecundario,
                        }}
                      >
                        {pushActivo
                          ? T(
                              "Activo",
                              "Active"
                            )
                          : T(
                              "Inactivo",
                              "Inactive"
                            )}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        procesandoPush ||
                        !pushDisponible
                      }
                      onClick={() =>
                        pushActivo
                          ? desactivarPushProfesional()
                          : activarPushProfesional()
                      }
                      className="rounded-lg px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        backgroundColor:
                          pushActivo
                            ? "#475569"
                            : colorActual.hex,
                      }}
                    >
                      {procesandoPush
                        ? T(
                            "Procesando...",
                            "Processing..."
                          )
                        : pushActivo
                        ? T(
                            "Desactivar",
                            "Disable"
                          )
                        : T(
                            "Activar",
                            "Enable"
                          )}
                    </button>
                  </div>

                  <div
                    className="flex items-center justify-between gap-4 rounded-xl border p-3.5"
                    style={{
                      borderColor:
                        bordeTarjeta,
                      backgroundColor:
                        fondoTarjeta,
                    }}
                  >
                    <div>
                      <p
                        className="text-sm font-black"
                        style={{
                          color:
                            textoPrincipal,
                        }}
                      >
                        🔊 {T(
                          "Sonido",
                          "Sound"
                        )}
                      </p>

                      <p
                        className="mt-1 text-xs font-bold"
                        style={{
                          color:
                            sonidoActivo
                              ? "#059669"
                              : textoSecundario,
                        }}
                      >
                        {sonidoActivo
                          ? T(
                              "Activo",
                              "Active"
                            )
                          : T(
                              "Inactivo",
                              "Inactive"
                            )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={
                        cambiarSonido
                      }
                      className="rounded-lg px-4 py-2 text-xs font-black text-white"
                      style={{
                        backgroundColor:
                          sonidoActivo
                            ? "#475569"
                            : colorActual.hex,
                      }}
                    >
                      {sonidoActivo
                        ? T(
                            "Desactivar",
                            "Disable"
                          )
                        : T(
                            "Activar",
                            "Enable"
                          )}
                    </button>
                  </div>

                  {!pushDisponible && (
                    <p className="text-xs font-bold text-amber-700">
                      {T(
                        "Push no disponible en este navegador.",
                        "Push is not available in this browser."
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* CUENTA */}
              <div
                className="rounded-2xl border p-5 md:col-span-2 xl:col-span-1"
                style={{
                  borderColor:
                    "#fecaca",
                  backgroundColor:
                    temaOscuro
                      ? "#111827"
                      : "#fff7f7",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">
                    👤
                  </div>

                  <div>
                    <h3
                      className="font-black"
                      style={{
                        color:
                          textoPrincipal,
                      }}
                    >
                      {T(
                        "Cuenta",
                        "Account"
                      )}
                    </h3>

                    <p
                      className="mt-1 text-xs leading-5"
                      style={{
                        color:
                          textoSecundario,
                      }}
                    >
                      {T(
                        "Administra la eliminación permanente de tu cuenta profesional RELYDO.",
                        "Manage permanent deletion of your RELYDO professional account."
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-black text-red-800">
                    {T(
                      "Eliminar cuenta",
                      "Delete account"
                    )}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-red-700">
                    {T(
                      "Elimina permanentemente tu cuenta y los datos personales que RELYDO no esté obligado a conservar.",
                      "Permanently delete your account and personal data RELYDO is not legally required to retain."
                    )}
                  </p>

                  <p className="mt-2 text-xs font-black text-red-800">
                    {T(
                      "Esta acción no se puede deshacer.",
                      "This action cannot be undone."
                    )}
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setMostrarEliminarCuenta(
                        true
                      );
                      setConfirmacionEliminar(
                        false
                      );
                      setMensajeEliminarCuenta(
                        ""
                      );
                    }}
                    className="mt-4 w-full rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-black text-red-700 transition hover:bg-red-100"
                  >
                    {T(
                      "Eliminar cuenta",
                      "Delete account"
                    )}
                  </button>
                </div>
              </div>
            </div>

            {mensajeAjustes && (
              <div
                className="border-t px-6 py-4 text-sm font-bold md:px-7"
                style={{
                  borderColor:
                    bordeTarjeta,
                  color:
                    textoSecundario,
                }}
              >
                ✓ {mensajeAjustes}
              </div>
            )}
          </section>
        )}

        {mostrarEliminarCuenta && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-6 shadow-2xl sm:p-7">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 text-2xl">
                  ⚠️
                </div>

                <div>
                  <h2 className="text-2xl font-black text-slate-950">
                    {T(
                      "¿Eliminar tu cuenta?",
                      "Delete your account?"
                    )}
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {T(
                      "Comprobaremos primero que no tengas trabajos activos, pagos pendientes ni reclamos pendientes. Si todo está cerrado, tu cuenta se eliminará.",
                      "We will first check that you have no active jobs, pending payments, or unresolved claims. If everything is closed, your account will be deleted."
                    )}
                  </p>
                </div>
              </div>

              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <input
                  type="checkbox"
                  checked={
                    confirmacionEliminar
                  }
                  onChange={(event) =>
                    setConfirmacionEliminar(
                      event.target.checked
                    )
                  }
                  className="mt-1 h-4 w-4"
                />

                <span className="text-sm font-bold leading-6 text-red-900">
                  {T(
                    "Entiendo que esta acción es permanente.",
                    "I understand that this action is permanent."
                  )}
                </span>
              </label>

              {mensajeEliminarCuenta && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
                  {mensajeEliminarCuenta}
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={
                    eliminandoCuenta
                  }
                  onClick={() =>
                    setMostrarEliminarCuenta(
                      false
                    )
                  }
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 disabled:opacity-50"
                >
                  {T(
                    "Cancelar",
                    "Cancel"
                  )}
                </button>

                <button
                  type="button"
                  disabled={
                    !confirmacionEliminar ||
                    eliminandoCuenta
                  }
                  onClick={
                    eliminarCuentaProfesional
                  }
                  className="rounded-xl bg-red-700 px-5 py-3 text-sm font-black text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {eliminandoCuenta
                    ? T(
                        "Eliminando cuenta...",
                        "Deleting account..."
                      )
                    : T(
                        "Eliminar mi cuenta",
                        "Delete my account"
                      )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PAGOS STRIPE CONNECT
            El bloque grande solo aparece cuando el profesional necesita
            configurar o completar Stripe. Cuando ya está listo, desaparece. */}

        {estaVerificado && !pagosConfigurados && (
          <section className="relative z-20 mt-6">
            <div className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">
                    {T("Pagos profesionales", "Professional payments")}
                  </p>

                  <h2 className="mt-2 text-xl font-black text-slate-950 md:text-2xl">
                    {T(
                      "Configura tus pagos para trabajar con RELYDO",
                      "Set up payments to work with RELYDO"
                    )}
                  </h2>

                  <p className="mt-2 leading-7 text-slate-700">
                    {stripeStatus?.connected
                      ? T(
                          "Tu cuenta Stripe ya fue creada, pero todavía falta completar o aprobar información antes de poder recibir pagos.",
                          "Your Stripe account has been created, but setup or approval is still incomplete before you can receive payments."
                        )
                      : T(
                          "Antes de poder aceptar trabajos y recibir dinero, debes completar una configuración segura de pagos con Stripe Connect.",
                          "Before you can accept jobs and receive money, you must complete secure payment setup with Stripe Connect."
                        )}
                  </p>

                  {stripeStatus?.disabledReason && (
                    <p className="mt-3 rounded-xl bg-white/80 px-4 py-3 text-sm font-bold text-amber-900">
                      Stripe: {stripeStatus.disabledReason}
                    </p>
                  )}

                  {stripeStatus && stripeStatus.currentlyDue.length > 0 && (
                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      {T(
                        "Stripe todavía solicita información adicional para activar los pagos.",
                        "Stripe still requires additional information to activate payments."
                      )}
                    </p>
                  )}

                  {errorPagos && (
                    <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 font-bold text-red-700">
                      {errorPagos}
                    </div>
                  )}

                  {mensajePagos && (
                    <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 font-bold text-emerald-800">
                      {mensajePagos}
                    </div>
                  )}
                </div>

                <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[230px]">
                  <button
                    type="button"
                    disabled={configurandoStripe || cargandoStripe}
                    onClick={configurarPagosStripe}
                    className="rounded-xl bg-blue-700 px-5 py-3.5 font-black text-white shadow-lg transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {configurandoStripe
                      ? T("Abriendo Stripe...", "Opening Stripe...")
                      : stripeStatus?.connected
                      ? T("Continuar configuración", "Continue setup")
                      : T("Configurar pagos", "Set up payments")}
                  </button>

                  <button
                    type="button"
                    disabled={cargandoStripe || configurandoStripe}
                    onClick={async () => {
                      const estadoActual = await consultarEstadoPagos(true);

                      if (
                        estadoActual &&
                        estadoActual.connected &&
                        estadoActual.onboardingComplete &&
                        estadoActual.payoutsEnabled &&
                        estadoActual.transfersCapability === "active"
                      ) {
                        setMensajePagos("");
                      }
                    }}
                    className="rounded-xl border-2 border-slate-300 bg-white px-5 py-3 font-black text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cargandoStripe
                      ? T("Comprobando...", "Checking...")
                      : T("Comprobar estado", "Check status")}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* RESUMEN */}

        <section className="relative z-10 mt-7">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                {T("Resumen", "Summary")}
              </p>

              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                {T("Tu actividad en RELYDO", "Your RELYDO activity")}
              </h2>

              <p className="mt-2 text-slate-600">
                {T(
                  "Una vista rápida de tus trabajos y reputación.",
                  "A quick view of your jobs and reputation."
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => cargarPanel(false)}
              disabled={actualizando}
              className="hidden w-fit rounded-xl border border-slate-300 bg-white px-5 py-3 font-black text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 md:inline-flex"
            >
              {actualizando
                ? T("Actualizando...", "Updating...")
                : T("↻ Actualizar", "↻ Refresh")}
            </button>
          </div>

          {/* DESKTOP / TABLET: 8 tarjetas, 4 por fila */}
          <div className="hidden gap-4 md:grid md:grid-cols-4">
            <ResumenCard
              titulo={T("Activos", "Active")}
              valor={String(trabajosActivos.length)}
              clase="text-blue-700"
              icono="⚡"
              fondo="bg-blue-50 text-blue-700"
              textoAccion={T("Ver activos", "View active")}
              onClick={() => abrirPanel("active")}
            />

            <ResumenCard
              titulo={T("Completados", "Completed")}
              valor={String(profile.completed_jobs ?? trabajosCompletados.length)}
              clase="text-emerald-700"
              icono="✓"
              fondo="bg-emerald-50 text-emerald-700"
              textoAccion={T("Ver completados", "View completed")}
              onClick={() => abrirPanel("completed")}
            />

            <ResumenCard
              titulo={T("Cancelados", "Cancelled")}
              valor={String(trabajosCancelados.length)}
              clase="text-red-700"
              icono="×"
              fondo="bg-red-50 text-red-700"
              textoAccion={T("Ver cancelados", "View cancelled")}
              onClick={() => abrirPanel("cancelled")}
            />

            <ResumenCard
              titulo={T("Reasignadas", "Reassigned")}
              valor={String(reasignadas)}
              clase="text-violet-700"
              icono="⇄"
              fondo="bg-violet-50 text-violet-700"
              textoAccion={T("Ver reasignadas", "View reassigned")}
              onClick={() => abrirPanel("reassigned")}
            />

            <ResumenCard
              titulo={T("Reclamos", "Claims")}
              valor={String(reclamosActivos.length)}
              clase="text-orange-600"
              icono="⚠"
              fondo="bg-orange-50 text-orange-600"
              textoAccion={T("Ver reclamos", "View claims")}
              onClick={() => abrirPanel("claims")}
            />

            <ResumenCard
              titulo={T("Calificación", "Rating")}
              valor={Number(profile.average_rating || 0).toFixed(1)}
              clase="text-amber-600"
              icono="★"
              fondo="bg-amber-50 text-amber-600"
              detalle={`${ratingCount} ${T(
                ratingCount === 1 ? "calificación" : "calificaciones",
                ratingCount === 1 ? "rating" : "ratings"
              )}`}
              textoAccion={T("Ver calificación", "View rating")}
              onClick={() => abrirPanel("rating")}
            />

            <ResumenCard
              titulo={T("Historial", "History")}
              valor={String(totalHistorial)}
              clase="text-violet-700"
              icono="↺"
              fondo="bg-violet-50 text-violet-700"
              textoAccion={T("Ver historial", "View history")}
              onClick={() => abrirPanel("history")}
            />

            <ResumenCard
              titulo={T("Documentos", "Documents")}
              valor={estadoDocumentos}
              clase={
                requiereAccionDocumental
                  ? "text-red-700 text-2xl"
                  : documentosPorVencer.length > 0
                  ? "text-amber-700 text-2xl"
                  : "text-emerald-700 text-2xl"
              }
              icono="▤"
              fondo={
                requiereAccionDocumental
                  ? "bg-red-50 text-red-700"
                  : documentosPorVencer.length > 0
                  ? "bg-amber-50 text-amber-700"
                  : "bg-emerald-50 text-emerald-700"
              }
              textoAccion={T("Ver documentos", "View documents")}
              onClick={() => abrirPanel("documents")}
            />
          </div>

          {/* MÓVIL: 4 métricas principales en 2x2 */}
          <div className="grid grid-cols-2 gap-3 md:hidden">
            <ResumenMovilPrincipal
              titulo={T("Activos", "Active")}
              valor={String(trabajosActivos.length)}
              valorClase="text-blue-700"
              icono="⚡"
              fondo="bg-blue-50 text-blue-700"
              onClick={() => abrirPanel("active")}
            />
            <ResumenMovilPrincipal
              titulo={T("Completados", "Completed")}
              valor={String(profile.completed_jobs ?? trabajosCompletados.length)}
              valorClase="text-emerald-700"
              icono="✓"
              fondo="bg-emerald-50 text-emerald-700"
              onClick={() => abrirPanel("completed")}
            />
            <ResumenMovilPrincipal
              titulo={T("Cancelados", "Cancelled")}
              valor={String(trabajosCancelados.length)}
              valorClase="text-red-700"
              icono="×"
              fondo="bg-red-50 text-red-700"
              onClick={() => abrirPanel("cancelled")}
            />
            <ResumenMovilPrincipal
              titulo={T("Reasignadas", "Reassigned")}
              valor={String(reasignadas)}
              valorClase="text-violet-700"
              icono="⇄"
              fondo="bg-violet-50 text-violet-700"
              onClick={() => abrirPanel("reassigned")}
            />
          </div>

          {/* MÓVIL: información secundaria compacta */}
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:hidden">
            <ResumenMovilFila
              titulo={T("Reclamos", "Claims")}
              valor={String(reclamosActivos.length)}
              valorClase="text-orange-600"
              icono="⚠"
              fondo="bg-orange-50 text-orange-600"
              onClick={() => abrirPanel("claims")}
            />
            <ResumenMovilFila
              titulo={T("Calificación", "Rating")}
              valor={Number(profile.average_rating || 0).toFixed(1)}
              valorClase="text-amber-600"
              icono="★"
              fondo="bg-amber-50 text-amber-600"
              detalle={`${ratingCount} ${T(
                ratingCount === 1 ? "calificación" : "calificaciones",
                ratingCount === 1 ? "rating" : "ratings"
              )}`}
              onClick={() => abrirPanel("rating")}
            />
            <ResumenMovilFila
              titulo={T("Historial", "History")}
              valor={String(totalHistorial)}
              valorClase="text-violet-700"
              icono="↺"
              fondo="bg-violet-50 text-violet-700"
              onClick={() => abrirPanel("history")}
            />
            <ResumenMovilFila
              titulo={T("Documentos", "Documents")}
              valor={estadoDocumentos}
              valorClase={
                requiereAccionDocumental
                  ? "text-red-700"
                  : documentosPorVencer.length > 0
                  ? "text-amber-700"
                  : "text-emerald-700"
              }
              icono="▤"
              fondo={
                requiereAccionDocumental
                  ? "bg-red-50 text-red-700"
                  : documentosPorVencer.length > 0
                  ? "bg-amber-50 text-amber-700"
                  : "bg-emerald-50 text-emerald-700"
              }
              onClick={() => abrirPanel("documents")}
              ultimo
            />
          </div>

          <button
            type="button"
            onClick={() => cargarPanel(false)}
            disabled={actualizando}
            className="mt-3 flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3.5 font-black text-blue-700 shadow-sm transition active:scale-[0.99] disabled:opacity-50 md:hidden"
          >
            {actualizando
              ? T("Actualizando...", "Updating...")
              : T("↻ Actualizar", "↻ Refresh")}
          </button>
        </section>

        <div id="contenido-resumen" className="scroll-mt-6" />

        {/* ALERTA TRABAJO ACTIVO */}

        {estaVerificado && trabajosActivos.length > 0 && (
          <section className="mt-6 rounded-3xl border border-blue-300 bg-blue-50 p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-blue-700">
                  {T("Atención", "Attention")}
                </p>

                <h2 className="mt-1 text-xl font-extrabold text-blue-950">
                  {trabajosActivos.length === 1
                    ? "Tienes un trabajo activo"
                    : `Tienes ${trabajosActivos.length} trabajos activos`}
                </h2>

                <p className="mt-1 text-blue-800">
                  {T("Revisa el estado y mantenlo actualizado para que el cliente pueda seguir el servicio en vivo.", "Review the status and keep it updated so the customer can follow the service live.")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => abrirPanel("active")}
                className="shrink-0 rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white transition hover:bg-blue-800"
              >
                {trabajosActivos.length === 1
                  ? "Ver trabajo activo"
                  : `Ver ${trabajosActivos.length} trabajos activos`}
              </button>
            </div>
          </section>
        )}

        {/* ESTADO
            Si la cuenta ya está verificada, el estado se muestra de forma
            compacta en el recuadro de CUENTA del header.
            Este bloque queda reservado para estados que requieren atención. */}

        {!estaVerificado && (
          <section className={`mt-6 rounded-3xl border p-7 shadow-sm ${estado.estilo}`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide">
                  {T("Estado de la cuenta", "Account status")}
                </p>

                <h2 className="mt-2 text-2xl font-extrabold">{estado.titulo}</h2>
                <p className="mt-2">{estado.descripcion}</p>
              </div>

              <span className={`w-fit rounded-full px-5 py-2 font-bold ${estado.badge}`}>
                {estado.textoBadge}
              </span>
            </div>
          </section>
        )}

        {panelActivo === "documents" && (
          <>
        {/* DOCUMENTACIÓN PROFESIONAL */}

        <section
          id="documentacion-profesional"
          className={`mt-6 scroll-mt-6 overflow-hidden rounded-[30px] border bg-white shadow-sm ${
            requiereAccionDocumental
              ? "border-red-200"
              : documentosPorVencer.length > 0
              ? "border-amber-200"
              : "border-emerald-200"
          }`}
        >
          <div className="border-b border-slate-100 bg-slate-50/70 px-7 py-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-purple-700">
                  {T("Documentación y verificación", "Documents and verification")}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {T("Mis documentos", "My documents")}
                </h2>
                <p className="mt-2 text-slate-600">
                  {T(
                    "Consulta tus documentos, vencimientos y cualquier solicitud enviada por RELYDO.",
                    "Review your documents, expiration dates, and any request sent by RELYDO."
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => router.push("/completar-verificacion")}
                className="w-fit rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-800"
              >
                {T("📤 Subir o renovar documentos", "📤 Upload or renew documents")}
              </button>
            </div>
          </div>

          <div className="p-7">
            {mensajeDocumentos && (
              <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="font-black text-emerald-900">
                  ✅ {T("Documento enviado", "Document sent")}
                </p>
                <p className="mt-1 text-sm leading-6 text-emerald-800">{mensajeDocumentos}</p>
              </div>
            )}

            {requiereAccionDocumental && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5">
                <p className="font-black text-red-900">
                  ⚠️ {T("Necesitas realizar una acción", "Action required")}
                </p>
                <p className="mt-1 text-sm leading-6 text-red-800">
                  {T(
                    "RELYDO necesita que revises o actualices parte de tu documentación. Lee la solicitud de abajo y sube el documento correspondiente.",
                    "RELYDO needs you to review or update part of your documentation. Read the request below and upload the corresponding document."
                  )}
                </p>
              </div>
            )}

            {!requiereAccionDocumental && documentosPorVencer.length > 0 && (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="font-black text-amber-900">
                  ⏳ {T("Documento próximo a vencer", "Document expiring soon")}
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  {T("Tienes documentación que vence dentro de los próximos 30 días.", "You have documentation expiring within the next 30 days.")}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
                {documentos.length} {T("documentos", "documents")}
              </span>
              {solicitudesDocsActivas.length > 0 && (
                <span className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-black text-red-800">
                  {solicitudesDocsActivas.length} {T("solicitud(es) activa(s)", "active request(s)")}
                </span>
              )}
            </div>

            {solicitudesDocsActivas.length > 0 && (
              <div className="mt-6">
                <h3 className="font-black text-slate-950">
                  {T("Solicitudes de RELYDO", "Requests from RELYDO")}
                </h3>
                <div className="mt-3 space-y-3">
                  {solicitudesDocsActivas.map((solicitud) => (
                    <div key={solicitud.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-black text-amber-950">
                            {nombreTipoDocumento(solicitud.document_type)}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">
                            {solicitud.message}
                          </p>
                          <p className="mt-3 text-xs font-semibold text-amber-700">
                            {T("Solicitado", "Requested")}: {formatearFecha(solicitud.requested_at, language)}
                          </p>
                        </div>
                        <span className="w-fit rounded-full bg-amber-200 px-3 py-1 text-xs font-black text-amber-900">
                          {T("Acción requerida", "Action required")}
                        </span>
                      </div>
                      <div className="mt-4">
                        <label className="inline-flex cursor-pointer items-center rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-amber-800">
                          📎 {T("Tomar foto o subir archivo", "Take photo or upload file")}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            disabled={enviandoSolicitud === solicitud.id}
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null;
                              seleccionarArchivoSolicitud(solicitud.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>

                        {archivosSolicitud[solicitud.id] && (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-white p-4">
                            <p className="text-xs font-black uppercase tracking-wide text-amber-700">
                              {T("Archivo seleccionado", "Selected file")}
                            </p>
                            <p className="mt-1 break-all text-sm font-bold text-slate-800">
                              {archivosSolicitud[solicitud.id]?.name}
                            </p>
                            <button
                              type="button"
                              disabled={enviandoSolicitud === solicitud.id}
                              onClick={() => enviarDocumentoSolicitado(solicitud)}
                              className="mt-3 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {enviandoSolicitud === solicitud.id
                                ? T("Enviando...", "Sending...")
                                : T("Enviar documento a RELYDO", "Send document to RELYDO")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <h3 className="font-black text-slate-950">
                {T("Documentos registrados", "Registered documents")}
              </h3>

              {documentos.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="font-bold text-slate-700">
                    {T("Todavía no tienes documentos registrados.", "You do not have any registered documents yet.")}
                  </p>
                </div>
              ) : (
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {documentos.map((doc) => {
                    const vencimiento = vencimientoDocumento(doc);
                    const dias = diasParaVencer(vencimiento);
                    const vencido = dias !== null && dias < 0;
                    const porVencer = dias !== null && dias >= 0 && dias <= 30;
                    const rechazado = doc.status === "rejected";

                    return (
                      <article
                        key={doc.id}
                        className={`rounded-2xl border p-5 ${
                          rechazado || vencido
                            ? "border-red-200 bg-red-50/50"
                            : porVencer
                            ? "border-amber-200 bg-amber-50/50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-lg font-black text-slate-950">
                              {nombreTipoDocumento(doc.document_type)}
                            </p>
                            <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${
                              rechazado
                                ? "bg-red-100 text-red-800"
                                : doc.status === "approved"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}>
                              {rechazado
                                ? T("Rechazado", "Rejected")
                                : doc.status === "approved"
                                ? T("Aprobado", "Approved")
                                : T("Pendiente", "Pending")}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={abriendoDocumento === doc.id}
                            onClick={() => abrirDocumento(doc)}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-700 disabled:opacity-50"
                          >
                            {abriendoDocumento === doc.id ? T("Abriendo...", "Opening...") : T("Ver", "View")}
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{T("Vencimiento", "Expiration")}</p>
                            <p className={`mt-1 font-bold ${vencido ? "text-red-700" : porVencer ? "text-amber-700" : "text-slate-800"}`}>
                              {vencimiento ? fechaCorta(vencimiento) : T("No aplica / sin registrar", "Not applicable / not registered")}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{T("Aprobado", "Approved")}</p>
                            <p className="mt-1 font-bold text-slate-800">
                              {doc.approved_at ? formatearFecha(doc.approved_at, language) : T("Sin registrar", "Not registered")}
                            </p>
                          </div>
                        </div>

                        {doc.rejection_reason && (
                          <div className="mt-4 rounded-xl border border-red-200 bg-white p-4">
                            <p className="text-xs font-black uppercase tracking-wide text-red-600">
                              {T("Motivo / acción necesaria", "Reason / required action")}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-red-800">{doc.rejection_reason}</p>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

          </>
        )}

        {/* VERIFICACIÓN */}

        {!estaVerificado && !estaSuspendido && (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow">
            <h2 className="text-xl font-extrabold text-slate-900">
              {T("Verificación profesional", "Professional verification")}
            </h2>

            <p className="mt-2 text-slate-600">
              {estaRechazado
                ? "Tu verificación fue rechazada. Puedes corregir y volver a enviar tus documentos."
                : "Completa la verificación para comenzar a recibir trabajos."}
            </p>

            <button
              type="button"
              onClick={() => router.push("/completar-verificacion")}
              className={`mt-5 rounded-xl px-6 py-3 font-extrabold text-white ${
                estaRechazado
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-700 hover:bg-blue-800"
              }`}
            >
              {estaRechazado
                ? "Corregir verificación"
                : "Completar verificación"}
            </button>
          </section>
        )}

        {/* SUSPENDIDO */}

        {estaSuspendido && (
          <section className="mt-6 rounded-3xl border border-red-200 bg-white p-7 shadow">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 text-2xl">
                ⛔
              </div>

              <div>
                <h2 className="text-xl font-extrabold text-red-900">
                  {T("Acceso a trabajos suspendido", "Job access suspended")}
                </h2>

                <p className="mt-2 leading-6 text-slate-600">
                  {T("Tu perfil continúa existiendo, pero mientras la cuenta esté suspendida no podrás recibir ni aceptar nuevos trabajos.", "Your profile still exists, but while your account is suspended you cannot receive or accept new jobs.")}
                </p>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5 font-medium text-red-700">
            {error}
          </div>
        )}

        {/* RECLAMOS */}

        {panelActivo === "claims" && estaVerificado && (
          <section
            id="reclamos-profesional"
            className="mt-6 scroll-mt-6 rounded-3xl border border-rose-200 bg-white p-7 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-rose-700">
                  {T("Protección", "Protection")}
                </p>

                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {T("Mis reclamos", "My claims")}
                </h2>

                <p className="mt-2 text-slate-600">
                  {T("Revisa los reclamos relacionados con tus trabajos y entra al detalle para adjuntar fotos o videos.", "Review claims related to your jobs and open the details to attach photos or videos.")}
                </p>
              </div>

              <span className="w-fit rounded-full bg-rose-100 px-4 py-2 font-extrabold text-rose-800">
                {reclamosActivos.length} {T("activos", "active")}
              </span>
            </div>

            {reclamos.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="font-bold text-slate-700">
                  {T("No tienes reclamos registrados.", "You have no registered claims.")}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {reclamos.map((reclamo) => {
                  const trabajoRelacionado = trabajosContratados.find(
                    (trabajo) => trabajo.id === reclamo.request_id
                  );

                  const activo =
                    reclamo.status === "open" ||
                    reclamo.status === "reviewing" ||
                    reclamo.status === "in_review";

                  return (
                    <button
                      key={reclamo.id}
                      type="button"
                      onClick={() => router.push(`/trabajos/${reclamo.request_id}`)}
                      className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-rose-300 hover:bg-rose-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-slate-900">
                            {trabajoRelacionado?.title || T("Trabajo con reclamo", "Job with claim")}
                          </p>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                              activo
                                ? "bg-rose-100 text-rose-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {reclamo.status === "open"
                              ? T("Abierto", "Open")
                              : reclamo.status === "reviewing" ||
                                reclamo.status === "in_review"
                              ? T("En revisión", "Under review")
                              : T("Resuelto", "Resolved")}
                          </span>
                        </div>

                        <p className="mt-2 font-bold text-slate-700">
                          {reclamo.reason || T("Reclamo del cliente", "Customer claim")}
                        </p>

                        {reclamo.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                            {reclamo.description}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-blue-700">
                          {T("Ver reclamo →", "View claim →")}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {formatearFecha(reclamo.created_at, language)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* CALIFICACIÓN */}

        {panelActivo === "rating" && (
          <section
            id="calificacion-profesional"
            className="mt-6 scroll-mt-6 rounded-3xl border border-amber-200 bg-white p-7 shadow-sm"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-amber-700">
                  {T("Reputación", "Reputation")}
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {T("Tu calificación", "Your rating")}
                </h2>
                <p className="mt-2 text-slate-600">
                  {T(
                    "Aquí ves tu calificación actual, cuántas veces te han calificado y el total de trabajos completados.",
                    "Here you can see your current rating, how many ratings you have received, and your total completed jobs."
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-7 py-5 text-center">
                <p className="text-4xl font-black text-amber-600">
                  ★ {Number(profile.average_rating || 0).toFixed(1)}
                </p>
                <p className="mt-1 text-sm font-bold text-amber-800">
                  {ratingCount} {T(
                    ratingCount === 1 ? "calificación" : "calificaciones",
                    ratingCount === 1 ? "rating" : "ratings"
                  )}
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  {profile.completed_jobs ?? trabajosCompletados.length} {T("trabajos completados", "completed jobs")}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* OPORTUNIDADES */}

        <section className="mt-6 overflow-hidden rounded-[30px] border border-blue-200 bg-white p-7 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
                {T("Oportunidades", "Opportunities")}
              </p>

              <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                {T("Nuevos trabajos", "New jobs")}
              </h2>

              <p className="mt-2 text-slate-600">
                {T("Revisa nuevas solicitudes disponibles y envía tus presupuestos.", "Review available requests and send your quotes.")}
              </p>
            </div>

            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-3xl">
              🔎
            </div>
          </div>

          {estaVerificado ? (
            <button
              type="button"
              onClick={() => router.push("/trabajos")}
              className="mt-5 w-full rounded-2xl bg-blue-700 px-6 py-4 text-lg font-black text-white shadow-lg shadow-blue-700/15 transition hover:-translate-y-0.5 hover:bg-blue-800"
            >
              {T("Ver trabajos disponibles →", "View available jobs →")}
            </button>
          ) : (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
              {estaSuspendido
                ? "No puedes recibir nuevos trabajos mientras tu cuenta esté suspendida."
                : "Los trabajos estarán disponibles cuando tu cuenta quede verificada."}
            </div>
          )}
        </section>

        {/* ACTIVOS */}

        {panelActivo === "active" && estaVerificado && (
          <section
            id="trabajos-activos"
            className="mt-6 scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                  {T("Trabajo activo", "Active job")}
                </p>

                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {T("Trabajos en progreso", "Jobs in progress")}
                </h2>

                <p className="mt-2 text-slate-600">
                  {T("Controla desde aquí todos los trabajos que ya fueron contratados.", "Manage all jobs that have already been hired from here.")}
                </p>
              </div>

              {trabajosActivos.length > 0 && (
                <span className="w-fit rounded-full bg-green-100 px-4 py-2 font-extrabold text-green-800">
                  {trabajosActivos.length}
                </span>
              )}
            </div>

            {trabajosActivos.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="font-bold text-slate-700">
                  {T("No tienes trabajos en progreso.", "You have no jobs in progress.")}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {trabajosActivos.map((trabajo) => (
                  <article
                    key={trabajo.id}
                    className="rounded-3xl border border-green-200 bg-green-50/40 p-6"
                  >
                    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-extrabold text-green-800">
                            {T("En progreso", "In progress")}
                          </span>

                          <span
                            className={`rounded-full px-3 py-1 text-sm font-extrabold ${estiloEtapa(
                              trabajo.job_stage,
                              trabajo.status
                            )}`}
                          >
                            {nombreEtapa(trabajo.job_stage, trabajo.status, language)}
                          </span>
                        </div>

                        <h3 className="mt-3 text-2xl font-extrabold text-slate-900">
                          {trabajo.title}
                        </h3>

                        <p className="mt-2 text-slate-600">
                          {trabajo.description}
                        </p>
                      </div>

                      {trabajo.pago ? (
                        <div className="min-w-[230px] rounded-2xl border border-emerald-200 bg-white px-6 py-4 shadow-sm">
                          <p className="text-center text-sm font-bold text-emerald-700">
                            {T("Recibirás", "You’ll receive")}
                          </p>

                          <p className="mt-1 text-center text-3xl font-extrabold text-emerald-900">
                            ${Number(trabajo.pago.provider_net_amount).toFixed(2)}
                          </p>

                          <div className="mt-3 border-t border-slate-100 pt-3 text-xs">
                            <div className="flex items-center justify-between gap-4 text-slate-600">
                              <span>{T("Valor del servicio", "Service value")}</span>
                              <span className="font-bold text-slate-900">
                                ${Number(trabajo.pago.job_amount).toFixed(2)}
                              </span>
                            </div>

                            <div className="mt-1.5 flex items-center justify-between gap-4 text-slate-600">
                              <span>
                                {T("Tarifa RELYDO", "RELYDO fee")} ({Number(
                                  trabajo.pago.provider_commission_percent
                                ).toFixed(2)}%)
                              </span>
                              <span className="font-bold text-slate-900">
                                ${Number(
                                  trabajo.pago.provider_commission_amount
                                ).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : trabajo.oferta ? (
                        <div className="rounded-2xl bg-white px-6 py-4 text-center shadow-sm">
                          <p className="text-sm font-bold text-slate-500">
                            {T("Precio acordado", "Agreed price")}
                          </p>

                          <p className="mt-1 text-3xl font-extrabold text-slate-900">
                            ${Number(trabajo.oferta.price).toFixed(2)}
                          </p>

                          <p className="mt-2 text-xs font-semibold text-amber-700">
                            {T("Cálculo de tarifa pendiente", "Fee calculation pending")}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <InfoBox
                        titulo={T("Cliente", "Customer")}
                        valor={trabajo.customer_name || "Cliente RELYDO"}
                      />

                      <InfoBox
                        titulo={T("Ubicación", "Location")}
                        valor={`${trabajo.city}, ${trabajo.state} ${trabajo.zip_code}`}
                      />

                      <InfoBox
                        titulo={T("Fecha", "Date")}
                        valor={trabajo.preferred_date || T("Flexible", "Flexible")}
                      />

                      <InfoBox
                        titulo={T("Hora", "Time")}
                        valor={trabajo.preferred_time || T("Flexible", "Flexible")}
                      />
                    </div>

                    {trabajo.oferta && (
                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <InfoBox
                          titulo={T("Tiempo estimado de llegada", "Estimated arrival time")}
                          valor={mostrarMinutos(trabajo.oferta.arrival_minutes, language)}
                          borde
                        />

                        <InfoBox
                          titulo={T("Duración estimada", "Estimated duration")}
                          valor={mostrarMinutos(
                            trabajo.oferta.estimated_job_minutes, language
                          )}
                          borde
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => router.push(`/trabajos/${trabajo.id}`)}
                      className="mt-5 w-full rounded-2xl bg-blue-700 px-6 py-4 text-lg font-black text-white shadow-lg shadow-blue-700/15 transition hover:-translate-y-0.5 hover:bg-blue-800"
                    >
                      {T("Ver trabajo y actualizar estado →", "View job and update status →")}
                    </button>

                    <p className="mt-3 text-center text-sm text-slate-500">
                      {T("Cambia el estado a En camino, Llegué, Trabajo iniciado o Completado.", "Change the status to On the way, Arrived, Work started, or Completed.")}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* COMPLETADOS */}

        {panelActivo === "completed" && estaVerificado && trabajosCompletados.length > 0 && (
          <section
            id="trabajos-completados"
            className="mt-6 scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
                  Historial
                </p>

                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {T("Trabajos completados", "Completed jobs")}
                </h2>
              </div>

              <span className="rounded-full bg-blue-100 px-4 py-2 font-extrabold text-blue-800">
                {trabajosCompletados.length}
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {trabajosCompletados.map((trabajo) => (
                <article
                  key={trabajo.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-extrabold text-green-800">
                        ✓ {T("Completado", "Completed")}
                      </span>

                      <h3 className="mt-3 text-xl font-extrabold text-slate-900">
                        {trabajo.title}
                      </h3>

                      <p className="mt-2 text-slate-600">
                        {trabajo.description}
                      </p>

                      <p className="mt-2 text-sm text-slate-500">
                        {trabajo.city}, {trabajo.state} {trabajo.zip_code}
                      </p>
                    </div>

                    {trabajo.pago ? (
                      <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-right">
                        <p className="text-xs font-bold text-emerald-700">
                          {T("Tu ingreso neto", "Your net earnings")}
                        </p>

                        <p className="mt-1 text-xl font-black text-emerald-800">
                          ${Number(trabajo.pago.provider_net_amount).toFixed(2)}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Valor ${Number(trabajo.pago.job_amount).toFixed(2)}
                          {" · "}
                          Tarifa ${Number(
                            trabajo.pago.provider_commission_amount
                          ).toFixed(2)}
                        </p>
                      </div>
                    ) : trabajo.oferta ? (
                      <div className="rounded-xl bg-white px-4 py-3 text-right">
                        <p className="text-xs font-bold text-slate-500">
                          {T("Precio acordado", "Agreed price")}
                        </p>

                        <p className="mt-1 text-xl font-black text-green-800">
                          ${Number(trabajo.oferta.price).toFixed(2)}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push(`/trabajos/${trabajo.id}`)}
                    className="mt-5 rounded-xl border-2 border-blue-700 px-5 py-3 font-extrabold text-blue-700 hover:bg-blue-50"
                  >
                    {T("Ver detalles", "View details")}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* CANCELADOS */}

        {panelActivo === "cancelled" && estaVerificado && (
          <section
            id="trabajos-cancelados"
            className="mt-6 scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-red-700">
                  {T("Historial", "History")}
                </p>

                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {T("Trabajos cancelados", "Cancelled jobs")}
                </h2>
              </div>

              <span className="rounded-full bg-red-100 px-4 py-2 font-extrabold text-red-800">
                {trabajosCancelados.length}
              </span>
            </div>

            {trabajosCancelados.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="font-bold text-slate-700">
                  {T("No tienes trabajos cancelados.", "You have no cancelled jobs.")}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {trabajosCancelados.map((trabajo) => (
                  <article
                    key={trabajo.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-sm font-extrabold text-red-800">
                          ✕ {T("Cancelado", "Cancelled")}
                        </span>

                        <h3 className="mt-3 text-xl font-extrabold text-slate-900">
                          {trabajo.title}
                        </h3>

                        <p className="mt-2 text-slate-600">{trabajo.description}</p>

                        <p className="mt-2 text-sm text-slate-500">
                          {trabajo.city}, {trabajo.state} {trabajo.zip_code}
                        </p>
                      </div>

                      {trabajo.pago ? (
                        <div className="shrink-0 rounded-xl border border-red-200 bg-white px-4 py-3 text-right">
                          <p className="text-xs font-bold text-red-700">
                            {T("Precio acordado", "Agreed price")}
                          </p>

                          <p className="mt-1 text-xl font-black text-red-800">
                            ${Number(trabajo.pago.job_amount).toFixed(2)}
                          </p>
                        </div>
                      ) : trabajo.oferta ? (
                        <div className="shrink-0 rounded-xl border border-red-200 bg-white px-4 py-3 text-right">
                          <p className="text-xs font-bold text-red-700">
                            {T("Precio acordado", "Agreed price")}
                          </p>

                          <p className="mt-1 text-xl font-black text-red-800">
                            ${Number(trabajo.oferta.price).toFixed(2)}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {trabajo.cancellation_reason && (
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <p className="text-xs font-black uppercase tracking-wide text-red-700">
                          {T("Motivo de cancelación", "Cancellation reason")}
                        </p>

                        <p className="mt-1 font-semibold text-slate-700">
                          {trabajo.cancellation_reason}
                        </p>

                        {trabajo.cancelled_at && (
                          <p className="mt-2 text-xs text-slate-500">
                            {formatearFecha(trabajo.cancelled_at, language)}
                          </p>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => router.push(`/trabajos/${trabajo.id}`)}
                      className="mt-5 rounded-xl border-2 border-blue-700 px-5 py-3 font-extrabold text-blue-700 transition hover:bg-blue-50"
                    >
                      {T("Ver detalles", "View details")}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* REASIGNADOS */}

        {panelActivo === "reassigned" && estaVerificado && (
          <section
            id="trabajos-reasignados"
            className="mt-6 scroll-mt-6 rounded-3xl border border-violet-200 bg-white p-7 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-violet-700">
                  {T("Historial de reasignaciones", "Reassignment history")}
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {T("Trabajos reasignados", "Reassigned jobs")}
                </h2>
                <p className="mt-2 text-slate-600">
                  {T(
                    "Aquí quedan registradas las órdenes en las que RELYDO realizó una reasignación relacionada contigo.",
                    "Orders where RELYDO made a reassignment related to you are recorded here."
                  )}
                </p>
              </div>

              <span className="w-fit rounded-full bg-violet-100 px-4 py-2 font-extrabold text-violet-800">
                {reasignadas}
              </span>
            </div>

            {historialReasignaciones.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="font-bold text-slate-700">
                  {T(
                    "No tienes reasignaciones registradas.",
                    "You have no recorded reassignments."
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {Array.from(idsReasignados).map((requestId) => {
                  const eventos = historialReasignaciones.filter(
                    (item) => item.request_id === requestId
                  );
                  const ultimoEvento = eventos[0];
                  const trabajo = trabajosContratados.find(
                    (item) => item.id === requestId
                  );

                  return (
                    <article
                      key={requestId}
                      className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">
                              ⇄ {T("Reasignada", "Reassigned")}
                            </span>
                            <span className="text-xs font-bold text-slate-400">
                              {eventos.length} {T("evento(s)", "event(s)")}
                            </span>
                          </div>

                          <h3 className="mt-3 font-black text-slate-900">
                            {trabajo?.title || `${T("Orden", "Order")} ${requestId.slice(0, 8)}`}
                          </h3>

                          {ultimoEvento?.reason && (
                            <p className="mt-2 text-sm text-slate-600">
                              {ultimoEvento.reason}
                            </p>
                          )}

                          <p className="mt-2 text-xs font-semibold text-slate-400">
                            {ultimoEvento
                              ? formatearFecha(ultimoEvento.created_at, language)
                              : ""}
                          </p>
                        </div>

                        {trabajo && (
                          <button
                            type="button"
                            onClick={() => router.push(`/trabajos/${requestId}`)}
                            className="shrink-0 rounded-xl border-2 border-violet-600 px-4 py-2.5 text-sm font-black text-violet-700 transition hover:bg-violet-50"
                          >
                            {T("Ver trabajo", "View job")}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* HISTORIAL COMPLETO */}

        {panelActivo === "history" && estaVerificado && (
          <section
            id="historial-completo"
            className="mt-6 scroll-mt-6 rounded-3xl border border-violet-200 bg-white p-7 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-violet-700">
                  {T("Historial completo", "Full history")}
                </p>

                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {T("Toda tu actividad", "All your activity")}
                </h2>

                <p className="mt-2 text-slate-600">
                  {T(
                    "Presupuestos enviados, rechazados o seleccionados y trabajos contratados en una sola vista.",
                    "Sent, rejected or selected quotes and hired jobs in one view."
                  )}
                </p>
              </div>

              <span className="w-fit rounded-full bg-violet-100 px-4 py-2 font-extrabold text-violet-800">
                {totalHistorial}
              </span>
            </div>

            {historialProfesional.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="font-bold text-slate-700">
                  {T(
                    "Todavía no tienes actividad en el historial.",
                    "You don’t have any activity in your history yet."
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {historialProfesional.map((item) => {
                  const trabajo = item.trabajo;
                  const oferta = item.oferta;

                  return (
                    <button
                      key={item.request_id}
                      type="button"
                      onClick={() =>
                        router.push(`/trabajos/${item.request_id}`)
                      }
                      className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-violet-300 hover:bg-violet-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-black text-slate-900">
                          {trabajo?.title ||
                            `${T("Trabajo", "Job")} ${item.request_id.slice(0, 8)}`}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {trabajo
                            ? `${trabajo.city}, ${trabajo.state} · ${formatearFecha(
                                oferta?.created_at || trabajo.created_at,
                                language
                              )}`
                            : formatearFecha(
                                oferta?.created_at,
                                language
                              )}
                        </p>

                        {oferta && (
                          <p className="mt-2 text-sm font-bold text-slate-700">
                            {T("Presupuesto", "Quote")}: ${Number(
                              oferta.price
                            ).toFixed(2)}
                          </p>
                        )}
                      </div>

                      <span
                        className={`w-fit shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${estiloEstadoHistorial(
                          item
                        )}`}
                      >
                        {nombreEstadoHistorial(item)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

      </div>

      {/* MENÚ COMPLETO MÓVIL */}
      {menuMovilAbierto && (
        <div className="fixed inset-0 z-[220] md:hidden">
          <button type="button" aria-label={T("Cerrar menú", "Close menu")} onClick={() => setMenuMovilAbierto(false)} className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" />
          <aside className="absolute inset-y-0 left-0 w-[86%] max-w-[340px] overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div><p className="text-xl font-black text-blue-700">RELYDO</p><p className="text-xs font-bold text-slate-400">{T("Panel profesional", "Professional dashboard")}</p></div>
              <button type="button" onClick={() => setMenuMovilAbierto(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl font-black text-slate-700">×</button>
            </div>
            <div className="mt-4 space-y-1">
              <MenuMovilItem icono="⌂" texto={T("Resumen", "Summary")} onClick={() => { setMenuMovilAbierto(false); setPanelActivo(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
              <MenuMovilItem icono="▣" texto={T("Mis trabajos", "My jobs")} onClick={() => { setMenuMovilAbierto(false); abrirPanel("active"); }} />
              <MenuMovilItem icono="⌕" texto={T("Trabajos disponibles", "Available jobs")} onClick={() => { setMenuMovilAbierto(false); router.push("/trabajos"); }} />
              <MenuMovilItem icono="✓" texto={T("Completados", "Completed")} onClick={() => { setMenuMovilAbierto(false); abrirPanel("completed"); }} />
              <MenuMovilItem icono="⇄" texto={T("Reasignadas", "Reassigned")} onClick={() => { setMenuMovilAbierto(false); abrirPanel("reassigned"); }} />
              <MenuMovilItem icono="⚠" texto={T("Reclamos", "Claims")} onClick={() => { setMenuMovilAbierto(false); abrirPanel("claims"); }} />
              <MenuMovilItem icono="★" texto={T("Reputación", "Reputation")} onClick={() => { setMenuMovilAbierto(false); abrirPanel("rating"); }} />
              <MenuMovilItem icono="▤" texto={T("Documentos", "Documents")} onClick={() => { setMenuMovilAbierto(false); abrirPanel("documents"); }} />
              <MenuMovilItem icono="↺" texto={T("Historial", "History")} onClick={() => { setMenuMovilAbierto(false); abrirPanel("history"); }} />
              <MenuMovilItem
                icono="⚙"
                texto={T("Ajustes", "Settings")}
                onClick={() => {
                  setMenuMovilAbierto(false);
                  setMostrarAjustes(true);
                  window.setTimeout(() => {
                    document.getElementById("ajustes-profesional")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 80);
                }}
              />
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <button type="button" onClick={cerrarSesion} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white">{T("Cerrar sesión", "Sign out")}</button>
            </div>
          </aside>
        </div>
      )}

      {/* NAVEGACIÓN INFERIOR MÓVIL */}
      <nav className="fixed inset-x-0 bottom-0 z-[180] border-t border-slate-200 bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.10)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          <NavMovilItem icono="⌂" texto={T("Resumen", "Summary")} activo={panelActivo === null} onClick={() => { setPanelActivo(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          <NavMovilItem icono="▣" texto={T("Mis trabajos", "My jobs")} activo={panelActivo === "active"} onClick={() => abrirPanel("active")} />
          <NavMovilItem icono="✉" texto={T("Mensajes", "Messages")} onClick={() => router.push("/mensajes")} />
          <NavMovilItem icono="▱" texto={T("Pagos", "Payments")} onClick={() => router.push("/pagos-profesional")} />
          <NavMovilItem icono="•••" texto={T("Más", "More")} onClick={() => setMenuMovilAbierto(true)} />
        </div>
      </nav>
    </main>
  );
}

function MenuMovilItem({ icono, texto, onClick }: { icono: string; texto: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold text-slate-800 transition active:bg-blue-50"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg">{icono}</span><span className="flex-1">{texto}</span><span className="text-slate-300">›</span></button>;
}

function NavMovilItem({ icono, texto, activo = false, onClick }: { icono: string; texto: string; activo?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-black ${activo ? "text-blue-700" : "text-slate-600"}`}><span className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-lg ${activo ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}>{icono}</span><span className="truncate">{texto}</span></button>;
}

function ResumenCard({
  titulo,
  valor,
  clase,
  icono,
  fondo,
  textoAccion,
  detalle,
  onClick,
}: {
  titulo: string;
  valor: string;
  clase: string;
  icono: string;
  fondo: string;
  textoAccion: string;
  detalle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-[165px] w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-100"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl font-black ${fondo}`}
        >
          {icono}
        </div>
        <p className="font-black text-slate-800">{titulo}</p>
      </div>

      <div className="mt-4">
        <p className={`text-4xl font-black tracking-tight ${clase}`}>{valor}</p>
        {detalle && (
          <p className="mt-1 text-xs font-bold text-slate-500">{detalle}</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-1 text-sm font-bold text-blue-700">
        <span>{textoAccion}</span>
        <span className="transition group-hover:translate-x-1">→</span>
      </div>
    </button>
  );
}

function ResumenMovilPrincipal({
  titulo,
  valor,
  valorClase,
  icono,
  fondo,
  onClick,
}: {
  titulo: string;
  valor: string;
  valorClase: string;
  icono: string;
  fondo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.98]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl font-black ${fondo}`}>
          {icono}
        </div>
        <span className="text-slate-300">›</span>
      </div>
      <p className="mt-3 text-xs font-black text-slate-700">{titulo}</p>
      <p className={`mt-1 text-3xl font-black ${valorClase}`}>{valor}</p>
    </button>
  );
}

function ResumenMovilFila({
  titulo,
  valor,
  valorClase,
  icono,
  fondo,
  detalle,
  ultimo = false,
  onClick,
}: {
  titulo: string;
  valor: string;
  valorClase: string;
  icono: string;
  fondo: string;
  detalle?: string;
  ultimo?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-slate-50 ${
        ultimo ? "" : "border-b border-slate-100"
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black ${fondo}`}>
        {icono}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-slate-800">{titulo}</p>
        {detalle && <p className="mt-0.5 text-[11px] font-bold text-slate-400">{detalle}</p>}
      </div>
      <p className={`shrink-0 font-black ${valorClase}`}>{valor}</p>
      <span className="shrink-0 text-xl text-slate-300">›</span>
    </button>
  );
}

function InfoBox({
  titulo,
  valor,
  borde = false,
}: {
  titulo: string;
  valor: string;
  borde?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-4 ${
        borde ? "border border-slate-200" : "border border-white"
      }`}
    >
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {titulo}
      </p>
      <p className="mt-1.5 font-extrabold text-slate-900">{valor}</p>
    </div>
  );
}