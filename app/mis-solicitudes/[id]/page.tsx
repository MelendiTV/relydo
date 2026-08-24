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
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  useEffect(() => {
    cargarPanelCliente();
  }, []);

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

  async function cerrarSesion() {
    await supabase.auth.signOut();
    window.location.href = "/login-cliente";
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

    const offerCount =
      solicitud.offer_count || 0;

    const professionalCount =
      solicitud.professional_count || 0;

    const fechaCreacion = new Date(
      solicitud.created_at
    ).toLocaleString(
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
    );

    if (
      solicitud.status === "open" ||
      solicitud.status === "in_progress"
    ) {
      return (
        <button
          key={solicitud.id}
          type="button"
          onClick={() => {
            window.location.assign(
              `/mis-solicitudes/${solicitud.id}`
            );
          }}
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
                {professionalCount === 1
                  ? t.profesional
                  : t.profesionales}
              </p>
            )}
          </div>

          <span
            className={`w-fit shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${estilo}`}
          >
            {nombre}
          </span>
        </button>
      );
    }

    return (
      <article
        key={solicitud.id}
        className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${estilo}`}
            >
              <span>
                {iconoEstado(
                  solicitud.status,
                  solicitud.job_stage
                )}
              </span>
              {nombre}
            </span>

            <h3 className="mt-3 text-2xl font-extrabold text-slate-900">
              {solicitud.title}
            </h3>

            <p className="mt-2 text-slate-600">
              {solicitud.description}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InfoBox
            titulo={t.ubicacion}
            valor={`${solicitud.city}, ${solicitud.state} ${solicitud.zip_code}`}
            icono="📍"
          />

          <InfoBox
            titulo={t.fecha}
            valor={
              solicitud.preferred_date ||
              t.flexible
            }
            icono="📅"
          />

          <InfoBox
            titulo={t.hora}
            valor={
              solicitud.preferred_time ||
              t.flexible
            }
            icono="🕐"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            router.push(
              `/mis-solicitudes/${solicitud.id}`
            )
          }
          className={`mt-6 rounded-xl px-6 py-3 font-bold transition ${
            solicitud.status === "cancelled"
              ? "border-2 border-red-600 bg-white text-red-700 hover:bg-red-50"
              : "bg-blue-700 text-white hover:bg-blue-800"
          }`}
        >
          {t.verDetalles}
        </button>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}

        <section className="relative z-30 overflow-visible rounded-[32px] border border-blue-500/20 bg-gradient-to-br from-blue-700 via-blue-700 to-indigo-700 text-white shadow-xl shadow-blue-900/10">
          <div className="relative px-7 py-8 md:px-10 md:py-10">
            <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 left-10 h-52 w-52 rounded-full bg-cyan-300/10 blur-3xl" />

            <div className="relative flex flex-col gap-7 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-blue-100">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  {t.panelCliente}
                </div>

                <div className="mt-4 text-2xl font-black">RELYDO</div>

                <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-white/25 bg-white/10 shadow-lg">
                    {cliente?.avatar_url ? (
                      <img
                        src={cliente.avatar_url}
                        alt={`${t.fotoAlt} ${cliente.full_name || t.cliente}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl font-black text-white">
                        {(cliente?.full_name || "C").charAt(0).toUpperCase()}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={subiendoAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                      className="absolute inset-x-0 bottom-0 bg-slate-950/75 px-2 py-1.5 text-[9px] font-black uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
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

                  <div>
                    <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                      {t.hola}, {cliente?.full_name || t.clienteNombre}
                    </h1>

                    <button
                      type="button"
                      disabled={subiendoAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                      className="mt-2 text-sm font-bold text-blue-100 underline decoration-white/40 underline-offset-4 transition hover:text-white disabled:opacity-60"
                    >
                      {subiendoAvatar
                        ? t.subiendoFoto
                        : cliente?.avatar_url
                        ? t.cambiarFoto
                        : t.anadirFoto}
                    </button>
                  </div>
                </div>

                <p className="mt-4 max-w-xl text-base leading-7 text-blue-100 md:text-lg">
                  {t.descripcionPanel}
                </p>

                <div className="mt-5">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
                      realtimeConectado
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        realtimeConectado ? "bg-green-500" : "bg-amber-500"
                      }`}
                    />

                    {realtimeConectado
                      ? t.vivoActivo
                      : t.conectandoVivo}
                  </span>
                </div>
              </div>

              <div className="relative z-[100] flex items-start gap-3 md:items-center">
                <div className="relative z-[110]">
                  <NotificationsBell modo="cliente" />
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-xs font-black uppercase tracking-wide text-blue-200">
                    {t.cuenta}
                  </p>

                  <p className="mt-1 max-w-[220px] truncate text-sm font-bold text-white">
                    {email}
                  </p>

                  {cliente?.role === "provider" && (
                    <div className="mt-3 rounded-xl bg-white/95 p-2 text-slate-900">
                      <AccountModeSwitcher />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={cerrarSesion}
                    className="mt-3 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20"
                  >
                    {t.cerrarSesion}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ACCIONES */}

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => router.push("/solicitar-trabajo")}
            className="rounded-2xl bg-blue-700 px-6 py-4 text-lg font-extrabold text-white shadow transition hover:-translate-y-0.5 hover:bg-blue-800"
          >
            {t.nuevoTrabajo}
          </button>

          <button
            type="button"
            onClick={() => router.push("/profesionales")}
            className="rounded-2xl border-2 border-blue-700 bg-white px-6 py-4 text-lg font-extrabold text-blue-700 shadow transition hover:-translate-y-0.5 hover:bg-blue-50"
          >
            {t.verProfesionales}
          </button>
        </section>

        {/* RESUMEN */}

        <section className="mt-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                {t.resumen}
              </p>

              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                {t.actividad}
              </h2>

              <p className="mt-2 text-slate-600">
                {t.pulsaTarjeta}
              </p>
            </div>

            <button
              type="button"
              onClick={() => cargarPanelCliente(false)}
              disabled={actualizando}
              className="w-fit rounded-xl border border-slate-300 bg-white px-5 py-3 font-black text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actualizando ? t.actualizando : t.actualizar}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <ResumenCard
              titulo={t.abiertas}
              valor={String(abiertas.length)}
              clase="text-blue-700"
              icono="📋"
              fondo="bg-blue-50"
              onClick={() => irASeccion("solicitudes-abiertas")}
            />

            <ResumenCard
              titulo={t.enProgreso}
              valor={String(enProgreso.length)}
              clase="text-amber-700"
              icono="⚡"
              fondo="bg-amber-50"
              onClick={() => irASeccion("trabajos-en-progreso")}
            />

            <ResumenCard
              titulo={t.completadas}
              valor={String(completadas.length)}
              clase="text-emerald-700"
              icono="✓"
              fondo="bg-emerald-50"
              onClick={() => irASeccion("trabajos-completados")}
            />

            <ResumenCard
              titulo={t.canceladas}
              valor={String(canceladas.length)}
              clase="text-red-700"
              icono="×"
              fondo="bg-red-50"
              onClick={() => irASeccion("solicitudes-canceladas")}
            />

            <ResumenCard
              titulo={t.reclamos}
              valor={String(reclamosActivos.length)}
              clase="text-rose-700"
              icono="⚠"
              fondo="bg-rose-50"
              onClick={() => irASeccion("mis-reclamos")}
            />

            <ResumenCard
              titulo={t.historial}
              valor={String(totalHistorial)}
              clase="text-violet-700"
              icono="↺"
              fondo="bg-violet-50"
              onClick={() => setMostrarHistorial((actual) => !actual)}
            />
          </div>

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

        {!error && abiertas.length > 0 && (
          <section id="solicitudes-abiertas" className="mt-8 scroll-mt-6">
            <h2 className="text-3xl font-extrabold text-slate-900">
              {t.solicitudesAbiertas}
            </h2>

            <p className="mt-2 text-slate-600">
              {t.esperandoPresupuestos}
            </p>

            <div className="mt-5 space-y-5">
              {abiertas.map(renderSolicitud)}
            </div>
          </section>
        )}

        {!error && enProgreso.length > 0 && (
          <section id="trabajos-en-progreso" className="mt-10 scroll-mt-6">
            <h2 className="text-3xl font-extrabold text-slate-900">
              {t.trabajosEnProgreso}
            </h2>

            <p className="mt-2 text-slate-600">
              {t.estadoTrabajos}
            </p>

            <div className="mt-5 space-y-5">
              {enProgreso.map(renderSolicitud)}
            </div>
          </section>
        )}

        {!error && completadas.length > 0 && (
          <section id="trabajos-completados" className="mt-10 scroll-mt-6">
            <h2 className="text-3xl font-extrabold text-slate-900">
              {t.trabajosCompletados}
            </h2>

            <p className="mt-2 text-slate-600">
              {t.historialTerminados}
            </p>

            <div className="mt-5 space-y-5">
              {completadas.map(renderSolicitud)}
            </div>
          </section>
        )}

        {!error && canceladas.length > 0 && (
          <section id="solicitudes-canceladas" className="mt-10 scroll-mt-6">
            <h2 className="text-3xl font-extrabold text-slate-900">
              {t.solicitudesCanceladas}
            </h2>

            <p className="mt-2 text-slate-600">
              {t.historialCanceladas}
            </p>

            <div className="mt-5 space-y-5">
              {canceladas.map(renderSolicitud)}
            </div>
          </section>
        )}

        {!error && (
          <section
            id="mis-reclamos"
            className="mt-10 scroll-mt-6 rounded-3xl border border-rose-200 bg-white p-7 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-rose-700">
                  {t.proteccion}
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {t.misReclamos}
                </h2>
                <p className="mt-2 text-slate-600">
                  {t.revisarReclamos}
                </p>
              </div>

              <span className="w-fit rounded-full bg-rose-100 px-4 py-2 font-extrabold text-rose-800">
                {reclamosActivos.length} {t.activos}
              </span>
            </div>

            {reclamos.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="font-bold text-slate-700">
                  {t.sinReclamos}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {reclamos.map((reclamo) => {
                  const solicitud = solicitudes.find(
                    (item) => item.id === reclamo.request_id
                  );

                  const activo =
                    reclamo.status === "open" ||
                    reclamo.status === "reviewing" ||
                    reclamo.status === "in_review";

                  return (
                    <button
                      key={reclamo.id}
                      type="button"
                      onClick={() =>
                        router.push(`/mis-solicitudes/${reclamo.request_id}`)
                      }
                      className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-rose-300 hover:bg-rose-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-black text-slate-900">
                          {reclamo.reason || t.reclamoTrabajo}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {solicitud?.title || t.verTrabajoRelacionado}
                        </p>
                      </div>

                      <span
                        className={`w-fit rounded-full px-3 py-1 text-sm font-extrabold ${
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
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}


      </div>
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
      className="group w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-100"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-500 transition group-hover:text-slate-800">
          {titulo}
        </p>

        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${fondo}`}
        >
          {icono}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={`text-3xl font-black tracking-tight ${clase}`}>
          {valor}
        </p>

        <span className="text-lg font-black text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600">
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