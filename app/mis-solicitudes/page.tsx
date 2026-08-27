"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NotificationsBell from "@/app/components/NotificationsBell";
import { AccountModeSwitcher } from "@/app/components/AccountModeSwitcher";
import { useAccountMode } from "@/app/components/AccountModeProvider";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Solicitud = {
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
  created_at: string;
  offer_count?: number;
  professional_count?: number;
};

type ClienteProfile = {
  full_name: string | null;
  role: string | null;
  avatar_url: string | null;
};

type ReclamoCliente = {
  id: string;
  request_id: string;
  reason: string | null;
  description: string | null;
  status: string;
  created_at: string;
};

type TemaDashboard = "light" | "dark" | "system";
type ColorDashboard =
  | "blue"
  | "violet"
  | "emerald"
  | "rose"
  | "amber"
  | "cyan";

const THEME_STORAGE_KEY = "relydo_customer_theme";
const COLOR_STORAGE_KEY = "relydo_customer_accent";
const SOUND_STORAGE_KEY = "relydo_sound_enabled";

const COLORES_DASHBOARD: Record<
  ColorDashboard,
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

function nombreEstado(
  status: string,
  jobStage: string | null,
  language: "es" | "en"
) {
  if (status === "open") return language === "es" ? "Abierta" : "Open";
  if (status === "completed") return language === "es" ? "Completada" : "Completed";
  if (status === "cancelled") return language === "es" ? "Cancelada" : "Cancelled";

  if (status === "in_progress") {
    if (jobStage === "on_the_way")
      return language === "es" ? "Profesional en camino" : "Professional on the way";
    if (jobStage === "arrived")
      return language === "es" ? "Profesional llegó" : "Professional arrived";
    if (jobStage === "working")
      return language === "es" ? "Trabajo iniciado" : "Work started";
    return language === "es" ? "Profesional contratado" : "Professional hired";
  }

  return status;
}

function estiloEstado(status: string, jobStage: string | null) {
  if (status === "open") return "bg-blue-100 text-blue-800";
  if (status === "completed") return "bg-green-100 text-green-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";

  if (status === "in_progress") {
    if (jobStage === "working") return "bg-amber-100 text-amber-800";
    if (jobStage === "arrived") return "bg-purple-100 text-purple-800";
    if (jobStage === "on_the_way") return "bg-blue-100 text-blue-800";
    return "bg-green-100 text-green-800";
  }

  return "bg-slate-100 text-slate-700";
}

function iconoEstado(status: string, jobStage: string | null) {
  if (status === "completed") return "✅";
  if (status === "cancelled") return "✕";
  if (status === "open") return "📋";
  if (jobStage === "working") return "🛠️";
  if (jobStage === "arrived") return "📍";
  if (jobStage === "on_the_way") return "🚗";
  return "🤝";
}

