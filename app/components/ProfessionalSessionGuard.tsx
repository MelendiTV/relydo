"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/app/lib/supabaseBrowser";

const PROFESSIONAL_PROTECTED_PREFIXES = [
  "/panel-profesional",
  "/trabajos",
  "/pagos-profesional",
  "/perfil-profesional",
];

function esRutaProfesionalProtegida(pathname: string) {
  return PROFESSIONAL_PROTECTED_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`)
  );
}

function construirLoginUrl(pathname: string) {
  const redirect =
    typeof window !== "undefined"
      ? `${pathname}${window.location.search || ""}`
      : pathname;

  return `/login-profesional?redirect=${encodeURIComponent(
    redirect
  )}`;
}

export default function ProfessionalSessionGuard() {
  const pathname = usePathname();
  const comprobandoRef = useRef(false);
  const expulsandoRef = useRef(false);

  useEffect(() => {
    if (!esRutaProfesionalProtegida(pathname)) {
      return;
    }

    let cancelado = false;

    async function expulsarSesionReemplazada() {
      if (expulsandoRef.current || cancelado) {
        return;
      }

      expulsandoRef.current = true;

      try {
        await supabase.auth.signOut({
          scope: "local",
        });
      } catch (error) {
        console.error(
          "RELYDO could not clear replaced provider session:",
          error
        );
      }

      if (!cancelado) {
        window.location.replace(
          "/login-profesional?reason=session_replaced"
        );
      }
    }

    async function comprobarSesionProfesional() {
      if (
        cancelado ||
        comprobandoRef.current ||
        expulsandoRef.current
      ) {
        return;
      }

      comprobandoRef.current = true;

      try {
        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.getSession();

        const accessToken =
          sessionData.session?.access_token;

        if (sessionError || !accessToken) {
          if (!cancelado) {
            window.location.replace(
              construirLoginUrl(pathname)
            );
          }
          return;
        }

        const response = await fetch(
          "/api/auth/provider/activate-session",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
          }
        );

        const result = await response
          .json()
          .catch(() => ({}));

        if (
          response.status === 409 &&
          result?.code === "PROVIDER_SESSION_REPLACED"
        ) {
          await expulsarSesionReemplazada();
          return;
        }

        if (response.status === 401) {
          try {
            await supabase.auth.signOut({
              scope: "local",
            });
          } catch {
            // La redirección de abajo sigue siendo segura.
          }

          if (!cancelado) {
            window.location.replace(
              construirLoginUrl(pathname)
            );
          }
          return;
        }

        if (!response.ok) {
          console.warn(
            "RELYDO professional session check failed:",
            result
          );
        }
      } catch (error) {
        console.warn(
          "RELYDO professional session check error:",
          error
        );
      } finally {
        comprobandoRef.current = false;
      }
    }

    void comprobarSesionProfesional();

    const intervalId = window.setInterval(
      () => {
        void comprobarSesionProfesional();
      },
      8000
    );

    function comprobarAlVolver() {
      if (document.visibilityState === "visible") {
        void comprobarSesionProfesional();
      }
    }

    function comprobarAlEnfocar() {
      void comprobarSesionProfesional();
    }

    document.addEventListener(
      "visibilitychange",
      comprobarAlVolver
    );

    window.addEventListener(
      "focus",
      comprobarAlEnfocar
    );

    return () => {
      cancelado = true;
      window.clearInterval(intervalId);
      document.removeEventListener(
        "visibilitychange",
        comprobarAlVolver
      );
      window.removeEventListener(
        "focus",
        comprobarAlEnfocar
      );
    };
  }, [pathname]);

  return null;
}
