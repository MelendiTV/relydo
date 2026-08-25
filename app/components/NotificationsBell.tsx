"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const SOUND_STORAGE_KEY =
  "relydo_sound_enabled";

type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  request_id: string | null;
  read: boolean;
  created_at: string;
};

type Props = {
  modo?: "cliente" | "profesional";
};

type WindowConAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export default function NotificationsBell({
  modo = "cliente",
}: Props) {
  const [userId, setUserId] =
    useState<string | null>(null);

  const [
    notificaciones,
    setNotificaciones,
  ] = useState<Notification[]>([]);

  const [abierto, setAbierto] =
    useState(false);

  const [cargando, setCargando] =
    useState(true);

  const [
    sonidoActivo,
    setSonidoActivo,
  ] = useState(false);

  const [
    sonidoDeseado,
    setSonidoDeseado,
  ] = useState(false);

  const [
    activandoSonido,
    setActivandoSonido,
  ] = useState(false);


  const [
    pushDisponible,
    setPushDisponible,
  ] = useState(false);

  const [
    pushActivo,
    setPushActivo,
  ] = useState(false);

  const [
    activandoPush,
    setActivandoPush,
  ] = useState(false);

  const [
    pushError,
    setPushError,
  ] = useState("");

  /*
    INDICA QUE EL USUARIO
    YA DIJO QUE QUIERE SONIDO
  */

  const sonidoDeseadoRef =
    useRef(false);

  /*
    AUDIO CONTEXT
  */

  const audioContextRef =
    useRef<AudioContext | null>(
      null
    );

  /*
    CARGAR USUARIO
  */

  useEffect(() => {
    iniciar();
  }, []);

  async function iniciar() {
    const {
      data: { user },
      error,
    } =
      await supabase.auth.getUser();

    if (
      error ||
      !user
    ) {
      setCargando(false);
      return;
    }

    setUserId(user.id);

    await cargarNotificaciones(
      user.id
    );

    setCargando(false);
  }

  /*
    NOTIFICACIONES PUSH DEL DISPOSITIVO
  */

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
      comprobarSuscripcionPush();
    }
  }, [userId]);

  async function comprobarSuscripcionPush() {
    if (!userId) {
      return;
    }

    try {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "denied"
      ) {
        setPushActivo(false);
        return;
      }

      await navigator.serviceWorker.register(
        "/sw.js"
      );

      const registration =
        await navigator.serviceWorker.ready;

      const subscription =
        await registration.pushManager.getSubscription();

      if (!subscription) {
        setPushActivo(false);
        return;
      }

      /*
        La suscripción Push pertenece al ORIGEN actual.
        localhost y relydo.vercel.app son orígenes diferentes.
        Si existe una suscripción en este origen, la sincronizamos
        también con Supabase para evitar que el navegador esté
        suscrito pero RELYDO no tenga el dispositivo registrado.
      */

      const json =
        subscription.toJSON();

      const endpoint =
        subscription.endpoint;

      const p256dh =
        json.keys?.p256dh;

      const auth =
        json.keys?.auth;

      if (
        endpoint &&
        p256dh &&
        auth
      ) {
        const {
          error: syncError,
        } = await supabase
          .from("push_subscriptions")
          .upsert(
            {
              user_id: userId,
              endpoint,
              p256dh,
              auth,
              user_agent:
                navigator.userAgent,
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict: "endpoint",
            }
          );

        if (syncError) {
          console.warn(
            "La suscripción Push existe en el navegador, pero no se pudo sincronizar con RELYDO:",
            syncError
          );
        }
      }

      setPushActivo(true);
    } catch (error) {
      console.error(
        "Error comprobando Push:",
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
        (4 -
          (base64String.length %
            4)) %
          4
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

    const outputArray =
      new Uint8Array(
        rawData.length
      );

    for (
      let i = 0;
      i < rawData.length;
      ++i
    ) {
      outputArray[i] =
        rawData.charCodeAt(i);
    }

    return outputArray;
  }

  async function activarPush() {
    if (
      !userId ||
      !pushDisponible
    ) {
      return;
    }

    setActivandoPush(true);
    setPushError("");

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
          "No se concedió permiso para las notificaciones del dispositivo."
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
          `No se pudo guardar el dispositivo: ${guardarError.message}`
        );
      }

      setPushActivo(true);
    } catch (error) {
      console.error(
        "Error activando Push:",
        error
      );

      setPushError(
        error instanceof Error
          ? error.message
          : "No se pudieron activar las notificaciones del dispositivo."
      );

      setPushActivo(false);
    } finally {
      setActivandoPush(false);
    }
  }

  /*
    RECORDAR PREFERENCIA
    DE SONIDO EN ESTE
    DISPOSITIVO
  */

  useEffect(() => {
    try {
      const guardado =
        localStorage.getItem(
          SOUND_STORAGE_KEY
        );

      sonidoDeseadoRef.current =
        guardado === "true";

      setSonidoDeseado(
        guardado === "true"
      );

      /*
        SI YA LO HABÍA ACTIVADO,
        INTENTAMOS REACTIVARLO.
      */

      if (
        sonidoDeseadoRef.current
      ) {
        intentarReactivarAudio();
      }
    } catch (error) {
      console.error(
        "No se pudo leer preferencia de sonido:",
        error
      );
    }
  }, []);

  /*
    REACTIVAR AUDIO AUTOMÁTICAMENTE

    Si el navegador suspende el
    AudioContext, RELYDO intenta
    recuperarlo cuando:

    - vuelves a la pestaña
    - haces clic
    - presionas una tecla
    - la ventana recupera foco
  */

  useEffect(() => {
    async function reactivar() {
      if (
        !sonidoDeseadoRef.current
      ) {
        return;
      }

      await intentarReactivarAudio();
    }

    function cambioVisibilidad() {
      if (
        document.visibilityState ===
        "visible"
      ) {
        reactivar();
      }
    }

    window.addEventListener(
      "pointerdown",
      reactivar
    );

    window.addEventListener(
      "keydown",
      reactivar
    );

    window.addEventListener(
      "focus",
      reactivar
    );

    document.addEventListener(
      "visibilitychange",
      cambioVisibilidad
    );

    return () => {
      window.removeEventListener(
        "pointerdown",
        reactivar
      );

      window.removeEventListener(
        "keydown",
        reactivar
      );

      window.removeEventListener(
        "focus",
        reactivar
      );

      document.removeEventListener(
        "visibilitychange",
        cambioVisibilidad
      );
    };
  }, []);

  /*
    OBTENER AUDIO CONTEXT
  */

  async function obtenerContextoAudio() {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as WindowConAudio
        ).webkitAudioContext;

      if (
        !AudioContextClass
      ) {
        console.error(
          "Este navegador no soporta AudioContext."
        );

        return null;
      }

      if (
        !audioContextRef.current ||
        audioContextRef.current.state ===
          "closed"
      ) {
        audioContextRef.current =
          new AudioContextClass();

        /*
          ESCUCHAR CAMBIOS
          DEL AUDIO CONTEXT
        */

        audioContextRef.current.onstatechange =
          () => {
            const context =
              audioContextRef.current;

            if (!context) {
              setSonidoActivo(false);
              return;
            }

            const activo =
              context.state ===
              "running";

            setSonidoActivo(
              activo
            );

            console.log(
              "Estado audio RELYDO:",
              context.state
            );
          };
      }

      const context =
        audioContextRef.current;

      if (
        context.state ===
        "suspended"
      ) {
        try {
          await context.resume();
        } catch (error) {
          console.warn(
            "El navegador todavía mantiene el audio suspendido:",
            error
          );
        }
      }

      if (
        context.state ===
        "running"
      ) {
        setSonidoActivo(true);
      } else {
        setSonidoActivo(false);
      }

      return context;
    } catch (error) {
      console.error(
        "Error creando AudioContext:",
        error
      );

      setSonidoActivo(false);

      return null;
    }
  }

  /*
    INTENTAR REACTIVAR
  */

  async function intentarReactivarAudio() {
    if (
      !sonidoDeseadoRef.current
    ) {
      return;
    }

    const context =
      await obtenerContextoAudio();

    if (
      context &&
      context.state ===
        "running"
    ) {
      setSonidoActivo(true);
    }
  }

  /*
    CREAR TONO
  */

  function crearTono(
    context: AudioContext,
    frecuencia: number,
    inicio: number,
    duracion: number,
    volumen: number,
    tipo: OscillatorType =
      "sine"
  ) {
    const oscillator =
      context.createOscillator();

    const gain =
      context.createGain();

    oscillator.type =
      tipo;

    oscillator.connect(
      gain
    );

    gain.connect(
      context.destination
    );

    oscillator.frequency.setValueAtTime(
      frecuencia,
      inicio
    );

    gain.gain.setValueAtTime(
      0.001,
      inicio
    );

    gain.gain.exponentialRampToValueAtTime(
      volumen,
      inicio + 0.02
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      inicio + duracion
    );

    oscillator.start(
      inicio
    );

    oscillator.stop(
      inicio +
        duracion +
        0.05
    );
  }

  /*
    ACTIVAR / PROBAR SONIDO
  */

  async function activarSonido() {
    setActivandoSonido(true);

    /*
      GUARDAMOS QUE EL USUARIO
      QUIERE SONIDO
    */

    sonidoDeseadoRef.current =
      true;

    setSonidoDeseado(true);

    try {
      localStorage.setItem(
        SOUND_STORAGE_KEY,
        "true"
      );
    } catch {
      // No hacemos nada.
    }

    try {
      const context =
        await obtenerContextoAudio();

      if (
        !context ||
        context.state !==
          "running"
      ) {
        setSonidoActivo(false);

        alert(
          "El navegador no permitió activar el sonido. Revisa que la pestaña y Windows no estén silenciados."
        );

        return;
      }

      /*
        SONIDO DE PRUEBA
      */

      const ahora =
        context.currentTime;

      crearTono(
        context,
        700,
        ahora,
        0.20,
        0.35
      );

      crearTono(
        context,
        950,
        ahora + 0.24,
        0.25,
        0.38
      );

      crearTono(
        context,
        1200,
        ahora + 0.52,
        0.45,
        0.42
      );

      setSonidoActivo(true);

      console.log(
        "🔊 Sonido RELYDO activado"
      );
    } catch (error) {
      console.error(
        "No se pudo activar sonido:",
        error
      );

      setSonidoActivo(false);
    } finally {
      setActivandoSonido(false);
    }
  }

  /*
    PREPARAR AUDIO PARA
    UNA NOTIFICACIÓN
  */

  async function prepararAudio() {
    if (
      !sonidoDeseadoRef.current
    ) {
      console.warn(
        "🔇 Sonido no activado por el usuario."
      );

      return null;
    }

    const context =
      await obtenerContextoAudio();

    if (
      !context ||
      context.state !==
        "running"
    ) {
      console.warn(
        "🔇 Audio suspendido. RELYDO intentará reactivarlo cuando vuelvas a interactuar."
      );

      setSonidoActivo(false);

      return null;
    }

    return context;
  }

  /*
    NUEVA ORDEN
  */

  async function sonidoNuevaOrden() {
    const context =
      await prepararAudio();

    if (!context) {
      return;
    }

    const ahora =
      context.currentTime;

    /*
      PRIMER AVISO
    */

    crearTono(
      context,
      740,
      ahora,
      0.25,
      0.38
    );

    crearTono(
      context,
      980,
      ahora + 0.30,
      0.25,
      0.40
    );

    crearTono(
      context,
      1250,
      ahora + 0.60,
      0.50,
      0.45
    );

    /*
      SEGUNDO AVISO
    */

    crearTono(
      context,
      740,
      ahora + 1.25,
      0.25,
      0.38
    );

    crearTono(
      context,
      980,
      ahora + 1.55,
      0.25,
      0.40
    );

    crearTono(
      context,
      1250,
      ahora + 1.85,
      0.50,
      0.45
    );
  }

  /*
    SONIDO POSITIVO
  */

  async function sonidoPositivo() {
    const context =
      await prepararAudio();

    if (!context) {
      return;
    }

    const ahora =
      context.currentTime;

    crearTono(
      context,
      650,
      ahora,
      0.18,
      0.28
    );

    crearTono(
      context,
      900,
      ahora + 0.22,
      0.20,
      0.30
    );

    crearTono(
      context,
      1150,
      ahora + 0.46,
      0.35,
      0.34
    );
  }

  /*
    SONIDO AVISO
  */

  async function sonidoAviso() {
    const context =
      await prepararAudio();

    if (!context) {
      return;
    }

    const ahora =
      context.currentTime;

    crearTono(
      context,
      800,
      ahora,
      0.18,
      0.26
    );

    crearTono(
      context,
      1000,
      ahora + 0.22,
      0.28,
      0.28
    );
  }

  /*
    SONIDO ALERTA
  */

  async function sonidoAlerta() {
    const context =
      await prepararAudio();

    if (!context) {
      return;
    }

    const ahora =
      context.currentTime;

    crearTono(
      context,
      500,
      ahora,
      0.30,
      0.30,
      "triangle"
    );

    crearTono(
      context,
      350,
      ahora + 0.35,
      0.45,
      0.32,
      "triangle"
    );
  }

  /*
    REALTIME
  */

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel =
      supabase
        .channel(
          `notifications-${userId}`
        )
        .on(
          "postgres_changes",
          {
            event:
              "INSERT",

            schema:
              "public",

            table:
              "notifications",

            filter:
              `user_id=eq.${userId}`,
          },
          async (
            payload
          ) => {
            const nueva =
              payload.new as Notification;

            console.log(
              "🔔 NUEVA NOTIFICACIÓN:",
              nueva
            );

            setNotificaciones(
              (
                actuales
              ) => [
                nueva,

                ...actuales.filter(
                  (
                    item
                  ) =>
                    item.id !==
                    nueva.id
                ),
              ]
            );

            /*
              PROFESIONAL
            */

            if (
              modo ===
              "profesional"
            ) {
              if (
                nueva.type ===
                "new_job_available"
              ) {
                await sonidoNuevaOrden();
                return;
              }

              if (
                nueva.type ===
                "offer_accepted"
              ) {
                await sonidoPositivo();
                return;
              }

              if (
                nueva.type ===
                "job_cancelled_by_customer" ||
                nueva.type ===
                "claim_opened" ||
                nueva.type ===
                "claim_created" ||
                nueva.type ===
                "provider_released_job"
              ) {
                await sonidoAlerta();
                return;
              }

              if (
                nueva.type ===
                  "change_order_accepted" ||
                nueva.type ===
                  "change_order_paid" ||
                nueva.type ===
                  "claim_resolved" ||
                nueva.type ===
                  "payment_released"
              ) {
                await sonidoPositivo();
                return;
              }

              if (
                nueva.type ===
                  "change_order_rejected" ||
                nueva.type ===
                  "change_order_cancelled"
              ) {
                await sonidoAlerta();
                return;
              }

              await sonidoAviso();

              return;
            }

            /*
              CLIENTE
            */

            if (
              modo ===
              "cliente"
            ) {
              if (
                nueva.type ===
                "new_offer_received"
              ) {
                await sonidoPositivo();
                return;
              }

              if (
                nueva.type ===
                  "provider_on_the_way" ||
                nueva.type ===
                  "provider_arrived" ||
                nueva.type ===
                  "job_started"
              ) {
                await sonidoAviso();
                return;
              }

              if (
                nueva.type ===
                "job_completed"
              ) {
                await sonidoPositivo();
                return;
              }

              if (
                nueva.type ===
                  "provider_released_job" ||
                nueva.type ===
                  "job_cancelled_by_customer" ||
                nueva.type ===
                  "job_cancelled" ||
                nueva.type ===
                  "claim_opened" ||
                nueva.type ===
                  "claim_created"
              ) {
                await sonidoAlerta();
                return;
              }

              if (
                nueva.type ===
                  "change_order_requested" ||
                nueva.type ===
                  "change_order_created"
              ) {
                await sonidoAviso();
                return;
              }

              if (
                nueva.type ===
                  "change_order_accepted" ||
                nueva.type ===
                  "change_order_paid" ||
                nueva.type ===
                  "claim_resolved" ||
                nueva.type ===
                  "refund_processed"
              ) {
                await sonidoPositivo();
                return;
              }

              if (
                nueva.type ===
                  "change_order_rejected" ||
                nueva.type ===
                  "change_order_cancelled"
              ) {
                await sonidoAlerta();
                return;
              }

              await sonidoAviso();
            }
          }
        )
        .subscribe(
          (
            status
          ) => {
            console.log(
              "Realtime notificaciones:",
              status
            );
          }
        );

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    userId,
    modo,
  ]);

  /*
    CARGAR NOTIFICACIONES
  */

  async function cargarNotificaciones(
    uid: string
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          "notifications"
        )
        .select(`
          id,
          user_id,
          type,
          title,
          message,
          request_id,
          read,
          created_at
        `)
        .eq(
          "user_id",
          uid
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        )
        .limit(30);

    if (error) {
      console.error(
        "Error cargando notificaciones:",
        error
      );

      return;
    }

    setNotificaciones(
      (data ||
        []) as Notification[]
    );
  }

  /*
    MARCAR UNA LEÍDA
  */

  async function marcarLeida(
    id: string
  ) {
    const {
      error,
    } =
      await supabase
        .from(
          "notifications"
        )
        .update({
          read: true,
        })
        .eq(
          "id",
          id
        );

    if (error) {
      console.error(
        "Error marcando notificación:",
        error
      );

      return;
    }

    setNotificaciones(
      (
        actuales
      ) =>
        actuales.map(
          (
            item
          ) =>
            item.id === id
              ? {
                  ...item,
                  read: true,
                }
              : item
        )
    );
  }

  /*
    MARCAR TODAS LEÍDAS
  */

  async function marcarTodasLeidas() {
    if (!userId) {
      return;
    }

    const {
      error,
    } =
      await supabase
        .from(
          "notifications"
        )
        .update({
          read: true,
        })
        .eq(
          "user_id",
          userId
        )
        .eq(
          "read",
          false
        );

    if (error) {
      console.error(
        "Error marcando todas:",
        error
      );

      return;
    }

    setNotificaciones(
      (
        actuales
      ) =>
        actuales.map(
          (
            item
          ) => ({
            ...item,
            read: true,
          })
        )
    );
  }

  /*
    ABRIR NOTIFICACIÓN
  */

  async function abrirNotificacion(
    notificacion: Notification
  ) {
    if (
      !notificacion.read
    ) {
      await marcarLeida(
        notificacion.id
      );
    }

    if (
      !notificacion.request_id
    ) {
      setAbierto(false);
      return;
    }

    if (
      modo ===
      "profesional"
    ) {
      window.location.href =
        `/trabajos/${notificacion.request_id}`;

      return;
    }

    window.location.href =
      `/mis-solicitudes/${notificacion.request_id}`;
  }

  /*
    ICONOS
  */

  function icono(
    tipo: string
  ) {
    switch (tipo) {
      case "new_job_available":
        return "🆕";

      case "new_offer_received":
        return "💰";

      case "offer_accepted":
        return "✅";

      case "provider_on_the_way":
        return "🚗";

      case "provider_arrived":
        return "📍";

      case "job_started":
        return "🛠️";

      case "job_completed":
        return "🎉";

      case "provider_released_job":
        return "🔄";

      case "job_cancelled_by_customer":
      case "job_cancelled":
        return "🚫";

      case "change_order_requested":
      case "change_order_created":
        return "🧾";

      case "change_order_accepted":
      case "change_order_paid":
        return "💵";

      case "change_order_rejected":
      case "change_order_cancelled":
        return "❌";

      case "claim_opened":
      case "claim_created":
        return "⚠️";

      case "claim_resolved":
        return "⚖️";

      case "payment_released":
        return "💸";

      case "refund_processed":
        return "↩️";

      default:
        return "🔔";
    }
  }

  /*
    FECHA
  */

  function fecha(
    valor: string
  ) {
    return new Intl.DateTimeFormat(
      "es-US",
      {
        month:
          "short",

        day:
          "numeric",

        hour:
          "numeric",

        minute:
          "2-digit",
      }
    ).format(
      new Date(valor)
    );
  }

  const noLeidas =
    notificaciones.filter(
      (item) =>
        !item.read
    ).length;

  if (
    cargando ||
    !userId
  ) {
    return null;
  }

  return (
    <div className="relative">

      {/* CAMPANA */}

      <button
        type="button"
        onClick={() =>
          setAbierto(
            (actual) =>
              !actual
          )
        }
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-xl text-white transition hover:bg-white/20"
        aria-label="Notificaciones"
      >
        🔔

        {noLeidas > 0 && (
          <span className="absolute -right-2 -top-2 flex min-h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-black text-white shadow">

            {noLeidas > 99
              ? "99+"
              : noLeidas}

          </span>
        )}

      </button>

      {/* PANEL */}

      {abierto && (
        <div className="absolute right-0 z-50 mt-3 w-[340px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl sm:w-[390px]">

          {/* HEADER */}

          <div className="border-b border-slate-200 px-5 py-4">

            <div className="flex items-center justify-between gap-3">

              <div>

                <p className="font-black text-slate-900">
                  Notificaciones
                </p>

                <p className="text-xs text-slate-500">
                  {noLeidas} sin leer
                </p>

              </div>

              {noLeidas > 0 && (
                <button
                  type="button"
                  onClick={
                    marcarTodasLeidas
                  }
                  className="text-xs font-bold text-blue-700 hover:text-blue-900"
                >
                  Marcar todas leídas
                </button>
              )}

            </div>

            {/* NOTIFICACIONES + SONIDO */}

            <div
              className={`mt-4 rounded-xl border p-4 ${
                pushActivo && sonidoActivo
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-blue-200 bg-blue-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-black ${
                      pushActivo && sonidoActivo
                        ? "text-emerald-800"
                        : "text-blue-800"
                    }`}
                  >
                    {pushActivo && sonidoActivo
                      ? "🔔 Notificaciones y sonido activados"
                      : "🔔 Activa las notificaciones de RELYDO"}
                  </p>

                  <p
                    className={`mt-1 text-xs ${
                      pushActivo && sonidoActivo
                        ? "text-emerald-700"
                        : "text-blue-700"
                    }`}
                  >
                    {pushActivo && sonidoActivo
                      ? modo === "profesional"
                        ? "RELYDO puede avisarte en este dispositivo y reproducir sonido cuando llegue una orden o cambie un trabajo."
                        : "RELYDO puede avisarte en este dispositivo y reproducir sonido cuando recibas presupuestos o cambie el estado de tu trabajo."
                      : "Activa en un solo paso los avisos del dispositivo y el sonido de RELYDO."}
                  </p>

                  {pushError && (
                    <p className="mt-2 text-xs font-bold text-red-700">
                      {pushError}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={
                    activandoPush ||
                    activandoSonido ||
                    (!pushDisponible && !pushActivo)
                  }
                  onClick={async () => {
                    if (!pushActivo) {
                      await activarPush();
                    }

                    await activarSonido();
                  }}
                  className={`shrink-0 rounded-lg px-4 py-2 text-xs font-black ${
                    pushActivo && sonidoActivo
                      ? "border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
                      : "bg-blue-700 text-white hover:bg-blue-800"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {activandoPush || activandoSonido
                    ? "Activando..."
                    : pushActivo && sonidoActivo
                    ? "Probar"
                    : "Activar"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                <span
                  className={`rounded-full px-2.5 py-1 ${
                    pushActivo
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-white text-slate-600"
                  }`}
                >
                  📲 Push {pushActivo ? "activo" : "pendiente"}
                </span>

                <span
                  className={`rounded-full px-2.5 py-1 ${
                    sonidoActivo
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-white text-slate-600"
                  }`}
                >
                  🔊 Sonido {sonidoActivo ? "activo" : "pendiente"}
                </span>
              </div>
            </div>

          </div>

          {/* LISTA */}

          {notificaciones.length ===
          0 ? (
            <div className="p-8 text-center">

              <div className="text-4xl">
                🔔
              </div>

              <p className="mt-3 font-bold text-slate-700">
                No tienes notificaciones
              </p>

            </div>
          ) : (
            <div className="max-h-[430px] overflow-y-auto">

              {notificaciones.map(
                (
                  notificacion
                ) => (
                  <button
                    type="button"
                    key={
                      notificacion.id
                    }
                    onClick={() =>
                      abrirNotificacion(
                        notificacion
                      )
                    }
                    className={`block w-full border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50 ${
                      !notificacion.read
                        ? "bg-blue-50/60"
                        : "bg-white"
                    }`}
                  >

                    <div className="flex items-start gap-3">

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
                        {icono(
                          notificacion.type
                        )}
                      </div>

                      <div className="min-w-0 flex-1">

                        <div className="flex items-start justify-between gap-3">

                          <p
                            className={`text-sm text-slate-900 ${
                              !notificacion.read
                                ? "font-black"
                                : "font-bold"
                            }`}
                          >
                            {
                              notificacion.title
                            }
                          </p>

                          {!notificacion.read && (
                            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />
                          )}

                        </div>

                        <p className="mt-1 text-sm leading-5 text-slate-600">
                          {
                            notificacion.message
                          }
                        </p>

                        <p className="mt-2 text-xs font-medium text-slate-400">
                          {fecha(
                            notificacion.created_at
                          )}
                        </p>

                      </div>

                    </div>

                  </button>
                )
              )}

            </div>
          )}

        </div>
      )}

    </div>
  );
}