export default function MisSolicitudesPage() {
  const router = useRouter();
  const { setAccountRole } = useAccountMode();
  const { language } = useLanguage();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const t =
    language === "es"
      ? {
          perfilNoEncontrado:
            "No pudimos encontrar tu perfil de cliente.",
          sinAcceso:
            "Esta cuenta no tiene acceso al modo cliente.",
          cargarSolicitudes:
            "No pudimos cargar tus solicitudes",
          cargarReclamos:
            "No pudimos cargar tus reclamos",
          errorInesperado:
            "Ocurrió un error inesperado.",
          fotoFormato:
            "La foto debe ser JPG, PNG o WEBP.",
          fotoTamano:
            "La foto no puede superar 5 MB.",
          sesionNoDisponible:
            "Tu sesión ya no está disponible.",
          subirFoto:
            "No se pudo subir la foto",
          guardarFoto:
            "La foto subió, pero no se pudo guardar en tu perfil",
          fotoError:
            "No se pudo subir la foto.",
          cargando:
            "Cargando panel de cliente...",
          ubicacion:
            "Ubicación",
          fecha:
            "Fecha",
          hora:
            "Hora",
          flexible:
            "Flexible",
          estadoActual:
            "Estado actual",
          verPresupuestos:
            "Ver presupuestos",
          verSeguimiento:
            "Ver seguimiento",
          verDetalles:
            "Ver detalles",
          presupuestosRecibidos:
            "presupuestos",
          profesional:
            "profesional",
          profesionales:
            "profesionales",
          panelCliente:
            "Panel de cliente",
          fotoAlt:
            "Foto de",
          cliente:
            "cliente",
          subiendo:
            "Subiendo...",
          cambiar:
            "Cambiar",
          hola:
            "Hola",
          clienteNombre:
            "Cliente",
          subiendoFoto:
            "Subiendo foto...",
          cambiarFoto:
            "Cambiar foto de perfil",
          anadirFoto:
            "Añadir foto de perfil",
          descripcionPanel:
            "Administra tus solicitudes, sigue tus trabajos y encuentra profesionales desde un solo lugar.",
          vivoActivo:
            "Actualización en vivo activa",
          conectandoVivo:
            "Conectando actualización en vivo...",
          cuenta:
            "Cuenta",
          cerrarSesion:
            "Cerrar sesión",
          nuevoTrabajo:
            "+ Solicitar un nuevo trabajo",
          verProfesionales:
            "Ver profesionales",
          ajustes:
            "Ajustes",
          ajustesTitulo:
            "Personaliza tu experiencia",
          ajustesDescripcion:
            "Configura la apariencia, el color y los avisos de este dispositivo.",
          apariencia:
            "Apariencia",
          aparienciaDesc:
            "Elige cómo quieres ver tu panel de cliente.",
          claro:
            "Claro",
          oscuro:
            "Oscuro",
          sistema:
            "Sistema",
          colorPrincipal:
            "Color principal",
          colorDesc:
            "Personaliza los detalles y acciones principales del dashboard.",
          avisos:
            "Avisos",
          avisosDesc:
            "Controla las notificaciones Push y el sonido en este dispositivo.",
          push:
            "Notificaciones Push",
          sonido:
            "Sonido",
          activo:
            "Activo",
          inactivo:
            "Inactivo",
          activar:
            "Activar",
          desactivar:
            "Desactivar",
          procesando:
            "Procesando...",
          pushNoDisponible:
            "Push no disponible en este navegador.",
          pushPermisoDenegado:
            "El navegador bloqueó las notificaciones. Debes permitirlas desde la configuración del navegador.",
          preferenciasGuardadas:
            "Preferencias guardadas en este dispositivo.",
          cerrarAjustes:
            "Cerrar ajustes",
          cuentaAjustes:
            "Cuenta",
          cuentaAjustesDesc:
            "Administra la eliminación permanente de tu cuenta RELYDO.",
          eliminarCuenta:
            "Eliminar cuenta",
          eliminarCuentaDesc:
            "Elimina permanentemente tu cuenta y los datos personales que RELYDO no esté obligado a conservar.",
          eliminarCuentaAviso:
            "Esta acción no se puede deshacer.",
          confirmarEliminarTitulo:
            "¿Eliminar tu cuenta?",
          confirmarEliminarDesc:
            "Comprobaremos primero que no tengas trabajos activos ni reclamos pendientes. Si todo está cerrado, tu cuenta se eliminará.",
          confirmarEliminarCheck:
            "Entiendo que esta acción es permanente.",
          cancelarEliminar:
            "Cancelar",
          confirmarEliminar:
            "Eliminar mi cuenta",
          eliminandoCuenta:
            "Eliminando cuenta...",
          cuentaConPendientes:
            "No podemos eliminar tu cuenta todavía porque tienes asuntos pendientes.",
          cuentaEliminada:
            "Tu cuenta fue eliminada correctamente.",
          errorEliminarCuenta:
            "No pudimos eliminar tu cuenta.",
          resumen:
            "Resumen",
          actividad:
            "Tu actividad en RELYDO",
          pulsaTarjeta:
            "Pulsa cualquier tarjeta para ir directamente a esa sección.",
          actualizando:
            "Actualizando...",
          actualizar:
            "↻ Actualizar",
          abiertas:
            "Abiertas",
          enProgreso:
            "En progreso",
          completadas:
            "Completadas",
          canceladas:
            "Canceladas",
          reclamos:
            "Reclamos",
          historial:
            "Historial",
          seguimiento:
            "Seguimiento",
          unTrabajoProgreso:
            "Tienes un trabajo en progreso",
          trabajosProgreso:
            "trabajos en progreso",
          avanceProfesional:
            "Revisa aquí el avance reportado por cada profesional.",
          verTrabajos:
            "Ver",
          trabajos:
            "trabajos",
          sinSolicitudes:
            "Todavía no tienes solicitudes",
          apareceranAqui:
            "Tus solicitudes aparecerán aquí cuando solicites un trabajo.",
          solicitarTrabajo:
            "Solicitar un trabajo",
          solicitudesAbiertas:
            "Solicitudes abiertas",
          esperandoPresupuestos:
            "Esperando presupuestos de profesionales.",
          trabajosEnProgreso:
            "Trabajos en progreso",
          estadoTrabajos:
            "Sigue aquí el estado actual de todos tus trabajos.",
          trabajosCompletados:
            "Trabajos completados",
          historialTerminados:
            "Historial de trabajos terminados.",
          solicitudesCanceladas:
            "Solicitudes canceladas",
          historialCanceladas:
            "Historial de solicitudes que fueron canceladas.",
          proteccion:
            "Protección",
          misReclamos:
            "Mis reclamos",
          revisarReclamos:
            "Revisa tus reclamos abiertos, en revisión y resueltos.",
          activos:
            "activos",
          sinReclamos:
            "No tienes reclamos.",
          reclamoTrabajo:
            "Reclamo de trabajo",
          verTrabajoRelacionado:
            "Ver trabajo relacionado",
          abierto:
            "Abierto",
          enRevision:
            "En revisión",
          resuelto:
            "Resuelto",
          historialCompleto:
            "Historial completo",
          todasSolicitudes:
            "Todas tus solicitudes",
          todasVista:
            "Solicitudes abiertas, en progreso, completadas y canceladas en una sola vista.",
          sinHistorial:
            "No tienes solicitudes en tu historial todavía.",
        }
      : {
          perfilNoEncontrado:
            "We could not find your customer profile.",
          sinAcceso:
            "This account does not have access to customer mode.",
          cargarSolicitudes:
            "We could not load your requests",
          cargarReclamos:
            "We could not load your claims",
          errorInesperado:
            "An unexpected error occurred.",
          fotoFormato:
            "The photo must be JPG, PNG, or WEBP.",
          fotoTamano:
            "The photo cannot exceed 5 MB.",
          sesionNoDisponible:
            "Your session is no longer available.",
          subirFoto:
            "We could not upload the photo",
          guardarFoto:
            "The photo was uploaded, but it could not be saved to your profile",
          fotoError:
            "We could not upload the photo.",
          cargando:
            "Loading customer dashboard...",
          ubicacion:
            "Location",
          fecha:
            "Date",
          hora:
            "Time",
          flexible:
            "Flexible",
          estadoActual:
            "Current status",
          verPresupuestos:
            "View quotes",
          verSeguimiento:
            "Track job",
          verDetalles:
            "View details",
          presupuestosRecibidos:
            "quotes",
          profesional:
            "professional",
          profesionales:
            "professionals",
          panelCliente:
            "Customer dashboard",
          fotoAlt:
            "Photo of",
          cliente:
            "customer",
          subiendo:
            "Uploading...",
          cambiar:
            "Change",
          hola:
            "Hello",
          clienteNombre:
            "Customer",
          subiendoFoto:
            "Uploading photo...",
          cambiarFoto:
            "Change profile photo",
          anadirFoto:
            "Add profile photo",
          descripcionPanel:
            "Manage your requests, track your jobs, and find professionals from one place.",
          vivoActivo:
            "Live updates active",
          conectandoVivo:
            "Connecting live updates...",
          cuenta:
            "Account",
          cerrarSesion:
            "Sign out",
          nuevoTrabajo:
            "+ Request a new job",
          verProfesionales:
            "View professionals",
          ajustes:
            "Settings",
          ajustesTitulo:
            "Personalize your experience",
          ajustesDescripcion:
            "Configure appearance, color, and alerts for this device.",
          apariencia:
            "Appearance",
          aparienciaDesc:
            "Choose how you want your customer dashboard to look.",
          claro:
            "Light",
          oscuro:
            "Dark",
          sistema:
            "System",
          colorPrincipal:
            "Primary color",
          colorDesc:
            "Personalize the main accents and actions in your dashboard.",
          avisos:
            "Alerts",
          avisosDesc:
            "Control Push notifications and sound on this device.",
          push:
            "Push notifications",
          sonido:
            "Sound",
          activo:
            "Active",
          inactivo:
            "Inactive",
          activar:
            "Enable",
          desactivar:
            "Disable",
          procesando:
            "Processing...",
          pushNoDisponible:
            "Push is not available in this browser.",
          pushPermisoDenegado:
            "The browser blocked notifications. Allow them from your browser settings.",
          preferenciasGuardadas:
            "Preferences saved on this device.",
          cerrarAjustes:
            "Close settings",
          cuentaAjustes:
            "Account",
          cuentaAjustesDesc:
            "Manage permanent deletion of your RELYDO account.",
          eliminarCuenta:
            "Delete account",
          eliminarCuentaDesc:
            "Permanently delete your account and personal data RELYDO is not legally required to retain.",
          eliminarCuentaAviso:
            "This action cannot be undone.",
          confirmarEliminarTitulo:
            "Delete your account?",
          confirmarEliminarDesc:
            "We will first check that you have no active jobs or unresolved claims. If everything is closed, your account will be deleted.",
          confirmarEliminarCheck:
            "I understand that this action is permanent.",
          cancelarEliminar:
            "Cancel",
          confirmarEliminar:
            "Delete my account",
          eliminandoCuenta:
            "Deleting account...",
          cuentaConPendientes:
            "We cannot delete your account yet because you have unresolved items.",
          cuentaEliminada:
            "Your account was deleted successfully.",
          errorEliminarCuenta:
            "We could not delete your account.",
          resumen:
            "Summary",
          actividad:
            "Your RELYDO activity",
          pulsaTarjeta:
            "Select any card to go directly to that section.",
          actualizando:
            "Updating...",
          actualizar:
            "↻ Refresh",
          abiertas:
            "Open",
          enProgreso:
            "In progress",
          completadas:
            "Completed",
          canceladas:
            "Cancelled",
          reclamos:
            "Claims",
          historial:
            "History",
          seguimiento:
            "Tracking",
          unTrabajoProgreso:
            "You have one job in progress",
          trabajosProgreso:
            "jobs in progress",
          avanceProfesional:
            "Review the progress reported by each professional here.",
          verTrabajos:
            "View",
          trabajos:
            "jobs",
          sinSolicitudes:
            "You don't have any requests yet",
          apareceranAqui:
            "Your requests will appear here once you submit a job.",
          solicitarTrabajo:
            "Request a job",
          solicitudesAbiertas:
            "Open requests",
          esperandoPresupuestos:
            "Waiting for quotes from professionals.",
          trabajosEnProgreso:
            "Jobs in progress",
          estadoTrabajos:
            "Track the current status of all your jobs here.",
          trabajosCompletados:
            "Completed jobs",
          historialTerminados:
            "History of completed jobs.",
          solicitudesCanceladas:
            "Cancelled requests",
          historialCanceladas:
            "History of requests that were cancelled.",
          proteccion:
            "Protection",
          misReclamos:
            "My claims",
          revisarReclamos:
            "Review your open, under-review, and resolved claims.",
          activos:
            "active",
          sinReclamos:
            "You don't have any claims.",
          reclamoTrabajo:
            "Job claim",
          verTrabajoRelacionado:
            "View related job",
          abierto:
            "Open",
          enRevision:
            "Under review",
          resuelto:
            "Resolved",
          historialCompleto:
            "Full history",
          todasSolicitudes:
            "All your requests",
          todasVista:
            "Open, in-progress, completed, and cancelled requests in one view.",
          sinHistorial:
            "You don't have any requests in your history yet.",
        };

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cliente, setCliente] = useState<ClienteProfile | null>(null);
  const [email, setEmail] = useState("");
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [realtimeConectado, setRealtimeConectado] = useState(false);
  const [reclamos, setReclamos] = useState<ReclamoCliente[]>([]);
  const [mostrarReclamos, setMostrarReclamos] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [mostrarAjustes, setMostrarAjustes] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState<
    "abiertas" | "en-progreso" | "completadas" | "canceladas" | null
  >(null);

  const [temaDashboard, setTemaDashboard] =
    useState<TemaDashboard>("system");

  const [temaOscuro, setTemaOscuro] =
    useState(false);

  const [colorDashboard, setColorDashboard] =
    useState<ColorDashboard>("blue");

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

  const [mostrarEliminarCuenta, setMostrarEliminarCuenta] = useState(false);
  const [confirmacionEliminar, setConfirmacionEliminar] = useState(false);
  const [eliminandoCuenta, setEliminandoCuenta] = useState(false);
  const [mensajeEliminarCuenta, setMensajeEliminarCuenta] = useState("");

  useEffect(() => {
    cargarPanelCliente();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const temaGuardado =
      localStorage.getItem(
        THEME_STORAGE_KEY
      ) as TemaDashboard | null;

    const colorGuardado =
      localStorage.getItem(
        COLOR_STORAGE_KEY
      ) as ColorDashboard | null;

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
      colorGuardado in
        COLORES_DASHBOARD
        ? colorGuardado
        : "blue";

    setTemaDashboard(
      temaValido
    );

    setColorDashboard(
      colorValido as ColorDashboard
    );

    setSonidoActivo(
      sonidoGuardado === "true"
    );

    const media =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      );

    const aplicarTema = () => {
      setTemaOscuro(
        temaValido === "dark" ||
          (
            temaValido === "system" &&
            media.matches
          )
      );
    };

    aplicarTema();

    const listener = () => {
      if (
        temaValido === "system"
      ) {
        setTemaOscuro(
          media.matches
        );
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
    if (
      typeof window === "undefined"
    ) {
      return;
    }

    const media =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      );

    setTemaOscuro(
      temaDashboard === "dark" ||
        (
          temaDashboard === "system" &&
          media.matches
        )
    );
  }, [temaDashboard]);

  useEffect(() => {
    const disponible =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setPushDisponible(
      disponible
    );

    if (
      disponible &&
      userId
    ) {
      comprobarPushCliente();
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const canal = supabase
      .channel(`panel-cliente-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
          filter: `customer_id=eq.${userId}`,
        },
        (payload) => {
          console.log("Cambio recibido en panel cliente:", payload);

          if (payload.eventType === "INSERT") {
            const nueva = payload.new as Solicitud;

            setSolicitudes((actuales) => {
              const existe = actuales.some((item) => item.id === nueva.id);
              if (existe) return actuales;
              return [nueva, ...actuales];
            });

            return;
          }

          if (payload.eventType === "UPDATE") {
            const actualizada = payload.new as Solicitud;

            setSolicitudes((actuales) =>
              actuales.map((item) =>
                item.id === actualizada.id
                  ? {
                      ...item,
                      ...actualizada,
                    }
                  : item
              )
            );

            return;
          }

          if (payload.eventType === "DELETE") {
            const eliminada = payload.old as { id?: string };

            if (!eliminada.id) return;

            setSolicitudes((actuales) =>
              actuales.filter((item) => item.id !== eliminada.id)
            );
          }
        }
      )
      .subscribe((status) => {
        console.log("Realtime panel cliente:", status);

        if (status === "SUBSCRIBED") {
          setRealtimeConectado(true);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeConectado(false);
        }
      });

    return () => {
      supabase.removeChannel(canal);
    };
  }, [userId]);

  async function cargarPanelCliente(mostrarCarga = true) {
    if (mostrarCarga) {
      setCargando(true);
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
        router.replace("/login-cliente");
        return;
      }

      setUserId(user.id);
      setEmail(user.email || "");

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(`
          full_name,
          role,
          avatar_url
        `)
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profileData) {
        throw new Error(t.perfilNoEncontrado);
      }

      if (
        profileData.role !== "customer" &&
        profileData.role !== "provider"
      ) {
        throw new Error(t.sinAcceso);
      }

      setAccountRole(
        profileData.role === "provider"
          ? "provider"
          : "customer"
      );

      setCliente(profileData);

      const { data, error: solicitudesError } = await supabase
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
          created_at
        `)
        .eq("customer_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (solicitudesError) {
        throw new Error(
          `${t.cargarSolicitudes}: ${solicitudesError.message}`
        );
      }

      const solicitudesBase = (data || []) as Solicitud[];

      const requestIds = solicitudesBase.map((solicitud) => solicitud.id);

      let solicitudesConPresupuestos = solicitudesBase;

      if (requestIds.length > 0) {
        const { data: ofertasData, error: ofertasError } = await supabase
          .from("offers")
          .select("request_id, professional_id")
          .in("request_id", requestIds);

        if (ofertasError) {
          console.error(
            "No pudimos cargar los contadores de presupuestos:",
            ofertasError
          );
        } else {
          const resumenOfertas = new Map<
            string,
            {
              offer_count: number;
              professionals: Set<string>;
            }
          >();

          for (const oferta of ofertasData || []) {
            const actual =
              resumenOfertas.get(oferta.request_id) || {
                offer_count: 0,
                professionals: new Set<string>(),
              };

            actual.offer_count += 1;

            if (oferta.professional_id) {
              actual.professionals.add(oferta.professional_id);
            }

            resumenOfertas.set(oferta.request_id, actual);
          }

          solicitudesConPresupuestos = solicitudesBase.map((solicitud) => {
            const resumen = resumenOfertas.get(solicitud.id);

            return {
              ...solicitud,
              offer_count: resumen?.offer_count || 0,
              professional_count: resumen?.professionals.size || 0,
            };
          });
        }
      }

      setSolicitudes(solicitudesConPresupuestos);

      const { data: reclamosData, error: reclamosError } = await supabase
        .from("job_claims")
        .select(`
          id,
          request_id,
          reason,
          description,
          status,
          created_at
        `)
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (reclamosError) {
        throw new Error(
          `${t.cargarReclamos}: ${reclamosError.message}`
        );
      }

      setReclamos((reclamosData || []) as ReclamoCliente[]);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error ? err.message : t.errorInesperado
      );
    } finally {
      if (mostrarCarga) {
        setCargando(false);
      }

      setActualizando(false);
    }
  }

  function guardarTema(
    tema: TemaDashboard
  ) {
    setTemaDashboard(tema);

    localStorage.setItem(
      THEME_STORAGE_KEY,
      tema
    );

    setMensajeAjustes(
      t.preferenciasGuardadas
    );
  }

  function guardarColor(
    color: ColorDashboard
  ) {
    setColorDashboard(color);

    localStorage.setItem(
      COLOR_STORAGE_KEY,
      color
    );

    setMensajeAjustes(
      t.preferenciasGuardadas
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
      t.preferenciasGuardadas
    );
  }

  async function comprobarPushCliente() {
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
        "No se pudo comprobar Push:",
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

  async function activarPushCliente() {
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
          t.pushPermisoDenegado
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
          "La suscripción Push no devolvió las claves necesarias."
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
        t.preferenciasGuardadas
      );
    } catch (error) {
      console.error(
        "No se pudo activar Push:",
        error
      );

      setMensajeAjustes(
        error instanceof Error
          ? error.message
          : t.pushNoDisponible
      );
    } finally {
      setProcesandoPush(false);
    }
  }

  async function desactivarPushCliente() {
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
        t.preferenciasGuardadas
      );
    } catch (error) {
      console.error(
        "No se pudo desactivar Push:",
        error
      );

      setMensajeAjustes(
        error instanceof Error
          ? error.message
          : t.pushNoDisponible
      );
    } finally {
      setProcesandoPush(false);
    }
  }

  async function eliminarCuentaCliente() {
    if (!confirmacionEliminar || eliminandoCuenta) return;

    setEliminandoCuenta(true);
    setMensajeEliminarCuenta("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      const accessToken = sessionData.session?.access_token;

      if (sessionError || !accessToken) {
        throw new Error(t.sesionNoDisponible);
      }

      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 409) {
          const details = Array.isArray(result?.pending)
            ? result.pending.join(" · ")
            : "";
          throw new Error(
            details
              ? `${t.cuentaConPendientes} ${details}`
              : t.cuentaConPendientes
          );
        }

        throw new Error(result?.error || t.errorEliminarCuenta);
      }

      await supabase.auth.signOut();
      window.location.href = `/login-cliente?account_deleted=1`;
    } catch (error) {
      setMensajeEliminarCuenta(
        error instanceof Error ? error.message : t.errorEliminarCuenta
      );
    } finally {
      setEliminandoCuenta(false);
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function subirAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !cliente) return;

    setError("");

    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];

    if (!tiposPermitidos.includes(file.type)) {
      setError(t.fotoFormato);
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t.fotoTamano);
      event.target.value = "";
      return;
    }

    setSubiendoAvatar(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(t.sesionNoDisponible);
      }

      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const ruta = `${user.id}/avatar-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("customer-avatars")
        .upload(ruta, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`${t.subirFoto}: ${uploadError.message}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("customer-avatars").getPublicUrl(ruta);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          avatar_url: publicUrl,
        })
        .eq("id", user.id);

      if (updateError) {
        throw new Error(
          `${t.guardarFoto}: ${updateError.message}`
        );
      }

      setCliente((actual) =>
        actual
          ? {
              ...actual,
              avatar_url: publicUrl,
            }
          : actual
      );
    } catch (err) {
      console.error("Error subiendo foto de cliente:", err);

      setError(
        err instanceof Error ? err.message : t.fotoError
      );
    } finally {
      setSubiendoAvatar(false);
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

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-lg">
          <p className="font-bold text-slate-700">
            {t.cargando}
          </p>
        </div>
      </main>
    );
  }

  const abiertas = solicitudes.filter(
    (solicitud) => solicitud.status === "open"
  );

  const enProgreso = solicitudes.filter(
    (solicitud) => solicitud.status === "in_progress"
  );

  const completadas = solicitudes.filter(
    (solicitud) => solicitud.status === "completed"
  );

  const canceladas = solicitudes.filter(
    (solicitud) => solicitud.status === "cancelled"
  );

  const totalHistorial =
    abiertas.length +
    enProgreso.length +
    completadas.length +
    canceladas.length;

  const reclamosActivos = reclamos.filter(
    (reclamo) =>
      reclamo.status === "open" ||
      reclamo.status === "reviewing" ||
      reclamo.status === "in_review"
  );

  function renderSolicitud(solicitud: Solicitud) {
    const nombre = nombreEstado(
      solicitud.status,
      solicitud.job_stage,
      language
    );

    const estilo = estiloEstado(
      solicitud.status,
      solicitud.job_stage
    );

    const offerCount = solicitud.offer_count || 0;
    const professionalCount = solicitud.professional_count || 0;

    const fechaCreacion = new Date(
      solicitud.created_at
    ).toLocaleString(
      language === "es" ? "es-US" : "en-US",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    );

    return (
      <Link
        key={solicitud.id}
        href={`/mis-solicitudes/${solicitud.id}`}
        className="relative z-20 flex w-full cursor-pointer flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <h3 className="truncate text-xl font-black text-slate-950">
            {solicitud.title}
          </h3>

          <p className="mt-1 text-sm text-slate-500 sm:text-base">
            {solicitud.city}, {solicitud.state} · {fechaCreacion}
          </p>

          {solicitud.status === "open" && (
            <p className="mt-2 text-sm font-bold text-blue-700">
              {offerCount} {t.presupuestosRecibidos}
              {" · "}
              {professionalCount}{" "}
              {professionalCount === 1 ? t.profesional : t.profesionales}
            </p>
          )}
        </div>

        <span
          className={`w-fit shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${estilo}`}
        >
          {nombre}
        </span>
      </Link>
    );
  }

  const colorActual =
    COLORES_DASHBOARD[
      colorDashboard
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
      className={`min-h-screen px-3 py-6 transition-colors duration-300 sm:px-4 md:py-7 ${
        temaOscuro
          ? "relydo-customer-dark"
          : ""
      }`}
      style={{
        backgroundColor:
          fondoPagina,
        color:
          textoPrincipal,
      }}
    >
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <section
          className="relative z-30 overflow-visible rounded-[28px] border text-white shadow-xl"
          style={{
            borderColor:
              `${colorActual.hex}55`,
            background:
              `linear-gradient(135deg, ${colorActual.hex}, ${colorActual.hexOscuro})`,
            boxShadow:
              `0 16px 36px ${colorActual.hex}20`,
          }}
        >
          <div className="relative px-5 py-5 sm:px-7 sm:py-6 md:px-8 md:py-6">
            <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 left-12 h-40 w-40 rounded-full bg-cyan-300/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.15em] text-blue-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-300" />
                    {t.panelCliente}
                  </div>

                  <div className="text-lg font-black tracking-[0.08em] sm:text-xl">
                    RELYDO
                  </div>

                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold ${
                      realtimeConectado
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        realtimeConectado ? "bg-green-500" : "bg-amber-500"
                      }`}
                    />

                    {realtimeConectado
                      ? t.vivoActivo
                      : t.conectandoVivo}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-4 sm:gap-5">
                  <div className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-white/30 bg-white/10 shadow-lg sm:h-16 sm:w-16">
                    {cliente?.avatar_url ? (
                      <img
                        src={cliente.avatar_url}
                        alt={`${t.fotoAlt} ${cliente.full_name || t.cliente}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-black text-white">
                        {(cliente?.full_name || "C").charAt(0).toUpperCase()}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={subiendoAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                      className="absolute inset-x-0 bottom-0 bg-slate-950/75 px-1 py-1 text-[8px] font-black uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
                    >
                      {subiendoAvatar ? t.subiendo : t.cambiar}
                    </button>
                  </div>

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={subirAvatar}
                    className="hidden"
                  />

                  <div className="min-w-0">
                    <h1 className="text-2xl font-black leading-[1.05] tracking-tight sm:text-3xl md:text-4xl">
                      {t.hola}, {cliente?.full_name || t.clienteNombre}
                    </h1>

                    <button
                      type="button"
                      disabled={subiendoAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                      className="mt-1.5 text-xs font-bold text-blue-100 underline decoration-white/40 underline-offset-4 transition hover:text-white disabled:opacity-60 sm:text-sm"
                    >
                      {subiendoAvatar
                        ? t.subiendoFoto
                        : cliente?.avatar_url
                        ? t.cambiarFoto
                        : t.anadirFoto}
                    </button>
                  </div>
                </div>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
                  {t.descripcionPanel}
                </p>
              </div>

              <div className="relative z-[100] flex w-full items-center gap-3 lg:w-auto lg:justify-end">
                <div className="relative z-[110] shrink-0">
                  <NotificationsBell modo="cliente" />
                </div>

                <div className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm lg:w-[260px] lg:flex-none">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-200">
                        {t.cuenta}
                      </p>

                      <p className="mt-0.5 truncate text-sm font-bold text-white">
                        {email}
                      </p>
                    </div>
                  </div>

                  {cliente?.role === "provider" && (
                    <div className="mt-2 rounded-xl bg-white/95 p-2 text-slate-900">
                      <AccountModeSwitcher />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={cerrarSesion}
                    className="mt-2.5 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/20"
                  >
                    {t.cerrarSesion}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ACCIONES */}

        <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => router.push("/solicitar-trabajo")}
            className="rounded-xl px-5 py-3 text-base font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:text-lg"
            style={{
              backgroundColor:
                colorActual.hex,
            }}
          >
            {t.nuevoTrabajo}
          </button>

          <button
            type="button"
            onClick={() => router.push("/profesionales")}
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
            {t.verProfesionales}
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
            ⚙️ {t.ajustes}
          </button>
        </section>

        {mostrarAjustes && (
          <section
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
                    ⚙️ {t.ajustes}
                  </p>

                  <h2
                    className="mt-1 text-2xl font-black"
                    style={{
                      color:
                        textoPrincipal,
                    }}
                  >
                    {t.ajustesTitulo}
                  </h2>

                  <p
                    className="mt-1 text-sm"
                    style={{
                      color:
                        textoSecundario,
                    }}
                  >
                    {t.ajustesDescripcion}
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
                  {t.cerrarAjustes}
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
                      {t.apariencia}
                    </h3>

                    <p
                      className="mt-1 text-xs leading-5"
                      style={{
                        color:
                          textoSecundario,
                      }}
                    >
                      {t.aparienciaDesc}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["light", t.claro],
                      ["dark", t.oscuro],
                      ["system", t.sistema],
                    ] as const
                  ).map(
                    ([valor, etiqueta]) => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() =>
                          guardarTema(
                            valor
                          )
                        }
                        className="rounded-xl border px-3 py-2.5 text-xs font-black transition"
                        style={{
                          borderColor:
                            temaDashboard ===
                            valor
                              ? colorActual.hex
                              : bordeTarjeta,
                          backgroundColor:
                            temaDashboard ===
                            valor
                              ? `${colorActual.hex}18`
                              : fondoTarjeta,
                          color:
                            temaDashboard ===
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
                      {t.colorPrincipal}
                    </h3>

                    <p
                      className="mt-1 text-xs leading-5"
                      style={{
                        color:
                          textoSecundario,
                      }}
                    >
                      {t.colorDesc}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  {(
                    Object.keys(
                      COLORES_DASHBOARD
                    ) as ColorDashboard[]
                  ).map(
                    (color) => {
                      const opcion =
                        COLORES_DASHBOARD[
                          color
                        ];

                      const seleccionado =
                        colorDashboard ===
                        color;

                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() =>
                            guardarColor(
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
                      {t.avisos}
                    </h3>

                    <p
                      className="mt-1 text-xs leading-5"
                      style={{
                        color:
                          textoSecundario,
                      }}
                    >
                      {t.avisosDesc}
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
                        📲 {t.push}
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
                          ? t.activo
                          : t.inactivo}
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
                          ? desactivarPushCliente()
                          : activarPushCliente()
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
                        ? t.procesando
                        : pushActivo
                        ? t.desactivar
                        : t.activar}
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
                        🔊 {t.sonido}
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
                          ? t.activo
                          : t.inactivo}
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
                        ? t.desactivar
                        : t.activar}
                    </button>
                  </div>

                  {!pushDisponible && (
                    <p className="text-xs font-bold text-amber-700">
                      {t.pushNoDisponible}
                    </p>
                  )}
                </div>
              </div>

              {/* CUENTA */}
              <div
                className="rounded-2xl border p-5 md:col-span-2 xl:col-span-1"
                style={{
                  borderColor: "#fecaca",
                  backgroundColor: temaOscuro ? "#111827" : "#fff7f7",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">👤</div>
                  <div>
                    <h3 className="font-black" style={{ color: textoPrincipal }}>
                      {t.cuentaAjustes}
                    </h3>
                    <p className="mt-1 text-xs leading-5" style={{ color: textoSecundario }}>
                      {t.cuentaAjustesDesc}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-black text-red-800">
                    {t.eliminarCuenta}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-red-700">
                    {t.eliminarCuentaDesc}
                  </p>
                  <p className="mt-2 text-xs font-black text-red-800">
                    {t.eliminarCuentaAviso}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarEliminarCuenta(true);
                      setConfirmacionEliminar(false);
                      setMensajeEliminarCuenta("");
                    }}
                    className="mt-4 w-full rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-black text-red-700 transition hover:bg-red-100"
                  >
                    {t.eliminarCuenta}
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
                    {t.confirmarEliminarTitulo}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t.confirmarEliminarDesc}
                  </p>
                </div>
              </div>

              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <input
                  type="checkbox"
                  checked={confirmacionEliminar}
                  onChange={(event) => setConfirmacionEliminar(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span className="text-sm font-bold leading-6 text-red-900">
                  {t.confirmarEliminarCheck}
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
                  disabled={eliminandoCuenta}
                  onClick={() => setMostrarEliminarCuenta(false)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 disabled:opacity-50"
                >
                  {t.cancelarEliminar}
                </button>
                <button
                  type="button"
                  disabled={!confirmacionEliminar || eliminandoCuenta}
                  onClick={eliminarCuentaCliente}
                  className="rounded-xl bg-red-700 px-5 py-3 text-sm font-black text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {eliminandoCuenta ? t.eliminandoCuenta : t.confirmarEliminar}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RESUMEN */}

        <section className="mt-5">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                {t.resumen}
              </p>

              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-[28px]">
                {t.actividad}
              </h2>

              <p className="mt-1 text-sm text-slate-600 sm:text-base">
                {t.pulsaTarjeta}
              </p>
            </div>

            <button
              type="button"
              onClick={() => cargarPanelCliente(false)}
              disabled={actualizando}
              className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actualizando ? t.actualizando : t.actualizar}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <ResumenCard
              titulo={t.abiertas}
              valor={String(abiertas.length)}
              clase="text-blue-700"
              icono="📋"
              fondo="bg-blue-50"
              onClick={() => {
                setMostrarReclamos(false);
                setMostrarHistorial(false);
                setSeccionActiva((actual) =>
                  actual === "abiertas" ? null : "abiertas"
                );
              }}
            />

            <ResumenCard
              titulo={t.enProgreso}
              valor={String(enProgreso.length)}
              clase="text-amber-700"
              icono="⚡"
              fondo="bg-amber-50"
              onClick={() => {
                setMostrarReclamos(false);
                setMostrarHistorial(false);
                setSeccionActiva((actual) =>
                  actual === "en-progreso" ? null : "en-progreso"
                );
              }}
            />

            <ResumenCard
              titulo={t.completadas}
              valor={String(completadas.length)}
              clase="text-emerald-700"
              icono="✓"
              fondo="bg-emerald-50"
              onClick={() => {
                setMostrarReclamos(false);
                setMostrarHistorial(false);
                setSeccionActiva((actual) =>
                  actual === "completadas" ? null : "completadas"
                );
              }}
            />

            <ResumenCard
              titulo={t.canceladas}
              valor={String(canceladas.length)}
              clase="text-red-700"
              icono="×"
              fondo="bg-red-50"
              onClick={() => {
                setMostrarReclamos(false);
                setMostrarHistorial(false);
                setSeccionActiva((actual) =>
                  actual === "canceladas" ? null : "canceladas"
                );
              }}
            />

            <ResumenCard
              titulo={t.reclamos}
              valor={String(reclamosActivos.length)}
              clase="text-rose-700"
              icono="⚠"
              fondo="bg-rose-50"
              onClick={() => {
                setSeccionActiva(null);
                setMostrarHistorial(false);
                setMostrarReclamos((actual) => !actual);
              }}
            />

            <ResumenCard
              titulo={t.historial}
              valor={String(totalHistorial)}
              clase="text-violet-700"
              icono="↺"
              fondo="bg-violet-50"
              onClick={() => {
                setSeccionActiva(null);
                setMostrarReclamos(false);
                setMostrarHistorial((actual) => !actual);
              }}
            />
          </div>

          {mostrarReclamos && (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-rose-700">
                    {t.proteccion}
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-slate-900">
                    {t.misReclamos}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {t.revisarReclamos}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMostrarReclamos(false)}
                  className="w-fit rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-extrabold text-rose-800 hover:bg-rose-100"
                >
                  {language === "es" ? "Ocultar" : "Hide"}
                </button>
              </div>

              {reclamos.length === 0 ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="font-bold text-slate-700">
                    {t.sinReclamos}
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {reclamos.map((reclamo) => {
                    const solicitudRelacionada = solicitudes.find(
                      (item) => item.id === reclamo.request_id
                    );

                    const activo =
                      reclamo.status === "open" ||
                      reclamo.status === "reviewing" ||
                      reclamo.status === "in_review";

                    return (
                      <Link
                        key={reclamo.id}
                        href={`/mis-solicitudes/${reclamo.request_id}`}
                        className="flex w-full cursor-pointer flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-rose-300 hover:bg-rose-50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-900">
                            {reclamo.reason || t.reclamoTrabajo}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {solicitudRelacionada?.title || t.verTrabajoRelacionado}
                          </p>
                        </div>

                        <span
                          className={`w-fit shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${
                            activo
                              ? "bg-rose-100 text-rose-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {reclamo.status === "open"
                            ? t.abierto
                            : reclamo.status === "reviewing" ||
                              reclamo.status === "in_review"
                            ? t.enRevision
                            : t.resuelto}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {mostrarHistorial && (
            <div className="mt-5 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-violet-700">
                    {t.historialCompleto}
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-slate-900">
                    {t.todasSolicitudes}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setMostrarHistorial(false)}
                  className="w-fit rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-extrabold text-violet-800 hover:bg-violet-100"
                >
                  {language === "es" ? "Ocultar" : "Hide"}
                </button>
              </div>

              {solicitudes.length === 0 ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="font-bold text-slate-700">
                    {t.sinHistorial}
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {solicitudes.map((solicitud) => (
                    <Link
                      key={solicitud.id}
                      href={`/mis-solicitudes/${solicitud.id}`}
                      className="flex w-full cursor-pointer flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-violet-300 hover:bg-violet-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-900">
                          {solicitud.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {solicitud.city}, {solicitud.state} {solicitud.zip_code}
                        </p>
                      </div>

                      <span
                        className={`w-fit shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${estiloEstado(
                          solicitud.status,
                          solicitud.job_stage
                        )}`}
                      >
                        {nombreEstado(
                          solicitud.status,
                          solicitud.job_stage,
                          language
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5 font-bold text-red-700">
            {error}
          </div>
        )}

        {!error && solicitudes.length === 0 && (
          <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-lg">
            <div className="text-5xl">📋</div>

            <h2 className="mt-4 text-2xl font-extrabold text-slate-900">
              {t.sinSolicitudes}
            </h2>

            <p className="mt-2 text-slate-600">
              {t.apareceranAqui}
            </p>

            <button
              type="button"
              onClick={() => router.push("/solicitar-trabajo")}
              className="mt-6 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800"
            >
              {t.solicitarTrabajo}
            </button>
          </section>
        )}

        {!error && seccionActiva === "abiertas" && (
          <section
            id="solicitudes-abiertas"
            className="mt-8 scroll-mt-6 rounded-3xl border p-6 shadow-sm md:p-7"
            style={{
              borderColor: bordeTarjeta,
              backgroundColor: fondoTarjeta,
            }}
          >
            <h2 className="text-3xl font-extrabold" style={{ color: textoPrincipal }}>
              {t.solicitudesAbiertas}
            </h2>
            <p className="mt-2" style={{ color: textoSecundario }}>
              {t.esperandoPresupuestos}
            </p>
            {abiertas.length > 0 ? (
              <div className="mt-5 space-y-5">
                {abiertas.map(renderSolicitud)}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border p-5 text-center" style={{ borderColor: bordeTarjeta }}>
                <p className="font-bold" style={{ color: textoSecundario }}>
                  {language === "es" ? "No tienes solicitudes abiertas." : "You don't have any open requests."}
                </p>
              </div>
            )}
          </section>
        )}

        {!error && seccionActiva === "en-progreso" && (
          <section
            id="trabajos-en-progreso"
            className="mt-8 scroll-mt-6 rounded-3xl border p-6 shadow-sm md:p-7"
            style={{
              borderColor: bordeTarjeta,
              backgroundColor: fondoTarjeta,
            }}
          >
            <h2 className="text-3xl font-extrabold" style={{ color: textoPrincipal }}>
              {t.trabajosEnProgreso}
            </h2>
            <p className="mt-2" style={{ color: textoSecundario }}>
              {t.estadoTrabajos}
            </p>
            {enProgreso.length > 0 ? (
              <div className="mt-5 space-y-5">
                {enProgreso.map(renderSolicitud)}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border p-5 text-center" style={{ borderColor: bordeTarjeta }}>
                <p className="font-bold" style={{ color: textoSecundario }}>
                  {language === "es" ? "No tienes trabajos en progreso." : "You don't have any jobs in progress."}
                </p>
              </div>
            )}
          </section>
        )}

        {!error && seccionActiva === "completadas" && (
          <section
            id="trabajos-completados"
            className="mt-8 scroll-mt-6 rounded-3xl border p-6 shadow-sm md:p-7"
            style={{
              borderColor: bordeTarjeta,
              backgroundColor: fondoTarjeta,
            }}
          >
            <h2 className="text-3xl font-extrabold" style={{ color: textoPrincipal }}>
              {t.trabajosCompletados}
            </h2>
            <p className="mt-2" style={{ color: textoSecundario }}>
              {t.historialTerminados}
            </p>
            {completadas.length > 0 ? (
              <div className="mt-5 space-y-5">
                {completadas.map(renderSolicitud)}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border p-5 text-center" style={{ borderColor: bordeTarjeta }}>
                <p className="font-bold" style={{ color: textoSecundario }}>
                  {language === "es" ? "No tienes trabajos completados." : "You don't have any completed jobs."}
                </p>
              </div>
            )}
          </section>
        )}

        {!error && seccionActiva === "canceladas" && (
          <section
            id="solicitudes-canceladas"
            className="mt-8 scroll-mt-6 rounded-3xl border p-6 shadow-sm md:p-7"
            style={{
              borderColor: bordeTarjeta,
              backgroundColor: fondoTarjeta,
            }}
          >
            <h2 className="text-3xl font-extrabold" style={{ color: textoPrincipal }}>
              {t.solicitudesCanceladas}
            </h2>
            <p className="mt-2" style={{ color: textoSecundario }}>
              {t.historialCanceladas}
            </p>
            {canceladas.length > 0 ? (
              <div className="mt-5 space-y-5">
                {canceladas.map(renderSolicitud)}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border p-5 text-center" style={{ borderColor: bordeTarjeta }}>
                <p className="font-bold" style={{ color: textoSecundario }}>
                  {language === "es" ? "No tienes solicitudes canceladas." : "You don't have any cancelled requests."}
                </p>
              </div>
            )}
          </section>
        )}


      </div>

      {temaOscuro && (
        <style jsx global>{`
          .relydo-customer-dark .bg-white {
            background-color: #0f172a !important;
          }

          .relydo-customer-dark .bg-slate-50 {
            background-color: #111827 !important;
          }

          .relydo-customer-dark .bg-slate-100 {
            background-color: #1e293b !important;
          }

          .relydo-customer-dark .text-slate-950,
          .relydo-customer-dark .text-slate-900,
          .relydo-customer-dark .text-slate-800 {
            color: #f8fafc !important;
          }

          .relydo-customer-dark .text-slate-700,
          .relydo-customer-dark .text-slate-600,
          .relydo-customer-dark .text-slate-500 {
            color: #cbd5e1 !important;
          }

          .relydo-customer-dark .border-slate-200,
          .relydo-customer-dark .border-slate-300 {
            border-color: #334155 !important;
          }
        `}</style>
      )}
    </main>
  );
}

function ResumenCard({
  titulo,
  valor,
  clase,
  icono,
  fondo,
  onClick,
}: {
  titulo: string;
  valor: string;
  clase: string;
  icono: string;
  fondo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100 sm:p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500 transition group-hover:text-slate-800 sm:text-sm sm:normal-case sm:tracking-normal">
          {titulo}
        </p>

        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-base font-black ${fondo} ${clase}`}
        >
          {icono}
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={`text-2xl font-black tracking-tight ${clase} sm:text-3xl`}>
          {valor}
        </p>

        <span className="text-base font-black text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600">
          →
        </span>
      </div>
    </button>
  );
}

function InfoBox({
  titulo,
  valor,
  icono,
}: {
  titulo: string;
  valor: string;
  icono: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">
        {icono} {titulo}
      </p>

      <p className="mt-1 font-bold text-slate-900">{valor}</p>
    </div>
  );
}